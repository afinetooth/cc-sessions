'use strict';

// Origin detection — which environment a session was launched from.
//
// NOTE (Phase 1): this is the original entrypoint-only mapping, preserved verbatim so
// behavior is unchanged during the modular refactor. Phase 2 replaces it with a layered,
// data-driven rule table where cwd-path rules (e.g. Superset's ~/.superset/ worktrees)
// take precedence over the generic entrypoint mapping.
function originLabel(entrypoint) {
  if (entrypoint === 'claude-vscode') return 'VSCode';
  if (entrypoint === 'cli') return 'Terminal';
  return entrypoint || '—';
}

module.exports = { originLabel };
