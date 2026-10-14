// Сайдбар, подключения, дерево таблиц, вкладки.
// ================= заголовок окна =================
function renderTitle() {
  const c = conn(S.active);
  const info = S.info[S.active];
  $('#title').innerHTML = c && info
    ? `${c.color ? `<span class="cdot" style="background:${c.color}"></span>` : ''}<b>${esc(info.db)}</b> · PostgreSQL ${esc(info.ver)} · ${esc(c.name)}${info.read_only ? ` <span class="tag-ro">${icon('lock', 11)}${t('readOnly')}</span>` : ''}`
    : 'Noir DB';
  // цветная полоска под заголовком – чтобы не перепутать рабочую базу с учебной
  document.documentElement.style.setProperty('--conn-color', c && info && c.color ? c.color : 'transparent');
}

const CONN_COLORS = ['', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];

// высота системного заголовка macOS и полноэкранный режим (вызываются из Python)
window.setTitlebar = h => { if (h && h > 20) document.documentElement.style.setProperty('--tb-h', h + 'px'); };
window.setFullscreen = on => document.documentElement.classList.toggle('fs', !!on);

// двойной клик по верхней полосе (над сайдбаром и строка с названием базы) – растянуть окно, как в других приложениях
document.addEventListener('dblclick', e => {
  if (NATIVE && e.target.closest('.sb-top, .titlebar') && !document.documentElement.classList.contains('fs')) api('window_zoom').catch(() => {});
});

// ================= сайдбар =================
function renderSidebar() {
  const sb = $('#sidebar');
  let h = `<div class="sb-scroll"><div class="sb-label"><span>${t('connections')}</span><span class="sb-acts"><button class="btn ghost icon" id="sb-settings" title="${t('settings')}" aria-label="${t('settings')}">${icon('gear', 14)}</button></span></div>`;
  S.conns.forEach(c => {
    const on = c.id === S.active;
    h += `<div class="conn ${on ? 'active' : ''}" data-conn="${c.id}">
      <div class="tile" ${c.color ? `style="background:${c.color};color:#000"` : ''}>${icon(c.read_only ? 'lock' : 'database', 16)}${S.info[c.id] ? '<span class="dot"></span>' : ''}</div>
      <div class="meta"><div class="nm">${esc(c.name)}</div><div class="sub" title="${esc(c.user)}@${esc(c.host)}:${esc(c.port)}/${esc((S.info[c.id] && S.info[c.id].db) || c.dbname)}${c.ssh && c.ssh.on ? ` · SSH ${esc(c.ssh.user)}@${esc(c.ssh.host)}` : ''}">${c.ssh && c.ssh.on ? 'SSH · ' : ''}${esc(c.host === '127.0.0.1' || c.host === '::1' ? 'localhost' : c.host)}${+c.port && +c.port !== 5432 ? ':' + esc(c.port) : ''} · ${esc((S.info[c.id] && S.info[c.id].db) || c.dbname)}</div></div>
      <button class="btn ghost icon more" data-conn-menu="${c.id}" aria-label="More">${icon('more', 16)}</button></div>`;
  });
  h += `<div class="add-conn" id="add-conn"><div class="tile">${icon('plus', 15)}</div><span>${t('newConnection')}</span></div>`;

  const id = S.active;
  const ro = id && S.info[id] && S.info[id].read_only;
  if (id && S.info[id]) {
    h += `<div class="sb-label"><span>${t('database')}</span></div>
      <div class="db-picker"><select class="select" id="db-select">
      ${(S.dbs[id] || []).map(d => `<option ${d === S.info[id].db ? 'selected' : ''}>${esc(d)}</option>`).join('')}
      </select><button class="btn ghost icon" id="db-more" title="${t('dbActions')}" aria-label="${t('dbActions')}">${icon('more', 16)}</button></div>
      <div class="sb-label"><span>${t('tables')}</span><span class="sb-acts">
      ${ro ? '' : `<button class="btn ghost icon" id="sb-newtable" title="${t('newTable')}" aria-label="${t('newTable')}">${icon('plus', 14)}</button>`}
      <button class="btn ghost icon" id="sb-refresh" aria-label="${t('refresh')}">${icon('refresh', 14)}</button></span></div>
      <div class="sb-filter search-box">${icon('search', 13)}<input class="input sm" id="tbl-filter" placeholder="${t('filterTables')}" value="${esc(S.filter)}" spellcheck="false"></div>
      <div id="tree"></div>`;
  }
  if (id && S.info[id]) {
    const list = S.saved.filter(q => savedHere(q, id));
    h += `<div class="sb-label"><span>${t('savedTables')}</span></div><div id="saved">${list.map(q => {
      const on = curTab() && curTab().savedId === q.id;
      const ic = q.mode === 'fixed' ? 'clock' : q.mode === 'live' ? 'table' : 'sql';
      const tip = q.mode === 'fixed' ? t('stTipFixed', { d: fmtDay(q.created), t: q.table }) : q.mode === 'live' ? t('stTipLive') : t('stTipQuery');
      return `<div class="tbl saved ${on ? 'active' : ''}" data-saved="${q.id}" data-m="${q.mode || 'query'}" title="${esc(tip)}">${icon(ic, 14)}<span class="nm">${esc(q.name)}</span>${q.mode === 'fixed' ? `<span class="cnt">${esc(fmtDay(q.created, true))}</span>` : ''}</div>`;
    }).join('') || `<div class="sb-empty">${t('stEmpty')}</div>`}</div>`;
  }
  h += '</div>';
  sb.innerHTML = h;
  $('#sb-settings').onclick = () => openSettings();
  renderTree();

  sb.querySelectorAll('[data-conn]').forEach(el => {
    el.onclick = e => { if (!e.target.closest('[data-conn-menu]')) selectConn(el.dataset.conn); };
    el.oncontextmenu = e => { e.preventDefault(); connMenu(el.dataset.conn, e.clientX, e.clientY); };
  });
  sb.querySelectorAll('[data-conn-menu]').forEach(el => el.onclick = e => {
    const r = el.getBoundingClientRect();
    connMenu(el.dataset.connMenu, r.left, r.bottom + 4);
  });
  $('#add-conn').onclick = () => editConnection();
  const dbSel = $('#db-select');
  if (dbSel) dbSel.onchange = () => switchDb(dbSel.value);
  const f = $('#tbl-filter');
  if (f) f.oninput = () => { S.filter = f.value; renderTree(); };
  const rf = $('#sb-refresh');
  if (rf) rf.onclick = () => loadTree(S.active);
  const dm = $('#db-more'); if (dm) dm.onclick = () => { const r = dm.getBoundingClientRect(); dbMenu(r.right - 220, r.bottom + 4); };
  const nt = $('#sb-newtable');
  if (nt) nt.onclick = () => {
    const r = nt.getBoundingClientRect();
    const sc = (S.schemas[S.active] || []).find(s => s.name === 'public') ? 'public' : ((S.schemas[S.active] || [])[0] || {}).name || 'public';
    openMenu(r.left, r.bottom + 4, [
      { icon: 'edit', label: t('ntDesigner'), hint: t('ntDesignerHint'), action: () => openNewDesign(S.active) },
      { icon: 'upload', label: t('ntFromFile'), hint: t('ntFromFileHint'), action: () => openFileToTable(S.active, sc) },
    ]);
  };
  sb.querySelectorAll('[data-saved]').forEach(el => {
    const q = S.saved.find(x => x.id === el.dataset.saved);
    el.onclick = () => openSaved(q);
    el.oncontextmenu = e => { e.preventDefault(); savedMenu(q, e.clientX, e.clientY); };
  });
}

