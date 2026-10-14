// SQL-редактор, выгрузка, автодополнение.
// ================= SQL-редактор =================
const KW = new Set(('select from where and or not in is null as on join left right inner outer full cross group by order having limit offset ' +
  'insert into values update set delete create table view index drop alter add column primary key foreign references default ' +
  'distinct union all case when then else end with returning truncate begin commit rollback exists between like ilike asc desc ' +
  'nulls first last count sum avg min max coalesce cast schema database if constraint unique check serial bigserial text integer int ' +
  'bigint numeric varchar boolean bool date timestamp timestamptz jsonb json true false grant revoke explain analyze over partition ' +
  'filter lateral using natural materialized replace function returns language cascade round extract interval').split(' '));
const DANGER = new Set(['drop', 'delete', 'truncate']);

function highlight(src) {
  const re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\{\{[^}\n]*\}\})/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const [tok, com, str, ident, num, word, vr] = m;
    if (vr) out += `<span class="tk-var">${esc(tok)}</span>`;
    else if (com) out += `<span class="tk-com">${esc(tok)}</span>`;
    else if (str) out += `<span class="tk-str">${esc(tok)}</span>`;
    else if (ident) out += esc(tok);
    else if (num) out += `<span class="tk-num">${esc(tok)}</span>`;
    else if (word && DANGER.has(word.toLowerCase())) out += `<span class="tk-danger">${esc(tok)}</span>`;
    else if (word && KW.has(word.toLowerCase())) out += `<span class="tk-kw">${esc(tok)}</span>`;
    else out += esc(tok);
    last = re.lastIndex;
  }
  return out + esc(src.slice(last)) + '\n';
}

const stripSql = q => q.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'|"(?:[^"]|"")*"/g, ' ');
const isDangerous = q => /\b(drop|delete|truncate)\b/i.test(stripSql(q));
const isSelect = q => /^\s*(select|with|table|values)\b/i.test(stripSql(q));

// UPDATE или DELETE без WHERE изменит всю таблицу – возвращаем её название, чтобы предупредить
function noWhereTarget(q) {
  for (const st of stripSql(q).split(';')) {
    const m = /^\s*(update|delete\s+from)\s+((?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+))?)/i.exec(st);
    if (m && !/\bwhere\b/i.test(st)) return m[2];
  }
  return null;
}

// одна кнопка «Выгрузить ▾» вместо отдельных CSV и Excel
function exportButton(prefix) {
  return `<button class="btn ghost sm exp" id="${prefix}-exp" title="${t('exportBtn')}">${icon('share', 13)}<span class="bl">${t('exportBtn')}</span>${icon('chevronDown', 11)}</button>`;
}

function exportMenu(btn, items) {
  const r = btn.getBoundingClientRect();
  openMenu(r.right - 230, r.bottom + 4, items);
}

// ================= транзакции редактора =================
const isManual = cid => !!S.manual[cid];

async function setTxMode(cid, manual) {
  if (!manual && !await resolveTx(cid)) return;
  try {
    await api('set_tx_mode', cid, manual);
    S.manual[cid] = manual;
    S.tx[cid] = 'none';
  } catch (e) { toast(e.message, 'err'); }
  const tab = curTab();
  if (tab && tab.type === 'query') renderTxBar(tab);
}

async function refreshTx(cid) {
  try { S.tx[cid] = await api('tx_state', cid); } catch (e) { /* соединение могло закрыться */ }
  const tab = curTab();
  if (tab && tab.type === 'query' && tab.conn === cid) renderTxBar(tab);
}

async function txCommit(cid) {
  try { S.tx[cid] = await api('commit', cid); toast(t('committed')); }
  catch (e) { toast(e.message, 'err'); await refreshTx(cid); return false; }
  const tab = curTab(); if (tab && tab.type === 'query') renderTxBar(tab);
  loadTree(cid);
  S.tabs.filter(x => x.type === 'table' && x.conn === cid && x.data).forEach(x => { recount(x); if (x === curTab()) loadTab(x); else x.data = null; });
  return true;
}

async function txRollback(cid) {
  try { S.tx[cid] = await api('rollback', cid); toast(t('rolledBack')); }
  catch (e) { toast(e.message, 'err'); }
  const tab = curTab(); if (tab && tab.type === 'query') renderTxBar(tab);
  return true;
}

// перед закрытием/отключением: если в редакторе есть несохранённая транзакция – спросить
async function resolveTx(cid) {
  const st = S.tx[cid];
  if (!st || st === 'none') return true;
  const choice = await askSave(t('txOpenTitle'), st === 'error' ? t('txErrorText') : t('txOpenText'));
  if (choice === 'save') return st === 'error' ? txRollback(cid) : txCommit(cid);
  if (choice === 'discard') return txRollback(cid);
  return false;
}

function renderTxBar(tab) {
  const bar = $('#txbar'), seg = $('#txmode');
  if (!bar || curTab() !== tab) return;
  const manual = isManual(tab.conn), st = S.tx[tab.conn] || 'none';
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.m === 'manual') === manual));
  const badge = $('#txbadge');   // режим «Вручную» не по умолчанию – видно на панели, клик открывает меню с выбором
  if (badge) badge.classList.toggle('hidden', !manual);
  bar.classList.toggle('hidden', !manual || st === 'none');
  bar.classList.toggle('err', st === 'error');
  bar.innerHTML = st === 'error'
    ? `<span class="pend-dot red"></span><span>${t('txErrorBar')}</span><div class="grow"></div>
       <button class="btn danger" id="tx-rb">${icon('refresh', 13)}${t('rollback')}</button>`
    : `<span class="pend-dot"></span><span>${t('txOpenBar')}</span><div class="grow"></div>
       <button class="btn danger-soft" id="tx-rb">${t('rollback')}</button>
       <button class="btn primary" id="tx-commit">${icon('check', 13)}${t('commit')}</button>`;
  const rb = $('#tx-rb'); if (rb) rb.onclick = () => txRollback(tab.conn);
  const cm = $('#tx-commit'); if (cm) cm.onclick = () => txCommit(tab.conn);
  renderTabs();
}

// ================= сохранение запроса: файл или «избранное» =================
async function saveQueryFile(tab, asNew) {
  try {
    const name = (tab.title || `query_${tab.n}`).replace(/\.sql$/i, '') + '.sql';
    const r = await api('save_sql_file', tab.sql, name, asNew ? null : (tab.file || null));
    if (!r) return;
    tab.file = r.path; tab.savedSql = tab.sql;
    if (!tab.savedId) tab.title = r.name;
    toast(t('exported', { p: r.name }));
    renderTabs(); saveDrafts();
  } catch (e) { toast(e.message, 'err'); }
}

async function saveQueryFav(tab, rename) {
  let name = tab.savedId && !rename ? tab.title : await promptText(t('saveQuery'), t('name'), tab.title || '');
  if (!name) return;
  try {
    const prev = !rename && tab.savedId ? savedById(tab.savedId) : null;
    const item = await api('saved_save', { id: rename ? null : tab.savedId, name, sql: tab.sql, mode: prev && prev.mode === 'live' ? 'live' : 'query',
      conn: tab.conn, db: S.info[tab.conn] && S.info[tab.conn].db });
    tab.savedId = item.id; tab.title = item.name; tab.savedSql = tab.sql;
    toast(t('querySaved', { t: item.name }));
    await loadSaved(); renderSidebar(); renderTabs(); saveDrafts();
  } catch (e) { toast(e.message, 'err'); }
}

