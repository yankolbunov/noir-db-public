// Вкладка таблицы: данные с накоплением правок, просмотр структуры, импорт CSV.

// ================= несохранённые правки =================
// upd: номер строки → {номер колонки: новое значение}; del: удалённые строки; ins: новые строки (сверху – последние)
const emptyPending = () => ({ upd: new Map(), del: new Set(), ins: [] });

// правки данных + изменения в конструкторе
const pendingCount = tab => dataCount(tab) + designCount(tab);

function dataCount(tab) {
  const P = tab.pending;
  if (!P) return 0;
  let n = P.ins.length + P.del.size;
  P.upd.forEach((u, i) => { if (!P.del.has(i) && Object.keys(u).length) n++; });
  return n;
}

const anyPending = () => S.tabs.some(x => (x.type === 'table' || x.type === 'design') && pendingCount(x) > 0);

let lastDirty = false;
function markDirty() {
  const d = anyPending();
  if (d !== lastDirty) { lastDirty = d; api('set_dirty', d).catch(() => {}); }   // в Python – только когда меняется
  renderTabs();
}

const sameVal = (a, b) => (a === null || a === undefined ? null : String(a)) === (b === null || b === undefined ? null : String(b));

// Перед уходом со страницы (листание, сортировка, обновление, закрытие): сохранить, не сохранять или остаться
async function leaveTable(tab) {
  const n = pendingCount(tab);
  if (!n) return true;
  const choice = await askSave(t('unsavedTitle'), t('unsavedText', { n }));
  if (choice === 'save') return savePending(tab);
  if (choice === 'discard') { tab.pending = emptyPending(); resetDesign(tab); markDirty(); return true; }
  return false;
}

async function savePending(tab) {
  if (designCount(tab) && !await saveDesign(tab)) return false;
  const P = tab.pending, d = tab.data;
  if (!dataCount(tab)) return true;
  if (P.del.size && !await confirmDanger(t('confirmSaveDel', { n: P.del.size }), t('confirmSaveDelText'), t('saveAndDelete'))) return false;
  const names = d.columns.map(c => c.name);
  const changes = {
    updates: [...P.upd].filter(([i, u]) => !P.del.has(i) && Object.keys(u).length)
      .map(([i, u]) => ({ pk: pkOf(tab, d.rows[i]), values: Object.fromEntries(Object.entries(u).map(([c, v]) => [names[c], v])) })),
    deletes: [...P.del].map(i => pkOf(tab, d.rows[i])),
    inserts: P.ins.slice().reverse().map(x => Object.fromEntries(x.values.map((v, c) => [names[c], v]))),
  };
  try {
    const r = await api('apply_changes', tab.conn, tab.schema, tab.table, changes);
    toast(t('changesSaved', { u: r.updated, i: r.inserted, d: r.deleted }));
    // подсказка «двойной клик – изменить ячейку…» нужна, пока человек ни разу не сохранил правки
    if (!S.settings.editLearned) { S.settings.editLearned = true; api('save_settings', { editLearned: true }).catch(() => {}); }
    tab.pending = emptyPending();
    markDirty();
    recount(tab);
    await loadTab(tab);
    return true;
  } catch (e) {
    toast(e.message, 'err');
    return false;
  }
}

function discardPending(tab) {
  tab.pending = emptyPending();
  tab.gsel.clear();
  markDirty();
  renderTableBody(tab);
}

// ================= загрузка =================
async function loadTab(tab) {
  if (!tab.pending) tab.pending = emptyPending();
  if (!tab.gsel) tab.gsel = new Set();
  tab.loading = true;
  const seq = tab.loadSeq = (tab.loadSeq || 0) + 1;     // ответ на устаревший запрос (сменили фильтр, пока грузилось) не показываем
  try {
    if (tab.view === 'data') {
      const key = (tab.search || '') + '\u0001' + JSON.stringify(tab.filters || []);
      // число строк считается отдельным запросом – страница появляется, не дожидаясь подсчёта всей таблицы;
      // связи таблицы читаются один раз, а не при каждом листании
      const needCount = tab.countKey !== key, needFks = !tab.fks;
      const d = await api('table_data', tab.conn, tab.schema, tab.table, tab.limit, tab.offset,
        tab.orderBy, tab.orderDir, tab.search || null, false, tab.filters || [], needFks);
      if (seq !== tab.loadSeq) return;
      if (needFks) tab.fks = d.fks;
      if (needCount) { tab.total = null; tab.countKey = key; countRows(tab, key); }
      tab.data = d;
      tab.pending = emptyPending();
      tab.gsel.clear();
      markDirty();
    } else if (tab.view === 'design') {
      await loadDesign(tab);
    } else {
      tab.structure = await api('structure', tab.conn, tab.schema, tab.table);
    }
  } catch (e) { toast(e.message, 'err'); tab.loadFailed = true; }
  tab.loading = false;
  if (curTab() !== tab) return;
  // пока грузилось, переключили вид (например, на «Структуру») – догружаем то, что теперь на экране
  if (!tab.loadFailed && tabNeedsLoad(tab)) loadTab(tab); else renderTableBody(tab);
  tab.loadFailed = false;
}

const tabNeedsLoad = tab => (tab.view === 'data' && !tab.data) || (tab.view === 'structure' && !tab.structure) || (tab.view === 'design' && !tab.d);

// пересчитать строки и перечитать связи при следующей загрузке (после сохранения, обновления, смены структуры)
const recount = tab => { tab.countKey = null; tab.fks = null; };

function countRows(tab, key) {
  api('table_count', tab.conn, tab.schema, tab.table, tab.search || null, tab.filters || [])
    .then(n => { if (tab.countKey === key) { tab.total = n; updatePager(tab); } })
    .catch(e => toast(e.message, 'err'));
}

