# Claude Code internals that cc-sessions depends on

`cc-sessions` reads two on-disk locations that Claude Code maintains. As of this writing
**neither is part of Claude Code's documented, supported public interface** — they're
observed behavior (Claude Code 2.1.x). This document records exactly what we rely on, why,
and how the tool is structured to survive a format change. It also serves as the basis for
a documentation request to Anthropic (see the end).

All paths are under `$CLAUDE_CONFIG_DIR` (default `~/.claude`).

---

## 1. Session transcripts — `projects/<slug>/<uuid>.jsonl`

Each session is a JSON-lines file. The pieces we read:

- **`<uuid>`** (the filename, minus `.jsonl`) — the session ID. This is the stable identity
  used everywhere (the `claude --resume <uuid>` argument, the key shown by every launching
  tool). It is the backbone of cross-environment matching.
- **`<slug>`** (the parent directory name) — the launch cwd with `/` flattened to `-`. Lossy
  (original dashes are ambiguous), so we prefer the cwd parsed from the file contents.
- **Per-line `cwd`** — the working directory. We take the first occurrence.
- **First user message** — used as the human-readable label. We read the first ~64 KB and
  take the first `type: "user"` message's text, **after stripping harness-injected wrapper
  blocks** (`<ide_opened_file>`, `<ide_selection>`, `<system-reminder>`, and slash-command
  tags like `<command-name>`). Without stripping, IDE/extension-launched sessions show a
  wrapper instead of what the user typed — and so wouldn't match the launching tool's menu.
- **`type: "summary"` lines** (when present) — an optional title. Rarely present in practice,
  so the first-user-message label is the common path.

Isolated in [`../lib/transcript.js`](../lib/transcript.js).

## 2. Process registry — `sessions/<pid>.json`

A small JSON file per live/recent Claude Code process. Fields we read:

- **`sessionId`** — joins a registry entry to a transcript UUID.
- **`entrypoint`** — the launch surface. Observed values: `cli`, `claude-vscode`. This is the
  most direct origin signal. **Caveat:** tools that wrap the CLI (e.g. Superset) inherit
  `entrypoint: "cli"`, so entrypoint alone can't distinguish them from a plain terminal — see
  the `~/.<tool>/` path heuristic in [`../lib/environments.js`](../lib/environments.js).
- **`cwd`** — the session's *current* working directory (more up to date than the transcript's
  first cwd; reflects worktrees the session moved into). Used for the resume command.
- **`updatedAt`** — to pick the freshest entry when a session has been reopened under a new pid.

**Lifecycle caveat:** these files are pruned over time, so older sessions have no registry
entry. Origin then degrades gracefully to the path heuristic or `—`. Isolated in
[`../lib/registry.js`](../lib/registry.js).

---

## Failure mode

If a future Claude Code release changes either format, the visible symptom is a **blank or
wrong Origin column and/or a missing first-prompt label — not a crash.** Both readers swallow
parse errors and return empty. Fixing a format change means editing one of the two isolated
modules above.

## Why we'd like these documented

`cc-sessions` (and a growing ecosystem of session managers, dashboards, and orchestrators)
already depends on this layout. A documented, versioned contract for **(a)** the transcript
filename/UUID convention and **(b)** the process-registry `entrypoint`/`cwd`/`sessionId`
fields would let these tools:

1. depend on stable field names instead of reverse-engineering them,
2. detect format/version changes deliberately (e.g. a `schemaVersion`) instead of silently
   degrading, and
3. correctly attribute launch origin — which benefits the editor/orchestrator integrations
   themselves, since their sessions become first-class and discoverable.

Even a minimal, explicitly "best-effort/may-change" note in the Claude Code docs would be a
big help. If you maintain Claude Code and are reading this: we'd love to talk.
