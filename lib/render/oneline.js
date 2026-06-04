'use strict';

// One session per line, no header/footer — built for piping and quick scanning
// (think `git log --oneline`). Columns: live-marker · uuid · pid · origin · first prompt.
// The first prompt is collapsed to a single line and truncated to the terminal width so
// every entry stays on exactly one row (defaults to 120 cols when output is piped).
function renderOneline(all, filtered) {
  const termW = process.stdout.columns || 120;
  // Fixed-width prefix: '● ' + uuid(36) + '  ' + pid(6) + '  ' + origin(8) + '  '
  const PREFIX = 2 + 36 + 2 + 6 + 2 + 8 + 2;
  const promptW = Math.max(20, termW - PREFIX);

  const out = [];
  for (const s of filtered) {
    const live = s.active ? '●' : ' ';
    const pid = s.active && s.pid ? String(s.pid) : '-';
    const origin = s.origin || '—';
    const fp = (s.firstPrompt || '').replace(/\s+/g, ' ').trim().slice(0, promptW);
    out.push(
      live + ' ' +
      s.uuid + '  ' +
      pid.padStart(6) + '  ' +
      origin.padEnd(8) + '  ' +
      fp
    );
  }
  return out.join('\n');
}

module.exports = { renderOneline };