// ================= сохранённые запросы =================
async function loadSaved() {
  try { S.saved = await api('saved_list'); } catch (e) { S.saved = []; }
}

const savedById = id => S.saved.find(q => q.id === id);

// пункт «Сохранённых таблиц» виден только в своей базе. Старые сохранения базу не помнят –
// для них смотрим, есть ли в открытой базе таблицы из запроса (пока список таблиц не загружен – не показываем)
function savedHere(q, cid) {
  const info = S.info[cid];
  if (!info) return false;
  if (q.db) return q.conn === cid && q.db === info.db;
  const meta = S.meta[cid];
  if (!q.sql) return true;
  if (!meta) return false;
  try {
    return sqStatements(sqSig(sqTokens(q.sql))).every(st => sqScope(st, meta).refs.every(r => r.derived || r.cte || r.tbl || !r.name || /^pg_/.test(r.name)));
  } catch (e) { return true; }
}
// дата сохранения: «11 октября 2026» или коротко «11.10»
function fmtDay(iso, short) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return short ? d.toLocaleDateString(LANG, { day: '2-digit', month: '2-digit' }) : d.toLocaleDateString(LANG, { day: 'numeric', month: 'long', year: 'numeric' });
}

function openSaved(q) {
  // на текущий момент – обычная таблица в базе
  if (q.mode === 'fixed') {
    const sc = (S.schemas[S.active] || []).find(s => s.name === q.schema);
    if (sc && sc.tables && !sc.tables.some(x => x.name === q.table)) { toast(t('stGone', { t: q.table }), 'err'); return; }
    openTable(S.active, q.schema, q.table, 'table', 'data', { savedId: q.id });
    return;
  }
  const ex = S.tabs.find(x => x.type === 'query' && x.savedId === q.id);
  if (ex) {
    S.tab = ex.id; renderTabs(); renderSidebar(); renderPane();
    if (q.mode === 'live') runQuery(ex);          // открыл снова – свежие данные
    return;
  }
  newQueryTab(q.sql);
  const tab = curTab();
  if (!tab) return;
  tab.savedId = q.id; tab.title = q.name; tab.savedSql = q.sql;
  if (q.mode === 'live') { tab.editorH = 90; renderPane(); runQuery(tab); }
  renderTabs(); renderSidebar(); saveDrafts();
}