// низ таблицы: «1–100 из 5 167», номер страницы, стрелка «дальше»
function updatePager(tab) {
  const d = tab.data, range = $('#t-range'), pages = $('#pg-pages'), next = $('#pg-next');
  if (!d || !range || curTab() !== tab) return;
  const known = tab.total != null, total = tab.total || 0;
  const to = tab.offset + d.rows.length, from = d.rows.length ? tab.offset + 1 : 0;
  range.textContent = `${from}–${to} ${t('of')} ${known ? total.toLocaleString(LANG) : '…'}`;
  pages.textContent = `${t('page')} ${Math.floor(tab.offset / tab.limit) + 1} / ${known ? Math.max(1, Math.ceil(total / tab.limit)) : '…'}`;
  next.disabled = known ? to >= total : d.rows.length < tab.limit;
  // одна страница – стрелки и номер не нужны
  const single = tab.offset === 0 && (known ? total <= tab.limit : d.rows.length < tab.limit);
  [pages, next, $('#pg-prev')].forEach(el => el && el.classList.toggle('hidden', single));
}
const isRO = tab => !!(S.info[tab.conn] && S.info[tab.conn].read_only);

function renderTable(pane, tab) {
  if (!tab.pending) tab.pending = emptyPending();
  if (!tab.gsel) tab.gsel = new Set();
  pane.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="tview">
        <button data-v="data" class="${tab.view === 'data' ? 'on' : ''}">${t('data')}</button>
        <button data-v="structure" class="${tab.view === 'structure' ? 'on' : ''}">${t('structure')}</button>
        ${tab.kind === 'table' && !isRO(tab) ? `<button data-v="design" class="${tab.view === 'design' ? 'on' : ''}">${t('dzDesigner')}</button>` : ''}
      </div>
      <div id="tbar" style="display:contents"></div>
    </div>
    <div id="tbody" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px"></div>`;
  const needLoad = () => tabNeedsLoad(tab);
  pane.querySelectorAll('#tview button').forEach(b => b.onclick = async () => {
    const v = b.dataset.v;
    if (v === tab.view) return;
    // в конструктор – только без несохранённых правок данных, и обратно – без несохранённой структуры
    if (v === 'design' && dataCount(tab) && !await leaveTable(tab)) return;
    if (tab.view === 'design' && designCount(tab) && !await leaveTable(tab)) return;
    tab.view = v;
    renderTable(pane, tab);
    if (needLoad()) loadTab(tab);
  });
  renderTableBody(tab);
  // данные сброшены (например, после COMMIT в редакторе) – загружаем заново
  if (!tab.loading && needLoad()) loadTab(tab);
}

function renderTableBody(tab) {
  const bar = $('#tbar'), body = $('#tbody');
  if (!bar || curTab() !== tab) return;
  if (tab.view === 'structure') return renderStructure(tab, bar, body);
  if (tab.view === 'design') return renderDesigner(tab, bar, body);

  const d = tab.data;
  const isTable = tab.kind === 'table';
  const canEdit = d && d.editable;
  bar.innerHTML = `
    <div class="search-box" style="width:200px">${icon('search', 13)}<input class="input sm" id="t-search" placeholder="${t('search')}" value="${esc(tab.search)}" spellcheck="false"></div>
    ${canEdit ? `<button class="btn ghost" id="t-add" title="${t('addRow')}">${icon('plus', 14)}<span class="bl">${t('addRow')}</span></button>` : ''}
    <button class="btn danger-soft hidden" id="t-del"></button>
    <div class="pend hidden" id="t-pend">
      <span class="pend-dot"></span><span id="t-pend-n"></span>
      <button class="btn ghost" id="t-discard">${t('discardChanges')}</button>
      <button class="btn primary" id="t-save">${icon('check', 13)}${t('saveChanges')}<span class="kbd">⌘S</span></button>
    </div>
    <div style="flex:1"></div>
    <button class="btn ghost icon" id="t-refresh" title="${t('refresh')}">${icon('refresh', 14)}</button>
    ${exportButton('t')}
    ${isTable ? `<button class="btn ghost icon" id="t-more" title="…">${icon('more', 16)}</button>` : ''}`;

  let searchTimer;
  $('#t-search').oninput = e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      if (!await leaveTable(tab)) { e.target.value = tab.search; return; }
      tab.search = e.target.value; tab.offset = 0; loadTab(tab);
    }, 350);
  };
  $('#t-refresh').onclick = async () => { if (await leaveTable(tab)) { recount(tab); loadTab(tab); } };
  $('#t-exp').onclick = e => exportMenu(e.currentTarget, [
    { icon: 'copy', label: t('copyTable'), action: () => tab.data && copyTable(tab.data.columns, viewRows(tab).rows).then(ok => ok && toast(t('tableCopied'))) },
    '-',
    { icon: 'download', label: t('exportCsvTip'), action: () => exportTable(tab, 'csv') },
    { icon: 'download', label: t('exportXlsxTip'), action: () => exportTable(tab, 'xlsx') },
  ]);
  const add = $('#t-add'); if (add) add.onclick = () => addRow(tab);
  $('#t-del').onclick = () => markDeleted(tab);
  $('#t-save').onclick = () => savePending(tab);
  $('#t-discard').onclick = () => discardPending(tab);
  const more = $('#t-more');
  if (more) more.onclick = () => { const r = more.getBoundingClientRect(); tableMenu(tab.conn, tab.schema, tab.table, tab.kind, r.right - 220, r.bottom + 4, true); };

  if (!d) { body.innerHTML = `<div class="grid-wrap"></div>`; return; }
  body.innerHTML = `
    <div class="fchips ${tab.filters && tab.filters.length ? '' : 'hidden'}" id="t-chips">${filterChips(tab)}</div>
    <div class="grid-wrap" id="tgrid"></div>
    <div class="toolbar tfoot">
      <span class="stat"><span id="t-range"></span><span id="t-selstat"></span></span><span class="stat selsum" id="t-sum"></span>
      ${!d.editable && isTable && !isRO(tab) ? `<span class="stat">· ${t('noPk')}</span>` : ''}
      ${canEdit && !S.settings.editLearned ? `<span class="stat hint-edit">· ${t('editHint')}</span>` : ''}
      <div class="grow"></div>
      <div class="pager">
        <select class="select sm" id="pg-size" title="${t('pageSize')}">${[...new Set([100, 500, 1000, tab.limit])].sort((a, b) => a - b).map(n => `<option value="${n}" ${n === tab.limit ? 'selected' : ''}>${n.toLocaleString(LANG)} ${t('perPage')}</option>`).join('')}<option value="custom">${t('rowsCustom')}</option></select>
        <button class="btn ghost icon" id="pg-prev" ${tab.offset <= 0 ? 'disabled' : ''}>${icon('chevronLeft', 15)}</button>
        <span class="stat" id="pg-pages"></span>
        <button class="btn ghost icon" id="pg-next">${icon('chevronRight', 15)}</button>
      </div>
    </div>`;
  $('#pg-size').onchange = async e => {
    if (!await leaveTable(tab)) { e.target.value = tab.limit; return; }
    let n = e.target.value === 'custom' ? null : +e.target.value;
    if (n === null) {            // своё число строк
      const v = await promptText(t('pageSize'), t('rowsAsk'), String(tab.limit));
      n = v === null ? null : clampRows(String(v).replace(/[\s\u00a0\u202f,]/g, ''), 0);
      if (!n) { if (v !== null) toast(t('rowsBad'), 'err'); renderPane(); return; }
    }
    tab.limit = n; tab.offset = 0;
    S.settings.pageSize = n; api('save_settings', { pageSize: n }).catch(() => {});      // запоминаем для новых вкладок
    renderPane(); loadTab(tab);
  };
  $('#pg-prev').onclick = async () => { if (await leaveTable(tab)) { tab.offset = Math.max(0, tab.offset - tab.limit); loadTab(tab); } };
  $('#pg-next').onclick = async () => { if (await leaveTable(tab)) { tab.offset += tab.limit; loadTab(tab); } };
  updatePager(tab);
  $('#t-chips').onclick = e => {
    const chip = e.target.closest('[data-fi]');
    if (!chip) return;
    const f = tab.filters[+chip.dataset.fi];
    if (e.target.closest('.fc-x')) setFilters(tab, tab.filters.filter(x => x !== f));
    else openFilter(tab, d.columns.find(c => c.name === f.col), chip);
  };
  mountTableGrid(tab);
}