// ================= сохранённые таблицы =================
// «Обновляется» – сохраняется запрос, при открытии он выполняется заново;
// «На текущий момент» – результат запроса становится настоящей таблицей в базе (create table … as).
const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
function tableSlug(name) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const base = [...name.toLowerCase()].map(ch => TRANSLIT[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'table';
  return `${/^[0-9]/.test(base) ? 't_' + base : base}_${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}`;
}

async function saveTableDialog(tab) {
  if (!tab.sql.trim()) { toast(t('stEmptySql'), 'err'); return; }
  const cur = tab.savedId ? savedById(tab.savedId) : null;
  const ro = S.info[tab.conn] && S.info[tab.conn].read_only;
  const schemas = (S.schemas[tab.conn] || []).map(s => s.name);
  const name0 = tab.title && !/\.sql$/i.test(tab.title) ? tab.title : '';
  let mode = cur && cur.mode === 'live' ? 'live' : 'live';
  let out = null;
  const body = `<div class="field"><label>${t('name')}</label><input class="input" id="st-name" value="${esc(name0)}" placeholder="${t('stNamePh')}" spellcheck="false" autocomplete="off"></div>
    <div class="st-choice" id="st-mode">
      <button class="st-opt on" data-m="live">${icon('refresh', 18)}<span><b>${t('stLive')}</b><i>${t('stLiveText')}</i></span></button>
      ${ro ? '' : `<button class="st-opt" data-m="fixed">${icon('clock', 18)}<span><b>${t('stFixed')}</b><i>${t('stFixedText')}</i></span></button>`}
    </div>
    <div class="st-fixed hidden" id="st-fixed">
      <div class="field"><label>${t('stTableName')}</label><div class="st-tn">
        ${schemas.length > 1 ? `<select class="select" id="st-schema">${schemas.map(s => `<option ${s === 'public' ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
        <input class="input mono" id="st-table" spellcheck="false" autocomplete="off"></div>
        <p class="hint">${t('stTableHint')}</p></div>
    </div>`;
  const buttons = [
    { label: t('cancel'), value: null },
    { label: t('save'), cls: 'primary', main: true, onClick: async (ov, btn) => {
      const name = $('#st-name', ov).value.trim();
      if (!name) { $('#st-name', ov).focus(); return false; }
      if (mode === 'live') { out = { mode, name }; return; }
      const table = $('#st-table', ov).value.trim();
      if (!table) { $('#st-table', ov).focus(); return false; }
      const sc = $('#st-schema', ov) ? $('#st-schema', ov).value : (schemas[0] || 'public');
      const bound = bindVars(tab, tab.sql);
      if (!bound) return false;
      btn.disabled = true; btn.textContent = t('stSaving');
      try {
        const r = await api('save_result_table', tab.conn, sc, table, bound.sql, bound.params);
        out = { mode, name, schema: sc, table, rows: r.rows };
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = t('save'); return false; }
    } },
  ];
  const p = modal({ title: t('stSaveTitle'), tile: 'table', body, buttons, cls: 'st-modal' });
  const ov = document.querySelector('.overlay.st-modal');
  const nm = $('#st-name', ov), tb = $('#st-table', ov);
  let tbTouched = false;
  tb.oninput = () => { tbTouched = true; };
  nm.oninput = () => { if (!tbTouched) tb.value = tableSlug(nm.value); };
  tb.value = tableSlug(nm.value);
  $('#st-mode', ov).onclick = e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    mode = b.dataset.m;
    ov.querySelectorAll('.st-opt').forEach(x => x.classList.toggle('on', x === b));
    $('#st-fixed', ov).classList.toggle('hidden', mode !== 'fixed');
  };
  await p;
  if (!out) return;
  try {
    const d = new Date();
    const item = out.mode === 'live'
      ? await api('saved_save', { id: cur && cur.mode === 'live' ? cur.id : null, name: out.name, sql: tab.sql, mode: 'live', conn: tab.conn, db: S.info[tab.conn].db })
      : await api('saved_save', { name: out.name, sql: tab.sql, mode: 'fixed', conn: tab.conn, db: S.info[tab.conn].db,
          schema: out.schema, table: out.table, created: d.toISOString().slice(0, 10) });
    if (out.mode === 'live') { tab.savedId = item.id; tab.title = item.name; tab.savedSql = tab.sql; }
    toast(out.mode === 'live' ? t('stSavedLive', { t: item.name }) : t('stSavedFixed', { t: out.table, n: out.rows }));
    await loadSaved();
    if (out.mode === 'fixed') { const sc = (S.schemas[tab.conn] || []).find(s => s.name === out.schema); if (sc) await loadTables(tab.conn, sc, true); loadMeta(tab.conn); }
    renderSidebar(); renderTabs(); saveDrafts();
  } catch (e) { toast(e.message, 'err'); }
}

function saveQuery(tab) {
  if (tab.savedId) return saveQueryFav(tab);
  return saveQueryFile(tab, false);
}

// «Сохранить ▾»: запрос или таблица в приложении (раздел «Сохранённое» в сайдбаре)
function saveMenu(tab, x, y) {
  const cur = tab.savedId ? savedById(tab.savedId) : null;
  openMenu(x, y, [
    ...(cur ? [{ icon: 'refresh', label: t('svUpdate', { t: cur.name }), hint: t('svUpdateHint'), action: () => saveQueryFav(tab) }] : []),
    { icon: 'star', label: t('svQuery'), hint: t('svQueryHint'), action: () => saveQueryFav(tab, true) },
    { icon: 'table', label: t('svTable'), hint: t('svTableHint'), action: () => saveTableDialog(tab) },
    ...(S.info[tab.conn] && S.info[tab.conn].read_only ? [] : [{ icon: 'view', label: t('svView'), hint: t('svViewHint'), action: () => saveViewDialog(tab) }]),
  ]);
}

// запрос → представление (VIEW) в базе: им пользуются pgAdmin, Excel, BI и коллеги, не только Noir DB
async function saveViewDialog(tab) {
  if (!tab.sql.trim()) { toast(t('stEmptySql'), 'err'); return; }
  const ta = $('#sql');
  const st = ta && statementAt(ta.value, ta.selectionStart);
  const sqlText = ta && ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : st ? ta.value.slice(st.s, st.e) : tab.sql;
  const schemas = (S.schemas[tab.conn] || []).map(s => s.name);
  const base = tab.title && !/\.sql$/i.test(tab.title) && !/^(Запрос|Query) \d+$/.test(tab.title) ? tab.title : '';
  const slug = n => 'v_' + ([...n.toLowerCase()].map(ch => TRANSLIT[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'query');
  let out = null;
  const body = `<div class="field"><label>${t('svViewName')}</label><div class="st-tn">
      ${schemas.length > 1 ? `<select class="select" id="vw-schema">${schemas.map(s => `<option ${s === 'public' ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
      <input class="input mono" id="vw-name" value="${esc(base ? slug(base) : 'v_')}" spellcheck="false" autocomplete="off"></div>
      <p class="hint">${t('svViewText')}</p></div>`;
  await modal({ title: t('svViewTitle'), tile: 'view', body, buttons: [
    { label: t('cancel'), value: null },
    { label: t('create'), cls: 'primary', main: true, onClick: async (ov, btn) => {
      const name = $('#vw-name', ov).value.trim();
      if (!name || name === 'v_') { $('#vw-name', ov).focus(); return false; }
      const sc = $('#vw-schema', ov) ? $('#vw-schema', ov).value : (schemas[0] || 'public');
      btn.disabled = true;
      try { await api('save_view', tab.conn, sc, name, sqlText); out = { sc, name }; }
      catch (e) { toast(e.message, 'err'); btn.disabled = false; return false; }
    } },
  ] });
  if (!out) return;
  toast(t('svViewDone', { t: out.name }));
  const sc = (S.schemas[tab.conn] || []).find(s => s.name === out.sc);
  if (sc) await loadTables(tab.conn, sc, true);
  loadMeta(tab.conn); renderSidebar();
}

// «Файл ▾»: запрос в файл .sql на Mac и обратно
function fileMenu(tab, x, y) {
  const fileName = tab.file ? tab.file.split('/').pop() : '';
  openMenu(x, y, [
    ...(tab.file ? [{ icon: 'download', label: t('svToFile', { t: fileName }), action: () => saveQueryFile(tab, false) }] : []),
    { icon: tab.file ? 'plus' : 'download', label: t('svNewFile'), action: () => saveQueryFile(tab, true) },
    '-',
    { icon: 'folder', label: t('svOpenFile'), action: () => openQueryFile(tab) },
  ]);
}

// открыть .sql с Mac: в этой вкладке, если она пустая, иначе в новой
async function openQueryFile(tab) {
  const f = await pickSqlFile();
  if (!f) return;
  if (f.text == null) { toast(`${f.name}: ${fmtSize(f.size)} – ${t('importSql')}`, 'err'); return; }
  let target = tab;
  if (tab.sql.trim()) { newQueryTab(f.text); target = curTab(); }
  target.sql = f.text; target.file = f.path || null; target.title = f.name; target.savedSql = f.text; target.savedId = null;
  saveDrafts();
  renderTabs(); renderPane();
}

// ================= редактор =================
function renderQuery(pane, tab) {
  pane.innerHTML = `
    <div class="editor" id="editor" style="${tab.editorH ? 'height:' + tab.editorH + 'px' : ''}">
      <div class="gutter"><div id="gutn"></div></div>
      <div class="errband hidden" id="errband"></div>
      <pre id="fm" class="fm"></pre>
      <pre id="hl"></pre>
      <pre id="dm" class="fm dm"></pre>
      <div class="findbar hidden" id="findbar">
        <div class="fb-row"><button class="btn ghost icon fb-tog" id="fb-tog" title="${t('fbReplaceShow')}">${icon('chevronRight', 12)}</button>
          <input class="input sm" id="fb-q" placeholder="${t('fbFind')}" spellcheck="false" autocomplete="off"><span class="fb-n" id="fb-n"></span>
          <button class="btn ghost icon" id="fb-prev" title="${t('fbPrev')}">${icon('chevronDown', 13, 'flip')}</button>
          <button class="btn ghost icon" id="fb-next" title="${t('fbNext')}">${icon('chevronDown', 13)}</button>
          <button class="btn ghost icon" id="fb-close" title="${t('close')}">${icon('x', 12)}</button></div>
        <div class="fb-row hidden" id="fb-rep"><span class="fb-sp"></span><input class="input sm" id="fb-r" placeholder="${t('fbReplace')}" spellcheck="false" autocomplete="off">
          <button class="btn ghost sm" id="fb-one">${t('fbReplaceOne')}</button><button class="btn ghost sm" id="fb-all">${t('fbReplaceAll')}</button></div>
      </div>
      <textarea id="sql" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off" placeholder="SELECT * FROM …"></textarea>
    </div>
    <div class="ac hidden" id="ac"></div>
    <div class="resizer" id="resizer"></div>
    <div class="toolbar">
      <div class="runbtn" id="runbox"><button class="btn primary play" id="run">${icon('play', 12)}${t('run')}<span class="kbd">${t('shortcutRun')}</span></button><button class="btn primary run-more" id="run-more" title="${t('moreActions')}" aria-label="${t('moreActions')}">${icon('chevronDown', 12)}</button></div>
      <button class="btn hidden" id="stop">${icon('stop', 12)}${t('stop')}</button>
      <button class="btn ghost sm txbadge hidden" id="txbadge" title="${t('txManualHint')}">${t('txBadge')}</button>
      <button class="btn ghost" id="hist" title="${t('history')}">${icon('clock', 14)}<span class="bl">${t('history')}</span></button>
      <button class="btn ghost" id="qsave" title="${t('saveBtn')}">${icon('bookmark', 14)}<span class="bl">${t('saveBtn')}</span>${icon('chevronDown', 12)}</button>
      <button class="btn ghost" id="qfile" title="${t('svFile')}">${icon('sqlfile', 14)}<span class="bl">${t('fileBtn')}</span>${icon('chevronDown', 12)}</button>
      <span class="stat" id="qstat"></span><div class="grow"></div>
      <div class="seg hidden" id="qview"><button data-v="table">${t('viewTable')}</button><button data-v="chart">${t('viewChart')}</button><button data-v="pivot">${t('viewPivot')}</button><button data-v="compare">${t('viewCompare')}</button></div>
      ${exportButton('q')}
    </div>
    <div class="txbar hidden" id="txbar"></div>
    <div class="varbar hidden" id="varbar"></div>
    <div class="chart-ctl hidden" id="chartctl"></div>
    <div class="grid-wrap" id="qgrid"></div>
    <div class="selsum-float hidden" id="qsum"></div>`;
  const ta = $('#sql'), hl = $('#hl'), gut = $('#gutn');
  ta.value = tab.sql;
  let raf = 0, lines = -1;
  const sync = () => {
    raf = 0;
    hl.innerHTML = highlight(ta.value);
    const n = ta.value.split('\n').length;
    if (n !== lines || tab.errLineDirty) {
      lines = n; tab.errLineDirty = false;
      let h = '';
      for (let i = 1; i <= n; i++) h += `<div class="${tab.errLine === i ? 'err' : ''}">${i}</div>`;
      gut.innerHTML = h;
    }
    scrollSync();
    sqPaint(tab);
    renderVarBar(tab);
    if (FIND.open) findUpdate(ta, false);
  };
  const scrollSync = () => {
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
    const fm = $('#fm'); if (fm) { fm.scrollTop = ta.scrollTop; fm.scrollLeft = ta.scrollLeft; }
    const dm = $('#dm'); if (dm) { dm.scrollTop = ta.scrollTop; dm.scrollLeft = ta.scrollLeft; }
    gut.style.transform = `translateY(${-ta.scrollTop}px)`;
    const band = $('#errband');
    if (!band) return;                     // вкладку уже закрыли
    if (tab.errLine) {
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21.45;
      band.style.top = (12 + (tab.errLine - 1) * lh - ta.scrollTop) + 'px';
      band.style.height = lh + 'px';
      band.classList.remove('hidden');
    } else band.classList.add('hidden');
  };
  sync();
  ta.oninput = () => {
    tab.sql = ta.value;
    if (tab.errLine) { tab.errLine = null; tab.errLineDirty = true; }
    // пока печатаешь – отметки убираем (позиции сдвинулись), проверка – после паузы
    tab.errMark = null; tab.lint = [];
    sqLintSoon(tab);
    saveDrafts();
    if (!raf) raf = requestAnimationFrame(sync);
    if (tab.savedSql != null && tabDirty(tab) !== tab._shownDirty) { tab._shownDirty = tabDirty(tab); renderTabs(); }
    if (ta._acSkip) { ta._acSkip = false; return; }
    if (snipOnInput(ta)) return;
    acUpdate(tab, ta, false);
  };
  // прокрутка (в том числе от вставки сниппета) не закрывает подсказки – они едут за курсором
  ta.onscroll = () => { scrollSync(); if (AC.open) acRender(ta); };
  ta.onblur = () => setTimeout(acClose, 150);
  ta.onclick = () => { acClose(); SNIP.on = false; };
  ta.onkeydown = e => {
    if (acKey(e, tab, ta, sync)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); runQuery(tab, e.shiftKey); return; }
    if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); acUpdate(tab, ta, true); return; }
    if ((e.metaKey || e.ctrlKey) && e.code === 'Slash') { e.preventDefault(); toggleComment(ta); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      tab.sql = ta.value; sync();
    }
  };
  bindFind(tab, ta);
  sqBindHover(tab, ta);
  sqLintSoon(tab, 30);
  $('#run').onclick = () => runQuery(tab);
  $('#run-more').onclick = () => { const r = $('#runbox').getBoundingClientRect(); runMenu(tab, r.left, r.bottom + 4); };
  $('#stop').onclick = () => api('cancel_query', tab.conn).catch(() => {});
  $('#hist').onclick = () => showHistory(tab);
  $('#txbadge').onclick = () => { const r = $('#run-more').getBoundingClientRect(); runMenu(tab, r.left, r.bottom + 4); };
  $('#qsave').onclick = () => { const r = $('#qsave').getBoundingClientRect(); saveMenu(tab, r.left, r.bottom + 4); };
  $('#qfile').onclick = () => { const r = $('#qfile').getBoundingClientRect(); fileMenu(tab, r.left, r.bottom + 4); };
  $('#qview').onclick = e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    tab.resView = b.dataset.v;
    renderQueryResult(tab);
  };
  $('#q-exp').onclick = e => {
    const chart = tab.resView === 'chart' && $('#qgrid svg.chart-svg');
    const r = tab.result;
    exportMenu(e.currentTarget, [
      { icon: 'copy', label: t('copyTable'), action: () => {
        const x = tab.resView === 'pivot' && tab.pivot && tab.pivot.data ? pivotExport(tab) : null;
        copyTable(x ? x.head.map(name => ({ name })) : r.columns, x ? x.rows : r.rows).then(ok => ok && toast(t('tableCopied')));
      } },
      '-',
      { icon: 'download', label: t('exportCsvTip'), action: () => exportQuery(tab, 'csv') },
      { icon: 'download', label: chart ? t('exportXlsxChart') : t('exportXlsxTip'), action: () => exportQuery(tab, 'xlsx') },
      ...(chart ? [{ icon: 'chart', label: t('exportPng'), action: () => exportPng(tab) }] : []),
    ]);
  };
  // перетаскивание границы редактора
  $('#resizer').onmousedown = e => {
    const ed = $('#editor'), y0 = e.clientY, h0 = ed.offsetHeight;
    const mv = ev => { tab.editorH = Math.max(90, Math.min(innerHeight - 220, h0 + ev.clientY - y0)); ed.style.height = tab.editorH + 'px'; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (tab.resView === 'chart') renderQueryResult(tab); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  };
  renderTxBar(tab);
  renderQueryResult(tab);
}

// стрелка у «Выполнить»: всё, что делается с текстом запроса, – в одном месте (как в pgAdmin и DBeaver)
function runMenu(tab, x, y) {
  const ro = S.info[tab.conn] && S.info[tab.conn].read_only, manual = isManual(tab.conn);
  openMenu(x, y, [
    ...(ro ? [] : [{ head: t('txHead') },
      { icon: manual ? 'none' : 'check', label: t('txAutoL'), hint: t('txAutoHint'), action: () => setTxMode(tab.conn, false) },
      { icon: manual ? 'check' : 'none', label: t('txManualL'), hint: t('txManualHint'), action: () => setTxMode(tab.conn, true) },
      '-']),
    { icon: 'play', label: t('runAll'), kbd: '⇧⌘↵', action: () => runQuery(tab, true) },
    '-',
    { icon: 'code', label: t('fmtSql'), kbd: '⇧⌘F', action: () => formatEditor(tab) },
    { icon: 'search', label: t('findSql'), kbd: '⌘F', action: () => openFind(tab, true) },
    { icon: 'sql', label: t('commentLine'), kbd: '⌘/', action: () => { const ta = $('#sql'); if (ta) toggleComment(ta); } },
  ]);
}

function setRunning(tab, on) {
  const run = $('#runbox'), stop = $('#stop');
  if (!run || curTab() !== tab) return;
  run.classList.toggle('hidden', on);
  stop.classList.toggle('hidden', !on);
}

// время запроса показываем, только когда оно заметно – от секунды
const qTime = ms => (ms >= 1000 ? ` · ${(ms / 1000).toLocaleString(LANG, { maximumFractionDigits: 1 })} ${t('sec')}` : '');

function renderQueryResult(tab) {
  const st = $('#qstat'), grid = $('#qgrid'), ctl = $('#chartctl'), viewSeg = $('#qview');
  if (!st || curTab() !== tab) return;
  const r = tab.result;
  const hasRows = !!(r && r.kind === 'rows' && !tab.running);
  $('#q-exp').classList.toggle('hidden', !hasRows);
  viewSeg.classList.toggle('hidden', !hasRows || (!r.rows.length && !tab.pinned));
  setRunning(tab, !!tab.running);
  ctl.classList.add('hidden');
  grid.classList.remove('chart-box');
  const qs = $('#qsum'); if (qs) qs.classList.add('hidden');
  if (tab.running) {
    st.className = 'stat';
    let shown = false;
    const tick = () => {
      if (!tab.running || curTab() !== tab || !$('#qstat')) return;
      const sec = (performance.now() - tab.startedAt) / 1000;
      $('#qstat').textContent = `${t('running')} ${sec.toFixed(1)} ${t('sec')}`;
      // долгий запрос – индикатор прямо в панели результата (быстрые не мигают)
      if (!shown && sec > 0.3 && $('#qgrid')) {
        shown = true;
        $('#qgrid').innerHTML = `<div class="grid-empty q-wait"><span class="spin"></span><span>${t('running')}</span></div>`;
      }
      setTimeout(tick, 100);
    };
    tick();
    return;
  }
  if (!r) { st.textContent = ''; grid.innerHTML = ''; return; }
  if (r.error) {
    st.className = 'stat err';
    st.textContent = '';             // сообщение – один раз, в карточке ошибки
    grid.innerHTML = sqErrorHtml(tab);
    sqBindError(tab, grid);
    return;
  }
  st.className = 'stat';
  if (r.kind === 'status') {
    st.textContent = r.status + qTime(r.ms);
    grid.innerHTML = `<div class="grid-empty">${esc(r.status)}${r.affected >= 0 ? ` · ${t('affected')}: ${r.affected}` : ''}
      ${isManual(tab.conn) && S.tx[tab.conn] === 'open' ? `<div class="err-where" style="color:var(--yellow)">${t('notCommittedYet')}</div>` : ''}</div>`;
    return;
  }
  st.textContent = nRows(r.rows.length) + qTime(r.ms) + (r.truncated ? ` · ${t('truncated', { n: r.rows.length.toLocaleString(LANG) })}` : '');
  const view = ['chart', 'pivot', 'compare'].includes(tab.resView) && (r.rows.length || tab.resView === 'compare') ? tab.resView : 'table';
  viewSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  if (view === 'pivot') return renderPivotView(tab, ctl, grid);
  if (view === 'compare') return renderCompareView(tab, ctl, grid);
  if (view === 'chart') return renderChartView(tab, ctl, grid);
  if (!tab.colW) tab.colW = {};
  mountGrid(grid, r.columns, r.rows, { colW: tab.colW,
    onRange: s => { const el = $('#qsum'); if (el) { el.textContent = s ? rangeText(s) : ''; el.classList.toggle('hidden', !s); } },
    onColMenu: (what, col, i, th) => showStats(th, tab.conn, { query: { sql: tab.lastSql, params: tab.lastParams || null, ncols: r.columns.length } }, i, col.name) });
}

// ================= поиск и замена в редакторе (⌘F), комментарий строки (⌘/) =================
const FIND = { open: false, q: '', list: [], cur: -1 };

// все вхождения без учёта регистра
function findAll(text, q) {
  const out = [];
  if (!q) return out;
  const T = text.toLowerCase(), Q = q.toLowerCase();
  for (let i = T.indexOf(Q); i >= 0 && out.length < 5000; i = T.indexOf(Q, i + Q.length)) out.push(i);
  return out;
}

// подсветка найденного – отдельным слоем под текстом редактора
function findPaint(ta) {
  const fm = $('#fm');
  if (!fm) return;
  if (!FIND.open || !FIND.list.length) { fm.innerHTML = ''; return; }
  let h = '', last = 0;
  FIND.list.forEach((p, i) => {
    h += esc(ta.value.slice(last, p)) + `<mark class="${i === FIND.cur ? 'cur' : ''}">${esc(ta.value.slice(p, p + FIND.q.length))}</mark>`;
    last = p + FIND.q.length;
  });
  fm.innerHTML = h + esc(ta.value.slice(last)) + '\n';
  fm.scrollTop = ta.scrollTop; fm.scrollLeft = ta.scrollLeft;
}

function findUpdate(ta, jump) {
  FIND.list = findAll(ta.value, FIND.q);
  if (!FIND.list.length) FIND.cur = -1;
  else if (jump || FIND.cur < 0 || FIND.cur >= FIND.list.length) {
    const from = ta.selectionStart;
    FIND.cur = Math.max(0, FIND.list.findIndex(p => p >= from));
  }
  const n = $('#fb-n');
  if (n) {
    n.textContent = !FIND.q ? '' : FIND.list.length ? t('fbOf', { i: FIND.cur + 1, n: FIND.list.length }) : t('fbNone');
    n.classList.toggle('err', !!FIND.q && !FIND.list.length);
  }
  findPaint(ta);
}

// перейти к вхождению: выделить его в тексте и прокрутить так, чтобы было видно
function findGo(ta, d) {
  if (!FIND.list.length) return;
  FIND.cur = (FIND.cur + d + FIND.list.length) % FIND.list.length;
  const p = FIND.list[FIND.cur];
  ta.setSelectionRange(p, p + FIND.q.length);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 21;
  const line = ta.value.slice(0, p).split('\n').length - 1;
  const y = line * lh;
  if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, y - ta.clientHeight / 3);
  const col = p - ta.value.lastIndexOf('\n', p - 1) - 1, x = caretX(ta, col);
  if (x < ta.scrollLeft || x > ta.scrollLeft + ta.clientWidth - 60) ta.scrollLeft = Math.max(0, x - ta.clientWidth / 2);
  ta.dispatchEvent(new Event('scroll'));
  findUpdate(ta, false);
}

// ширина символов моноширинного шрифта редактора
let _monoW = 0;
function caretX(ta, col) {
  if (!_monoW) { _cv.font = getComputedStyle(ta).font; _monoW = _cv.measureText('0000000000').width / 10 || 7.8; }
  return col * _monoW;
}

function openFind(tab, replace) {
  const ta = $('#sql'), bar = $('#findbar');
  if (!ta || !bar) return;
  FIND.open = true;
  bar.classList.remove('hidden');
  const selText = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  if (selText && !selText.includes('\n')) { FIND.q = selText; $('#fb-q').value = selText; }
  if (replace) { $('#fb-rep').classList.remove('hidden'); $('#fb-tog').classList.add('open'); }
  findUpdate(ta, true);
  $('#fb-q').focus(); $('#fb-q').select();
}

function closeFind(ta) {
  FIND.open = false;
  $('#findbar').classList.add('hidden');
  findPaint(ta);
  ta.focus();
}

// замена через insertText – так её можно отменить ⌘Z
function replaceRange(ta, from, to, text) {
  ta.focus();
  ta.setSelectionRange(from, to);
  if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, from, to, 'end');
  ta.dispatchEvent(new Event('input'));
}

function bindFind(tab, ta) {
  FIND.open = false;
  const q = $('#fb-q'), r = $('#fb-r');
  q.value = FIND.q;
  q.oninput = () => { FIND.q = q.value; findUpdate(ta, true); };
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(ta); }
    else if (e.key === 'Enter' && e.target === q) { e.preventDefault(); findGo(ta, e.shiftKey ? -1 : 1); q.focus(); }
    else if (e.key === 'Enter' && e.target === r) { e.preventDefault(); $('#fb-one').click(); }
  };
  q.onkeydown = keys; r.onkeydown = keys;
  $('#fb-next').onclick = () => findGo(ta, 1);
  $('#fb-prev').onclick = () => findGo(ta, -1);
  $('#fb-close').onclick = () => closeFind(ta);
  $('#fb-tog').onclick = () => { const on = $('#fb-rep').classList.toggle('hidden'); $('#fb-tog').classList.toggle('open', !on); if (!on) r.focus(); };
  $('#fb-one').onclick = () => {
    if (!FIND.list.length) return;
    const p = FIND.list[Math.max(0, FIND.cur)];
    replaceRange(ta, p, p + FIND.q.length, r.value);
    ta.setSelectionRange(p + r.value.length, p + r.value.length);
    findUpdate(ta, true);
    if (FIND.list.length) findGo(ta, 0);
    r.focus();
  };
  $('#fb-all').onclick = () => {
    if (!FIND.list.length) return;
    const n = FIND.list.length;
    let out = '', last = 0;
    FIND.list.forEach(p => { out += ta.value.slice(last, p) + r.value; last = p + FIND.q.length; });
    replaceRange(ta, 0, ta.value.length, out + ta.value.slice(last));
    findUpdate(ta, true);
    toast(t('fbReplaced', { n }));
    r.focus();
  };
}