function savedMenu(q, x, y) {
  openMenu(x, y, [
    { icon: q.mode === 'query' || !q.mode ? 'sql' : 'table', label: t('open'), action: () => openSaved(q) },
    ...(q.mode === 'fixed' ? [{ icon: 'sql', label: t('stShowQuery'), action: () => { newQueryTab(q.sql); } }] : []),
    { icon: 'edit', label: t('rename'), action: async () => {
      const name = await promptText(t('rename'), t('name'), q.name);
      if (!name) return;
      await api('saved_save', { ...q, name }).catch(e => toast(e.message, 'err'));
      S.tabs.filter(x => x.savedId === q.id).forEach(x => { x.title = name; });
      await loadSaved(); renderSidebar(); renderTabs();
    } },
    '-',
    { icon: 'trash', label: t('remove'), red: true, action: async () => {
      if (!await confirmDanger(t('confirmSavedDel', { t: q.name }), q.mode === 'fixed' ? t('stDelFixedText', { t: q.table }) : t('confirmSavedDelText'), t('deleteBtn'))) return;
      await api('saved_delete', q.id).catch(e => toast(e.message, 'err'));
      S.tabs.filter(x => x.savedId === q.id).forEach(x => { x.savedId = null; });
      await loadSaved(); renderSidebar();
    } },
  ]);
}

function renderTree() {
  const tree = $('#tree');
  if (!tree) return;
  const list = S.schemas[S.active] || [];
  const q = S.filter.trim().toLowerCase();
  const ct = curTab();
  document.querySelectorAll('#saved [data-saved]').forEach(e => e.classList.toggle('active', !!ct && ct.savedId === e.dataset.saved));
  let h = '';
  list.forEach((sc, si) => {
    const tables = (sc.tables || []).filter(x => !q || x.name.toLowerCase().includes(q));
    if (q && !tables.length) return;
    const open = sc.open || !!q;
    h += `<div class="schema-head ${open ? '' : 'closed'}" data-schema="${si}">${icon('chevronDown', 12, 'chev')}${icon('layers', 13)}<span>${esc(sc.name)}</span><span class="sch-dg" data-schema-dg="${si}" title="${t('dgMenu')}">${icon('diagram', 14)}</span><span class="count">${sc.tables ? sc.tables.length : ''}</span></div>`;
    if (open) tables.forEach(tb => {
      const on = ct && ct.type === 'table' && ct.conn === S.active && ct.schema === sc.name && ct.table === tb.name;
      h += `<div class="tbl ${on ? 'active' : ''}" data-s="${esc(sc.name)}" data-t="${esc(tb.name)}" data-k="${tb.kind}">
        ${icon(tb.kind === 'table' ? 'table' : 'view', 15)}<span class="nm">${esc(tb.name)}</span>
        <span class="cnt">${tb.kind === 'table' && tb.rows_estimate > 0 ? fmtCount(tb.rows_estimate) : ''}</span></div>`;
    });
  });
  tree.innerHTML = h;
  tree.querySelectorAll('[data-schema]').forEach(el => el.onclick = e => {
    const sc = list[+el.dataset.schema];
    if (e.target.closest('[data-schema-dg]')) { openDiagram(S.active, sc.name); return; }
    sc.open = !sc.open;
    if (sc.open && !sc.tables) loadTables(S.active, sc); else renderTree();
  });
  tree.querySelectorAll('[data-schema]').forEach(el => {
    el.oncontextmenu = e => { e.preventDefault(); schemaMenu(list[+el.dataset.schema], e.clientX, e.clientY); };
  });
  tree.querySelectorAll('.tbl').forEach(el => {
    const a = [el.dataset.s, el.dataset.t, el.dataset.k];
    el.onclick = () => openTable(S.active, ...a);
    el.oncontextmenu = e => { e.preventDefault(); tableMenu(S.active, ...a, e.clientX, e.clientY); };
  });
}