// строки для показа: новые сверху, затем данные с применёнными правками
function viewRows(tab) {
  const d = tab.data, P = tab.pending;
  const ins = P.ins.map(x => x.values);
  const data = d.rows.map((r, i) => {
    const u = P.upd.get(i);
    return u ? r.map((v, c) => (c in u ? u[c] : v)) : r;
  });
  return { rows: ins.concat(data), nIns: ins.length };
}

function mountTableGrid(tab) {
  const d = tab.data, P = tab.pending;
  const { rows, nIns } = viewRows(tab);
  tab.nIns = nIns;
  if (!tab.colW) tab.colW = {};
  mountGrid($('#tgrid'), d.columns, rows, {
    alignKey: `t|${(S.conns.find(c => c.id === tab.conn) || {}).name}|${S.info[tab.conn] ? S.info[tab.conn].db : ''}|${tab.schema}.${tab.table}`,
    colW: tab.colW,
    sel: d.editable ? tab.gsel : null,
    emptyHint: d.editable && !isRO(tab) && !tab.search && !(tab.filters || []).length ? t('emptyAddRow') : '',
    sort: { by: tab.orderBy, dir: tab.orderDir },
    rowInfo: gi => {
      if (gi < tab.nIns) return { kind: 'new' };
      const i = gi - tab.nIns, u = P.upd.get(i);
      return { kind: P.del.has(i) ? 'gone' : '', mod: u ? new Set(Object.keys(u).map(Number)) : null };
    },
    onSort: async c => {
      if (!await leaveTable(tab)) return;
      if (tab.orderBy !== c) { tab.orderBy = c; tab.orderDir = 'asc'; }
      else if (tab.orderDir === 'asc') tab.orderDir = 'desc';
      else { tab.orderBy = null; tab.orderDir = 'asc'; }
      tab.offset = 0; loadTab(tab);
    },
    onPick: () => refreshSelBar(tab),
    onRange: s => { const el = $('#t-sum'); if (el) el.textContent = s ? '· ' + rangeText(s) : ''; },
    onFilter: (col, th) => openFilter(tab, col, th),
    fkCols: fkLinks(tab).map(l => l.ci),
    onLink: (gi, ci) => {
      const l = fkLinks(tab).find(x => x.ci === ci), v = viewRows(tab).rows[gi][ci];
      if (l && v !== null && v !== '') openTableFiltered(tab.conn, l.fk.ref_schema, l.fk.ref_table, [{ col: l.fk.ref_columns[0], op: 'eqv', v: String(v) }]);
    },
    onRowMenu: (gi, ci, x, y) => rowMenu(tab, gi, ci, x, y),
    onColMenu: (what, col, i, th) => showStats(th, tab.conn,
      { table: { schema: tab.schema, table: tab.table, search: tab.search || null, filters: tab.filters || [] } }, col.name, col.name),
    filtered: name => (tab.filters || []).some(f => f.col === name),
    onUndo: gi => {
      if (gi < tab.nIns) P.ins.splice(gi, 1); else P.del.delete(gi - tab.nIns);
      tab.gsel.clear();
      markDirty();
      mountTableGrid(tab);
    },
    onEdit: (gi, c, td, at) => {
      if (!d.editable) { toast(isRO(tab) ? t('errReadOnly') : t('noPk'), 'err'); return; }
      if (gi >= tab.nIns && P.del.has(gi - tab.nIns)) return;
      editCell(tab, gi, c, td, at);
    },
  });
  refreshSelBar(tab);
}

