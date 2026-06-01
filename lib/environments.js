'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Origin detection ─────────────────────────────────────────────────────────────
// Which environment a Claude Code session was launched from. This is GENERAL, not a
// pile of per-tool special cases. A session's origin is resolved by walking these
// layers; the first match wins (most specific / user-controllable first):
//
//   1. User rules     — JSON at $CC_SESSIONS_RULES or ~/.config/cc-sessions/environments.json
//                       (+ the seeded defaults shipped with the tool). Lets users add or
//                       override recognition for tools the heuristics miss. Evaluated first
//                       so a user can override even our built-in guesses.
//   2. Path heuristic — cwd under a hidden per-tool home dir (~/.<tool>/...) => "<Tool>".
//                       Catches CLI-wrapping orchestrators (e.g. Superset = ~/.superset/
//                       worktrees/...) that all report entrypoint "cli". Zero per-tool code.
//   3. Known entrypoint map — cli => Terminal, claude-vscode => VSCode.
//   4. Unknown entrypoint   — auto-prettified (claude-foo => "Foo"); future IDE integrations
//                       get a sensible label for free.
//   5. Unknown => "—".
//
// HONEST LIMIT: a tool that launches the CLI from an ordinary directory with entrypoint
// "cli" and no distinguishing path leaves no signal separating it from a plain terminal.
// That tail is exactly what layer 1 (user rules) is for.
// ─────────────────────────────────────────────────────────────────────────────────

const HOME = os.homedir();

const KNOWN_ENTRYPOINTS = {
  cli: 'Terminal',
  'claude-vscode': 'VSCode',
};

// Hidden home-dir names that are infrastructure, not tools — never treated as an origin.
// (.claude is excluded because ~/.claude/worktrees is Claude Code's OWN worktree area;
// such sessions should fall through to their real entrypoint, e.g. Terminal/VSCode.)
const PATH_DENYLIST = new Set([
  '.config', '.cache', '.local', '.npm', '.cargo', '.rustup', '.nvm', '.pyenv',
  '.gem', '.bundle', '.docker', '.kube', '.aws', '.gnupg', '.ssh', '.git',
  '.vscode', '.claude', '.Trash', '.tmp',
]);

// Seeded community rules, shipped with the tool. Same shape as the user file; these run
// after the user's own rules (user overrides win). Keep this list small and conventional.
const SEED_RULES = [
  { label: 'Cursor', cwdMatch: '/\\.cursor/' },
];

function titleize(s) {
  s = String(s || '').replace(/^\./, '').replace(/[-_]+/g, ' ').trim();
  if (!s) return s;
  // Preserve all-caps-ish acronyms; otherwise capitalize first letter of each word.
  return s
    .split(' ')
    .map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function prettifyEntrypoint(ep) {
  return titleize(String(ep).replace(/^claude-/, '')) || ep;
}

// Load + compile user rules once. Invalid file / invalid regex degrade silently (skipped).
function loadUserRules() {
  const file =
    process.env.CC_SESSIONS_RULES ||
    path.join(HOME, '.config', 'cc-sessions', 'environments.json');
  let raw = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) raw = parsed;
  } catch {}
  return compileRules(raw);
}

function compileRules(raw) {
  const out = [];
  for (const r of raw) {
    if (!r || !r.label) continue;
    const rule = { label: r.label, entrypoint: r.entrypoint || null };
    try {
      rule.cwdRe = r.cwdMatch ? new RegExp(r.cwdMatch) : null;
      rule.slugRe = r.slugMatch ? new RegExp(r.slugMatch) : null;
    } catch {
      continue; // bad regex -> skip this rule
    }
    // A rule must constrain on something; otherwise it would match everything.
    if (!rule.entrypoint && !rule.cwdRe && !rule.slugRe) continue;
    out.push(rule);
  }
  return out;
}

function ruleMatches(rule, s) {
  if (rule.entrypoint && rule.entrypoint !== s.entrypoint) return false;
  if (rule.cwdRe && !(s.cwd && rule.cwdRe.test(s.cwd))) return false;
  if (rule.slugRe && !(s.slug && rule.slugRe.test(s.slug))) return false;
  return true;
}

// Extract a tool name from a cwd that lives under a hidden home dir: ~/.<tool>/...
function homeToolFromCwd(cwd) {
  if (!cwd || !cwd.startsWith(HOME + '/')) return null;
  const seg = cwd.slice(HOME.length + 1).split('/')[0];
  if (!seg || seg[0] !== '.' || PATH_DENYLIST.has(seg)) return null;
  return titleize(seg);
}

// Compiled user+seed rules, cached at module load. (Tests can call setRules to override.)
let RULES = [...loadUserRules(), ...compileRules(SEED_RULES)];

function setRules(rawRules) {
  RULES = compileRules(rawRules || []);
}

// Friendly label for a raw entrypoint value (e.g. "cli" -> "Terminal", "claude-x" -> "X").
function entrypointLabel(ep) {
  if (!ep) return null;
  return KNOWN_ENTRYPOINTS[ep] || prettifyEntrypoint(ep);
}

// Resolve origin for a session, returning { origin, source }. Layered, first match wins:
//   user-rule  -> user/community JSON rule
//   path       -> ~/.<tool>/ cwd heuristic (durable, authoritative)
//   entrypoint -> launch entrypoint: the transcript's BIRTH stamp (durable, primary), or
//                 the live registry value as a fallback. cli -> Terminal, claude-x -> X.
//   inferred   -> transcript IDE markers => "IDE" (a guess; last resort for pre-entrypoint
//                 transcripts; shown distinctly in the UI)
//   none       -> "—"
// s: { entrypoint (live registry), entrypointFirst (transcript birth), cwd, slug, ideMarkers }
function detectOrigin(s) {
  for (const r of RULES) if (ruleMatches(r, s)) return { origin: r.label, source: 'user-rule' };
  const tool = homeToolFromCwd(s.cwd);
  if (tool) return { origin: tool, source: 'path' };
  // Birth entrypoint from the transcript is durable; the live registry value is a fallback.
  const ep = s.entrypointFirst || s.entrypoint;
  if (ep) return { origin: entrypointLabel(ep), source: 'entrypoint' };
  if (s.ideMarkers) return { origin: 'IDE', source: 'inferred' };
  return { origin: '—', source: 'none' };
}

// CSS-class-safe slug of an origin label, for the HTML report.
function originSlug(origin) {
  const slug = String(origin || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'unknown';
}

module.exports = { detectOrigin, entrypointLabel, originSlug, setRules, titleize, prettifyEntrypoint };