// меню схемы: «•••» при наведении на схему и правый клик
function schemaMenu(sc, x, y) {
  openMenu(x, y, [{ icon: 'diagram', label: t('dgMenu'), action: () => openDiagram(S.active, sc.name) }]);
}

// меню базы: «•••» рядом с выбором базы
function dbMenu(x, y) {
  const ro = S.info[S.active] && S.info[S.active].read_only;
  openMenu(x, y, [
    { icon: 'search', label: t('fsMenu'), action: () => openSearchTab(S.active) },
    ...(ro ? [] : ['-',
      { icon: 'plus', label: t('newDatabase'), action: () => createDatabase() },
      { icon: 'upload', label: t('importSql'), action: () => importSql() },
      '-',
      { icon: 'trash', label: t('dropDb'), red: true, action: () => dropDatabase() }]),
  ]);
}

function connMenu(id, x, y) {
  const c = conn(id);
  const connected = !!S.info[id];
  openMenu(x, y, [
    connected
      ? { icon: 'power', label: t('disconnect'), red: true, action: () => disconnect(id) }
      : { icon: 'power', label: t('connect'), action: () => selectConn(id) },
    { icon: 'edit', label: t('edit'), action: () => editConnection(c) },
    '-',
    { icon: 'trash', label: t('remove'), red: true, action: async () => {
      if (!await confirmDanger(t('confirmConn', { t: c.name }), t('confirmConnText'), t('deleteBtn'))) return;
      try {
        await api('delete_connection', id);
        forgetConn(id);
        S.conns = S.conns.filter(x => x.id !== id);
        if (S.active === id) S.active = null;
        renderAll();
      } catch (e) { toast(e.message, 'err'); }
    } },
  ]);
}

// меню таблицы: правый клик в сайдбаре и «•••» во вкладке (inTab – там «Открыть» не нужен)
function tableMenu(cid, schema, table, kind, x, y, inTab) {
  const items = [
    ...(inTab ? [] : [{ icon: 'table', label: t('open'), action: () => openTable(cid, schema, table, kind) }]),
    { icon: 'sql', label: t('queryTable'), action: () => {
      newQueryTab(`SELECT *\nFROM ${schema === 'public' ? quoteId(table) : `${quoteId(schema)}.${quoteId(table)}`}\nLIMIT 100;`);
      const qt = curTab(); if (qt && qt.type === 'query') qt.ctxTable = { schema, table };   // сниппеты подставят эту таблицу сами
    } },
  ];
  if (!(S.info[cid] && S.info[cid].read_only)) {
    if (kind === 'table') items.push({ icon: 'upload', label: t('importCsv'), action: () => openCsvImport(cid, schema, table) });
    items.push('-');
    if (kind === 'table') items.push({ icon: 'eraser', label: t('truncate'), red: true, action: () => truncateTable(cid, schema, table) });
    items.push({ icon: 'trash', label: kind === 'table' ? t('dropTable') : t('dropView'), red: true, action: () => dropTable(cid, schema, table, kind) });
  }
  openMenu(x, y, items);
}

