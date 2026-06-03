'use strict';
const fs = require('fs');
const path = require('path');

// ── CLAUDE CODE INTERNAL #1: the process registry ───────────────────────────────
// `<CLAUDE_CONFIG_DIR>/sessions/<pid>.json` is a LIVENESS MARKER: Claude Code writes
// one file per running process on start and removes it on exit. The filename is the OS
// pid; the contents record its sessionId, launch `entrypoint` (e.g. "cli",
// "claude-vscode"), current `cwd`, `version`, and `status`. It is NOT an aged/pruned
// archive — a missing entry means "no process is running for that session right now",
// which is exactly how we tell active sessions from plain history.
//
// Caveat: a marker can be ORPHANED if a process dies hard (SIGKILL/crash) without
// removing its own file, so the file's mere existence isn't proof of life. isAlive()
// probes the pid to settle it honestly.
//
// This format is UNDOCUMENTED and may change across Claude Code releases (observed on
// CC 2.1.x). It is deliberately isolated in this one module so a spec change is a
// single-file fix. See docs/claude-code-internals.md.
// ─────────────────────────────────────────────────────────────────────────────────

// Returns { [sessionId]: registryEntry }, keeping the most recently updated entry per
// sessionId (a session can be reopened under a new pid). Each entry is annotated with
// `pid` parsed from its filename, so callers can probe liveness.
function loadRegistry(sessionsDir) {
  const map = {};
  try {
    for (const e of fs.readdirSync(sessionsDir)) {
      if (!e.endsWith('.json')) continue;
      let o;
      try {
        o = JSON.parse(fs.readFileSync(path.join(sessionsDir, e), 'utf8'));
      } catch {
        continue;
      }
      if (!o || !o.sessionId) continue;
      o.pid = parseInt(path.basename(e, '.json'), 10) || null;
      const prev = map[o.sessionId];
      if (!prev || (o.updatedAt || 0) > (prev.updatedAt || 0)) map[o.sessionId] = o;
    }
  } catch {}
  return map;
}

// Is `pid` a process that exists right now? Signal 0 sends nothing — it only probes
// existence. ESRCH => the process is gone (orphaned marker); EPERM => it exists but is
// owned by another user (still alive). This is what makes "active" honest rather than
// trusting that a registry file was cleaned up.
function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

module.exports = { loadRegistry, isAlive };
