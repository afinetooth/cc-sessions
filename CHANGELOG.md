# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-06-03

### Added
- **Active-session indicator.** Each session now shows whether a Claude process is running for
  it right now. The HTML report gains a sortable/filterable **Status** column with a green
  `● live` badge and an active count in the header; the terminal table prefixes live rows with
  `●` and reports `(N active)`; `--json` gains `active` (boolean) and `pid`.
- **`--active` filter** — list only sessions with a live process (e.g. `cc-sessions --active`).

### Changed
- Liveness is **probed**, not assumed: a session is "active" only if its registry pid is a real
  running process (signal-0 check). An orphaned marker left by a hard-killed/crashed process
  (which never removed its own file) correctly reads as **not active**.
- Docs/comments: the process registry is described consistently as a liveness marker keyed by pid.

## [0.3.0] - 2026-06-01

### Added
- **Durable origin from the transcript.** `entrypoint` is stamped into the transcript and
  accumulates across resumes, so origin now survives a session closing — no cache needed. Reads
  the first stamp (`origin`, birth) from the head and the last (`lastOpenedIn`) from the tail.
- **"Moved environments"** detection: when birth and most-recent entrypoints differ (e.g. born
  in Terminal, last opened in VSCode), the HTML shows `→ VSCode` and `--json` sets
  `movedEnvironments: true`. New `--json` fields: `lastOpenedIn`, `movedEnvironments`, `liveEntrypoint`.
- **`vscode://` deep-link button** ("copy vscode") in the HTML report, alongside "copy resume".
- GitHub Actions CI: `node --check` + the test suite on Node 18/20/22.

### Changed
- Origin ladder is now: user rules → `~/.<tool>/` path → transcript/live entrypoint →
  IDE-marker fallback → `—`. On a real 87-session machine, unknown origins dropped from 55 to 2
  (only the two transcripts predating the entrypoint stamp).

### Removed
- The origin-persistence cache (`lib/cache.js`, `$CC_SESSIONS_CACHE`) — redundant now that the
  transcript carries `entrypoint` durably. It was built on the mistaken belief that entrypoint
  lived only in the (liveness-only) process registry.

## [0.2.0] - 2026-05-29

### Added
- **Origin persistence cache** (`~/.config/cc-sessions/origins.json`, override `$CC_SESSIONS_CACHE`):
  on every run, the origin of each currently-live session is snapshotted, so a session keeps its
  real origin after its process exits (the registry `entrypoint` is liveness-only and never stored
  in the transcript).
- **Transcript fingerprint**: closed sessions with `<ide_opened_file>`/`<ide_selection>` markers are
  inferred as **IDE**, shown distinctly (faded/italic, trailing `?`/`*`) so a guess never reads as fact.
- **`originSource`** field in `--json` (`user-rule` | `path` | `entrypoint` | `cache` | `inferred` |
  `none`) — every origin says how it was determined.

### Changed
- Origin resolution is now a 6-layer ladder: user rules → `~/.<tool>/` path → live entrypoint →
  cache → transcript fingerprint → `—`.
- Docs corrected: the process registry is a **liveness marker** (one file per running process,
  removed on exit), not "pruned over time".

## [0.1.0] - 2026-05-29

First public release.

### Added
- Cross-environment session inventory: HTML report (`--html`), terminal table (default),
  and JSON (`--json`), newest-first, with filtering (`--grep`, `--cwd`, `--since`, `--limit`)
  and an interactive fzf resume picker (`--resume`).
- **Origin** column with general, layered detection (user JSON rules → `~/.<tool>/` cwd
  heuristic → known entrypoint → auto-prettified unknown entrypoint → `—`). Recognizes
  Terminal, VSCode, Cursor, and CLI-wrapping orchestrators (e.g. Superset) out of the box.
- User/community-extensible rules via `~/.config/cc-sessions/environments.json` or
  `$CC_SESSIONS_RULES`; seeded with Cursor/Windsurf. Example in `examples/`.
- First-prompt labels strip harness wrapper blocks (`<ide_opened_file>`, `<system-reminder>`,
  slash-command tags) so they match Claude Code's own resume/Session-History listings.
- Resume command targets the session's live cwd (from the process registry) when available.
- `install.sh` (symlink + optional aliases, idempotent, shell/path-agnostic) and npm packaging
  (`@afinetooth/cc-sessions`; command stays `cc-sessions`).
- Honors `$CLAUDE_CONFIG_DIR` for non-default Claude Code data directories.
- Modular `lib/` layout isolating the two undocumented Claude Code internals
  (`lib/transcript.js`, `lib/registry.js`); see `docs/claude-code-internals.md`.
- Zero-dependency integration test suite (`test/run.js`).

[Unreleased]: https://github.com/afinetooth/cc-sessions/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/afinetooth/cc-sessions/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/afinetooth/cc-sessions/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/afinetooth/cc-sessions/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/afinetooth/cc-sessions/releases/tag/v0.1.0
