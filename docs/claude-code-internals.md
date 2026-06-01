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
- **`entrypoint`** — the launch surface (`cli`, `claude-vscode`, …), stamped on transcript
  lines and **accumulating across resumes**. The **first** occurrence is the session's birth
  surface (`origin`); the **last** occurrence is the most recent one (`lastOpenedIn`). Because
  it lives in the transcript, origin is **durable** — it survives the session closing. We read
  the first from the head and the last from the tail (it sits at the very end of long files).
  This is the primary origin signal.

Isolated in [`../lib/transcript.js`](../lib/transcript.js).

## 2. Process registry — `sessions/<pid>.json`

A **liveness marker** — one JSON file per Claude Code process that is *currently running*
(like a PID/lock file). It is created when a process starts and removed when that process
exits; it is **not** aged out or pruned on a timer. (Verified: every registry file on a test
machine corresponded to a live `claude` PID, including sessions idle for weeks; many *recent*
but closed sessions had none.) Fields we read:

- **`sessionId`** — joins a registry entry to a transcript UUID.
- **`entrypoint`** — the launch surface (`cli`, `claude-vscode`). This is the *live/current*
  copy of the same value the transcript stamps; we use it only as a fallback to the transcript.
  **Caveat:** tools that wrap the CLI (e.g. Superset) inherit `entrypoint: "cli"`, so entrypoint
  alone can't distinguish them from a plain terminal — that's what the `~/.<tool>/` path
  heuristic in [`../lib/environments.js`](../lib/environments.js) is for.
- **`cwd`** — the session's *current* working directory (more up to date than the transcript's
  first cwd; reflects worktrees the session moved into). Used for the resume command.
- **`updatedAt`** — to pick the freshest entry when a session has been reopened under a new pid.

**Lifecycle caveat:** the registry file exists only while the process is alive, so a **closed**
session has no entry. That is fine for origin, because `entrypoint` is *also* stamped durably in
the transcript (above) — the registry is only needed for the live `cwd` (resume target) and for
knowing a session is currently running. Earlier versions of cc-sessions wrongly assumed
entrypoint lived *only* here and added a persistence cache; that was removed in v0.3 once the
transcript stamp was found to be durable.
Isolated in [`../lib/registry.js`](../lib/registry.js).

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
