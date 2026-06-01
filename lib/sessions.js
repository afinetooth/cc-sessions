'use strict';
const fs = require('fs');
const path = require('path');
const { walk, parseSession, unsanitize } = require('./transcript');
const { detectOrigin, entrypointLabel } = require('./environments');

// Build the full session list from the projects dir, joined to the process registry.
// Sessions are returned newest-first. cwd/firstPrompt/summary are filled lazily via
// ensureParsed() so we only crack open transcripts we actually display.
function collect(projectsDir, registry) {
  const all = [];
  for (const f of walk(projectsDir)) {
    const st = fs.statSync(f);
    const slug = path.basename(path.dirname(f));
    const uuid = path.basename(f).replace(/\.jsonl$/, '');
    const reg = registry[uuid];
    all.push({
      uuid,
      slug,
      mtime: st.mtime,
      size: st.size,
      path: f,
      isSubagent: uuid.startsWith('agent-'),
      entrypoint: reg ? reg.entrypoint : null,
      // The registry's cwd is the session's CURRENT dir (e.g. a worktree it moved into);
      // prefer it for the resume command over the transcript's stale first-cwd.
      liveCwd: reg ? reg.cwd : null,
      origin: '—', // resolved in ensureParsed once cwd is known
      _parsed: false,
    });
  }
  all.sort((a, b) => b.mtime - a.mtime);
  return all;
}

// Lazily fill cwd / firstPrompt / summary from the transcript head.
function ensureParsed(s) {
  if (s._parsed) return;
  const p = parseSession(s.path);
  s.cwd = p.cwd || unsanitize(s.slug);
  s.firstPrompt = p.firstPrompt;
  s.summary = p.summary;
  s.ideMarkers = p.ideMarkers;
  s.entrypointFirst = p.entrypointFirst;
  s.entrypointLast = p.entrypointLast;
  // Origin = where the session was born (durable). Resolution needs the parsed cwd + entrypoint.
  const r = detectOrigin({
    entrypoint: s.entrypoint,
    entrypointFirst: p.entrypointFirst,
    cwd: s.cwd,
    slug: s.slug,
    ideMarkers: s.ideMarkers,
  });
  s.origin = r.origin;
  s.originSource = r.source;
  // "Last opened in" — the most-recent launch surface; flag when it differs from birth.
  s.lastEntrypoint = entrypointLabel(p.entrypointLast);
  s.entrypointMoved = !!(p.entrypointFirst && p.entrypointLast && p.entrypointFirst !== p.entrypointLast);
  // The command to jump back in from a terminal — target the live cwd when we have it.
  s.resumeCwd = s.liveCwd || s.cwd;
  s._parsed = true;
}

// Apply CLI filters in the original order. grep/limit force a parse where needed; we
// also parse every survivor at the end so renderers can rely on cwd/firstPrompt.
function applyFilters(all, opts) {
  let filtered = all;
  if (opts.cwdFilter) {
    const q = opts.cwdFilter.toLowerCase();
    filtered = filtered.filter((s) => s.slug.toLowerCase().includes(q));
  }
  if (opts.since && !isNaN(opts.since.getTime())) {
    filtered = filtered.filter((s) => s.mtime >= opts.since);
  }
  if (opts.grep) {
    const q = opts.grep.toLowerCase();
    filtered = filtered.filter((s) => {
      ensureParsed(s);
      return (
        (s.firstPrompt || '').toLowerCase().includes(q) ||
        (s.summary || '').toLowerCase().includes(q) ||
        (s.cwd || '').toLowerCase().includes(q) ||
        s.uuid.toLowerCase().includes(q)
      );
    });
  }
  if (opts.limit && opts.limit > 0) filtered = filtered.slice(0, opts.limit);
  for (const s of filtered) ensureParsed(s);
  return filtered;
}

module.exports = { collect, ensureParsed, applyFilters };
