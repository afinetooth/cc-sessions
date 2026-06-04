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
cc-sessions --active              Only sessions running right now (live process)
cc-sessions --oneline             Compact one-line-per-session output (pipe-friendly)
cc-sessions --html                Generate HTML report and open in browser
cc-sessions --json                JSON output (for scripts)
cc-sessions --resume              Interactive fzf picker; prints a resume command
cc-sessions --help                Help
```

Each invocation re-scans the filesystem, so it always reflects current state.

`--oneline` prints one session per line — live-marker, uuid, pid, origin, first prompt — with no header or footer, so it pipes cleanly (`cc-sessions --active --oneline | grep …`). The first prompt is truncated to your terminal width so every entry stays on a single row.

In the HTML report, every row has two copy buttons: **copy resume** (a `cd … && claude --resume <uuid>` command for the terminal) and **copy vscode** (a `vscode://anthropic.claude-code/open?session=<uuid>` deep link that opens the session in the VS Code extension — open the session's project folder in VS Code first, since the extension scopes sessions to the open workspace).

## Active sessions

Most of what you see is **history** — every transcript Claude Code has ever written stays on disk forever. A small subset is **active**: a `claude` process is running for it right now. cc-sessions tells them apart:

- the HTML report has a sortable/filterable **Status** column with a green `● live` badge (and an *N active* count in the header — filter the search box by `live`),
- the terminal table prefixes live rows with `●` and reports `(N active)`,
- `--json` adds `active` (boolean) and `pid`,
- `cc-sessions --active` lists only the running ones.

Liveness is **probed, not assumed**: a session counts as active only if its process id is actually running. Claude Code drops a marker file per process and removes it on exit, but a process that's killed hard (or crashes) can leave the marker behind — cc-sessions checks the pid (a no-op signal-0 probe) so an orphaned marker doesn't read as alive.

## Origin detection

`cc-sessions` figures out which environment launched a session using general signals — not a hardcoded list. Resolution is layered; the **first match wins**:

| Layer | Signal | `source` | Examples |
|------:|--------|----------|----------|
| 1 | **Your rules** (`~/.config/cc-sessions/environments.json`) | `user-rule` | anything you define — evaluated first, so you can override the rest |
| 2 | **`~/.<tool>/` cwd heuristic** | `path` | a session running under `~/.superset/…` → **Superset**; catches any CLI-wrapping orchestrator following the convention |
| 3 | **Launch entrypoint** (read from the transcript — durable) | `entrypoint` | `cli` → **Terminal**, `claude-vscode` → **VSCode**; unknown `claude-jetbrains` → **Jetbrains** (new integrations work with zero changes) |
| 4 | **Inferred** (transcript IDE markers) | `inferred` | a pre-entrypoint transcript with `<ide_opened_file>` → **IDE** *(a guess — shown faded/italic with a `?`)* |
| 5 | **Unknown** | `none` | `—` (no path, no entrypoint stamp, no markers — only the very oldest transcripts) |

Every row carries a machine-readable `source` in `--json`, so you always know *how* an origin was determined — and inferred guesses never masquerade as authoritative.

### Durable origin, and "last opened in"

The launch `entrypoint` is **stamped into the transcript** and accumulates across resumes, so origin **survives a session closing — no cache required.** cc-sessions reads:

- the **first** stamp → `origin` (where the session was *born*), and
- the **last** stamp → `lastOpenedIn` (where it was *most recently* opened — your best resume target).

When those differ, the session **moved environments** (e.g. born in Terminal, last opened in VSCode): the HTML flags it with a small `→ VSCode`, and `--json` sets `movedEnvironments: true`.

**Inferred fallback.** The only sessions without a stamp are transcripts older than when Claude Code began recording it. If such a transcript has `<ide_opened_file>` markers, origin is inferred as **IDE** (`source: inferred`, shown distinctly); otherwise it stays `—`. (On a real 87-session machine this was just **2** sessions.)

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

## Roadmap

Possible future work — contributions welcome:

- **Hide subagent sessions by default.** Sub-agent transcripts (`agent-*.jsonl`, the side-chains Claude Code spawns within a turn) are listed alongside top-level sessions today. A flag to hide them by default (e.g. `--all` to opt back in) would de-clutter the common view.
- **Anthropic documentation PR.** [`docs/claude-code-internals.md`](docs/claude-code-internals.md) is written as a seed for proposing that Claude Code officially document the transcript and process-registry formats this tool depends on, so they stop being undocumented internals.

## License

MIT © James Kessler