// ⌘/ – закомментировать строки (или снять комментарий, если все уже закомментированы)
function toggleComment(ta) {
  const v = ta.value, s0 = ta.selectionStart;
  let s1 = ta.selectionEnd;
  if (s1 > s0 && v[s1 - 1] === '\n') s1--;
  const from = v.lastIndexOf('\n', s0 - 1) + 1;
  let to = v.indexOf('\n', s1); if (to < 0) to = v.length;
  const lines = v.slice(from, to).split('\n');
  const code = lines.filter(l => l.trim());
  const off = code.length && code.every(l => /^\s*--/.test(l));
  const ind = Math.min(...code.map(l => l.match(/^\s*/)[0].length), Infinity);
  const out = lines.map(l => {
    if (!l.trim()) return l;
    return off ? l.replace(/^(\s*)-- ?/, '$1') : l.slice(0, ind === Infinity ? 0 : ind) + '-- ' + l.slice(ind === Infinity ? 0 : ind);
  }).join('\n');
  replaceRange(ta, from, to, out);
  ta.setSelectionRange(from, from + out.length);
}

// ================= переменные {{…}} =================
// имена переменных по порядку (без повторов); в строках и комментариях {{…}} – обычный текст
function sqlVars(text) {
  if (!text.includes('{{')) return [];
  const names = [];
  sqlTokens(text).forEach(x => {
    if (x.t !== 'lit' || !x.v.startsWith('{{')) return;
    const n = x.v.slice(2, -2).trim();
    if (n && !names.includes(n)) names.push(n);
  });
  return names;
}

const varValue = (tab, n) => (tab.vars && n in tab.vars ? tab.vars[n] : ((S.settings.vars || {})[n] ?? ''));

// строка полей над результатом – видна, пока в тексте есть переменные
function renderVarBar(tab) {
  const box = $('#varbar');
  if (!box || curTab() !== tab) return;
  const names = sqlVars(tab.sql);
  const sig = names.join('\u0001');
  if (box._sig === sig) return;          // набор переменных не изменился – поля не трогаем
  box._sig = sig;
  box.classList.toggle('hidden', !names.length);
  box.innerHTML = names.length ? `<span class="var-ic" title="${esc(t('varsHint'))}">${icon('code', 13)}</span>` + names.map(n =>
    `<label class="var"><span>${esc(n)}</span><input class="input sm" data-var="${esc(n)}" value="${esc(varValue(tab, n))}" spellcheck="false" autocomplete="off"></label>`).join('') : '';
  box.querySelectorAll('[data-var]').forEach(inp => {
    inp.oninput = () => { (tab.vars || (tab.vars = {}))[inp.dataset.var] = inp.value; inp.classList.remove('bad'); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); runQuery(tab); } };
  });
}

