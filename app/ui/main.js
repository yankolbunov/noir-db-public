// Новая база, импорт, закрытие, настройки, запуск.
// ================= новая база и импорт =================
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' ' + t('mb') : Math.max(1, Math.round(b / 1024)) + ' ' + t('kb');

function pickSqlFile() {
  if (NATIVE) return api('pick_sql_file').catch(e => { toast(e.message, 'err'); return null; });
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.sql,text/plain';
    inp.onchange = () => {
      const file = inp.files[0];
      if (!file) return resolve(null);
      file.text().then(text => resolve({ name: file.name, size: file.size, text, path: null }));
    };
    inp.click();
  });
}

async function createDatabase() {
  const id = S.active;
  let created = null;
  const body = `<div class="field"><label>${t('dbName')}</label><input class="input" id="f-dbname" placeholder="shop" spellcheck="false" autocomplete="off"></div>
    <div class="hint" id="f-dbhint">${t('dbNameHint')}</div>`;
  await modal({
    title: t('newDatabase'), body,
    buttons: [
      { label: t('cancel'), value: null },
      { label: t('create'), cls: 'primary', main: true, onClick: async ov => {
        const v = $('#f-dbname', ov).value.trim();
        const hint = $('#f-dbhint', ov);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) { hint.className = 'hint err'; hint.textContent = t('dbNameHint'); return false; }
        try { await api('create_database', id, v); created = v; }
        catch (e) { hint.className = 'hint err'; hint.textContent = e.message; return false; }
      } },
    ],
  });
  if (created) { toast(t('dbCreated', { t: created })); await switchDb(created); }
}

async function dropDatabase() {
  const id = S.active, name = S.info[id] && S.info[id].db;
  if (!name) return;
  if (!await confirmDanger(t('confirmDropDb', { t: name }), t('confirmDropDbText'), t('deleteBtn'), name)) return;
  if (!await confirmLeaveConn(id)) return;
  try {
    S.info[id] = await api('drop_database', id, name);
    S.tabs = S.tabs.filter(x => !(x.conn === id && ['table', 'search', 'diagram', 'design'].includes(x.type)));
    if (!S.tabs.find(x => x.id === S.tab)) S.tab = S.tabs.length ? S.tabs[S.tabs.length - 1].id : null;
    S.schemas[id] = []; delete S.meta[id];
    S.conns = await api('list_connections');
    toast(t('dbDropped', { t: name }));
    await loadTree(id);
  } catch (e) { toast(e.message, 'err'); await loadTree(id); }
  renderAll();
}

async function importSql() {
  const id = S.active;
  if (!id || !S.info[id]) { toast(t('notConnected'), 'err'); return; }
  const f = await pickSqlFile();
  if (!f) return;
  const ok = await modal({
    title: t('importTitle', { t: f.name }), tile: 'upload',
    body: `<p>${esc(t('importText', { s: fmtSize(f.size), db: S.info[id].db }))}</p>`,
    buttons: [{ label: t('cancel'), value: false }, { label: t('importRun'), cls: 'primary', main: true, value: true }],
  });
  if (!ok) return;
  const wait = document.createElement('div');
  wait.className = 'overlay';
  wait.innerHTML = `<div class="toast" style="pointer-events:auto"><span class="spin"></span><span>${esc(t('importing', { t: f.name }))}</span></div>`;
  document.body.appendChild(wait);
  try {
    if (f.path) await api('import_sql_path', id, f.path); else await api('run_script', id, f.text);
    toast(t('imported', { t: f.name }));
    await loadTree(id);
    renderPane();
  } catch (e) { toast(e.message, 'err'); }
  wait.remove();
}

