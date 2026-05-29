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

// Harness-injected wrapper blocks that prefix/surround the user's actual first message.
// We strip these so the displayed "first prompt" matches what the user actually typed —
// i.e. what Claude Code's own resume picker / IDE "Session History" menu shows.
const WRAPPER_TAGS = [
  'ide_opened_file',
  'ide_selection',
  'system-reminder',
  'command-message',
  'command-name',
  'command-args',
  'local-command-stdout',
  'local-command-stderr',
];
const WRAPPER_OPEN_RE = new RegExp('^<(' + WRAPPER_TAGS.join('|') + ')(?:\\s|>|/>)');

// Strip leading wrapper blocks (paired or self-closing) from a text block, returning the
// first real typed content. Returns '' if the block is entirely wrappers (or an unclosed
// wrapper that ran past our read window — we decline to surface raw tag soup).
function stripLeadingWrappers(text) {
  let t = String(text || '');
  let changed = true;
  while (changed) {
    changed = false;
    t = t.replace(/^\s+/, '');
    for (const tag of WRAPPER_TAGS) {
      const paired = new RegExp('^<' + tag + '(?:\\s[^>]*)?>[\\s\\S]*?</' + tag + '>');
      const selfClose = new RegExp('^<' + tag + '(?:\\s[^>]*)?/>');
      if (paired.test(t)) {
        t = t.replace(paired, '');
        changed = true;
      } else if (selfClose.test(t)) {
        t = t.replace(selfClose, '');
        changed = true;
      }
    }
  }
  t = t.trim();
  // Guard: an unclosed wrapper (closing tag beyond the read window) — don't surface it.
  if (WRAPPER_OPEN_RE.test(t)) return '';
  return t;
}

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
  // Durable IDE fingerprint: <ide_opened_file>/<ide_selection> blocks are injected only by
  // IDE extensions (VSCode/Cursor). Their presence survives in the transcript forever, so it
  // can infer "IDE" origin for a closed session whose registry entry is long gone.
  let ideMarkers = false;
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(READ_BYTES);
    const bytes = fs.readSync(fd, buf, 0, READ_BYTES, 0);
    fs.closeSync(fd);
    const headStr = buf.toString('utf8', 0, bytes);
    ideMarkers = /<ide_opened_file|<ide_selection/.test(headStr);
    const lines = headStr.split('\n');
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
        const texts = [];
        if (typeof c === 'string') texts.push(c);
        else if (Array.isArray(c)) {
          for (const x of c) if (x.type === 'text' && x.text) texts.push(x.text);
        }
        // Walk this message's text blocks in order; take the first that has real typed
        // content once wrapper blocks are stripped. (The real prompt is often a separate
        // block after an <ide_opened_file>/<system-reminder> block, or inline after it.)
        for (const raw of texts) {
          const stripped = stripLeadingWrappers(raw);
          if (stripped) {
            firstPrompt = stripped.replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
      if (cwd && firstPrompt && summary) break;
    }
  } catch {}
  return { cwd, firstPrompt: firstPrompt || '(no user prompt parsed)', summary, ideMarkers };
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