// текст для Python: {{имя}} → %(v0)s, остальные % удваиваются (их так понимает psycopg). null – не все поля заполнены
function bindVars(tab, text) {
  const names = sqlVars(text);
  if (!names.length) return { sql: text, params: null };
  const params = {}, missing = [];
  names.forEach((n, i) => {
    const v = String(varValue(tab, n));
    if (!v.trim()) missing.push(n);
    params['v' + i] = v.trim().toUpperCase() === 'NULL' ? null : v;
  });
  if (missing.length) {
    renderVarBar(tab);
    const inp = $(`#varbar [data-var="${CSS.escape(missing[0])}"]`);
    if (inp) { inp.classList.add('bad'); inp.focus(); }
    toast(t('varsFill', { v: missing.join(', ') }), 'err');
    return null;
  }
  const sql = sqlTokens(text).map(x => x.t === 'lit' && x.v.startsWith('{{') ? `%(v${names.indexOf(x.v.slice(2, -2).trim())})s`
    : x.t === 'ws' ? x.v : x.v.replace(/%/g, '%%')).join('');
  // запоминаем значения – в следующий раз (и в сохранённом запросе) поля заполнятся сами
  const mem = { ...(S.settings.vars || {}) };
  names.forEach((n, i) => { mem[n] = params['v' + i] === null ? 'NULL' : params['v' + i]; });
  S.settings.vars = mem;
  api('save_settings', { vars: mem }).catch(() => {});
  return { sql, params };
}

// ================= сравнение с закреплённым результатом =================
// «Было» – закреплённый результат, «стало» – текущий. Строки сопоставляются по ключевой колонке.
function renderCompareView(tab, ctl, box) {
  const r = tab.result, pin = tab.pinned;
  ctl.classList.remove('hidden');
  box.classList.remove('chart-box');
  if (!pin) {
    ctl.innerHTML = `<span class="stat">${t('cmpHint')}</span><button class="btn primary" id="cmp-pin">${icon('check', 13)}${t('cmpPin')}</button>`;
    box.onscroll = null; box._grid = null;
    box.innerHTML = `<div class="grid-empty">${t('cmpEmpty')}</div>`;
    $('#cmp-pin').onclick = () => pinResult(tab);
    return;
  }
  const common = r.columns.map(c => c.name).filter(n => pin.columns.some(c => c.name === n));
  if (tab.cmpKey == null || (tab.cmpKey !== '' && !common.includes(tab.cmpKey))) {
    tab.cmpKey = common.find(n => /^id$/i.test(n)) || common.find(n => /(^|_)id$/i.test(n)) || common[0] || '';
  }
  const d = diffResults(pin, r, tab.cmpKey);
  const time = new Date(pin.at).toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' });
  ctl.innerHTML = `<span class="fchip pinned" title="${esc(t('cmpPinnedTip'))}"><span class="fc-t">${t('cmpWas')}: <b>${nRows(pin.rows.length)}</b> · ${time}</span><span class="fc-x" id="cmp-unpin" title="${t('cmpUnpin')}">${icon('x', 11)}</span></span>
    <span class="ctl-l">${t('cmpKey')}</span><select class="select sm" id="cmp-key">${common.map(n => `<option ${n === tab.cmpKey ? 'selected' : ''}>${esc(n)}</option>`).join('')}<option value="" ${tab.cmpKey === '' ? 'selected' : ''}>${t('cmpWholeRow')}</option></select>
    <label class="check"><input type="checkbox" id="cmp-only" ${tab.cmpOnly ? 'checked' : ''}><span>${t('cmpOnly')}</span></label>
    <span class="cmp-sum"><b class="g">+${d.added}</b><b class="r">−${d.removed}</b><b class="y">${t('cmpChanged', { n: d.changed })}</b></span>
    ${d.dupKey ? `<span class="stat err">${t('cmpDupKey')}</span>` : ''}
    <button class="btn ghost" id="cmp-repin">${t('cmpRepin')}</button>`;
  $('#cmp-unpin').onclick = () => { tab.pinned = null; renderQueryResult(tab); };
  $('#cmp-repin').onclick = () => pinResult(tab);
  $('#cmp-key').onchange = e => { tab.cmpKey = e.target.value; renderQueryResult(tab); };
  $('#cmp-only').onchange = e => { tab.cmpOnly = e.target.checked; renderQueryResult(tab); };
  const list = tab.cmpOnly ? d.rows.filter(x => x.kind || x.mod.size) : d.rows;
  if (!tab.colWc) tab.colWc = {};
  mountGrid(box, d.columns, list.map(x => x.row), { colW: tab.colWc,
    rowInfo: i => ({ kind: list[i].kind, mod: list[i].mod.size ? list[i].mod : null }) });
}

function pinResult(tab) {
  const r = tab.result;
  if (!r || r.kind !== 'rows') return;
  tab.pinned = { columns: r.columns, rows: r.rows, at: Date.now() };
  toast(t('cmpPinned'));
  renderQueryResult(tab);
}

// разница: строки «стало» (новые – зелёные, изменённые ячейки – жёлтые), затем исчезнувшие строки «было» (красные)
function diffResults(pin, cur, key) {
  const columns = cur.columns;
  const map = columns.map(c => pin.columns.findIndex(p => p.name === c.name));
  const ki = key === '' ? -1 : columns.findIndex(c => c.name === key), pk = key === '' ? -1 : pin.columns.findIndex(c => c.name === key);
  const keyOf = (row, idx) => JSON.stringify(row[idx]);
  const pinIdx = new Map();
  let dupKey = false;
  pin.rows.forEach((row, i) => {
    const k = ki < 0 ? JSON.stringify(map.map(j => (j < 0 ? null : row[j]))) : keyOf(row, pk);
    if (pinIdx.has(k)) { dupKey = dupKey || ki >= 0; pinIdx.get(k).push(i); } else pinIdx.set(k, [i]);
  });
  const used = new Set(), rows = [];
  let added = 0, changed = 0;
  const seen = new Set();
  cur.rows.forEach(row => {
    const k = ki < 0 ? JSON.stringify(row) : keyOf(row, ki);
    if (ki >= 0 && seen.has(k)) dupKey = true;
    seen.add(k);
    const cand = (pinIdx.get(k) || []).find(i => !used.has(i));
    if (cand === undefined) { rows.push({ row, kind: 'new', mod: new Set() }); added++; return; }
    used.add(cand);
    const old = pin.rows[cand], mod = new Set();
    columns.forEach((c, ci) => { if (map[ci] >= 0 && !sameVal(row[ci], old[map[ci]])) mod.add(ci); });
    if (mod.size) changed++;
    rows.push({ row, kind: '', mod });
  });
  let removed = 0;
  pin.rows.forEach((old, i) => {
    if (used.has(i)) return;
    removed++;
    rows.push({ row: map.map(j => (j < 0 ? null : old[j])), kind: 'gone', mod: new Set() });
  });
  return { columns, rows, added, removed, changed, dupKey };
}

// ================= сводная таблица =================
const PIVOT_FNS = ['sum', 'avg', 'count', 'min', 'max'];

function renderPivotView(tab, ctl, box) {
  const r = tab.result;
  const sig = r.columns.map(c => c.name).join('|');
  const { numeric } = chartDefaults(r.columns, r.rows);
  if (!tab.pivot || tab.pivot.sig !== sig) {
    const rc = Math.max(0, r.columns.findIndex((c, i) => !numeric[i]));
    const vc = r.columns.findIndex((c, i) => numeric[i] && i !== rc);
    tab.pivot = { sig, r: rc, c: null, v: vc >= 0 ? vc : null, fn: vc >= 0 ? 'sum' : 'count' };
  }
  const p = tab.pivot;
  const opt = (sel, skip, onlyNum, none) => (none ? `<option value="" ${sel == null ? 'selected' : ''}>${none}</option>` : '') +
    r.columns.map((c, i) => (i === skip || (onlyNum && !numeric[i]) ? '' : `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(c.name)}</option>`)).join('');
  ctl.classList.remove('hidden');
  ctl.innerHTML = `<span class="ctl-l">${t('pvRows')}</span><select class="select sm" id="pv-r">${opt(p.r)}</select>
    <span class="ctl-l">${t('pvCols')}</span><select class="select sm" id="pv-c">${opt(p.c, p.r, false, '–')}</select>
    <span class="ctl-l">${t('pvValue')}</span><select class="select sm" id="pv-v">${opt(p.v, null, true, t('pvRowsCount'))}</select>
    <span class="ctl-l">${t('pvFn')}</span><select class="select sm" id="pv-fn" ${p.v == null ? 'disabled' : ''}>${PIVOT_FNS.map(f =>
      `<option value="${f}" ${f === p.fn ? 'selected' : ''}>${t('pv_' + f)}</option>`).join('')}</select>`;
  const num = v => (v === '' ? null : +v);
  const set = (k, v) => { p[k] = v; if (k === 'r' && p.c === v) p.c = null; if (k === 'v' && v == null) p.fn = 'count'; if (k === 'v' && v != null && p.fn === 'count') p.fn = 'sum'; p.data = null; renderQueryResult(tab); };
  $('#pv-r').onchange = e => set('r', num(e.target.value));
  $('#pv-c').onchange = e => set('c', num(e.target.value));
  $('#pv-v').onchange = e => set('v', num(e.target.value));
  $('#pv-fn').onchange = e => set('fn', e.target.value);
  box.classList.remove('chart-box'); box.onscroll = null; box._grid = null;
  const key = JSON.stringify([tab.lastSql, p.r, p.c, p.v, p.fn, r.ms]);
  if (p.data && p.key === key) { box.innerHTML = pivotHtml(tab); return; }
  box.innerHTML = `<div class="grid-empty"><span class="spin" style="display:inline-block"></span></div>`;
  p.key = key;
  api('pivot', tab.conn, { sql: tab.lastSql, params: tab.lastParams || null, ncols: r.columns.length }, p.r, p.c, p.v, p.fn)
    .then(d => { if (p.key !== key) return; p.data = d.cells; if (curTab() === tab && tab.resView === 'pivot') box.innerHTML = pivotHtml(tab); })
    .catch(e => { if (p.key === key && curTab() === tab) box.innerHTML = `<div class="grid-empty" style="color:var(--red)">${esc(e.message)}</div>`; });
}

// ячейки из PostgreSQL → строки, колонки и итоги
function pivotMatrix(tab) {
  const p = tab.pivot, cells = p.data, cols = [], rows = [], body = new Map(), rowTot = new Map(), colTot = new Map();
  let grand = null;
  const k = v => (v === null ? '\u0000' : v);
  cells.forEach(([gr, gc, rv, cv, v]) => {
    if (gr === 0 && gc === 0) { if (!body.has(k(rv))) body.set(k(rv), new Map()); body.get(k(rv)).set(k(cv), v); }
    else if (gr === 0) { rowTot.set(k(rv), v); rows.push(rv); }
    else if (gc === 0) { colTot.set(k(cv), v); cols.push(cv); }
    else grand = v;
  });
  return { rows, cols, body, rowTot, colTot, grand, k };
}

function pivotHtml(tab) {
  const p = tab.pivot, r = tab.result, m = pivotMatrix(tab);
  const f = v => (v === null || v === undefined ? '' : fmtNum(String(p.fn === 'avg' ? +(+v).toFixed(2) : v)));
  const lab = v => (v === null ? '<span class="null">NULL</span>' : esc(v));
  const shown = m.rows.slice(0, 1000);
  const hasCols = p.c != null;
  let h = `<table class="grid pivot"><thead><tr><th>${esc(r.columns[p.r].name)}${hasCols ? ` <span class="ty">/ ${esc(r.columns[p.c].name)}</span>` : ''}</th>`;
  h += hasCols ? m.cols.map(c => `<th class="num">${lab(c)}</th>`).join('') + `<th class="num tot">${t('pvTotal')}</th>` : `<th class="num">${esc(pivotValName(tab))}</th>`;
  h += '</tr></thead><tbody>';
  shown.forEach(rv => {
    h += `<tr><td>${lab(rv)}</td>`;
    if (hasCols) {
      const row = m.body.get(m.k(rv)) || new Map();
      h += m.cols.map(c => `<td class="num">${f(row.get(m.k(c)))}</td>`).join('');
    }
    h += `<td class="num ${hasCols ? 'tot' : ''}">${f(m.rowTot.get(m.k(rv)))}</td></tr>`;
  });
  h += `<tr class="tot"><td>${t('pvTotal')}</td>${hasCols ? m.cols.map(c => `<td class="num">${f(m.colTot.get(m.k(c)))}</td>`).join('') : ''}<td class="num">${f(m.grand)}</td></tr>`;
  h += '</tbody></table>';
  if (m.rows.length > shown.length) h += `<div class="grid-empty">${t('pvMore', { n: (m.rows.length - shown.length).toLocaleString(LANG) })}</div>`;
  return h;
}