// ================= связи: ссылки и «Где используется» =================
// колонки-ссылки (внешний ключ из одной колонки) → номер колонки и сама связь
function fkLinks(tab) {
  const d = tab.data;
  if (!d || !tab.fks) return [];
  return tab.fks.out.filter(f => f.columns.length === 1).map(fk => ({ ci: d.columns.findIndex(c => c.name === fk.columns[0]), fk })).filter(l => l.ci >= 0);
}

// открыть таблицу сразу с фильтром (если вкладка уже открыта – поменять фильтр в ней)
async function openTableFiltered(cid, schema, table, filters) {
  const tab = findTableTab(cid, schema, table);
  if (tab) {
    if (!await leaveTable(tab)) return;
    Object.assign(tab, { view: 'data', filters, offset: 0, search: '', data: null });
    recount(tab);
  }
  openTable(cid, schema, table, 'table', 'data', { filters });
}

function rowMenu(tab, gi, ci, x, y) {
  const row = viewRows(tab).rows[gi], d = tab.data, v = row[ci];
  const items = [{ icon: 'copy', label: t('copyValue'), action: () => copyText(v === null || v === undefined ? '' : String(v)).then(ok => ok && toast(t('copied'))) },
    { icon: 'columns', label: t('showValue'), action: () => showValue(d.columns[ci], v) }];
  if (tab.fks && tab.fks.refs.length && gi >= (tab.nIns || 0)) {
    items.push({ icon: 'link', label: t('whereUsed'), action: () => whereUsed(tab, row, x, y) });
  }
  // удалить строку – то же, что галочка + «Удалить», но там, где его ищут (как в Finder и Numbers)
  if (d.editable && !isRO(tab)) {
    const P = tab.pending, isNew = gi < (tab.nIns || 0), gone = !isNew && P.del.has(gi - (tab.nIns || 0));
    items.push('-');
    if (gone) items.push({ icon: 'refresh', label: t('restoreRow'), action: () => { P.del.delete(gi - tab.nIns); tab.gsel.clear(); markDirty(); mountTableGrid(tab); } });
    else {
      const many = tab.gsel.has(gi) && tab.gsel.size > 1;
      items.push({ icon: 'trash', red: true, label: many ? `${t('deleteSelected')} (${tab.gsel.size})` : t('deleteRow'),
        action: () => { if (!many) { tab.gsel.clear(); tab.gsel.add(gi); } markDeleted(tab); } });
    }
  }
  openMenu(x, y, items);
}

async function whereUsed(tab, row, x, y) {
  const values = Object.fromEntries(tab.data.columns.map((c, i) => [c.name, row[i]]));
  let list;
  try { list = await api('where_used', tab.conn, tab.schema, tab.table, values); } catch (e) { toast(e.message, 'err'); return; }
  const anchor = document.createElement('div');
  Object.assign(anchor.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: '1px', height: '1px' });
  document.body.appendChild(anchor);
  const name = (s, tb) => (s === tab.schema ? tb : `${s}.${tb}`);
  const p = openPop(anchor, `<div class="pop-h">${t('whereUsed')}</div>${list.length ? `<div class="wu">${list.map((r, i) =>
    `<div class="wu-r ${r.n ? '' : 'none'}" data-wu="${i}">${icon('table', 14)}<span class="wu-t">${esc(name(r.schema, r.table))}<i>${esc(r.columns.join(', '))}</i></span><b>${nRows(r.n)}</b></div>`).join('')}</div>`
    : `<div class="hint">${t('noRelations')}</div>`}`);
  anchor.remove();
  p.querySelectorAll('[data-wu]').forEach(el => el.onclick = () => {
    const r = list[+el.dataset.wu];
    if (!r.n) return;
    closePop();
    openTableFiltered(tab.conn, r.schema, r.table, r.columns.map((c, k) => ({ col: c, op: 'eqv', v: String(r.values[k]) })));
  });
}

// ================= фильтры по колонкам =================
const colKind = ty => /^bool/i.test(ty || '') ? 'bool' : isNumType(ty) ? 'num' : /^(date|timestamp|time)/i.test(ty || '') ? 'date' : 'text';
const FILTER_OPS = { text: ['contains', 'eq', 'empty'], num: ['eqv', 'gt', 'lt', 'between', 'empty'], date: ['eqv', 'gt', 'lt', 'between', 'empty'], bool: ['is'] };

function filterText(f) {
  const v = s => `<b>${esc(s)}</b>`;
  if (f.op === 'empty') return `${esc(f.col)} ${t('fEmptyShort')}`;
  if (f.op === 'is') return `${esc(f.col)} = ${v(f.v === true ? t('fYes') : f.v === false ? t('fNo') : t('fNull'))}`;
  if (f.op === 'between') return `${esc(f.col)} ${t('fBetweenShort')} ${v(f.v)} ${t('fAnd')} ${v(f.v2)}`;
  const sign = { contains: t('fContainsShort'), eq: '=', eqv: '=', gt: '>', lt: '<' }[f.op];
  return `${esc(f.col)} ${sign} ${v(f.v)}`;
}

const filterChips = tab => (tab.filters || []).map((f, i) =>
  `<span class="fchip" data-fi="${i}"><span class="fc-t">${filterText(f)}</span><span class="fc-x" title="${t('fRemove')}">${icon('x', 11)}</span></span>`).join('');

