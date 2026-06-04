#!/usr/bin/env node
'use strict';

// Integration test: build a synthetic CLAUDE_CONFIG_DIR (transcripts + process registry),
// run the real CLI against it, and assert origin detection, transcript-entrypoint recovery
// for closed sessions, first/last entrypoint ("moved environments"), the first-prompt
// wrapper-skip, the IDE fingerprint, user-rule precedence, and live-cwd resume. No deps.
//
// Fixtures are generated using the real os.homedir() so the ~/.<tool>/ path heuristic
// matches naturally without env spoofing.

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

function reset() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(PROJECTS, { recursive: true });
  fs.mkdirSync(SESSIONS, { recursive: true });
}
const slugFor = (cwd) => cwd.replace(/\//g, '-');

// Write a transcript (with optional entrypoint stamps that accumulate across "resumes") and,
// optionally, a live registry entry. registryEntrypoint set => the session is "live".
function makeSession({ uuid, cwd, content, registryEntrypoint, transcriptEntrypoints, liveCwd, pid }) {
  const dir = path.join(PROJECTS, slugFor(cwd));
  fs.mkdirSync(dir, { recursive: true });
  const eps = transcriptEntrypoints || [];
  const lines = [];
  const first = { type: 'user', cwd, message: { role: 'user', content } };
  if (eps[0]) first.entrypoint = eps[0];
  lines.push(JSON.stringify(first));
  for (let i = 1; i < eps.length; i++) {
    lines.push(JSON.stringify({ type: 'assistant', cwd, entrypoint: eps[i], message: { role: 'assistant', content: 'ok' } }));
  }
  fs.writeFileSync(path.join(dir, uuid + '.jsonl'), lines.join('\n') + '\n');
  if (registryEntrypoint) {
    fs.writeFileSync(
      path.join(SESSIONS, (pid || uuid) + '.json'),
      JSON.stringify({ sessionId: uuid, entrypoint: registryEntrypoint, cwd: liveCwd || cwd, updatedAt: 1 })
    );
  }
}

function run(extraEnv, extraArgs) {
  const out = execFileSync('node', [BIN, '--json', ...(extraArgs || [])], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: CFG, ...extraEnv },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

// Raw (non-JSON) CLI output, for asserting human-facing formats like --oneline.
function runRaw(extraEnv, extraArgs) {
  return execFileSync('node', [BIN, ...(extraArgs || [])], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: CFG, ...extraEnv },
    encoding: 'utf8',
  });
}

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

reset();

// 1. Closed Terminal session — NO registry, entrypoint only in the transcript (the v0.3 win).
makeSession({ uuid: 'u-term', cwd: HOME + '/work/a', transcriptEntrypoints: ['cli'], content: 'Fix the test' });

// 2. VSCode, with a wrapper block before the real prompt (tests wrapper-skip too).
makeSession({
  uuid: 'u-vscode',
  cwd: HOME + '/work/b',
  transcriptEntrypoints: ['claude-vscode'],
  content: [
    { type: 'text', text: '<ide_opened_file>opened foo.ts</ide_opened_file>' },
    { type: 'text', text: 'Add a logout button' },
  ],
});

// 3. Superset — transcript entrypoint cli, but ~/.superset/ path wins.
makeSession({ uuid: 'u-superset', cwd: HOME + '/.superset/worktrees/c', transcriptEntrypoints: ['cli'], content: 'Refactor' });

// 4. Cursor — seed rule (cwdMatch /\.cursor/).
makeSession({ uuid: 'u-cursor', cwd: HOME + '/.cursor/worktrees/d', transcriptEntrypoints: ['cli'], content: 'Styles' });

// 5. Unknown entrypoint -> auto-prettify "Jetbrains".
makeSession({ uuid: 'u-jb', cwd: HOME + '/work/e', transcriptEntrypoints: ['claude-jetbrains'], content: 'Hi' });

// 6. Ancient transcript: no entrypoint stamp at all, but an IDE marker -> "IDE" (inferred).
makeSession({
  uuid: 'u-ancient',
  cwd: HOME + '/work/f',
  content: [{ type: 'text', text: '<ide_opened_file>x</ide_opened_file>' }, { type: 'text', text: 'old one' }],
});

// 7. No signal at all -> "—".
makeSession({ uuid: 'u-none', cwd: HOME + '/work/g', content: 'nothing to go on' });

