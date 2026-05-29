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

| Layer | Signal | `source` | Examples |
|------:|--------|----------|----------|
| 1 | **Your rules** (`~/.config/cc-sessions/environments.json`) | `user-rule` | anything you define — evaluated first, so you can override the rest |
| 2 | **`~/.<tool>/` cwd heuristic** | `path` | a session running under `~/.superset/…` → **Superset**; catches any CLI-wrapping orchestrator following the convention |
| 3 | **Live entrypoint** | `entrypoint` | `cli` → **Terminal**, `claude-vscode` → **VSCode**; unknown `claude-jetbrains` → **Jetbrains** (new integrations work with zero changes) |
| 4 | **Remembered (cache)** | `cache` | a now-closed session whose origin was snapshotted while it was live — see below |
| 5 | **Inferred (transcript markers)** | `inferred` | a closed session with `<ide_opened_file>` markers → **IDE** *(a guess — shown faded/italic with a `?`)* |
| 6 | **Unknown** | `none` | `—` (no live process, no path, never cached, no markers) |

Every row carries a machine-readable `source` in `--json`, so you always know *how* an origin was determined — and inferred guesses never masquerade as authoritative.

### Why origin needs a cache (and what "inferred" means)

The launch `entrypoint` (Terminal vs VSCode) is a **liveness signal**: Claude Code keeps it in a per-process file that exists only while the session is running, and it is **never written into the transcript**. So when you close a session, its entrypoint is gone for good. Two mechanisms keep origin from vanishing:

- **Cache (authoritative).** Every run, cc-sessions snapshots the origin of every *currently-live* session into `~/.config/cc-sessions/origins.json`. A session closed *after* cc-sessions has seen it keeps its real origin forever. (Limit: only sessions observed while live can be remembered — so run it now and then to capture your open sessions.)
- **Inferred fingerprint.** For sessions closed *before* they were ever cached, the durable `<ide_opened_file>`/`<ide_selection>` markers in the transcript infer **IDE** (`source: inferred`). It's shown distinctly because it's a guess, not the registry's word.

**Honest limitation:** a tool that launches the *CLI* from an ordinary directory, never cached and with no markers, leaves no signal separating it from a plain terminal — those stay `—`. For that case, add a rule. Set `$CC_SESSIONS_CACHE` to relocate the cache file.

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
