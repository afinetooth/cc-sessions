'use strict';
const fs = require('fs');
const path = require('path');

// ── CLAUDE CODE INTERNAL #2: session transcripts ────────────────────────────────
// `<CLAUDE_CONFIG_DIR>/projects/<slug>/<uuid>.jsonl` is a JSON-lines log of one
// session. The filename (minus .jsonl) is the session UUID; the parent dir <slug> is
// the launch cwd with path separators flattened to dashes. We read the head (and, for
// long files, the tail) and extract: the working dir (`cwd`), the first user prompt, a
// `summary` if present, IDE markers, and the launch `entrypoint`.
//
// `entrypoint` is stamped on transcript lines and ACCUMULATES across resumes, so the
// FIRST stamp is the session's birth surface and the LAST is the most recent one. Both
// are durable (they survive the session closing) — unlike the liveness-only process
// registry. This format is UNDOCUMENTED and may change across Claude Code releases
// (observed on CC 2.1.x). Isolated here so a spec change is a single-file fix.
// See docs/claude-code-internals.md.
// ─────────────────────────────────────────────────────────────────────────────────

const READ_BYTES = 65536;
const EP_RE = /"entrypoint":"([^"]*)"/g;

function entrypointsIn(str) {
  return [...str.matchAll(EP_RE)].map((m) => m[1]);
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

// Parse a transcript for { cwd, firstPrompt, summary, ideMarkers, entrypointFirst, entrypointLast }.
function parseSession(file) {
  let cwd = null;
  let firstPrompt = '';
  let summary = null;
  // Durable IDE fingerprint: <ide_opened_file>/<ide_selection> blocks are injected only by
  // IDE extensions. Used as a last resort for transcripts too old to stamp an entrypoint.
  let ideMarkers = false;
  let entrypointFirst = null;
  let entrypointLast = null;
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    const headLen = Math.min(size, READ_BYTES);
    const head = Buffer.alloc(headLen);
    fs.readSync(fd, head, 0, headLen, 0);
    const headStr = head.toString('utf8');
    ideMarkers = /<ide_opened_file|<ide_selection/.test(headStr);
    const headEps = entrypointsIn(headStr);
    if (headEps.length) entrypointFirst = headEps[0];
    // The most recent entrypoint lives at the tail of long transcripts (beyond the head window).
    if (size > headLen) {
      const tailLen = Math.min(size, READ_BYTES);
      const tail = Buffer.alloc(tailLen);
      fs.readSync(fd, tail, 0, tailLen, size - tailLen);
      const tailEps = entrypointsIn(tail.toString('utf8'));
      if (tailEps.length) entrypointLast = tailEps[tailEps.length - 1];
    }
    fs.closeSync(fd);
    if (!entrypointLast) entrypointLast = headEps.length ? headEps[headEps.length - 1] : null;

    for (const line of headStr.split('\n')) {
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
  return {
    cwd,
    firstPrompt: firstPrompt || '(no user prompt parsed)',
    summary,
    ideMarkers,
    entrypointFirst,
    entrypointLast,
  };
}

// Harness-injected wrapper blocks that prefix/surround the user's actual first message.
// We strip these so the displayed "first prompt" matches what the user actually typed.
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
  if (WRAPPER_OPEN_RE.test(t)) return '';
  return t;
}

// Best-effort reconstruction of a cwd from a project-dir slug. Prefer the cwd parsed from
// the transcript when available. Handles both /Users (macOS) and /home (Linux).
function unsanitize(slug) {
  if (slug.startsWith('-Users-')) return '/Users' + slug.replace('-Users', '').replace(/-/g, '/');
  if (slug.startsWith('-home-')) return '/home' + slug.replace('-home', '').replace(/-/g, '/');
  return slug;
}

module.exports = { walk, parseSession, unsanitize };