const pivotValName = tab => { const p = tab.pivot; return p.v == null ? t('pvRowsCount') : `${t('pv_' + p.fn)} · ${tab.result.columns[p.v].name}`; };

// сводная для выгрузки: те же строки, колонки и итоги, что на экране
function pivotExport(tab) {
  const p = tab.pivot, r = tab.result, m = pivotMatrix(tab);
  const hasCols = p.c != null;
  const head = [r.columns[p.r].name, ...(hasCols ? m.cols.map(c => (c === null ? 'NULL' : c)) : []), hasCols ? t('pvTotal') : pivotValName(tab)];
  const rows = m.rows.map(rv => {
    const row = m.body.get(m.k(rv)) || new Map();
    return [rv, ...(hasCols ? m.cols.map(c => row.get(m.k(c)) ?? null) : []), m.rowTot.get(m.k(rv)) ?? null];
  });
  rows.push([t('pvTotal'), ...(hasCols ? m.cols.map(c => m.colTot.get(m.k(c)) ?? null) : []), m.grand]);
  return { head, rows, types: head.map((_, i) => (i === 0 ? 'text' : 'numeric')) };
}

// ================= график по результату =================
function renderChartView(tab, ctl, box) {
  const r = tab.result;
  const { numeric, cfg } = chartDefaults(r.columns, r.rows);
  if (!tab.chart || tab.chart.sig !== r.columns.map(c => c.name).join('|')) tab.chart = { ...cfg, sig: r.columns.map(c => c.name).join('|') };
  const c = tab.chart;
  const opts = (sel, onlyNum) => r.columns.map((col, i) => onlyNum && !numeric[i] ? ''
    : `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(col.name)}</option>`).join('');
  const pick = (id, label, sel, onlyNum) => `<span class="ctl-l">${label}</span><select class="select sm" id="${id}">${sel == null ? '<option value="">–</option>' : ''}${opts(sel, onlyNum)}</select>`;
  let axes = '';
  if (c.type === 'line' || c.type === 'bar') {
    axes = pick('ch-x', t('chartX'), c.x) + `<span class="ctl-l">${t('chartY')}</span><div class="chips">${r.columns.map((col, i) => numeric[i] && i !== c.x
      ? `<span class="chip ${c.ys.includes(i) ? 'on' : ''}" data-y="${i}">${c.ys.includes(i) ? `<span class="sw" style="background:${CHART_COLORS[c.ys.indexOf(i)]}"></span>` : ''}${esc(col.name)}</span>` : '').join('')}</div>`;
  } else if (c.type === 'pie') {
    axes = pick('ch-x', t('chartLabels'), c.x) + pick('ch-val', t('chartValue'), c.val, true)
      + `<span class="ctl-l">${t('chartSlices')}</span><select class="select sm" id="ch-slices">${Array.from({ length: 15 }, (_, i) => i + 2)
        .map(n => `<option value="${n}" ${n === (c.slices || 6) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  } else if (c.type === 'hist') {
    axes = pick('ch-val', t('chartColumn'), c.val, true) + `<span class="ctl-l">${t('chartBins')}</span><select class="select sm" id="ch-bins">${[0, 10, 20, 30, 50]
      .map(n => `<option value="${n}" ${n === (c.bins || 0) ? 'selected' : ''}>${n || t('chartAuto')}</option>`).join('')}</select>`;
  } else {
    axes = pick('ch-sx', t('chartX'), c.sx, true) + pick('ch-val', t('chartY'), c.val, true);
  }
  ctl.classList.remove('hidden');
  ctl.innerHTML = `<div class="seg" id="ch-type">${['line', 'bar', 'pie', 'hist', 'scatter'].map(k =>
      `<button data-t="${k}" class="${c.type === k ? 'on' : ''}">${t('chart_' + k)}</button>`).join('')}</div>
    ${axes}${r.truncated ? `<span class="stat">${t('chartTruncated', { n: r.rows.length.toLocaleString(LANG) })}</span>` : ''}`;
  const num = v => (v === '' ? null : +v);
  $('#ch-type').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { c.type = b.dataset.t; renderQueryResult(tab); } };
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onchange = e => { fn(num(e.target.value)); renderQueryResult(tab); }; };
  on('ch-x', v => { c.x = v; c.ys = c.ys.filter(y => y !== c.x); });
  on('ch-val', v => { c.val = v; });
  on('ch-sx', v => { c.sx = v; });
  on('ch-bins', v => { c.bins = v; });
  on('ch-slices', v => { c.slices = v; });
  ctl.querySelectorAll('[data-y]').forEach(ch => ch.onclick = () => {
    const i = +ch.dataset.y;
    if (c.ys.includes(i)) c.ys = c.ys.filter(y => y !== i);
    else if (c.ys.length < 4) c.ys.push(i);
    else toast(t('chartMax4'), 'err');
    renderQueryResult(tab);
  });
  box.classList.add('chart-box');
  box.onscroll = null; box._grid = null;
  requestAnimationFrame(() => renderChart(box, r.columns, r.rows, c));
}

let chartResize = 0;
addEventListener('resize', () => {
  clearTimeout(chartResize);
  chartResize = setTimeout(() => { const tab = curTab(); if (tab && tab.type === 'query' && tab.resView === 'chart') renderQueryResult(tab); }, 120);
});

// запросы в тексте: [{s, e}] – от первого до последнего значимого символа, без «;» и комментариев по краям
function sqlStatementRanges(src) {
  const segs = [];
  let pos = 0, cur = { from: 0, s: -1, e: -1 };
  for (const x of sqlTokens(src)) {
    const p = pos; pos += x.v.length;
    if (x.t === 'p' && x.v === ';') { cur.to = pos; segs.push(cur); cur = { from: pos, s: -1, e: -1 }; continue; }
    if (x.t === 'ws' || x.t === 'lcom' || x.t === 'bcom') continue;
    if (cur.s < 0) cur.s = p;
    cur.e = pos;
  }
  cur.to = src.length; segs.push(cur);
  return segs;
}
// запрос под курсором: тот, в котором стоит курсор; на пустом месте между запросами – предыдущий (или следующий)
function statementAt(src, at) {
  const segs = sqlStatementRanges(src), full = segs.filter(x => x.s >= 0);
  if (full.length < 2) return null;
  let i = segs.findIndex(x => at >= x.from && at <= x.to);
  if (i < 0) i = segs.length - 1;
  if (segs[i].s >= 0 && (at >= segs[i].s || i === 0 || segs[i - 1].s < 0)) return segs[i];
  for (let j = i - 1; j >= 0; j--) if (segs[j].s >= 0) return segs[j];
  return full[0];
}

async function runQuery(tab, all) {
  if (tab.running) return;
  const ta = $('#sql');
  let text = tab.sql, offset = 0;
  // подсветка «какой запрос выполняется» – это не выделение человека
  const flash = ta && ta._flash && ta.selectionStart === ta._flash.s && ta.selectionEnd === ta._flash.e;
  if (ta && !all && !flash && ta.selectionStart !== ta.selectionEnd) { text = ta.value.slice(ta.selectionStart, ta.selectionEnd); offset = ta.selectionStart; }
  else if (ta && !all) {
    // несколько запросов и ничего не выделено – выполняется тот, где курсор (как в DataGrip и DBeaver)
    const caret = flash ? ta._flash.caret : ta.selectionStart;
    const st = statementAt(ta.value, caret);
    if (st) {
      text = ta.value.slice(st.s, st.e); offset = st.s;
      ta.setSelectionRange(st.s, st.e);            // коротко показать, какой запрос выполняется
      ta._flash = { s: st.s, e: st.e, caret };
      setTimeout(() => {
        if (ta._flash && ta.selectionStart === st.s && ta.selectionEnd === st.e) ta.setSelectionRange(caret, caret);
        ta._flash = null;
      }, 450);
    }
  }
  if (!text.trim()) return;
  acClose();
  // переменные {{…}}: значения из полей над результатом уходят параметрами, а не вклеиваются в текст
  const bound = bindVars(tab, text);
  if (!bound) return;
  const manual = isManual(tab.conn);
  const target = noWhereTarget(text);
  if (target) {
    if (!await confirmDanger(t('noWhereTitle'), t(manual ? 'noWhereTextManual' : 'noWhereText', { t: target }), t('runAnyway'))) return;
  } else if (!manual && isDangerous(text) && !await confirmDanger(t('confirmQuery'), t('confirmQueryText'), t('runAnyway'))) return;
  tab.running = true; tab.startedAt = performance.now(); tab.lastSql = bound.sql; tab.lastParams = bound.params;
  tab.errLine = null; tab.errLineDirty = true; tab.errMark = null; tab.diag = null;
  renderQueryResult(tab);
  try {
    tab.result = await api('run_query', tab.conn, bound.sql, bound.params, bound.params ? text : null);
    S.tx[tab.conn] = tab.result.tx || 'none';
  } catch (e) {
    tab.result = { error: e.message, raw: e.raw && e.raw !== e.message ? e.raw : null, hint: e.hint };
    if (e.pos && !bound.params) {
      // позиция ошибки → номер строки во всём тексте редактора
      const abs = offset + e.pos - 1;
      tab.errLine = tab.sql.slice(0, abs).split('\n').length;
      tab.result.errLine = tab.errLine;
      tab.errLineDirty = true;
    }
    // где именно ошибка и как исправить
    try {
      if (S.meta[tab.conn] === undefined) await loadMeta(tab.conn);
      tab.diag = await sqlDiagnose(tab, e, offset, !!bound.params);
      tab.errMark = tab.diag.at;
      // весь запрос целиком: исправления по цепочке, пока PostgreSQL не примет запрос (только если выполнялся весь текст)
      if (!offset && !bound.params && tab.diag.fixes.length) {
        const all = await sqFixAll(tab, tab.diag).catch(() => null);
        if (all && all.text !== tab.diag.text) tab.diag.fixAll = { label: all.steps.length > 1 ? t('sqFixAllLabel', { n: all.steps.length }) : tab.diag.fixes[0].label, edits: [sqMinEdit(tab.diag.text, all.text)], steps: all.steps };
      }
      if (tab.diag.at) { tab.errLine = tab.sql.slice(0, tab.diag.at.s).split('\n').length; tab.result.errLine = tab.errLine; tab.errLineDirty = true; }
    } catch (x) { tab.diag = null; console.error(x); }
    if (e.code === 'TX_LOST') toast(t('errTxLost'), 'err');
    await refreshTx(tab.conn);
  }
  tab.running = false;
  if (curTab() === tab) {
    const ta2 = $('#sql');
    if (ta2) ta2.dispatchEvent(new Event('scroll'));
    renderPaneKeepEditor(tab);
  }
  if (/\b(create|drop|alter|rename)\b/i.test(stripSql(text)) && !isManual(tab.conn)) loadTree(tab.conn);
}

// обновить всё, кроме самого текста редактора (чтобы не сбивать курсор)
function renderPaneKeepEditor(tab) {
  renderTxBar(tab);
  renderQueryResult(tab);
  const ta = $('#sql');
  if (ta) {
    tab.errLineDirty = true;
    ta.dispatchEvent(new Event('scroll'));
    const gut = $('#gutn');
    if (gut) {
      const n = ta.value.split('\n').length;
      let h = '';
      for (let i = 1; i <= n; i++) h += `<div class="${tab.errLine === i ? 'err' : ''}">${i}</div>`;
      gut.innerHTML = h;
    }
  }
}

async function showHistory(tab) {
  let items = [];
  try { items = await api('history'); } catch (e) { toast(e.message, 'err'); return; }
  items = items.slice(0, 50);
  const list = () => items.length
    ? `<div class="history-list">${items.map((h, i) => `<div class="history-item" data-h="${i}">${esc(h.sql)}<span class="hist-x" data-hx="${i}" title="${t('histRemove')}">${icon('x', 12)}</span></div>`).join('')}</div>`
    : `<p>${t('noHistory')}</p>`;
  const buttons = [{ label: t('close'), value: null, main: true }];
  if (items.length) buttons.unshift({ label: t('histClear'), value: null, left: true, cls: 'danger-soft', onClick: async () => {
    if (!await confirmDanger(t('histClearQ'), t('histClearText'), t('histClearBtn'))) return false;
    try { await api('history_clear'); toast(t('histCleared')); } catch (e) { toast(e.message, 'err'); return false; }
  } });
  const p = modal({ title: t('history'), tile: 'clock', body: `<div id="hist-body">${list()}</div>`, cls: 'hist-dlg', buttons });
  const ov = document.querySelector('.overlay.hist-dlg');
  const bind = () => $('#hist-body', ov).onclick = async e => {
    const x = e.target.closest('[data-hx]');
    if (x) {   // убрать один запрос из истории
      const h = items[+x.dataset.hx];
      try { await api('history_delete', h.sql); } catch (err) { toast(err.message, 'err'); return; }
      items = items.filter(it => it !== h);
      $('#hist-body', ov).innerHTML = list();
      if (!items.length) { const c = ov.querySelector('.modal-f .danger-soft'); if (c) c.remove(); }
      return;
    }
    const el = e.target.closest('[data-h]');
    if (!el) return;
    tab.sql = items[+el.dataset.h].sql;
    saveDrafts();
    ov.querySelector('.modal-f .btn:last-child').click();
    renderPane();
  };
  bind();
  await p;
}