async function setFilters(tab, list) {
  closePop();
  if (!await leaveTable(tab)) return false;
  tab.filters = list;
  tab.offset = 0;
  loadTab(tab);
  return true;
}

// окошко фильтра одной колонки: условие зависит от типа (текст, число, дата, Да/Нет)
function openFilter(tab, col, anchor) {
  if (!col) return;
  const kind = colKind(col.type);
  const cur = (tab.filters || []).find(f => f.col === col.name);
  let op = cur ? cur.op : FILTER_OPS[kind][0];
  const label = o => t({ contains: 'fContains', eq: 'fEq', eqv: 'fEq', empty: 'fEmpty', gt: 'fGt', lt: 'fLt', between: 'fBetween' }[o]);
  const ph = kind === 'date' ? '2024-01-31' : kind === 'num' ? '0' : '';
  const html = `<div class="pop-h">${t('filter')} · <b>${esc(col.name)}</b></div>
    ${kind === 'bool'
      ? `<div class="seg" id="f-bool">${[[true, 'fYes'], [false, 'fNo'], [null, 'fNull']].map(([v, k]) =>
          `<button data-b="${v}" class="${cur && cur.v === v ? 'on' : ''}">${t(k)}</button>`).join('')}</div>`
      : `<div class="seg" id="f-op">${FILTER_OPS[kind].map(o => `<button data-op="${o}" class="${o === op ? 'on' : ''}">${label(o)}</button>`).join('')}</div>
         <div class="pop-row" id="f-vals"><input class="input sm" id="f-v" placeholder="${ph}" spellcheck="false" autocomplete="off" value="${esc(cur && cur.v != null ? cur.v : '')}">
           <span class="ctl-l" id="f-and">${t('fAnd')}</span><input class="input sm" id="f-v2" placeholder="${ph}" spellcheck="false" autocomplete="off" value="${esc(cur && cur.v2 != null ? cur.v2 : '')}"></div>`}
    <div class="pop-f">${cur ? `<button class="btn ghost" id="f-clear">${t('fClear')}</button>` : ''}<div class="grow"></div>
      ${kind === 'bool' ? '' : `<button class="btn primary" id="f-apply">${t('fApply')}</button>`}</div>`;
  const p = openPop(anchor, html);
  const others = (tab.filters || []).filter(f => f.col !== col.name);
  const apply = f => setFilters(tab, [...others, f]);
  const clear = $('#f-clear', p); if (clear) clear.onclick = () => setFilters(tab, others);
  if (kind === 'bool') {
    p.querySelectorAll('[data-b]').forEach(b => b.onclick = () => apply({ col: col.name, op: 'is', v: JSON.parse(b.dataset.b) }));
    return;
  }
  const v = $('#f-v', p), v2 = $('#f-v2', p);
  const sync = () => {
    p.querySelectorAll('[data-op]').forEach(b => b.classList.toggle('on', b.dataset.op === op));
    $('#f-vals', p).classList.toggle('hidden', op === 'empty');
    v2.classList.toggle('hidden', op !== 'between'); $('#f-and', p).classList.toggle('hidden', op !== 'between');
    if (op !== 'empty') v.focus();
  };
  $('#f-op', p).onclick = e => { const b = e.target.closest('[data-op]'); if (b) { op = b.dataset.op; sync(); } };
  const go = () => {
    if (op === 'empty') return apply({ col: col.name, op });
    if (!v.value.trim()) { v.focus(); return; }
    if (op === 'between' && !v2.value.trim()) { v2.focus(); return; }
    apply({ col: col.name, op, v: v.value.trim(), ...(op === 'between' ? { v2: v2.value.trim() } : {}) });
  };
  $('#f-apply', p).onclick = go;
  p.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  sync();
}

function refreshSelBar(tab) {
  const n = tab.gsel.size, del = $('#t-del'), st = $('#t-selstat');
  if (del) {
    del.classList.toggle('hidden', !n);
    del.innerHTML = `${icon('trash', 14)}${t('deleteSelected')} (${n})`;
  }
  if (st) st.textContent = n ? ` · ${n} ${t('selected')}` : '';
  const p = pendingCount(tab), bar = $('#t-pend');
  if (bar) {
    bar.classList.toggle('hidden', !p);
    $('#t-pend-n').textContent = t('pendingN', { n: p });
  }
}

function pkOf(tab, row) {
  const pk = {};
  tab.data.columns.forEach((c, i) => { if (c.pk) pk[c.name] = row[i]; });
  return pk;
}

// ================= правка, добавление, удаление (всё – до нажатия «Сохранить») =================
// at – точка двойного клика: курсор встаёт туда, куда кликнули. Без неё (Tab, новая строка) – значение выделяется целиком.
function editCell(tab, gi, c, td, at) {
  const wrap = $('#tgrid'), g = wrap._grid, P = tab.pending, d = tab.data;
  // ячейка могла перерисоваться, пока шёл клик, – берём ту, что сейчас на экране
  if (!td || !td.isConnected) td = $(`tr[data-r="${gi}"] td[data-c="${c}"]`, wrap);
  if (!td || td.classList.contains('editing')) return;
  const cur = g.rows[gi][c];
  const raw = cur === null || cur === undefined ? 'NULL' : String(cur);
  const caret = at ? caretFromPoint(td, at.x, at.y, raw) : null;
  td.classList.add('editing');
  td.innerHTML = `<input spellcheck="false" autocomplete="off" class="${g.meta[c].num ? 'num' : ''}">`;
  const inp = $('input', td);
  inp.value = raw;
  inp.focus();
  if (caret === null) inp.select(); else inp.setSelectionRange(caret, caret);
  let done = false;
  const finish = (save, move) => {
    if (done) return;
    done = true;
    if (save) {
      const nv = inp.value === 'NULL' ? null : inp.value;
      if (gi < tab.nIns) {
        P.ins[gi].values[c] = nv;
      } else {
        const i = gi - tab.nIns;
        const u = P.upd.get(i) || {};
        if (sameVal(nv, d.rows[i][c])) delete u[c]; else u[c] = nv;
        if (Object.keys(u).length) P.upd.set(i, u); else P.upd.delete(i);
      }
      g.rows[gi][c] = nv;
      markDirty();
    }
    redrawCell(wrap, gi, c);
    refreshSelBar(tab);
    if (move) {
      const nc = c + move;
      if (nc >= 0 && nc < d.columns.length) editCell(tab, gi, nc);
    }
  };
  // колонка-ссылка: под полем список строк связанной таблицы с понятной подписью («6 · Ноутбуки»)
  const link = fkLinks(tab).find(l => l.ci === c);
  const fk = link ? fkPicker(tab, link.fk, inp, td, v => { inp.value = v; finish(true); }) : null;
  inp.onkeydown = e => {
    if (fk && fk.key(e)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); inp.select(); return; }
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    if (e.key === 'Tab') { e.preventDefault(); finish(true, e.shiftKey ? -1 : 1); }
  };
  inp.onblur = () => { if (fk) fk.close(); finish(true); };
}