// ================= подключения =================
function editConnection(c) {
  const isNew = !c;
  c = c || { name: '', host: 'localhost', port: 5432, user: 'postgres', dbname: 'postgres', sslmode: 'prefer' };
  const ssh = c.ssh || {};
  const body = `
    <div class="field"><label>${t('name')}</label><input class="input" id="f-name" value="${esc(c.name)}" placeholder="My database" spellcheck="false"></div>
    <div class="row2">
      <div class="field"><label>${t('host')}</label><input class="input" id="f-host" value="${esc(c.host)}" spellcheck="false"></div>
      <div class="field"><label>${t('port')}</label><input class="input" id="f-port" value="${esc(c.port)}"></div>
    </div>
    <div class="field"><label>${t('user')}</label><input class="input" id="f-user" value="${esc(c.user)}" spellcheck="false"></div>
    <div class="field"><label>${t('password')}</label><input class="input" id="f-pass" type="password" placeholder="${isNew ? '' : t('passwordKeep')}"></div>
    <div class="row2 half">
      <div class="field"><label>${t('database')}</label><input class="input" id="f-db" value="${esc(c.dbname)}" spellcheck="false"></div>
      <div class="field"><label>${t('ssl')}</label><select class="select" id="f-ssl" style="height:30px">
        ${['prefer', 'require', 'disable'].map(m => `<option value="${m}" ${m === c.sslmode ? 'selected' : ''}>${t('ssl_' + m)}</option>`).join('')}</select></div>
    </div>
    <label class="check"><input type="checkbox" id="f-ssh" ${ssh.on ? 'checked' : ''}><span>${t('sshOn')}</span></label>
    <div class="ssh-box ${ssh.on ? '' : 'hidden'}" id="f-ssh-box">
      <div class="row2">
        <div class="field"><label>${t('sshHost')}</label><input class="input" id="f-ssh-host" value="${esc(ssh.host || '')}" placeholder="server.example.com" spellcheck="false"></div>
        <div class="field"><label>${t('port')}</label><input class="input" id="f-ssh-port" value="${esc(ssh.port || 22)}"></div>
      </div>
      <div class="row2 half">
        <div class="field"><label>${t('sshUser')}</label><input class="input" id="f-ssh-user" value="${esc(ssh.user || '')}" spellcheck="false"></div>
        <div class="field"><label>${t('sshAuth')}</label><select class="select" id="f-ssh-auth" style="height:30px">
          <option value="key" ${ssh.auth !== 'password' ? 'selected' : ''}>${t('sshKey')}</option>
          <option value="password" ${ssh.auth === 'password' ? 'selected' : ''}>${t('password')}</option></select></div>
      </div>
      <div class="field ${ssh.auth === 'password' ? 'hidden' : ''}" id="f-ssh-keyf"><label>${t('sshKeyFile')}</label>
        <input class="input mono" id="f-ssh-key" value="${esc(ssh.key || '')}" placeholder="~/.ssh/id_ed25519" spellcheck="false"></div>
      <div class="field ${ssh.auth === 'password' ? '' : 'hidden'}" id="f-ssh-pwf"><label>${t('sshPassword')}</label>
        <input class="input" id="f-ssh-pass" type="password" placeholder="${isNew || !ssh.on ? '' : t('passwordKeep')}"></div>
      <div class="hint">${t('sshHint')}</div>
    </div>
    <div class="field"><label>${t('connColor')}</label><div class="swatches" id="f-color">${CONN_COLORS.map(col =>
      `<span class="sw ${col === (c.color || '') ? 'on' : ''} ${col ? '' : 'none'}" data-col="${col}" ${col ? `style="background:${col}"` : ''} title="${col ? '' : t('noColor')}"></span>`).join('')}</div>
      <div class="hint">${t('connColorHint')}</div></div>
    <label class="check"><input type="checkbox" id="f-ro" ${c.read_only ? 'checked' : ''}><span>${t('readOnlyMode')}</span></label>
    <div class="hint">${t('readOnlyHint')}</div>
    <div class="hint" id="f-hint"></div>`;
  const read = ov => {
    const on = $('#f-color .sw.on', ov);
    const d = {
      id: c.id, name: $('#f-name', ov).value.trim(), host: $('#f-host', ov).value.trim(),
      port: +$('#f-port', ov).value || 5432, user: $('#f-user', ov).value.trim(),
      dbname: $('#f-db', ov).value.trim() || 'postgres', sslmode: $('#f-ssl', ov).value,
      color: on ? on.dataset.col || null : null, read_only: $('#f-ro', ov).checked,
      ssh: $('#f-ssh', ov).checked ? { on: true, host: $('#f-ssh-host', ov).value.trim(), port: +$('#f-ssh-port', ov).value || 22,
        user: $('#f-ssh-user', ov).value.trim(), auth: $('#f-ssh-auth', ov).value, key: $('#f-ssh-key', ov).value.trim() || null } : null,
    };
    const spw = $('#f-ssh-pass', ov).value;
    if (d.ssh && d.ssh.auth === 'password' && spw) d.ssh_password = spw;
    if (!d.name) d.name = d.dbname + '@' + d.host;
    const pw = $('#f-pass', ov).value;
    if (pw || isNew) d.password = pw;
    return d;
  };
  setTimeout(() => {
    const sw = $('#f-ssh'), auth = $('#f-ssh-auth');
    if (sw) sw.onchange = () => $('#f-ssh-box').classList.toggle('hidden', !sw.checked);
    if (auth) auth.onchange = () => { $('#f-ssh-keyf').classList.toggle('hidden', auth.value === 'password'); $('#f-ssh-pwf').classList.toggle('hidden', auth.value !== 'password'); };
    const box = $('#f-color');
    if (box) box.onclick = e => {
      const sw = e.target.closest('.sw');
      if (!sw) return;
      box.querySelectorAll('.sw').forEach(x => x.classList.remove('on'));
      sw.classList.add('on');
    };
  }, 0);
  modal({
    title: isNew ? t('newConnection') : t('editConnection'),
    body,
    buttons: [
      { label: t('test'), left: true, cls: 'ghost', onClick: async ov => {
        const hint = $('#f-hint', ov);
        hint.className = 'hint'; hint.textContent = t('connecting');
        try {
          const i = await api('test_connection', read(ov));
          hint.className = 'hint ok'; hint.textContent = `${t('testOk')} · PostgreSQL ${i.ver}`;
        } catch (e) { hint.className = 'hint err'; hint.textContent = e.message; }
        return false;
      } },
      { label: t('cancel'), value: null },
      { label: t('save'), cls: 'primary', main: true, onClick: async (ov, btn) => {
        try {
          const saved = await api('save_connection', read(ov));
          const i = S.conns.findIndex(x => x.id === saved.id);
          if (i >= 0) S.conns[i] = saved; else S.conns.push(saved);
          if (!isNew) {
            if (!await confirmLeaveConn(saved.id)) return false;
            await api('disconnect', saved.id).catch(() => {});
            forgetConn(saved.id);
          }
          setTimeout(() => selectConn(saved.id), 0);
        } catch (e) { const h = $('#f-hint', ov); h.className = 'hint err'; h.textContent = e.message; return false; }
      } },
    ],
  });
}

