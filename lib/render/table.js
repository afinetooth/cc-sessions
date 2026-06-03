'use strict';
const { HOME } = require('../config');

// Plain terminal table, newest-first. Returns the full string (the caller console.log's
// it once — byte-equivalent to the original line-by-line logging).
function renderTable(all, filtered) {
  const out = [];
  const activeCount = filtered.filter((s) => s.active).length;
  out.push(`${all.length} sessions total; showing ${filtered.length} (${activeCount} active).\n`);

  const W = { live: 1, date: 16, kb: 7, uuid: 36, origin: 8, cwd: 50 };
  const header =
    ' '.padEnd(W.live) + ' ' +
    'Modified'.padEnd(W.date) + '  ' +
    'KB'.padStart(W.kb) + '  ' +
    'UUID'.padEnd(W.uuid) + '  ' +
    'Origin'.padEnd(W.origin) + '  ' +
    'CWD'.padEnd(W.cwd) + '  ' +
    'First Prompt';
  out.push(header);
  out.push('-'.repeat(header.length));

  let anyInferred = false;
  for (const s of filtered) {
    // A filled dot marks a session whose process is running right now.
    const live = (s.active ? '●' : ' ').padEnd(W.live);
    const d = s.mtime.toISOString().slice(0, 16).replace('T', ' ');
    const kb = (s.size / 1024).toFixed(0);
    const cwd = (s.cwd || '').replace(HOME, '~');
    const cwdTrunc = cwd.length > W.cwd ? cwd.slice(0, W.cwd - 1) + '…' : cwd;
    const fp = (s.firstPrompt || '').slice(0, 80);
    // Inferred origins (from transcript markers) get a trailing * so a guess never reads as fact.
    const inferred = s.originSource === 'inferred';
    if (inferred) anyInferred = true;
    const origin = inferred ? s.origin + '*' : s.origin;
    out.push(
      live + ' ' +
      d.padEnd(W.date) + '  ' +
      kb.padStart(W.kb) + '  ' +
      s.uuid.padEnd(W.uuid) + '  ' +
      origin.padEnd(W.origin) + '  ' +
      cwdTrunc.padEnd(W.cwd) + '  ' +
      fp
    );
  }

  out.push('\n● = active (a Claude process is running for this session)');
  if (anyInferred) out.push('* origin inferred from transcript markers (no live process)');
  out.push('\nResume:  cd <CWD> && claude --resume <UUID>');
  out.push('More:    cc-sessions --help');
  return out.join('\n');
}

module.exports = { renderTable };