// выпадающий список для колонки-ссылки: ищет по номеру и по подписи, ↑↓ – выбор, Enter – подставить, Esc – закрыть
function fkPicker(tab, fk, inp, td, pick) {
  const box = document.createElement('div');
  box.className = 'ac fk-ac';
  document.body.appendChild(box);
  let items = [], sel = -1, timer = 0, seq = 0, closed = false;
  const place = () => {
    const r = td.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px';
    const below = r.bottom + 4, h = box.offsetHeight;
    box.style.top = (below + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : below) + 'px';
  };
  const render = () => {
    if (closed) return;
    box.innerHTML = items.length
      ? items.map((it, i) => `<div class="ac-it ${i === sel ? 'on' : ''}" data-i="${i}"><span class="fk-v">${esc(it.v)}</span><span class="nm">${esc(it.l == null ? '' : it.l)}</span></div>`).join('')
      : `<div class="fk-empty">${t('fkNone')}</div>`;
    place();
    const on = $('.ac-it.on', box); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  const load = q => {
    const my = ++seq;
    api('fk_options', tab.conn, fk.ref_schema, fk.ref_table, fk.ref_columns[0], q === 'NULL' ? '' : q).then(list => {
      if (my !== seq || closed) return;
      items = list; sel = items.findIndex(it => it.v === inp.value); render();
    }).catch(() => {});
  };
  // сначала все варианты; когда начали печатать – по набранному
  load('');
  inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load(inp.value.trim()), 180); });
  box.onmousedown = e => {
    e.preventDefault();               // поле не теряет фокус
    const it = e.target.closest('.ac-it');
    if (it) { const v = items[+it.dataset.i].v; close(); pick(v); }
  };
  const close = () => { if (closed) return; closed = true; clearTimeout(timer); box.remove(); };
  return {
    close,
    key(e) {
      if (closed || !items.length) return false;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); return true; }
      if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); return true; }
      if (e.key === 'Enter' && sel >= 0 && items[sel].v !== inp.value) { e.preventDefault(); const v = items[sel].v; close(); pick(v); return true; }
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter') close();
      return false;
    },
  };
}

// новая строка появляется сверху сразу, без перерисовки всей таблицы
function addRow(tab) {
  const d = tab.data;
  const values = d.columns.map(() => '');
  tab.pending.ins.unshift({ values });
  if (tab.gsel.size) { tab.gsel.clear(); refreshPicks($('#tgrid')); }
  tab.nIns = tab.pending.ins.length;
  if (!gridInsertTop($('#tgrid'), values)) mountTableGrid(tab);
  markDirty();
  refreshSelBar(tab);
  $('#tgrid').scrollTop = 0;
  // сразу начинаем ввод с первой колонки без значения по умолчанию
  let c = d.columns.findIndex(col => !col.default);
  if (c < 0) c = 0;
  editCell(tab, 0, c);
}

function markDeleted(tab) {
  const P = tab.pending;
  const picked = [...tab.gsel].sort((a, b) => b - a);
  picked.forEach(gi => {
    if (gi < tab.nIns) P.ins.splice(gi, 1);
    else P.del.add(gi - tab.nIns);
  });
  tab.gsel.clear();
  markDirty();
  mountTableGrid(tab);
}

async function truncateTable(cid, schema, table) {
  if (!await confirmDanger(t('confirmTruncate', { t: table }), t('confirmTruncateText'), t('clearBtn'))) return;
  try {
    await api('truncate_table', cid, schema, table);
    toast(t('tableCleared'));
    const tab = findTableTab(cid, schema, table);
    if (tab) { tab.offset = 0; recount(tab); loadTab(tab); }
    loadTree(cid);
  } catch (e) { toast(e.message, 'err'); }
}

async function dropTable(cid, schema, table, kind) {
  if (!await confirmDanger(t('confirmDrop', { t: table }), t('confirmDropText'), t('deleteBtn'), table)) return;
  try {
    await api('drop_table', cid, schema, table, kind);
    toast(t('tableDropped'));
    S.tabs.filter(x => x.type === 'table' && x.conn === cid && x.schema === schema && x.table === table)
      .forEach(x => { x.pending = emptyPending(); forceCloseTab(x.id); });
    markDirty();
    loadTree(cid);
  } catch (e) { toast(e.message, 'err'); }
}

const findTableTab = (cid, schema, table) => S.tabs.find(x => x.type === 'table' && x.conn === cid && x.schema === schema && x.table === table);

