'use strict';
const fs = require('fs');
const path = require('path');

// ── CLAUDE CODE INTERNAL #2: session transcripts ────────────────────────────────
// `<CLAUDE_CONFIG_DIR>/projects/<slug>/<uuid>.jsonl` is a JSON-lines log of one
// session. The filename (minus .jsonl) is the session UUID; the parent dir <slug> is
// the launch cwd with path separators flattened to dashes. We read the first 64KB and
// extract: the working dir (`cwd`), the first user prompt, and a `summary` if present.
//
// This format is UNDOCUMENTED and may change across Claude Code releases (observed on
// CC 2.1.x). Isolated here so a spec change is a single-file fix.
// See docs/claude-code-internals.md.
// ─────────────────────────────────────────────────────────────────────────────────

const READ_BYTES = 65536;

// Recursively collect *.jsonl transcript paths under dir.
function walk(dir, results = []) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, results);
      else if (p.endsWith('.jsonl')) results.push(p);
    }
  } catch {}
  return results;
}

// Parse the head of a transcript for { cwd, firstPrompt, summary }.
function parseSession(file) {
  let cwd = null;
  let firstPrompt = '';
  let summary = null;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(READ_BYTES);
    const bytes = fs.readSync(fd, buf, 0, READ_BYTES, 0);
    fs.closeSync(fd);
    const lines = buf.toString('utf8', 0, bytes).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch {
        continue;
      }
      if (!cwd && o.cwd) cwd = o.cwd;
      if (!summary && o.type === 'summary' && o.summary) summary = o.summary;
      if (!firstPrompt && o.type === 'user' && o.message) {
        const c = o.message.content;
        let text = '';
        if (typeof c === 'string') text = c;
        else if (Array.isArray(c)) {
          const t = c.find((x) => x.type === 'text');
          if (t) text = t.text;
        }
        if (text) {
          const isIde = /^<(ide_selection|ide_opened_file|command-message|command-name|local-command)/.test(text);
          if (!isIde) firstPrompt = text.replace(/\s+/g, ' ').trim();
          else if (!firstPrompt) firstPrompt = '[IDE-launched / slash-command first turn]';
        }
      }
      if (cwd && firstPrompt && summary) break;
    }
  } catch {}
  return { cwd, firstPrompt: firstPrompt || '(no user prompt parsed)', summary };
}

// Best-effort reconstruction of a cwd from a project-dir slug. The slug is the cwd with
// "/" flattened to "-", so original dashes in dir names are ambiguous — prefer the cwd
// parsed from the transcript when available. Handles both /Users (macOS) and /home (Linux).
function unsanitize(slug) {
  if (slug.startsWith('-Users-')) return '/Users' + slug.replace('-Users', '').replace(/-/g, '/');
  if (slug.startsWith('-home-')) return '/home' + slug.replace('-home', '').replace(/-/g, '/');
  return slug;
}

module.exports = { walk, parseSession, unsanitize };