// ================= закрытие приложения =================
window.askClose = async () => {
  if (document.querySelector('.overlay.close-dlg')) return;
  api('close_dialog_shown').catch(() => {});
  // что не сохранено: правки таблиц и транзакции редактора
  await Promise.all(Object.keys(S.info).map(id => refreshTx(id)));
  const changes = S.tabs.reduce((n, x) => n + (x.type === 'table' || x.type === 'design' ? pendingCount(x) : 0), 0);
  const txOpen = Object.keys(S.info).filter(id => S.tx[id] === 'open').length;
  const dbUnsaved = changes > 0 || txOpen > 0;
  const drafts = S.tabs.filter(x => x.type === 'query' && x.sql.trim()).length;
  const running = S.tabs.some(x => x.running);
  const body = `${dbUnsaved ? `<p class="warn">${icon('alert', 14)}<span>${esc(t('closeUnsavedDb'))}</span></p><ul class="close-list">
      ${changes ? `<li>${esc(t('closeTableChanges', { n: changes }))}</li>` : ''}
      ${txOpen ? `<li>${esc(t('closeTxOpen'))}</li>` : ''}</ul>` : ''}
    <p>${esc(drafts ? t('closeText', { n: drafts }) : t('closeTextEmpty'))}</p>
    ${running ? `<p class="warn">${icon('alert', 14)}<span>${esc(t('closeRunning'))}</span></p>` : ''}
    ${dbUnsaved ? '' : `<label class="check"><input type="checkbox" id="close-remember"><span>${esc(t('dontAsk'))}</span></label>`}`;
  let remember = false;
  const rem = ov => { const cb = $('#close-remember', ov); remember = !!(cb && cb.checked); };
  const choice = await modal({
    title: t('closeTitle'), tile: 'power', red: true, body,
    buttons: [
      { label: t('cancel'), value: null, left: true, cls: 'ghost' },
      { label: t('closeDiscard'), value: 'discard', cls: 'danger-soft', onClick: rem },
      { label: t('closeSave'), value: 'save', cls: 'primary', main: true, onClick: rem },
    ],
    cls: 'close-dlg',
  });
  if (!choice) { api('close_dialog_dismissed').catch(() => {}); return; }
  clearTimeout(draftTimer);
  if (choice === 'save') {
    for (const tab of S.tabs.filter(x => (x.type === 'table' || x.type === 'design') && pendingCount(x) > 0)) {
      if (!await savePending(tab)) { api('close_dialog_dismissed').catch(() => {}); return; }
    }
    const drafts2 = S.tabs.filter(x => x.type === 'query' && x.sql.trim())
      .map(x => ({ conn: x.conn, sql: x.sql, file: x.file || null, savedId: x.savedId || null, title: x.title || null, savedSql: x.savedSql ?? null }));
    await api('save_settings', { drafts: drafts2 }).catch(() => {});
  } else {
    S.tabs.forEach(x => { if (x.type === 'table') x.pending = emptyPending(); resetDesign(x); });
    lastDirty = false; await api('set_dirty', false).catch(() => {});
  }
  try { await api('close_app', choice === 'save', remember); }
  catch (e) { toast(e.message, 'err'); api('close_dialog_dismissed').catch(() => {}); }
};