function forgetConn(id) {
  delete S.info[id]; delete S.dbs[id]; delete S.schemas[id]; delete S.meta[id];
  S.tabs = S.tabs.filter(x => x.conn !== id);
  if (!S.tabs.find(x => x.id === S.tab)) S.tab = S.tabs.length ? S.tabs[S.tabs.length - 1].id : null;
}

async function selectConn(id) {
  S.active = id;
  S.filter = '';
  if (!S.info[id]) {
    renderSidebar(); renderTitle();
    const el = document.querySelector(`[data-conn="${id}"] .sub`);
    if (el) el.textContent = t('connecting');
    try {
      S.info[id] = await api('connect', id);
      S.tx[id] = 'none'; S.manual[id] = false;
      if (S.settings.txManual && !S.info[id].read_only) {
        await api('set_tx_mode', id, true).then(() => { S.manual[id] = true; }).catch(() => {});
      }
      await loadTree(id);
      restoreDrafts(id);
      api('save_settings', { lastConn: id }).catch(() => {});
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  renderAll();
}

// перед отключением/сменой базы: несохранённые правки таблиц и открытая транзакция редактора
async function confirmLeaveConn(id, keepQueries = true) {
  for (const tab of S.tabs.filter(x => x.type === 'table' && x.conn === id)) {
    if (!await leaveTable(tab)) return false;
  }
  return resolveTx(id);
}

async function disconnect(id) {
  if (!await confirmLeaveConn(id)) return;
  await api('disconnect', id).catch(() => {});
  forgetConn(id);
  renderAll();
}

async function loadTree(id) {
  try {
    const [dbs, schemas] = await Promise.all([api('databases', id), api('schemas', id)]);
    S.dbs[id] = dbs;
    const old = S.schemas[id] || [];
    S.schemas[id] = schemas.map((name, i) => {
      const prev = old.find(o => o.name === name);
      return { name, tables: null, open: prev ? prev.open : (name === 'public' || i === 0) };
    });
    await Promise.all(S.schemas[id].filter(s => s.open).map(s => loadTables(id, s, true)));
    loadMeta(id);
  } catch (e) { toast(e.message, 'err'); }
  if (id === S.active) renderSidebar();
}

async function loadTables(id, sc, silent) {
  try { sc.tables = await api('tables', id, sc.name); } catch (e) { toast(e.message, 'err'); sc.tables = []; }
  if (!silent) renderTree();
}

async function switchDb(db) {
  const id = S.active;
  if (!await confirmLeaveConn(id)) { renderSidebar(); return; }
  try {
    S.info[id] = await api('switch_database', id, db);
    S.tabs = S.tabs.filter(x => !(x.conn === id && ['table', 'search', 'diagram'].includes(x.type)));   // они про старую базу
    if (!S.tabs.find(x => x.id === S.tab)) S.tab = S.tabs.length ? S.tabs[S.tabs.length - 1].id : null;
    S.schemas[id] = [];
    S.meta[id] = undefined;          // список таблиц прежней базы больше не подходит
    await loadTree(id);
  } catch (e) { toast(e.message, 'err'); }
  renderAll();
}

// ================= черновики запросов (переживают перезапуск) =================
let draftTimer = 0;
function saveDrafts() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const drafts = S.tabs.filter(x => x.type === 'query' && x.sql.trim())
      .map(x => ({ conn: x.conn, sql: x.sql, file: x.file || null, savedId: x.savedId || null, title: x.title || null, savedSql: x.savedSql ?? null }));
    api('save_settings', { drafts }).catch(() => {});
  }, 700);
}

