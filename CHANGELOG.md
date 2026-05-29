# Changelog

All notable changes to this project are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/afinetooth/cc-sessions/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/afinetooth/cc-sessions/releases/tag/v0.1.0