// ================= выгрузка =================
async function runExport(fn) {
  const wait = document.createElement('div');
  wait.className = 'toast';
  wait.innerHTML = `<span class="spin"></span><span>${esc(t('exporting'))}</span>`;
  $('#toasts').appendChild(wait);
  try {
    const path = await fn();
    if (path) toast(t('exported', { p: path.split('/').pop() }));
  } catch (e) { toast(e.message, 'err'); }
  wait.remove();
}

async function exportQuery(tab, fmt) {
  const r = tab.result;
  if (!r || r.kind !== 'rows') return;
  const name = `query_${tab.n}.${fmt}`;
  if (tab.resView === 'pivot' && tab.pivot && tab.pivot.data) {
    const x = pivotExport(tab);
    return runExport(() => api('export_rows', x.head, x.rows, `pivot_${tab.n}.${fmt}`, fmt, x.types));
  }
  // открыт график – в Excel он ляжет картинкой на отдельный лист
  let chart = null;
  if (fmt === 'xlsx' && tab.resView === 'chart') {
    const png = await chartPng($('#qgrid'));
    if (png) chart = { png: png.data, w: png.w, h: png.h, name: t('viewChart') };
  }
  if (r.truncated && tab.lastSql && isSelect(tab.lastSql)) {
    return runExport(() => api('export_query', tab.conn, tab.lastSql, name, fmt, tab.lastParams || null, chart));
  }
  runExport(() => api('export_rows', r.columns.map(c => c.name), r.rows, name, fmt, r.columns.map(c => c.type), chart));
}

async function exportPng(tab) {
  const png = await chartPng($('#qgrid'));
  if (!png) { toast(t('exportPngFailed'), 'err'); return; }
  runExport(() => api('save_png', png.data, `chart_${tab.n}.png`));
}

function exportTable(tab, fmt) {
  runExport(() => api('export_table', tab.conn, tab.schema, tab.table, tab.orderBy, tab.orderDir, tab.search || null, fmt, tab.filters || []));
}

// ================= автодополнение =================
const AC_WORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'ILIKE', 'BETWEEN',
  'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'UNION', 'UNION ALL', 'EXCEPT', 'INTERSECT', 'INSERT INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE FROM', 'RETURNING', 'CREATE TABLE', 'CREATE VIEW', 'CREATE INDEX', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE',
  'EXISTS', 'OVER', 'PARTITION BY', 'ASC', 'DESC', 'NULLS LAST', 'NULLS FIRST', 'TRUE', 'FALSE', 'NULL', 'INTERVAL', 'FILTER',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'EXPLAIN ANALYZE'];
const AC_FUNCS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'COALESCE', 'NULLIF', 'CAST', 'DATE_TRUNC', 'EXTRACT', 'DATE_PART', 'NOW',
  'CURRENT_DATE', 'AGE', 'TO_CHAR', 'LOWER', 'UPPER', 'LENGTH', 'SUBSTRING', 'TRIM', 'CONCAT', 'STRING_AGG', 'ARRAY_AGG', 'ROW_NUMBER',
  'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'NTILE', 'ABS', 'GREATEST', 'LEAST', 'SPLIT_PART', 'REPLACE'];
const AC = { open: false, items: [], sel: 0, start: 0, end: 0 };

// сниппеты: набери ключ и нажми Tab. Колонки подбираются по самим данным таблицы (column_profile):
// {cat} – категория (мало разных значений: статус, город), {date} – главная дата, {num} – сумма или цена,
// {uniq} – то, что должно быть уникальным (email, телефон), {nullcols} – все колонки таблицы, {cursor} – курсор в конце.
// [ключ, кусок для вставки внутрь запроса, целый запрос для пустого редактора]
const AC_SNIPPETS = [
  ['sel', 'SELECT *\nFROM {table}\nLIMIT 100;'],
  ['top', 'SELECT {cat}, COUNT(*) AS n\nFROM {table}\nGROUP BY 1\nORDER BY n DESC\nLIMIT 10;'],
  ['bymonth', "SELECT DATE_TRUNC('month', {date})::date AS month, COUNT(*) AS n\nFROM {table}\nGROUP BY 1\nORDER BY 1;"],
  ['month', "DATE_TRUNC('month', {date})::date AS month",
    "SELECT DATE_TRUNC('month', {date})::date AS month, COUNT(*) AS n\nFROM {table}\nGROUP BY 1\nORDER BY 1;"],
  ['share', 'ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct',
    'SELECT {cat}, COUNT(*) AS n,\n  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS share_pct\nFROM {table}\nGROUP BY 1\nORDER BY n DESC;'],
  ['running', 'SUM({num}) OVER (ORDER BY {date}) AS running_total',
    "WITH m AS (\n  SELECT DATE_TRUNC('month', {date})::date AS month, SUM({num}) AS total\n  FROM {table}\n  GROUP BY 1\n)\nSELECT month, total,\n  SUM(total) OVER (ORDER BY month) AS running_total\nFROM m\nORDER BY month;"],
  ['prev', 'LAG({num}) OVER (ORDER BY {date}) AS prev_value',
    "WITH m AS (\n  SELECT DATE_TRUNC('month', {date})::date AS month, SUM({num}) AS total\n  FROM {table}\n  GROUP BY 1\n)\nSELECT month, total,\n  LAG(total) OVER (ORDER BY month) AS prev_total,\n  ROUND(100.0 * (total - LAG(total) OVER (ORDER BY month)) / NULLIF(LAG(total) OVER (ORDER BY month), 0), 1) AS change_pct\nFROM m\nORDER BY month;"],
  ['rank', 'ROW_NUMBER() OVER (PARTITION BY {cat} ORDER BY {num} DESC) AS rn',
    'SELECT *\nFROM (\n  SELECT *, ROW_NUMBER() OVER (PARTITION BY {cat} ORDER BY {num} DESC) AS rn\n  FROM {table}\n) t\nWHERE rn <= 3\nORDER BY {cat}, rn;'],
  ['dup', 'SELECT {uniq}, COUNT(*) AS n\nFROM {table}\nGROUP BY 1\nHAVING COUNT(*) > 1\nORDER BY n DESC;'],
  ['nulls', 'SELECT COUNT(*) AS total_rows,\n  {nullcols}\nFROM {table};'],
  ['cte', 'WITH t AS (\n  SELECT *\n  FROM {table}\n)\nSELECT *\nFROM t{cursor}\nLIMIT 100;'],
  ['casewhen', "CASE WHEN {num} > 0 THEN 'да' ELSE 'нет' END AS flag",
    "SELECT *,\n  CASE WHEN {num} >= (SELECT AVG({num}) FROM {table}) THEN 'выше среднего' ELSE 'ниже среднего' END AS grp\nFROM {table}\nLIMIT 100;"],
];
// как поле выглядит, пока не заполнено (не служебные слова SQL – чтобы ошибка была понятной)
const SNIP_PH = { table: 'table_name', cat: 'category_col', date: 'date_col', num: 'number_col', uniq: 'unique_col', nullcols: 'columns' };
// заполнение: где в тексте каждое поле (одно поле может встречаться несколько раз), какое выбираем сейчас
const SNIP = { on: false, occ: [], keys: [], i: 0, table: null, prof: null, tab: null };