// ================= структура (только просмотр; менять – в конструкторе) =================
function renderStructure(tab, bar, body) {
  const editable = tab.kind === 'table' && !isRO(tab);
  bar.innerHTML = `<div class="grow" style="flex:1"></div><button class="btn ghost icon" id="t-refresh" title="${t('refresh')}">${icon('refresh', 14)}</button>`;
  $('#t-refresh').onclick = () => loadTab(tab);
  const s = tab.structure;
  if (!s) { body.innerHTML = ''; return; }
  const fks = s.fks || { out: [], refs: [] };
  const tname = (sc, tb) => sc === tab.schema ? tb : `${sc}.${tb}`;
  const link = (sc, tb) => `<span class="lnk" data-open-s="${esc(sc)}" data-open-t="${esc(tb)}">${esc(tname(sc, tb))}</span>`;
  const relRow = (cols, sc, tb, refCols, arrow) => `<div class="rel">${arrow === 'out'
    ? `<span class="rel-c">${esc(cols.join(', '))}</span><span class="rel-a">→</span>${link(sc, tb)}<span class="rel-c">(${esc(refCols.join(', '))})</span>`
    : `${link(sc, tb)}<span class="rel-c">(${esc(cols.join(', '))})</span><span class="rel-a">→</span><span class="rel-c">${esc(refCols.join(', '))}</span>`}</div>`;
  const rels = fks.out.length || fks.refs.length
    ? `${fks.out.length ? `<div class="rel-h">${t('relOut')}</div>${fks.out.map(f => relRow(f.columns, f.ref_schema, f.ref_table, f.ref_columns, 'out')).join('')}` : ''}
       ${fks.refs.length ? `<div class="rel-h">${t('relIn')}</div>${fks.refs.map(f => relRow(f.columns, f.src_schema, f.src_table, f.ref_columns, 'in')).join('')}` : ''}`
    : `<div class="grid-empty" style="padding:16px">${t('noRelations')}</div>`;
  body.innerHTML = `<div class="struct">
    <div class="card"><div class="card-h">${t('columns')}</div><div class="grid-x"><table class="grid" style="width:100%"><thead><tr>
      <th>${t('column')}</th><th>${t('type')}</th><th class="c">${t('dzRequired')}</th><th>${t('default')}</th></tr></thead><tbody>
      ${s.columns.map(c => {
        // типы и значения по умолчанию – теми же словами, что в конструкторе; технический тип – серым рядом
        const counter = /^nextval\(/.test(c.default || '') || !!c.identity;
        const k = dzParseType(c.type, counter).k, nice = k === 'other' ? c.type : t('dzT_' + k);
        const def = counter ? t('dzCounterLocked') : dzShowDefault(c.default);
        return `<tr><td>${c.pk ? `<span class="badge pk">${icon('key', 11)}PK</span> ` : ''}${esc(c.name)}</td>
        <td>${esc(nice)}${nice !== c.type ? ` <span class="ty-raw">${esc(c.type)}</span>` : ''}</td>
        <td class="c">${c.nullable ? '' : icon('check', 13)}</td>
        <td style="color:var(--text-2)">${esc(def)}</td></tr>`; }).join('')}
    </tbody></table></div></div>
    ${tab.kind === 'table' ? `<div class="card"><div class="card-h">${t('relations')}</div><div class="rels">${rels}</div></div>` : ''}
    ${tab.kind === 'table' ? `<div class="card"><div class="card-h">${t('indexes')}</div>${s.indexes.length
      ? s.indexes.map(i => `<pre class="code" style="border-bottom:1px solid var(--line)">${highlight(i.definition).trim()}</pre>`).join('')
      : `<div class="grid-empty" style="padding:16px">${t('noIndexes')}</div>`}</div>` : ''}
    <div class="card"><div class="card-h">${t('ddl')}</div><pre class="code">${highlight(s.ddl).trim()}</pre></div></div>`;
  body.querySelectorAll('[data-open-t]').forEach(el => el.onclick = () => openTable(tab.conn, el.dataset.openS, el.dataset.openT, 'table'));
}

// ================= импорт CSV =================
// файл CSV или Excel → предпросмотр (заголовок, первые строки, имена и типы колонок)
async function pickTableFile() {
  try {
    if (NATIVE) return await api('pick_csv');
    const f = await new Promise(res => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.csv,.txt,.tsv,.xlsx';
      inp.onchange = () => {
        const file = inp.files[0];
        if (!file) return res(null);
        if (/\.xlsx$/i.test(file.name)) file.arrayBuffer().then(b => {
          let bin = ''; const u = new Uint8Array(b);
          for (let i = 0; i < u.length; i += 32768) bin += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
          res({ name: file.name, text: btoa(bin), b64: true });
        });
        else file.text().then(text => res({ name: file.name, text }));
      };
      inp.click();
    });
    return f && await api('csv_preview_text', f.name, f.text, !!f.b64);
  } catch (e) { toast(e.message, 'err'); return null; }
}

