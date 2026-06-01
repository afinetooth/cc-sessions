'use strict';
const { HOME } = require('../config');
const { originSlug } = require('../environments');

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Self-contained HTML report with in-browser filter + column sort and a per-row
// "copy resume" button. Returns the HTML string; the caller writes + opens it.
function renderHtml(all, filtered) {
  const rows = filtered
    .map((s) => {
      const d = s.mtime.toISOString().slice(0, 16).replace('T', ' ');
      const kb = (s.size / 1024).toFixed(0);
      const cwd = (s.cwd || '').replace(HOME, '~');
      const fp = (s.firstPrompt || '').slice(0, 300);
      const sub = s.isSubagent ? ' <span class="tag">subagent</span>' : '';
      const inferred = s.originSource === 'inferred';
      const otitle =
        inferred ? 'inferred from transcript IDE markers (a guess)' :
        s.originSource === 'path' ? 'detected from working-directory path' :
        s.originSource === 'user-rule' ? 'matched a user rule' :
        s.originSource === 'entrypoint' ? 'from the launch entrypoint (transcript / live registry)' : 'no signal';
      const ocls = 'origin origin-' + originSlug(s.origin) + (inferred ? ' inferred' : '');
      // "moved environments": born in one surface, last opened in another.
      const moved = s.entrypointMoved
        ? ` <span class="moved" title="last opened in ${escapeHTML(s.lastEntrypoint || '')}">→ ${escapeHTML(s.lastEntrypoint || '')}</span>`
        : '';
      const vscodeLink = `vscode://anthropic.claude-code/open?session=${s.uuid}`;
      return `<tr>
      <td>${d}</td>
      <td class="num">${kb}</td>
      <td><code class="uuid">${escapeHTML(s.uuid)}</code>${sub}</td>
      <td><span class="${ocls}" title="${escapeHTML(otitle)}">${escapeHTML(s.origin)}${inferred ? ' ?' : ''}</span>${moved}</td>
      <td><code>${escapeHTML(cwd)}</code></td>
      <td class="prompt">${escapeHTML(fp)}</td>
      <td class="actions">
        <button onclick="copyCmd(event, '${escapeHTML(s.uuid)}', '${escapeHTML(s.resumeCwd || s.cwd || '')}')">copy resume</button>
        <button class="link" title="copy a vscode:// deep link (open the session's folder in VS Code first)" onclick="copyText(event, '${escapeHTML(vscodeLink)}')">copy vscode</button>
      </td>
    </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Claude Code Sessions</title>
<style>
  body { font: 14px -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; color: #222; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 16px; font-size: 13px; }
  #search { width: 460px; padding: 8px 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 13px; }
  thead { position: sticky; top: 0; background: #f5f5f5; z-index: 1; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { cursor: pointer; user-select: none; }
  th:hover { background: #eaeaea; }
  tr:hover td { background: #fafafa; }
  code { font: 12px ui-monospace, Menlo, monospace; color: #444; }
  code.uuid { color: #777; font-size: 11px; }
  td.num { text-align: right; }
  td.prompt { max-width: 640px; color: #333; word-break: break-word; }
  .tag { display: inline-block; font-size: 10px; padding: 1px 5px; background: #fff3e0; color: #e65100; border-radius: 3px; margin-left: 4px; }
  /* Base pill — every origin (even auto-detected unknown tools) gets this. */
  .origin { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 3px; white-space: nowrap; background: #eceff1; color: #455a64; }
  .origin-terminal { background: #ede7f6; color: #4527a0; }
  .origin-vscode { background: #e3f2fd; color: #1565c0; }
  .origin-cursor { background: #e8eaf6; color: #283593; }
  .origin-superset { background: #e0f2f1; color: #00695c; }
  .origin-ide { background: #fff8e1; color: #8d6e00; }
  .origin-unknown { background: #f5f5f5; color: #999; }
  .origin.inferred { opacity: 0.65; font-style: italic; }
  .moved { font-size: 10px; color: #888; margin-left: 4px; }
  td.actions { white-space: nowrap; }
  button.link { color: #1565c0; }
  button { font-size: 11px; padding: 3px 8px; cursor: pointer; border: 1px solid #ccc; border-radius: 3px; background: #fff; }
  button:hover { background: #f0f0f0; }
  button.copied { background: #c8e6c9; border-color: #81c784; }
</style></head><body>
<h1>Claude Code Sessions</h1>
<div class="meta">${filtered.length} of ${all.length} total sessions · Generated ${new Date().toLocaleString()}</div>
<input id="search" placeholder="Filter by uuid, cwd, first prompt..." oninput="doFilter()" autofocus>
<table id="t">
<thead><tr>
  <th data-col="0" data-type="date">Modified</th>
  <th data-col="1" data-type="num">KB</th>
  <th data-col="2">UUID</th>
  <th data-col="3">Origin</th>
  <th data-col="4">CWD</th>
  <th data-col="5">First Prompt</th>
  <th></th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<script>
function doFilter() {
  const q = document.getElementById('search').value.toLowerCase();
  for (const tr of document.querySelectorAll('#t tbody tr')) {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  }
}
function copyCmd(ev, uuid, cwd) {
  copyText(ev, 'cd ' + cwd + ' && claude --resume ' + uuid);
}
function copyText(ev, text) {
  navigator.clipboard.writeText(text).then(() => {
    const b = ev.target;
    const orig = b.textContent;
    b.textContent = 'copied!';
    b.classList.add('copied');
    setTimeout(() => { b.textContent = orig; b.classList.remove('copied'); }, 1500);
  });
}
const sortDir = {};
document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = +th.dataset.col;
    const type = th.dataset.type || 'str';
    const dir = sortDir[col] = !sortDir[col];
    const tbody = document.querySelector('#t tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      let av = a.children[col].textContent, bv = b.children[col].textContent;
      if (type === 'num') return (dir ? 1 : -1) * (parseFloat(av) - parseFloat(bv));
      return (dir ? 1 : -1) * av.localeCompare(bv);
    });
    for (const r of rows) tbody.appendChild(r);
  });
});
</script>
</body></html>`;
}

module.exports = { renderHtml, escapeHTML };
