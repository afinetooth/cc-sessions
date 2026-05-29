'use strict';
const fs = require('fs');
const path = require('path');
const { walk, parseSession, unsanitize } = require('./transcript');
const { originLabel } = require('./environments');

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
      origin: originLabel(reg && reg.entrypoint),
      entrypoint: reg ? reg.entrypoint : null,
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
