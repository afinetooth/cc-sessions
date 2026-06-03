'use strict';

// Machine-readable output. resumeCmd is the canonical "jump back in from a terminal"
// command; GUI environments (VSCode, Cursor, Superset) resume the same transcript by
// their own means — the uuid is the stable key across all of them.
function renderJson(filtered) {
  return JSON.stringify(
    filtered.map((s) => ({
      uuid: s.uuid,
      cwd: s.cwd,
      mtime: s.mtime.toISOString(),
      sizeBytes: s.size,
      isSubagent: s.isSubagent,
      active: s.active,
      pid: s.pid,
      origin: s.origin,
      originSource: s.originSource,
      lastOpenedIn: s.lastEntrypoint,
      movedEnvironments: s.entrypointMoved,
      liveEntrypoint: s.entrypoint,
      firstPrompt: s.firstPrompt,
      summary: s.summary,
      path: s.path,
      resumeCmd: `cd ${s.resumeCwd || s.cwd} && claude --resume ${s.uuid}`,
      vscodeLink: `vscode://anthropic.claude-code/open?session=${s.uuid}`,
    })),
    null,
    2
  );
}

module.exports = { renderJson };
