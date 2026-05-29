# cc-sessions

**See every Claude Code session in one place — across Terminal, the VSCode extension, Cursor, Superset, and more — then find and resume any of them.**

Claude Code can be launched from many surfaces, and each one feels like its own little island of history. But every session, no matter where it was launched, is written to the same place on disk. `cc-sessions` reads all of them and gives you one inventory: newest-first, searchable, sortable, with the **launch environment** labeled and a one-click **resume** command for each.

```
$ sessions          # opens an HTML report in your browser
$ cc-sessions        # or a plain table in the terminal
```

## Why

- **One list, every environment.** Stop hunting through separate Terminal scrollback, VSCode "Session History" menus, and orchestrator UIs.
- **Know where a session came from.** The **Origin** column tells you whether a session was a Terminal run, the VSCode extension, Cursor, Superset, or another tool — so you can go resume it *in the right place*, whether that's a copy-paste `claude --resume` or that tool's own UI.
- **Resume from anywhere.** Each row carries `cd <cwd> && claude --resume <uuid>`, targeting the session's *current* working directory (e.g. a worktree it moved into).
- **Stable identity.** Sessions are keyed by their UUID — the one identifier that's identical across every tool — so the text you see here matches what the launching tool shows.

## Install

Requires **Node.js ≥ 16**. No runtime dependencies.

### From a clone (recommended)

```bash
git clone https://github.com/afinetooth/cc-sessions
cd cc-sessions
./install.sh          # symlinks the CLI onto your PATH; offers to add aliases
```

### From npm

```bash
npm install -g @afinetooth/cc-sessions     # the command is still `cc-sessions`
# or run without installing:
npx @afinetooth/cc-sessions --html
```

> The npm package is scoped (`@afinetooth/cc-sessions`) because the bare `cc-sessions` name was already taken; the installed **command** is `cc-sessions`.

### Aliases

The installer offers to add these (you can also add them by hand):

```bash
alias sessions='cc-sessions --html'    # generate + open the HTML report
alias resume='cc-sessions --resume'    # fzf picker -> prints a resume command
```

## Usage

```
cc-sessions                       Print sessions newest-first (terminal table)
cc-sessions --limit 30            Show top 30
cc-sessions --grep "WAYVE"        Filter by first-prompt / summary / cwd / uuid
cc-sessions --cwd coveralls       Filter by cwd slug (substring)
cc-sessions --since 2026-05-01    Only sessions modified on/after a date
cc-sessions --html                Generate HTML report and open in browser
cc-sessions --json                JSON output (for scripts)
cc-sessions --resume              Interactive fzf picker; prints a resume command
cc-sessions --help                Help
```

Each invocation re-scans the filesystem, so it always reflects current state.

## Origin detection

`cc-sessions` figures out which environment launched a session using general signals — not a hardcoded list. Resolution is layered; the **first match wins**:

| Layer | Signal | Examples |
|------:|--------|----------|
| 1 | **Your rules** (`~/.config/cc-sessions/environments.json`) | anything you define — evaluated first, so you can override the rest |
| 2 | **`~/.<tool>/` cwd heuristic** | a session running under `~/.superset/…` → **Superset**; catches any CLI-wrapping orchestrator following the convention |
| 3 | **Known entrypoint** | `cli` → **Terminal**, `claude-vscode` → **VSCode** |
| 4 | **Unknown entrypoint, auto-labeled** | `claude-jetbrains` → **Jetbrains** (new editor integrations work with zero changes) |
| 5 | **Unknown** | `—` (older sessions whose process metadata has been cleaned up) |

**Honest limitation:** a tool that launches the Claude Code *CLI* from an ordinary directory, with no distinguishing path, leaves no signal separating it from a plain terminal. There's nothing to detect — so for that case, add a rule.

### Adding your own environments

Create `~/.config/cc-sessions/environments.json` (or point `$CC_SESSIONS_RULES` at any file). Each rule matches when **all** of its conditions match; the first matching rule wins, and your rules run before the built-ins:

```json
[
  { "label": "Cursor",   "cwdMatch": "/\\.cursor/" },
  { "label": "Acme",     "slugMatch": "acme-worktrees" },
  { "label": "My Tool",  "entrypoint": "claude-mytool" }
]
```

- `cwdMatch` — regex tested against the session's working directory
- `slugMatch` — regex tested against the project-dir slug
- `entrypoint` — exact match against the launch entrypoint

See [`examples/environments.json`](examples/environments.json). PRs that add widely-useful tools to the built-in seed rules are welcome.

## How it works (and what could break)

`cc-sessions` reads two locations that Claude Code maintains but does **not** officially document:

- `~/.claude/projects/**/*.jsonl` — session transcripts (UUID, cwd, first prompt)
- `~/.claude/sessions/<pid>.json` — a process registry (launch entrypoint, live cwd)

These are isolated in [`lib/transcript.js`](lib/transcript.js) and [`lib/registry.js`](lib/registry.js) so that if Claude Code changes a format, it's a one-file fix. If a future version changes them, the visible symptom is a blank Origin column — not a crash. Full details and the rationale for documenting these are in [`docs/claude-code-internals.md`](docs/claude-code-internals.md).

Set `$CLAUDE_CONFIG_DIR` to point at a non-default Claude Code data directory.

## License

MIT © James Kessler