function restoreDrafts(id) {
  if (S.restored[id]) return;
  S.restored[id] = true;
  (S.settings.drafts || []).filter(d => d.conn === id && d.sql).forEach(d => {
    S.tabs.push({ id: ++tabSeq, type: 'query', conn: id, n: ++querySeq, sql: d.sql, result: null, editorH: null,
      file: d.file, savedId: d.savedId, title: d.title, savedSql: d.savedSql });
  });
  if (!S.tab && S.tabs.length) S.tab = S.tabs[0].id;
}

// ================= вкладки =================
function newQueryTab(sql = '') {
  if (!S.active || !S.info[S.active]) { toast(t('notConnected'), 'err'); return; }
  const tab = { id: ++tabSeq, type: 'query', conn: S.active, n: ++querySeq, sql, result: null, editorH: null };
  S.tabs.push(tab);
  S.tab = tab.id;
  renderTabs(); renderPane();
  if (sql) saveDrafts();
  setTimeout(() => { const ta = $('#sql'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 0);
}

function openTable(cid, schema, table, kind, view = 'data', extra = null) {
  let tab = S.tabs.find(x => x.type === 'table' && x.conn === cid && x.schema === schema && x.table === table);
  if (!tab) {
    tab = { id: ++tabSeq, type: 'table', conn: cid, schema, table, kind, view, data: null, structure: null,
      offset: 0, limit: pageSizeSetting(), orderBy: null, orderDir: 'asc', search: '', ...extra };
    S.tabs.push(tab);
  } else if (tab.view !== view && !pendingCount(tab)) tab.view = view;   // с несохранённым – просто показываем вкладку
  S.tab = tab.id;
  renderTabs(); renderTree(); renderPane();   // загрузку данных запускает сама вкладка, если их ещё нет
}

async function closeTab(id) {
  const tab = S.tabs.find(x => x.id === id);
  if (!tab) return;
  if ((tab.type === 'table' || tab.type === 'design') && !await leaveTable(tab)) return;
  if (tab.type === 'query' && tab.running) await api('cancel_query', tab.conn).catch(() => {});
  if (tab.type === 'search') stopSearch(tab);
  // последняя вкладка запросов этого подключения – решаем судьбу открытой транзакции
  if (tab.type === 'query' && !S.tabs.some(x => x !== tab && x.type === 'query' && x.conn === tab.conn) && !await resolveTx(tab.conn)) return;
  forceCloseTab(id);
}

// закрыть все вкладки (или все, кроме keep) – с подтверждением; несохранённое в таблицах и транзакции спросятся отдельно
async function closeAllTabs(keep) {
  const list = S.tabs.filter(x => x.id !== keep);
  if (!list.length) return;
  const queries = list.filter(x => x.type === 'query' && x.sql.trim() && !(x.savedId && x.savedSql === x.sql)).length;
  const ok = await modal({
    title: keep ? t('closeOtherTabsQ', { n: list.length }) : t('closeAllTabsQ', { n: list.length }), tile: 'closeAll', red: true,
    body: `<p>${esc(t('closeAllText'))}${queries ? ' ' + esc(t('closeAllQueries', { n: queries })) : ''}</p>`,
    buttons: [{ label: t('cancel'), value: false }, { label: keep ? t('closeOtherTabs') : t('closeAllTabs'), cls: 'danger', main: true, value: true }],
  });
  if (!ok) return;
  for (const x of list) {
    if (!S.tabs.includes(x)) continue;
    const before = S.tabs.length;
    await closeTab(x.id);
    if (S.tabs.length === before) break;          // пользователь нажал «Отмена» в вопросе о несохранённом
  }
}

function forceCloseTab(id) {
  const i = S.tabs.findIndex(x => x.id === id);
  if (i < 0) return;
  const [gone] = S.tabs.splice(i, 1);
  if (S.tab === id) S.tab = S.tabs.length ? S.tabs[Math.min(i, S.tabs.length - 1)].id : null;
  renderTabs(); renderTree(); renderPane();
  if (gone.type === 'query') saveDrafts();
}

function tabTitle(tab) {
  if (tab.type === 'query') return tab.title || (tab.file ? tab.file.split('/').pop() : `${t('query')} ${tab.n}`);
  if (tab.type === 'design') return (tab.d && tab.d.name.trim()) || t('newTable');
  if (tab.type === 'search') return tab.q.trim() ? `${t('fsTitle')}: ${tab.q.trim()}` : t('fsTitle');
  if (tab.type === 'diagram') return `${t('dgTitle')}: ${tab.schema}`;
  if (tab.savedId && savedById(tab.savedId)) return savedById(tab.savedId).name;     // сохранённая таблица «на текущий момент»
  return tab.schema === 'public' ? tab.table : `${tab.schema}.${tab.table}`;
}

// точка на вкладке: в таблице есть несохранённые правки или запрос изменён после сохранения
const tabDirty = tab => tab.type === 'table' || tab.type === 'design' ? pendingCount(tab) > 0
  : (tab.savedSql != null && tab.savedSql !== tab.sql);

function renderTabs() {
  const bar = $('#tabs');
  if (!bar) return;
  bar.innerHTML = S.tabs.map(tab => `<div class="tab ${tab.id === S.tab ? 'on' : ''}" data-tab="${tab.id}" data-type="${tab.type}" data-k="${tab.kind || ''}">
      ${icon({ query: 'sql', design: 'edit', search: 'search', diagram: 'diagram' }[tab.type] || (tab.kind === 'table' ? 'table' : 'view'), 14)}
      <span class="nm">${esc(tabTitle(tab))}</span>${tabDirty(tab) ? '<span class="tdot"></span>' : ''}<span class="x" data-close="${tab.id}">${icon('x', 11)}</span></div>`).join('')
    + `<div class="tab-add" id="tab-add" title="${t('newQuery')}">${icon('plus', 15)}</div>`
    + (S.tabs.length > 1 ? `<div class="tab-grow"></div><button class="btn sm tab-closeall" id="tab-closeall" title="${t('closeAllTabs')}">${icon('closeAll', 14)}<span>${t('closeAllShort')}</span></button>` : '');
  bar.querySelectorAll('[data-tab]').forEach(el => {
    el.onclick = e => {
      if (e.target.closest('[data-close]')) { closeTab(+el.dataset.tab); return; }
      S.tab = +el.dataset.tab;
      const tb = curTab();
      if (tb && tb.conn !== S.active && S.info[tb.conn]) { S.active = tb.conn; renderSidebar(); renderTitle(); }
      renderTabs(); renderTree(); renderPane();
    };
    el.onauxclick = e => { if (e.button === 1) closeTab(+el.dataset.tab); };
    el.oncontextmenu = e => {
      e.preventDefault();
      const id = +el.dataset.tab;
      openMenu(e.clientX, e.clientY, [
        { icon: 'x', label: t('closeTab'), red: true, action: () => closeTab(id) },
        ...(S.tabs.length > 1 ? [{ icon: 'x', label: t('closeOtherTabs'), red: true, action: () => closeAllTabs(id) },
          { icon: 'closeAll', label: t('closeAllTabs'), red: true, action: () => closeAllTabs() }] : []),
      ]);
    };
  });
  $('#tab-add').onclick = () => newQueryTab();
  const ca = $('#tab-closeall'); if (ca) ca.onclick = () => closeAllTabs();
}

function renderMain() {
  $('#main').innerHTML = `<div class="tabs" id="tabs"></div><div class="pane" id="pane"></div>`;
  renderTabs(); renderPane();
}

function renderPane() {
  const pane = $('#pane');
  if (!pane) return;
  const tab = curTab();
  $('#tabs').classList.toggle('hidden', !S.tabs.length);
  if (!tab) {
    const connected = S.active && S.info[S.active];
    pane.innerHTML = `<div class="empty"><div class="big">${icon('database', 30)}</div>
      <h2>${connected ? esc(S.info[S.active].db) : t('emptyTitle')}</h2>
      <p>${connected ? t('emptyConnected') : t('emptyText')}</p>
      ${connected ? `<button class="btn primary" id="e-new">${icon('plus', 14)}${t('newQuery')}</button>`
                  : `<button class="btn primary" id="e-add">${icon('plus', 14)}${t('newConnection')}</button>`}</div>`;
    const a = $('#e-add'); if (a) a.onclick = () => editConnection();
    const n = $('#e-new'); if (n) n.onclick = () => newQueryTab();
    return;
  }
  if (tab.type === 'query') renderQuery(pane, tab);
  else if (tab.type === 'design') renderDesignTab(pane, tab);
  else if (tab.type === 'search') renderSearchTab(pane, tab);
  else if (tab.type === 'diagram') renderDiagramTab(pane, tab);
  else renderTable(pane, tab);
}

