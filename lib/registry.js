'use strict';
const fs = require('fs');
const path = require('path');

// ── CLAUDE CODE INTERNAL #1: the process registry ───────────────────────────────
// `<CLAUDE_CONFIG_DIR>/sessions/<pid>.json` records one live/recent Claude Code
// process: its sessionId, launch `entrypoint` (e.g. "cli", "claude-vscode"), current
// `cwd`, `version`, and `status`. These files are pruned over time, so OLD sessions
// have no entry here — origin/live-cwd from this source is best-effort, recent-only.
//
// This format is UNDOCUMENTED and may change across Claude Code releases (observed on
// CC 2.1.x). It is deliberately isolated in this one module so a spec change is a
// single-file fix. See docs/claude-code-internals.md.
// ─────────────────────────────────────────────────────────────────────────────────

// Returns { [sessionId]: registryEntry }, keeping the most recently updated entry per
// sessionId (a session can be reopened under a new pid).
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
      const prev = map[o.sessionId];
      if (!prev || (o.updatedAt || 0) > (prev.updatedAt || 0)) map[o.sessionId] = o;
    }
  } catch {}
  return map;
}

module.exports = { loadRegistry };
