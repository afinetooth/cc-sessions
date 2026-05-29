#!/usr/bin/env bash
# cc-sessions installer — symlinks the CLI onto your PATH and (optionally) adds the
# `sessions` / `resume` aliases to your shell rc. Idempotent: safe to re-run. No deps
# beyond Node.js (>=16) and a POSIX shell.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO_DIR/bin/cc-sessions"

# --- pick a writable bin dir already on PATH (prefer ~/.local/bin, then ~/bin) -------
choose_bindir() {
  for d in "$HOME/.local/bin" "$HOME/bin"; do
    case ":$PATH:" in *":$d:"*) echo "$d"; return;; esac
  done
  # Neither is on PATH yet — default to ~/.local/bin and warn.
  echo "$HOME/.local/bin"
}
BIN_DIR="$(choose_bindir)"
mkdir -p "$BIN_DIR"
LINK="$BIN_DIR/cc-sessions"

# --- node check ---------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js (>=16) is required but 'node' was not found on PATH." >&2
  exit 1
fi

# --- symlink the CLI ----------------------------------------------------------------
ln -sf "$SRC" "$LINK"
chmod +x "$SRC"
echo "✓ linked $LINK -> $SRC"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "! $BIN_DIR is not on your PATH — add it, e.g.:  export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac

# --- optional aliases ---------------------------------------------------------------
# Detect the rc for the current shell.
detect_rc() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh)  echo "$HOME/.zshrc" ;;
    bash) [ -f "$HOME/.bashrc" ] && echo "$HOME/.bashrc" || echo "$HOME/.bash_profile" ;;
    *)    echo "" ;;
  esac
}
RC="$(detect_rc)"

ADD_ALIASES="${CC_SESSIONS_ADD_ALIASES:-ask}"  # ask | yes | no  (env override for non-interactive installs)
if [ -n "$RC" ]; then
  if grep -q "alias sessions=" "$RC" 2>/dev/null; then
    echo "✓ aliases already present in $RC"
  else
    if [ "$ADD_ALIASES" = "ask" ] && [ -t 0 ]; then
      printf "Add 'sessions' and 'resume' aliases to %s? [y/N] " "$RC"
      read -r reply
      [ "$reply" = "y" ] || [ "$reply" = "Y" ] && ADD_ALIASES=yes || ADD_ALIASES=no
    fi
    if [ "$ADD_ALIASES" = "yes" ]; then
      cp "$RC" "$RC.cc-sessions.bak" 2>/dev/null || true
      {
        echo ""
        echo "# cc-sessions — Claude Code session inventory & resume tool"
        echo "alias sessions='cc-sessions --html'"
        echo "alias resume='cc-sessions --resume'"
      } >> "$RC"
      echo "✓ added aliases to $RC (backup: $RC.cc-sessions.bak) — open a new shell or 'source $RC'"
    else
      echo "· skipped aliases. Run directly with: cc-sessions --html"
    fi
  fi
fi

echo ""
echo "Done. Try:  cc-sessions --help"
