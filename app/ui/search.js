// Поиск значения по всей базе: каждая таблица проверяется отдельным запросом (не дольше 10 секунд),
// поэтому виден ход поиска, его можно остановить, а найденное сразу открывается с фильтром.

function openSearchTab(cid) {
  if (!cid || !S.info[cid]) return;
  let tab = S.tabs.find(x => x.type === 'search' && x.conn === cid);
  if (!tab) {
    tab = { id: ++tabSeq, type: 'search', conn: cid, q: '', exact: false, found: [], done: 0, total: 0, skipped: [] };
    S.tabs.push(tab);
  }
  S.tab = tab.id;
  renderTabs(); renderPane();
  setTimeout(() => { const el = $('#fs-q'); if (el) el.focus(); }, 30);
}

function renderSearchTab(pane, tab) {
  pane.innerHTML = `
    <div class="toolbar fs-bar">
      <div class="search-box fs-input">${icon('search', 14)}<input class="input" id="fs-q" value="${esc(tab.q)}" placeholder="${t('fsPlaceholder')}" spellcheck="false" autocomplete="off"></div>
      <div class="seg" id="fs-mode"><button data-x="0" class="${tab.exact ? '' : 'on'}">${t('fContains')}</button><button data-x="1" class="${tab.exact ? 'on' : ''}">${t('fsExact')}</button></div>
      <button class="btn primary ${tab.running ? 'hidden' : ''}" id="fs-go">${t('fsFind')}</button>
      <button class="btn ${tab.running ? '' : 'hidden'}" id="fs-stop">${icon('stop', 12)}${t('stop')}</button>
      <span class="stat" id="fs-stat"></span>
    </div>
    <div class="grid-wrap fs-res" id="fs-res"></div>`;
  const q = $('#fs-q');
  q.oninput = () => { tab.q = q.value; renderTabs(); };
  q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(tab); } };
  $('#fs-mode').onclick = e => { const b = e.target.closest('[data-x]'); if (b && !tab.running) { tab.exact = b.dataset.x === '1'; renderSearchTab(pane, tab); } };
  $('#fs-go').onclick = () => runSearch(tab);
  $('#fs-stop').onclick = () => stopSearch(tab);
  renderSearchResults(tab);
}

function renderSearchResults(tab) {
  const box = $('#fs-res'), st = $('#fs-stat');
  if (!box || curTab() !== tab) return;
  st.textContent = tab.running ? t('fsProgress', { i: tab.done + 1, n: tab.total, t: tab.current || '' })
    : tab.total ? t('fsDone', { n: tab.found.length, t: tab.total }) : '';
  if (!tab.found.length) {
    box.innerHTML = `<div class="grid-empty">${tab.running ? `<span class="spin" style="display:inline-block"></span>` : tab.total ? t('fsNothing') : t('fsHint')}</div>`;
  } else {
    const name = r => (r.schema === 'public' ? r.table : `${r.schema}.${r.table}`);
    box.innerHTML = `<table class="grid fs-table"><thead><tr><th>${t('fsTable')}</th><th>${t('column')}</th><th class="num">${t('fsMatches')}</th></tr></thead><tbody>
      ${tab.found.map((r, i) => `<tr data-fs="${i}"><td>${icon('table', 14)}<span>${esc(name(r))}</span></td><td class="mono">${esc(r.col)}</td><td class="num">${nRows(r.n)}</td></tr>`).join('')}</tbody></table>`;
    box.querySelectorAll('[data-fs]').forEach(tr => tr.onclick = () => {
      const r = tab.found[+tr.dataset.fs];
      const num = isNumType(r.type) && /^-?\d+(\.\d+)?$/.test(r.q.trim());
      openTableFiltered(tab.conn, r.schema, r.table, [{ col: r.col, op: r.exact ? (num ? 'eqv' : 'eq') : 'contains', v: r.q.trim() }]);
    });
  }
  if (!tab.running && tab.skipped.length) {
    box.insertAdjacentHTML('beforeend', `<div class="hint fs-skip">${esc(t('fsSkipped', { t: tab.skipped.join(', ') }))}</div>`);
  }
}

async function runSearch(tab) {
  const value = tab.q.trim();
  if (!value || tab.running) return;
  if (S.meta[tab.conn] === undefined) await loadMeta(tab.conn);
  const tables = (S.meta[tab.conn] || []).filter(x => !x.view);
  Object.assign(tab, { running: true, stopped: false, found: [], done: 0, total: tables.length, skipped: [], current: '' });
  if (curTab() === tab) renderPane();
  const run = tab.runId = (tab.runId || 0) + 1;
  for (const tb of tables) {
    if (tab.stopped || tab.runId !== run) break;
    tab.current = tb.name;
    renderSearchResults(tab);
    try {
      const res = await api('search_table', tab.conn, tb.schema, tb.name, value, tab.exact);
      res.forEach(r => tab.found.push({ schema: tb.schema, table: tb.name, col: r.col, n: r.n, q: value, exact: tab.exact,
        type: (tb.cols.find(c => c.name === r.col) || {}).type }));
    } catch (e) {
      if (tab.stopped) break;
      tab.skipped.push(tb.name);          // таблица не успела за 10 секунд или недоступна – идём дальше
    }
    tab.done++;
  }
  if (tab.runId !== run) return;
  tab.running = false;
  tab.found.sort((a, b) => b.n - a.n);
  if (curTab() === tab) renderPane(); else renderTabs();
}

function stopSearch(tab) {
  if (!tab.running) return;
  tab.stopped = true;
  api('cancel_search', tab.conn).catch(() => {});
}