// ================= настройки =================
async function openSettings() {
  let st = {}, info = {};
  try { st = await api('get_settings'); } catch (e) { /* по умолчанию */ }
  try { info = await api('window_info'); } catch (e) { /* режим разработки */ }
  const ask = st.closeAsk !== false;
  const body = `
    <div class="set-h">${esc(t('setLook'))}</div>
    <div class="row2 half">
      <div class="field"><label>${esc(t('setTheme'))}</label>
        <select class="select" id="set-theme" style="height:30px">${['dark', 'light', 'auto'].map(m =>
          `<option value="${m}" ${(st.theme || 'dark') === m ? 'selected' : ''}>${esc(t('theme_' + m))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('setLang'))}</label>
        <select class="select" id="set-lang" style="height:30px">
          <option value="ru" ${LANG === 'ru' ? 'selected' : ''}>Русский</option>
          <option value="en" ${LANG === 'en' ? 'selected' : ''}>English</option></select></div>
    </div>
    <label class="check"><input type="checkbox" id="set-glass" ${st.glass ? 'checked' : ''}><span>${esc(t('setGlass'))}</span></label>
    <p class="hint">${esc(t('setGlassHint'))}</p>
    <div class="set-h">${esc(t('setEditor'))}</div>
    <div class="row2">
      <div class="field"><label>${esc(t('setTxDefault'))}</label>
        <select class="select" id="set-tx" style="height:30px">
          <option value="auto" ${!st.txManual ? 'selected' : ''}>${esc(t('txAuto'))}</option>
          <option value="manual" ${st.txManual ? 'selected' : ''}>${esc(t('txManual'))}</option>
        </select></div>
      <div class="field"><label>${esc(t('setTimeout'))}</label>
        <input class="input" id="set-timeout" type="number" min="0" step="1" value="${+st.timeout || 0}"></div>
    </div>
    <p class="hint">${esc(t('setTxHint'))} ${esc(t('setTimeoutHint'))}</p>
    <div class="row2">
      <div class="field"><label>${esc(t('setRows'))}</label>
        <input class="input" id="set-rows" type="number" min="10" max="100000" step="10" value="${clampRows(st.pageSize, 100)}"></div>
      <div class="field"><label>${esc(t('setRowLimit'))}</label>
        <input class="input" id="set-rowlimit" type="number" min="10" max="100000" step="100" value="${clampRows(st.rowLimit, 2000)}"></div>
    </div>
    <p class="hint">${esc(t('setRowsHint'))}</p>
    <div class="set-h">${esc(t('setClosing'))}</div>
    <label class="check"><input type="checkbox" id="set-ask" ${ask ? 'checked' : ''}><span>${esc(t('setAsk'))}</span></label>
    <div class="field"><label>${esc(t('setAction'))}</label>
      <select class="select" id="set-action" style="height:30px">
        <option value="save" ${st.closeAction !== 'discard' ? 'selected' : ''}>${esc(t('setActionSave'))}</option>
        <option value="discard" ${st.closeAction === 'discard' ? 'selected' : ''}>${esc(t('setActionDiscard'))}</option>
      </select></div>
    <p class="hint">${esc(t('setActionHint'))}</p>
    <div class="set-h">${esc(t('setAbout'))}</div>
    <div class="about"><span>Noir DB ${esc(info.version || '')}</span>
      <button class="btn" id="set-update">${icon('upload', 13)}${esc(t('updateFromZip'))}</button></div>
    <p class="hint">${esc(t('updateHint'))}</p>
    ${info.author ? `<p class="set-credit">${esc(info.author[LANG] || info.author.en)} · © ${new Date().getFullYear() > 2026 ? '2026–' + new Date().getFullYear() : '2026'}</p>` : ''}`;
  const p = modal({
    title: t('settings'), tile: 'gear', body,
    buttons: [
      { label: t('cancel'), value: null },
      { label: t('save'), cls: 'primary', main: true, onClick: async ov => {
        const v = { theme: $('#set-theme', ov).value, lang: $('#set-lang', ov).value, glass: $('#set-glass', ov).checked, closeAsk: $('#set-ask', ov).checked, closeAction: $('#set-action', ov).value,
          txManual: $('#set-tx', ov).value === 'manual',
          pageSize: clampRows($('#set-rows', ov).value, 100), rowLimit: clampRows($('#set-rowlimit', ov).value, 2000), timeout: Math.max(0, Math.round(+$('#set-timeout', ov).value || 0)) };
        try {
          S.settings = await api('save_settings', v);
          applyTheme(v.theme); applyGlass(v.glass);
          if (v.lang !== LANG) { LANG = v.lang; document.documentElement.lang = LANG; renderAll(); } else rerenderCharts();
          api('set_theme', v.theme).catch(() => {});
          toast(t('saved'));
        }
        catch (e) { toast(e.message, 'err'); return false; }
      } },
    ],
  });
  $('#set-update').onclick = () => installUpdate();
  // Liquid Glass виден сразу, «Отменить» возвращает как было
  const gl = $('#set-glass');
  gl.onchange = () => applyGlass(gl.checked);
  await p;
  applyGlass(!!S.settings.glass);
}

async function installUpdate() {
  if (anyPending() || Object.values(S.tx).some(x => x === 'open')) { toast(t('updateSaveFirst'), 'err'); return; }
  const ok = await modal({
    title: t('updateFromZip'), tile: 'upload', body: `<p>${esc(t('updateText'))}</p>`,
    buttons: [{ label: t('cancel'), value: false }, { label: t('updateChoose'), cls: 'primary', main: true, value: true }],
  });
  if (!ok) return;
  clearTimeout(draftTimer);
  const drafts = S.tabs.filter(x => x.type === 'query' && x.sql.trim())
    .map(x => ({ conn: x.conn, sql: x.sql, file: x.file || null, savedId: x.savedId || null, title: x.title || null, savedSql: x.savedSql ?? null }));
  await api('save_settings', { drafts }).catch(() => {});
  try {
    const r = await api('install_update');
    if (r) toast(t('updateStarted', { v: r.version || '' }));
  } catch (e) { toast(e.message, 'err'); }
}

// ================= общие горячие клавиши =================
document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || document.querySelector('.overlay')) return;
  const k = e.key.toLowerCase();
  if (k === 't') { e.preventDefault(); newQueryTab(); }
  if (k === 'f') {
    const tab = curTab();
    if (tab && tab.type === 'query') { e.preventDefault(); if (e.shiftKey) formatEditor(tab); else openFind(tab, e.altKey); }
  }
  // ⌘↵ запускает запрос, даже если курсор не в редакторе (в самом редакторе это обрабатывает он)
  if (k === 'enter' && !e.target.closest('textarea, input')) {
    const tab = curTab();
    if (tab && tab.type === 'query') { e.preventDefault(); runQuery(tab, e.shiftKey); }
  }
  if (k === 's') {
    e.preventDefault();
    const tab = curTab();
    if (!tab) return;
    if (tab.type === 'table' || tab.type === 'design') savePending(tab);
    else if (tab.type === 'query') saveQuery(tab);
  }
});
document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea, td')) e.preventDefault(); });

// ================= запуск =================
function renderAll() {
  renderTitle(); renderSidebar(); renderMain();
}

(async function init() {
  try {
    // настройки, подключения и сохранённые таблицы – одновременно, а не по очереди
    const [s, conns] = await Promise.all([api('get_settings'), api('list_connections'), loadSaved()]);
    S.settings = s;
    applyTheme(s.theme || 'dark');
    applyGlass(!!s.glass);
    LANG = s.lang || 'ru';
    document.documentElement.lang = LANG;
    S.conns = conns;
  } catch (e) { toast(e.message, 'err'); }
  renderAll();
  const last = S.conns.find(c => c.id === S.settings.lastConn) || (S.conns.length === 1 ? S.conns[0] : null);
  if (last) selectConn(last.id);
  // высота системного заголовка macOS: окно настраивается чуть позже загрузки страницы
  if (NATIVE) for (let i = 0; i < 10; i++) {
    const w = await api('window_info').catch(() => null);
    if (w && w.titlebar) { setTitlebar(w.titlebar); break; }
    await new Promise(r => setTimeout(r, 250));
  }
})();