// 8. User-rule override beats the entrypoint.
makeSession({ uuid: 'u-acme', cwd: HOME + '/acme-thing', transcriptEntrypoints: ['cli'], content: 'Acme' });
fs.writeFileSync(RULES_FILE, JSON.stringify([{ label: 'Acme', slugMatch: 'acme' }]));

// 9. Moved environments: born in cli, last opened in VSCode.
makeSession({ uuid: 'u-moved', cwd: HOME + '/work/h', transcriptEntrypoints: ['cli', 'claude-vscode'], content: 'moved' });

// 10. Live-cwd resume: registry cwd differs from transcript cwd.
makeSession({
  uuid: 'u-live',
  cwd: HOME + '/work/i',
  transcriptEntrypoints: ['cli'],
  registryEntrypoint: 'cli',
  liveCwd: HOME + '/work/i/.claude/worktrees/feature',
  content: 'live',
});

// 11. ACTIVE: registry marker whose pid is a real running process (this test's own pid).
makeSession({ uuid: 'u-active', cwd: HOME + '/work/j', registryEntrypoint: 'cli', pid: process.pid, content: 'running' });

// 12. ORPHANED marker: a registry file exists but its pid is dead -> NOT active (honesty case).
makeSession({ uuid: 'u-orphan', cwd: HOME + '/work/k', registryEntrypoint: 'cli', pid: 2147483646, content: 'dead' });

const byId = Object.fromEntries(run({ CC_SESSIONS_RULES: RULES_FILE }).map((s) => [s.uuid, s]));

console.log('origin detection (durable, from the transcript):');
eq('closed terminal recovered -> Terminal', byId['u-term'].origin, 'Terminal');
eq('  ...source is entrypoint (not cache/none)', byId['u-term'].originSource, 'entrypoint');
eq('vscode -> VSCode', byId['u-vscode'].origin, 'VSCode');
eq('superset (path beats entrypoint)', byId['u-superset'].origin, 'Superset');
eq('cursor (seed rule)', byId['u-cursor'].origin, 'Cursor');
eq('unknown entrypoint prettified', byId['u-jb'].origin, 'Jetbrains');
eq('no signal -> —', byId['u-none'].origin, '—');
eq('user rule overrides entrypoint', byId['u-acme'].origin, 'Acme');

console.log('first-prompt wrapper skip:');
eq('vscode first prompt = typed text', byId['u-vscode'].firstPrompt, 'Add a logout button');

console.log('IDE fingerprint (last resort, pre-entrypoint transcript):');
eq('no entrypoint + IDE marker -> IDE', byId['u-ancient'].origin, 'IDE');
eq('  ...flagged inferred', byId['u-ancient'].originSource, 'inferred');

console.log('moved environments (first vs last entrypoint):');
eq('origin = birth (Terminal)', byId['u-moved'].origin, 'Terminal');
eq('lastOpenedIn = VSCode', byId['u-moved'].lastOpenedIn, 'VSCode');
eq('movedEnvironments flag set', byId['u-moved'].movedEnvironments, true);
eq('non-moved session not flagged', byId['u-term'].movedEnvironments, false);

console.log('active (live-process probe):');
eq('live pid -> active', byId['u-active'].active, true);
eq('orphaned marker (dead pid) -> not active', byId['u-orphan'].active, false);
eq('no registry -> not active', byId['u-term'].active, false);
eq('active session carries its pid', byId['u-active'].pid, process.pid);

console.log('--active filter:');
const activeOnly = run({ CC_SESSIONS_RULES: RULES_FILE }, ['--active']);
eq('--active returns only the live session', activeOnly.length, 1);
eq('  ...and it is u-active', activeOnly[0] && activeOnly[0].uuid, 'u-active');

console.log('--oneline format:');
const ol = runRaw({ CC_SESSIONS_RULES: RULES_FILE }, ['--oneline']);
const olLines = ol.trim().split('\n');
eq('one line per session (no header/footer)', olLines.length, Object.keys(byId).length);
eq('active row marked ● + carries pid', new RegExp('●.*u-active.*' + process.pid).test(ol), true);
eq('inactive row has no ● marker', /^\s+u-term\b/m.test(ol), true);

console.log('live-cwd resume + deep link:');
eq(
  'resume targets live cwd',
  byId['u-live'].resumeCmd,
  `cd ${HOME}/work/i/.claude/worktrees/feature && claude --resume u-live`
);
eq('vscode deep link present', byId['u-live'].vscodeLink, 'vscode://anthropic.claude-code/open?session=u-live');

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