// курсор внутри кавычек после «колонка =», «колонка LIKE» или «колонка IN (…» – подсказываем значения колонки
function acValueContext(text, pos, meta) {
  const before = text.slice(0, pos);
  if (!((before.match(/'/g) || []).length % 2)) return null;
  const q = before.lastIndexOf("'"), head = stripSql(before.slice(0, q));
  const id = '((?:"[^"]+"|[A-Za-z_][\\w$]*)(?:\\.(?:"[^"]+"|[A-Za-z_][\\w$]*))?)';
  const m = new RegExp(id + '\\s*(?:=|<>|!=|\\s(?:not\\s+)?i?like)\\s*$', 'i').exec(head)
    || new RegExp(id + '\\s+(?:not\\s+)?in\\s*\\((?:[^()]*,)?\\s*$', 'i').exec(head);
  if (!m) return null;
  const parts = m[1].split('.').map(unquote), col = parts.pop(), refs = tableRefs(text, meta);
  let tbl = parts.length ? refs[parts[0]] : null;
  if (!tbl) tbl = Object.values(refs).find(x => x.cols.some(c => c.name.toLowerCase() === col.toLowerCase()));
  if (!tbl || tbl.view) return null;
  const c = tbl.cols.find(x => x.name.toLowerCase() === col.toLowerCase());
  return c ? { schema: tbl.schema, table: tbl.name, col: c.name, prefix: before.slice(q + 1).replace(/''/g, "'"), start: q + 1, end: pos } : null;
}

const acValCache = new Map();
let acValTimer = 0;
function acValues(tab, ta, ctx) {
  clearTimeout(acValTimer);
  acValTimer = setTimeout(async () => {
    const key = [tab.conn, ctx.schema, ctx.table, ctx.col, ctx.prefix].join('\u0001');
    let list = acValCache.get(key);
    if (!list) {
      try { list = await api('column_values', tab.conn, ctx.schema, ctx.table, ctx.col, ctx.prefix); } catch (e) { return; }
      acValCache.set(key, list);
      if (acValCache.size > 200) acValCache.delete(acValCache.keys().next().value);
    }
    if ($('#sql') !== ta || ta.selectionStart !== ctx.end) return;      // пока ждали, курсор ушёл
    if (!list.length) { acClose(); return; }
    const closed = ta.value[ctx.end] === "'";
    Object.assign(AC, { open: true, sel: 0, start: ctx.start, end: ctx.end, items: list.map(x => ({
      label: x.v, insert: x.v.replace(/'/g, "''") + (closed ? '' : "'"), kind: 'val', hint: `${ctx.col} · ${x.n}`, score: 0 })) });
    acRender(ta);
  }, 120);
}

async function loadMeta(id) {
  try {
    const list = await api('completion_meta', id);
    S.meta[id] = list.map(x => ({ ...x, cols: x.cols.map((n, i) => ({ name: n, type: x.types[i] })) }));
    const schemas = [...new Set(S.meta[id].filter(x => !x.view).map(x => x.schema))];
    Promise.all(schemas.map(sc => sqFks(id, sc).then(f => f.map(x => ({ ...x, schema: sc })))))
      .then(all => { AC_FKS[id] = all.flat(); }).catch(() => {});
  } catch (e) { S.meta[id] = null; }
  // «Сохранённые таблицы» без привязки к базе показываются по списку таблиц – он только что обновился
  if (id === S.active && S.saved.some(q => !q.db)) renderSidebar();
}

const quoteId = n => /^[a-z_][a-z0-9_$]*$/.test(n) && !KW.has(n) ? n : `"${n.replace(/"/g, '""')}"`;
const unquote = n => n.startsWith('"') ? n.slice(1, -1).replace(/""/g, '"') : n.toLowerCase();

function findTable(meta, ref) {
  const parts = ref.split('.').map(unquote);
  const [schema, name] = parts.length > 1 ? parts : [null, parts[0]];
  return meta.find(x => x.name.toLowerCase() === name.toLowerCase() && (!schema || x.schema.toLowerCase() === schema.toLowerCase())
    && (schema || x.schema === 'public')) || meta.find(x => x.name.toLowerCase() === name.toLowerCase());
}

// таблицы, упомянутые в запросе, и их псевдонимы: FROM orders o JOIN customers AS c
function tableRefs(text, meta) {
  const refs = {};
  const re = /\b(?:from|join|update|into)\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)(?:\s+(?:as\s+)?(?!(?:where|join|left|right|inner|full|cross|on|group|order|limit|having|union|set|values|natural|using|offset|returning)\b)([A-Za-z_][\w$]*))?/gi;
  let m;
  const clean = stripSql(text);
  while ((m = re.exec(clean))) {
    const tbl = findTable(meta, m[1]);
    if (!tbl) continue;
    refs[unquote(m[1].split('.').pop())] = tbl;
    if (m[2]) refs[m[2].toLowerCase()] = tbl;
  }
  return refs;
}

// ---------- автодополнение JOIN по связям базы ----------
const AC_FKS = {};          // id подключения → внешние ключи [{schema, src, ref, columns, ref_columns}]
// таблицы запроса с их псевдонимами по порядку: [{tbl, alias}]
function joinRefs(text, meta) {
  const out = [];
  const re = /\b(?:from|join)\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)(?:\s+(?:as\s+)?(?!(?:where|join|left|right|inner|full|cross|on|group|order|limit|having|union|natural|using|offset|lateral)\b)([A-Za-z_][\w$]*))?/gi;
  let m;
  while ((m = re.exec(stripSql(text)))) {
    const tbl = findTable(meta, m[1]);
    if (tbl) out.push({ tbl, alias: m[2] || null, name: m[1] });
  }
  return out;
}
// условие ON между двумя таблицами по внешнему ключу (в любую сторону), с их псевдонимами
function joinOn(fks, a, aName, b, bName) {
  const f1 = fks.find(f => f.schema === a.schema && f.src === a.name && f.ref === b.name);
  const f2 = !f1 && fks.find(f => f.schema === a.schema && f.src === b.name && f.ref === a.name);
  if (f1) return f1.columns.map((c, k) => `${aName}.${quoteId(c)} = ${bName}.${quoteId(f1.ref_columns[k])}`).join(' AND ');
  if (f2) return f2.columns.map((c, k) => `${bName}.${quoteId(c)} = ${aName}.${quoteId(f2.ref_columns[k])}`).join(' AND ');
  return null;
}
// короткий псевдоним: первые буквы слов имени (order_items → oi), без повторов
function joinAlias(name, used) {
  const base = name.toLowerCase().split(/_+/).filter(Boolean).map(w => w[0]).join('') || 't';
  let a = KW.has(base) ? base + '1' : base, n = 2;
  while (used.has(a)) a = base + n++;
  return a;
}
function joinItems(stmt, before, meta, conn) {
  const fks = AC_FKS[conn];
  if (!fks || !fks.length) return null;
  const refs = joinRefs(stmt, meta);
  // 1) «JOIN таблица [псевдоним] |» → готовое «ON …»
  const m1 = /\bjoin\s+((?:"[^"]+"|[A-Za-z_][\w$]*)(?:\.(?:"[^"]+"|[A-Za-z_][\w$]*))?)(?:\s+(?:as\s+)?([A-Za-z_][\w$]*))?\s+(o|on)?$/i.exec(before);
  if (m1 && !(m1[2] && /^(on|o)$/i.test(m1[2]))) {
    const tbl = findTable(meta, m1[1]);
    if (!tbl) return null;
    const me = m1[2] || unquote(m1[1].split('.').pop());
    const items = [];
    refs.forEach(r => {
      if (r.tbl === tbl) return;
      const on = joinOn(fks, tbl, me, r.tbl, r.alias || r.name);
      if (on) items.push({ label: `ON ${on}`, insert: `ON ${on}`, kind: 'join', hint: t('acJoinOn', { t: r.tbl.name }), pri: -1 });
    });
    return items.length ? { items, word: m1[3] || '' } : null;
  }
  // 2) «JOIN |» → связанные таблицы сразу с псевдонимом и условием
  const m2 = /\bjoin\s+([A-Za-z_][\w$]*)?$/i.exec(before);
  if (m2 && refs.length) {
    const used = new Set(refs.map(r => (r.alias || unquote(r.name.split('.').pop())).toLowerCase()));
    const items = [];
    meta.filter(x => !x.view).forEach(x => {
      for (const r of refs) {
        if (r.tbl === x) continue;
        const al = joinAlias(x.name, used);
        const on = joinOn(fks, x, al, r.tbl, r.alias || r.name);
        if (!on) continue;
        const nm = x.schema === 'public' ? quoteId(x.name) : `${quoteId(x.schema)}.${quoteId(x.name)}`;
        items.push({ label: `${x.name} ${al} ON ${on}`, insert: `${nm} ${al} ON ${on}`, kind: 'join', hint: t('acJoinLink', { t: r.tbl.name }), pri: -1 });
        break;
      }
    });
    return items.length ? { items, word: m2[1] || '' } : null;
  }
  return null;
}

function acSuggest(text, pos, meta, force, conn) {
  const before = text.slice(0, pos);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (/--/.test(line) || ((before.match(/'/g) || []).length % 2)) return null;
  const refs = tableRefs(text, meta);
  const items = [];
  let word, start;
  // JOIN: связанные таблицы и готовое условие ON – первыми в списке. Только если перед курсором правда «JOIN …»;
  // границы запроса – по ближайшим «;» (без разбора всего текста на каждое нажатие – на длинных скриптах это тормозило)
  if (conn && /\bjoin\s+(?:[\w$."]+(?:\s+(?:as\s+)?[\w$]+)?\s+)?[\w$]*$/i.test(before.slice(-200))) {
    const stStart = text.lastIndexOf(';', pos - 1) + 1;
    const stEnd = text.indexOf(';', pos);
    const j = joinItems(text.slice(stStart, stEnd < 0 ? text.length : stEnd), text.slice(stStart, pos), meta, conn);
    if (j) {
      const w = j.word.toLowerCase();
      const its = j.items.filter(it => !w || it.label.toLowerCase().startsWith(w));
      if (its.length) {
        // после «JOIN » дальше идут и обычные таблицы
        if (/^ON /.test(its[0].label)) return { items: its.slice(0, 20), start: pos - j.word.length, end: pos };
        word = j.word; start = pos - word.length;
        its.forEach(it => items.push(it));
      }
    }
  }

  const dot = /((?:"[^"]+"|[A-Za-z_][\w$]*))\.([A-Za-z_][\w$]*)?$/.exec(before);
  if (dot) {
    word = dot[2] || ''; start = pos - word.length;
    const q = unquote(dot[1]);
    const tbl = refs[q] || findTable(meta, dot[1]);
    if (tbl) tbl.cols.forEach(c => items.push({ label: c.name, insert: quoteId(c.name), kind: 'col', hint: shortType(c.type), pri: 0 }));
    meta.filter(x => x.schema.toLowerCase() === q).forEach(x =>
      items.push({ label: x.name, insert: quoteId(x.name), kind: x.view ? 'view' : 'table', hint: t(x.view ? 'acView' : 'acTable'), pri: 0 }));
  } else {
    const m = /[A-Za-z_][\w$]*$/.exec(before);
    word = m ? m[0] : ''; start = pos - word.length;
    if (!word && !force && !items.length) return null;
    const prev = /([A-Za-z_]+)[\s(]*$/.exec(before.slice(0, start));
    const kw = prev ? prev[1].toLowerCase() : '';
    const tableCtx = ['from', 'join', 'into', 'update', 'table', 'truncate'].includes(kw);
    const addTables = pri => meta.forEach(x => items.push({
      label: x.schema === 'public' ? x.name : `${x.schema}.${x.name}`,
      insert: x.schema === 'public' ? quoteId(x.name) : `${quoteId(x.schema)}.${quoteId(x.name)}`,
      kind: x.view ? 'view' : 'table', hint: t(x.view ? 'acView' : 'acTable'), pri }));
    if (tableCtx) addTables(0);
    else {
      const seen = new Set();
      Object.values(refs).forEach(tbl => {
        if (seen.has(tbl)) return; seen.add(tbl);
        tbl.cols.forEach(c => items.push({ label: c.name, insert: quoteId(c.name), kind: 'col', hint: `${tbl.name} · ${shortType(c.type)}`, pri: 0 }));
      });
      const lower = word && word === word.toLowerCase();
      AC_WORDS.forEach(k => items.push({ label: k, insert: lower ? k.toLowerCase() : k, kind: 'kw', hint: t('acKeyword'), pri: 1 }));
      AC_FUNCS.forEach(k => items.push({ label: k, insert: (lower ? k.toLowerCase() : k) + '(', kind: 'fn', hint: t('acFunc'), pri: 1 }));
      if (word.length >= 2 || force) AC_SNIPPETS.forEach(([k, body, full]) => items.push({ label: k, insert: body, full, kind: 'snip', hint: t('snip_' + k), pri: 0 }));
      addTables(2);
      // колонки всех таблиц – только подходящие по набранному, а не все подряд на каждую букву
      const lw = word.toLowerCase();
      if (!seen.size && lw) meta.forEach(x => x.cols.forEach(c => { if (c.name.toLowerCase().includes(lw)) items.push({ label: c.name, insert: quoteId(c.name), kind: 'col', hint: `${x.name} · ${shortType(c.type)}`, pri: 3 }); }));
    }
  }
  const w = word.toLowerCase();
  const seenLabel = new Set();
  const out = [];
  items.forEach(it => {
    const l = it.label.toLowerCase();
    const short = l.includes('.') ? l.split('.').pop() : l;
    let score;
    if (!w) score = 0;
    else if (l.startsWith(w) || short.startsWith(w)) score = l === w ? -1 : 0;
    else if (w.length >= 2 && l.includes(w)) score = 1;
    else return;
    const key = it.kind + '|' + it.label;
    if (seenLabel.has(key)) return;
    seenLabel.add(key);
    out.push({ ...it, score });
  });
  if (out.length === 1 && out[0].score === -1 && !dot && out[0].kind !== 'snip') return null;   // слово уже набрано полностью
  out.sort((a, b) => a.score - b.score || a.pri - b.pri || a.label.length - b.label.length || a.label.localeCompare(b.label));
  return { items: out.slice(0, 60), start, end: pos };
}

function caretXY(ta, pos) {
  const m = document.createElement('div');
  const cs = getComputedStyle(ta);
  ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight', 'tabSize']
    .forEach(p => { m.style[p] = cs[p]; });
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre',
    width: ta.clientWidth + 'px', top: '0', left: '0', boxSizing: 'border-box' });
  m.textContent = ta.value.slice(0, pos);
  const sp = document.createElement('span');
  sp.textContent = '​';
  m.appendChild(sp);
  ta.parentElement.appendChild(m);
  const res = { x: sp.offsetLeft - ta.scrollLeft + ta.offsetLeft, y: sp.offsetTop - ta.scrollTop, lh: parseFloat(cs.lineHeight) || 21 };
  m.remove();
  return res;
}

function acUpdate(tab, ta, force) {
  const meta = S.meta[tab.conn];
  if (!meta) { if (S.meta[tab.conn] === undefined) loadMeta(tab.conn); acClose(); return; }
  if (ta.selectionStart !== ta.selectionEnd) { acClose(); return; }
  const vctx = acValueContext(ta.value, ta.selectionStart, meta);
  if (vctx) { acValues(tab, ta, vctx); return; }
  const res = acSuggest(ta.value, ta.selectionStart, meta, force, tab.conn);
  if (!res || !res.items.length) { acClose(); return; }
  Object.assign(AC, res, { open: true, sel: 0 });
  acRender(ta);
}

function acRender(ta) {
  const box = $('#ac');
  if (!box) return;
  const kinds = { table: 'table', view: 'view', col: 'columns', kw: 'code', fn: 'sql', snip: 'star', val: 'funnel', join: 'link' };
  box.innerHTML = AC.items.map((it, i) => `<div class="ac-it ${i === AC.sel ? 'on' : ''}" data-i="${i}">
      <span class="ac-k ac-${it.kind}">${icon(kinds[it.kind], 13)}</span><span class="nm">${esc(it.label)}</span><span class="ac-t">${esc(it.hint || '')}</span></div>`).join('');
  box.classList.remove('hidden');
  const ed = $('#editor'), pane = $('#pane');
  const c = caretXY(ta, AC.start);
  const edTop = ed.offsetTop, maxH = 236;
  let top = edTop + c.y + c.lh + 4;
  if (c.y + c.lh + maxH > ed.clientHeight + 160) top = Math.max(4, edTop + c.y - Math.min(maxH, box.offsetHeight) - 4);
  box.style.left = Math.max(8, Math.min(ed.offsetLeft + c.x + 8, pane.clientWidth - box.offsetWidth - 8)) + 'px';
  box.style.top = top + 'px';
  box.onmousedown = e => {
    const it = e.target.closest('.ac-it');
    if (!it) return;
    e.preventDefault();
    AC.sel = +it.dataset.i;
    acAccept(ta);
  };
  const on = $('.ac-it.on', box);
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function acClose() {
  AC.open = false;
  const box = $('#ac');
  if (box) box.classList.add('hidden');
}

function acAccept(ta) {
  const it = AC.items[AC.sel];
  if (!it) return;
  if (it.kind === 'snip') {
    const alone = !(ta.value.slice(0, AC.start) + ta.value.slice(AC.end)).trim();
    acClose(); snipInsert(ta, alone && it.full ? it.full : it.insert); return;
  }
  if (it.field) { snipFill(ta, it); return; }
  ta.setRangeText(it.insert, AC.start, AC.end, 'end');
  acClose();
  ta._acSkip = true;
  ta.dispatchEvent(new Event('input'));
}

// ================= сниппеты с полями =================
// таблица, с которой работает запрос: открыт из таблицы («Запрос к таблице») или уже есть в тексте после FROM
function snipContextTable(tab, text) {
  const meta = S.meta[tab.conn] || [];
  const refs = Object.values(tableRefs(text, meta));
  if (refs.length) return refs[0];
  if (tab.ctxTable) return meta.find(x => x.schema === tab.ctxTable.schema && x.name === tab.ctxTable.table) || null;
  return null;
}
const tableSql = x => (x.schema === 'public' ? quoteId(x.name) : `${quoteId(x.schema)}.${quoteId(x.name)}`);

// профиль таблицы (сколько разных значений в колонках) – один раз на таблицу
const snipProfiles = new Map();
async function snipProfile(tab, tbl) {
  const key = `${tab.conn}|${tbl.schema}.${tbl.name}`;
  if (!snipProfiles.has(key)) {
    try { snipProfiles.set(key, await api('column_profile', tab.conn, tbl.schema, tbl.name)); }
    catch (e) { return null; }
  }
  return snipProfiles.get(key);
}

// насколько колонка подходит для роли: больше – лучше, меньше нуля – не подходит
const SN_NUM = /^(smallint|integer|bigint|numeric|decimal|real|double|money)/i, SN_DATE = /^(date|timestamp)/i;
const SN_TEXT = /^(text|character|varchar|boolean|citext)/i;
function snipScore(kind, c, rows) {
  const name = c.name.toLowerCase(), key = c.pk || c.fk || /(^|_)id$/.test(name);
  const d = c.distinct, filled = c.filled || 0, ratio = filled ? d / filled : 1;
  if (kind === 'date') {
    if (!SN_DATE.test(c.type)) return -1;
    return 5 + (/(created|order|paid|registered|date$|_at$|time)/.test(name) ? 3 : 0) - (/birth/.test(name) ? 4 : 0) + (filled === rows ? 1 : 0);
  }
  if (kind === 'num') {
    if (!SN_NUM.test(c.type) || key) return -1;
    if (/^(smallint|integer)/i.test(c.type) && d != null && d <= 3) return -1;   // 1–3 значения – это код или признак, а не величина
    if (/(attempt|number|num$|code|year|semester)/.test(name)) return -1;
    return 5 + (/(amount|total|price|cost|salary|sum|revenue|qty|quantity|value|balance|scholarship|stock|paid|budget)/.test(name) ? 3 : 0)
      + (/^(numeric|decimal|real|double|money)/i.test(c.type) ? 1 : 0) - (/(year|age|rating|grade|semester|level)/.test(name) ? 2 : 0);
  }
  if (kind === 'cat') {
    if (key || d == null || d < 2) return -1;
    if (!SN_TEXT.test(c.type) && !/^(smallint|integer)/i.test(c.type)) return -1;   // даты и дробные числа – не категории
    let s = d <= 30 ? 6 : ratio <= 0.2 ? 3 : ratio <= 0.5 ? 0 : -1;
    if (s < 0) return -1;
    if (/(status|type|city|category|position|gender|level|method|state|kind|group|role|country|region|segment|department|faculty|brand|channel|source|control|funding|delivery)/.test(name)) s += 3;
    if (/(name|email|phone|title|description|body|comment|address|note|text)/.test(name)) s -= 4;
    if (/^(smallint|integer)/i.test(c.type)) s -= 2;
    if (d === 2) s -= 3;                         // да/нет и пол – слишком бедно для «топа», если есть что-то содержательнее
    else if (d >= 3 && d <= 30) s += 2;
    return s;
  }
  if (kind === 'uniq') {
    if (key || !SN_TEXT.test(c.type)) return -1;
    return (/(email|phone|sku|code|login|passport|inn|snils|number|title|full_name|name)/.test(name) ? 6 : 0) + (ratio > 0.8 ? 3 : ratio > 0.5 ? 1 : -2);
  }
  return 0;
}

// варианты для поля: подходящие колонки первыми (лучшая – самой первой), потом остальные
function snipCandidates(kind) {
  const meta = S.meta[SNIP.tab.conn] || [];
  if (kind === 'table') return meta.map(x => ({ label: x.schema === 'public' ? x.name : `${x.schema}.${x.name}`, insert: tableSql(x),
    kind: x.view ? 'view' : 'table', hint: t(x.view ? 'acView' : 'acTable'), field: true, ref: x }));
  if (SNIP.prof) {
    const rows = SNIP.prof.rows;
    return SNIP.prof.cols.map(c => ({ label: c.name, insert: quoteId(c.name), kind: 'col', field: true, score: snipScore(kind, c, rows),
      hint: `${shortType(c.type)}${c.distinct != null ? ' · ' + t('snipDistinct', { n: c.distinct }) : ''}${snipScore(kind, c, rows) < 0 ? ' · ' + t('snipNotFit') : ''}` }))
      .sort((a, b) => (b.score >= 0) - (a.score >= 0) || b.score - a.score).map(x => ({ ...x, fit: x.score >= 0, score: undefined }));
  }
  // таблица неизвестна – колонки всех таблиц
  const out = [];
  meta.filter(x => !x.view).forEach(x => x.cols.forEach(c => out.push({ label: c.name, insert: quoteId(c.name), kind: 'col', field: true, hint: `${x.name} · ${shortType(c.type)}` })));
  return out;
}

// заменить все места поля key на text, сдвинув остальные поля
function snipSet(ta, key, text) {
  const list = SNIP.occ.filter(o => o.key === key).sort((a, b) => b.start - a.start);
  list.forEach(o => {
    ta.setRangeText(text, o.start, o.start + o.len, 'end');
    const d = text.length - o.len;
    SNIP.occ.forEach(x => { if (x !== o && x.start > o.start) x.start += d; });
    o.len = text.length;
  });
}

function snipInsert(ta, body) {
  const tab = curTab(), start = AC.start;
  const ind = (ta.value.slice(0, start).split('\n').pop().match(/^\s*/) || [''])[0];
  const known = snipContextTable(tab, ta.value.slice(0, start) + ta.value.slice(AC.end));
  let out = '';
  const occ = [];
  body.replace(/\n/g, '\n' + ind).split(/(\{\w+\})/).forEach(part => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) { out += part; return; }
    if (m[1] === 'cursor') { occ.push({ key: 'cursor', start: start + out.length, len: 0 }); return; }
    if (m[1] === 'table' && known) { out += tableSql(known); return; }
    occ.push({ key: m[1], start: start + out.length, len: SNIP_PH[m[1]].length });
    out += SNIP_PH[m[1]];
  });
  if (!occ.some(o => o.key === 'cursor')) occ.push({ key: 'cursor', start: start + out.length, len: 0 });
  ta.setRangeText(out, start, AC.end, 'end');
  // порядок выбора: сначала таблица, потом поля в порядке появления; {nullcols} заполняется сам
  const keys = [];
  occ.forEach(o => { if (!keys.includes(o.key) && o.key !== 'cursor' && o.key !== 'nullcols') keys.push(o.key); });
  keys.sort((a, b) => (b === 'table') - (a === 'table'));
  Object.assign(SNIP, { on: true, occ, keys, i: 0, table: known, prof: null, tab, ind });
  snipChanged(ta);
  if (keys[0] === 'table') snipFocus(ta);
  else snipTableReady(ta);
}

// таблица известна – смотрим её данные и сразу подставляем лучшие колонки во все поля
async function snipTableReady(ta) {
  const tbl = SNIP.table;
  SNIP.prof = tbl ? await snipProfile(SNIP.tab, tbl) : null;
  if (!SNIP.on) return;
  const missing = [];
  SNIP.keys.forEach(k => {
    if (k === 'table') return;
    const best = snipCandidates(k)[0];
    if (best && (best.fit || !SNIP.prof)) snipSet(ta, k, best.insert);
    else missing.push(k);
  });
  if (SNIP.occ.some(o => o.key === 'nullcols') && SNIP.prof) {
    const used = new Set();
    const lines = SNIP.prof.cols.map(c => {
      let alias = (c.name.replace(/[^\w]/g, '_') + '_empty').toLowerCase();
      while (used.has(alias)) alias += '_';
      used.add(alias);
      return `COUNT(*) - COUNT(${quoteId(c.name)}) AS ${alias}`;
    });
    snipSet(ta, 'nullcols', lines.join(',\n  ' + SNIP.ind));
  }
  // нет числовой колонки – «сумму» заменяем количеством строк: нарастающий итог и сравнение с прошлым месяцем всё равно имеют смысл
  if (missing.includes('num')) {
    const sums = SNIP.occ.filter(o => o.key === 'num' && ta.value.slice(o.start - 4, o.start).toUpperCase() === 'SUM(' && ta.value[o.start + o.len] === ')');
    if (sums.length && sums.length === SNIP.occ.filter(o => o.key === 'num').length) {
      sums.sort((a, b) => b.start - a.start).forEach(o => {
        const from = o.start - 4, to = o.start + o.len + 1, d = 'COUNT(*)'.length - (to - from);
        ta.setRangeText('COUNT(*)', from, to, 'end');
        SNIP.occ.forEach(x => { if (x !== o && x.start > from) x.start += d; });
      });
      SNIP.occ = SNIP.occ.filter(o => o.key !== 'num');
      SNIP.keys = SNIP.keys.filter(k => k !== 'num');
      missing.splice(missing.indexOf('num'), 1);
    }
  }
  if (missing.length && tbl) toast(t('snipNoCol', { t: tbl.name, k: missing.map(k => t('snipKind_' + k)).join(', ') }), 'err');
  snipChanged(ta);
  // дальше можно поменять подставленное: поле выделено, список открыт, Enter – оставить как есть
  SNIP.keys = SNIP.keys.filter(k => k !== 'table');
  SNIP.i = 0;
  if (SNIP.keys.length) snipFocus(ta); else snipFinish(ta);
}

function snipChanged(ta) {
  SNIP.tab.sql = ta.value;
  ta._acSkip = true;
  ta.dispatchEvent(new Event('input'));
}

// выделить текущее поле и показать варианты
function snipFocus(ta) {
  const o = SNIP.occ.find(x => x.key === SNIP.keys[SNIP.i]);
  if (!o) { snipNext(ta); return; }
  ta.focus();
  ta.setSelectionRange(o.start, o.start + o.len);
  snipSuggest(ta, '');
}

function snipSuggest(ta, typed) {
  const key = SNIP.keys[SNIP.i], o = SNIP.occ.find(x => x.key === key), w = typed.toLowerCase();
  const items = snipCandidates(key).filter(x => !w || x.label.toLowerCase().includes(w)).slice(0, 80);
  if (!items.length || !o) { acClose(); return; }
  Object.assign(AC, { open: true, sel: 0, start: o.start, end: o.start + o.len, items });
  acRender(ta);
}

// выбрали вариант – подставляем во все места поля и идём дальше
function snipFill(ta, it) {
  const key = SNIP.keys[SNIP.i];
  acClose();
  snipSet(ta, key, it.insert);
  snipChanged(ta);
  if (key === 'table') { SNIP.table = it.ref; snipTableReady(ta); return; }
  snipNext(ta);
}

function snipNext(ta) {
  SNIP.i++;
  if (SNIP.i < SNIP.keys.length) snipFocus(ta); else snipFinish(ta);
}

function snipFinish(ta) {
  SNIP.on = false;
  acClose();
  const c = SNIP.occ.find(o => o.key === 'cursor');
  if (c) ta.setSelectionRange(c.start, c.start);
}

// набор текста внутри поля: поле растёт, список фильтруется; курсор ушёл из поля – заполнение закончено
function snipOnInput(ta) {
  if (!SNIP.on || curTab() !== SNIP.tab) { SNIP.on = false; return false; }
  const o = SNIP.occ.find(x => x.key === SNIP.keys[SNIP.i]), pos = ta.selectionStart;
  if (!o || pos < o.start || ta.selectionStart !== ta.selectionEnd) { SNIP.on = false; return false; }
  const newLen = pos - o.start;
  if (newLen > 60 || /[\s,()]/.test(ta.value.slice(o.start, pos))) { SNIP.on = false; return false; }
  const d = newLen - o.len;
  SNIP.occ.forEach(x => { if (x !== o && x.start > o.start) x.start += d; });
  o.len = newLen;
  snipSuggest(ta, ta.value.slice(o.start, pos));
  return true;
}

function acKey(e, tab, ta) {
  // Tab без списка внутри поля сниппета – оставить как есть и перейти к следующему полю
  if (!AC.open && SNIP.on && e.key === 'Tab') { e.preventDefault(); snipNext(ta); return true; }
  if (e.key === 'Escape' && SNIP.on) { SNIP.on = false; }
  if (!AC.open) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    AC.sel = (AC.sel + (e.key === 'ArrowDown' ? 1 : -1) + AC.items.length) % AC.items.length;
    acRender(ta);
    return true;
  }
  if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
    // слово уже набрано целиком – Enter просто переносит строку
    if (e.key === 'Enter' && AC.items[AC.sel] && AC.items[AC.sel].score === -1) { acClose(); return false; }
    e.preventDefault();
    acAccept(ta);
    return true;
  }
  if (e.key === 'Escape') { e.preventDefault(); acClose(); return true; }
  return false;
}