// новая таблица из файла CSV / Excel: имена и типы колонок угаданы, их можно поправить; создание и загрузка – одной транзакцией
const FT_TYPES = ['text', 'integer', 'bigint', 'numeric', 'date', 'timestamp', 'boolean'];
async function openFileToTable(cid, schema) {
  const p = await pickTableFile();
  if (!p) return;
  if (!p.header.length) { toast(t('ftEmpty'), 'err'); return; }
  const tyName = ty => t({ text: 'dzT_text', integer: 'dzT_integer', bigint: 'dzT_bigint', numeric: 'dzT_numeric', date: 'dzT_date', timestamp: 'dzT_timestamp', boolean: 'dzT_boolean' }[ty]);
  const body = `<p>${esc(t('ftInfo', { f: p.name, n: p.total.toLocaleString(LANG) }))}</p>
    <div class="field"><label>${t('stTableName')}</label><input class="input mono" id="ft-name" value="${esc(p.table)}" spellcheck="false" autocomplete="off"></div>
    <div class="ft-cols">
      <div class="ft-row ft-head"><span></span><span>${t('ftFileCol')}</span><span>${t('ftCol')}</span><span>${t('dzType')}</span><span>${t('ftSample')}</span></div>
      ${p.header.map((h, i) => `<div class="ft-row">
        <input type="checkbox" data-use="${i}" checked>
        <span class="ft-h" title="${esc(h)}">${esc(h || '–')}</span>
        <input class="input sm mono" data-name="${i}" value="${esc(p.names[i])}" spellcheck="false" autocomplete="off">
        <select class="select sm" data-type="${i}">${FT_TYPES.map(x => `<option value="${x}" ${x === p.types[i] ? 'selected' : ''}>${esc(tyName(x))}</option>`).join('')}</select>
        <span class="ft-ex" title="${esc(p.rows.slice(0, 3).map(r => r[i] ?? '').join(' · '))}">${esc((p.rows[0] || [])[i] ?? '')}</span></div>`).join('')}
    </div>
    <div class="field"><label>${t('dzKey')}</label><select class="select" id="ft-key">
      <option value="add" ${p.key === 'add' ? 'selected' : ''}>${t('ftKeyAdd')}</option>
      ${p.names.map((n, i) => `<option value="${i}" ${p.key === n ? 'selected' : ''}>${esc(t('ftKeyCol', { c: n }))}</option>`).join('')}
      <option value="">${t('ftKeyNone')}</option></select>
      <p class="hint">${t('ftKeyHint')}</p></div>
    <div class="hint" id="ft-hint">${t('ftHint')}</div>`;
  let made = null;
  await modal({ title: t('ftTitle'), tile: 'upload', body, cls: 'wide ft-dlg', buttons: [
    { label: t('cancel'), value: null },
    { label: t('create'), cls: 'primary', main: true, onClick: async (ov, btn) => {
      const table = $('#ft-name', ov).value.trim();
      const hint = $('#ft-hint', ov);
      const cols = p.header.map((h, i) => ({ src: i, use: $(`[data-use="${i}"]`, ov).checked, name: $(`[data-name="${i}"]`, ov).value.trim(), type: $(`[data-type="${i}"]`, ov).value }))
        .filter(c => c.use && c.name);
      if (!table) { $('#ft-name', ov).focus(); return false; }
      if (!cols.length) { hint.className = 'hint err'; hint.textContent = t('errNoMapping'); return false; }
      const kv = $('#ft-key', ov).value;
      const key = kv === 'add' ? 'add' : kv === '' ? null : (cols.find(c => c.src === +kv) || {}).name || null;
      btn.disabled = true; hint.className = 'hint'; hint.textContent = t('importing', { t: p.name });
      try { made = { table, n: await api('import_new_table', cid, schema, table, p.path, cols, key) }; }
      catch (e) { btn.disabled = false; hint.className = 'hint err'; hint.textContent = e.message; return false; }
    } },
  ] });
  if (!made) return;
  toast(t('ftDone', { t: made.table, n: made.n.toLocaleString(LANG) }));
  const sc = (S.schemas[cid] || []).find(s => s.name === schema);
  if (sc) await loadTables(cid, sc, true);
  loadMeta(cid);
  openTable(cid, schema, made.table, 'table');
}

async function openCsvImport(cid, schema, table) {
  const tab = findTableTab(cid, schema, table);
  if (tab && !await leaveTable(tab)) return;
  const preview = await pickTableFile();
  if (!preview) return;
  let cols = [];
  try { cols = (await api('structure', cid, schema, table)).columns; } catch (e) { toast(e.message, 'err'); return; }
  const guess = h => { const x = cols.find(c => c.name.toLowerCase() === h.trim().toLowerCase()); return x ? x.name : ''; };
  const body = `<p>${esc(t('csvInfo', { n: preview.total.toLocaleString(LANG), f: preview.name }))}</p>
    <div class="csv-map">${preview.header.map((h, i) => `<div class="csv-row">
      <span class="csv-h" title="${esc(h)}">${esc(h || '–')}</span><span class="csv-arrow">→</span>
      <select class="select sm" data-map="${i}"><option value="">${t('csvSkip')}</option>${cols.map(c => `<option ${guess(h) === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <span class="csv-ex">${esc((preview.rows[0] || [])[i] ?? '')}</span></div>`).join('')}</div>
    <label class="check"><input type="checkbox" id="csv-null" checked><span>${t('csvEmptyNull')}</span></label>
    <div class="hint" id="csv-hint">${t('csvHint')}</div>`;
  let loaded = null;
  await modal({
    title: t('csvTitle', { t: table }), tile: 'upload', body, cls: 'wide',
    buttons: [
      { label: t('cancel'), value: null },
      { label: t('importRun'), cls: 'primary', main: true, onClick: async (ov, btn) => {
        const mapping = [...ov.querySelectorAll('[data-map]')].map(s => s.value || null);
        const hint = $('#csv-hint', ov);
        if (!mapping.some(Boolean)) { hint.className = 'hint err'; hint.textContent = t('errNoMapping'); return false; }
        btn.disabled = true; hint.className = 'hint'; hint.textContent = t('importing', { t: preview.name });
        try { loaded = await api('import_csv', cid, schema, table, preview.path, mapping, $('#csv-null', ov).checked); }
        catch (e) { btn.disabled = false; hint.className = 'hint err'; hint.textContent = e.message; return false; }
      } },
    ],
  });
  if (loaded != null) {
    toast(t('csvDone', { n: loaded.toLocaleString(LANG) }));
    if (tab) { recount(tab); loadTab(tab); }
    loadTree(cid);
  }
}
