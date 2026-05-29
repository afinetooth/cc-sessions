#!/usr/bin/env node
'use strict';

// Integration test: build a synthetic CLAUDE_CONFIG_DIR (transcripts + process registry),
// run the real CLI against it, and assert origin detection, the first-prompt wrapper-skip,
// user-rule override/precedence, and live-cwd resume. No deps, no network.
//
// Note: fixtures are generated at run time using the real os.homedir(), so the ~/.<tool>/
// path heuristic (which keys off the same home) matches naturally without env spoofing.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const BIN = path.join(__dirname, '..', 'bin', 'cc-sessions');
const ROOT = path.join(os.tmpdir(), 'cc-sessions-test');
const CFG = path.join(ROOT, '.claude');
const PROJECTS = path.join(CFG, 'projects');
const SESSIONS = path.join(CFG, 'sessions');
const RULES_FILE = path.join(ROOT, 'rules.json');
const CACHE_FILE = path.join(ROOT, 'origins-cache.json');

// ── fixture builders ───────────────────────────────────────────────────────────
function reset() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROJECTS, { recursive: true });
  fs.mkdirSync(SESSIONS, { recursive: true });
}

function slugFor(cwd) {
  return cwd.replace(/\//g, '-');
}

// Write a transcript and (optionally) a registry entry for one session.
function makeSession({ uuid, cwd, content, entrypoint, liveCwd, pid }) {
  const dir = path.join(PROJECTS, slugFor(cwd));
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({ type: 'user', cwd, message: { role: 'user', content } });
  fs.writeFileSync(path.join(dir, uuid + '.jsonl'), line + '\n');
  if (entrypoint) {
    fs.writeFileSync(
      path.join(SESSIONS, (pid || uuid) + '.json'),
      JSON.stringify({ sessionId: uuid, entrypoint, cwd: liveCwd || cwd, updatedAt: 1 })
    );
  }
}

function run(extraEnv) {
  const out = execFileSync('node', [BIN, '--json'], {
    // Sandbox the cache to a temp file so tests never touch the real ~/.config cache.
    env: { ...process.env, CLAUDE_CONFIG_DIR: CFG, CC_SESSIONS_CACHE: CACHE_FILE, ...extraEnv },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

// ── assertions ───────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
function eq(name, got, want) {
  if (got === want) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fail++;
    console.log('  ✗ ' + name + '\n      got:  ' + JSON.stringify(got) + '\n      want: ' + JSON.stringify(want));
  }
}
function ok(name, cond, detail) {
  eq(name, !!cond, true);
  if (!cond && detail) console.log('      ' + detail);
}

// ── fixtures ───────────────────────────────────────────────────────────────────
reset();

// 1. Terminal: cli entrypoint, ordinary cwd, plain string prompt.
makeSession({ uuid: 'u-terminal', cwd: HOME + '/work/proj-a', entrypoint: 'cli', content: 'Fix the failing test' });

// 2. VSCode: claude-vscode, wrapper block THEN real prompt in a separate block.
makeSession({
  uuid: 'u-vscode',
  cwd: HOME + '/work/proj-b',
  entrypoint: 'claude-vscode',
  content: [
    { type: 'text', text: '<ide_opened_file>The user opened foo.ts</ide_opened_file>' },
    { type: 'text', text: 'Add a logout button' },
  ],
});

// 3. Superset: cli entrypoint BUT cwd under ~/.superset/ — path heuristic must beat cli.
makeSession({ uuid: 'u-superset', cwd: HOME + '/.superset/worktrees/proj-c', entrypoint: 'cli', content: 'Refactor the parser' });

// 4. Cursor: seed rule (cwdMatch /\.cursor/) — cwd under ~/.cursor/.
makeSession({ uuid: 'u-cursor', cwd: HOME + '/.cursor/worktrees/proj-d', entrypoint: 'cli', content: 'Tweak styles' });

// 5. Unknown entrypoint: claude-jetbrains -> auto-prettify "Jetbrains".
makeSession({ uuid: 'u-jb', cwd: HOME + '/work/proj-e', entrypoint: 'claude-jetbrains', content: 'Hello' });

// 6. No registry entry at all -> Unknown "—".
makeSession({ uuid: 'u-orphan', cwd: HOME + '/work/proj-f', content: 'Old session' });

// 7. Live cwd: registry cwd differs from transcript cwd -> resume targets the live cwd.
makeSession({
  uuid: 'u-live',
  cwd: HOME + '/work/proj-g',
  entrypoint: 'cli',
  liveCwd: HOME + '/work/proj-g/.claude/worktrees/feature',
  content: 'Work in a worktree',
});

// 8. User-rule override: cli + ordinary cwd whose slug contains "acme" -> rule wins over Terminal.
makeSession({ uuid: 'u-acme', cwd: HOME + '/acme-thing', entrypoint: 'cli', content: 'Acme work' });
fs.writeFileSync(RULES_FILE, JSON.stringify([{ label: 'Acme', slugMatch: 'acme' }]));

// 9. Fingerprint: no registry, ordinary cwd, but transcript has an IDE marker -> "IDE" (inferred).
makeSession({
  uuid: 'u-ide',
  cwd: HOME + '/work/proj-ide',
  content: [
    { type: 'text', text: '<ide_opened_file>opened bar.ts</ide_opened_file>' },
    { type: 'text', text: 'do a thing' },
  ],
});

// 10. Cache: live cli session (Terminal). After it "closes", origin must persist from cache.
makeSession({ uuid: 'u-cacheme', cwd: HOME + '/work/proj-cache', entrypoint: 'cli', content: 'cache me' });

// ── run + assert ───────────────────────────────────────────────────────────────
console.log('origin detection:');
const byId = Object.fromEntries(run({ CC_SESSIONS_RULES: RULES_FILE }).map((s) => [s.uuid, s]));

eq('terminal -> Terminal', byId['u-terminal'].origin, 'Terminal');
eq('vscode -> VSCode', byId['u-vscode'].origin, 'VSCode');
eq('superset (cli+path) -> Superset (path beats cli)', byId['u-superset'].origin, 'Superset');
eq('cursor (seed rule) -> Cursor', byId['u-cursor'].origin, 'Cursor');
eq('unknown entrypoint -> prettified', byId['u-jb'].origin, 'Jetbrains');
eq('no registry -> Unknown', byId['u-orphan'].origin, '—');
eq('user rule overrides entrypoint', byId['u-acme'].origin, 'Acme');

console.log('first-prompt wrapper skip:');
eq('vscode first prompt = real typed text', byId['u-vscode'].firstPrompt, 'Add a logout button');
eq('terminal first prompt = plain text', byId['u-terminal'].firstPrompt, 'Fix the failing test');

console.log('live-cwd resume:');
ok(
  'resume targets live cwd, not transcript cwd',
  byId['u-live'].resumeCmd === `cd ${HOME}/work/proj-g/.claude/worktrees/feature && claude --resume u-live`,
  'resumeCmd=' + byId['u-live'].resumeCmd
);

console.log('transcript fingerprint:');
eq('inferred origin source flagged', byId['u-ide'].originSource, 'inferred');
eq('inferred -> IDE label', byId['u-ide'].origin, 'IDE');
eq('plain terminal not mislabeled IDE', byId['u-terminal'].origin, 'Terminal');

console.log('origin persistence cache:');
eq('live session is Terminal (source=entrypoint)', byId['u-cacheme'].origin, 'Terminal');
eq('  ...sourced live', byId['u-cacheme'].originSource, 'entrypoint');
// Simulate closing the session: delete its registry entry, then re-read.
fs.rmSync(path.join(SESSIONS, 'u-cacheme.json'));
const afterClose = Object.fromEntries(run({ CC_SESSIONS_RULES: RULES_FILE }).map((s) => [s.uuid, s]));
eq('closed session keeps origin via cache', afterClose['u-cacheme'].origin, 'Terminal');
eq('  ...now sourced from cache', afterClose['u-cacheme'].originSource, 'cache');

console.log('without user rules (precedence sanity):');
const noRules = Object.fromEntries(run({ CC_SESSIONS_RULES: path.join(ROOT, 'none.json') }).map((s) => [s.uuid, s]));
eq('acme falls back to Terminal when no rule', noRules['u-acme'].origin, 'Terminal');

// ── result ───────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
