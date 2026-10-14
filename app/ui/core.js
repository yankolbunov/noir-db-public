// Noir DB – основа: связь с Python, состояние, уведомления, меню, модальные окна.
// ================= связь с Python =================
// Интерфейс общается с Python через локальный сервер на 127.0.0.1 – это быстрее моста pywebview,
// который гоняет каждый ответ через главный поток macOS. Токен из адреса не даёт обращаться к серверу посторонним.
const URLP = new URLSearchParams(location.search);
const TOKEN = URLP.get('t') || '';
const NATIVE = !!TOKEN;

async function api(method, ...args) {
  let res;
  try {
    const r = await fetch('/api/' + method, { method: 'POST', headers: { 'X-Noir-Token': TOKEN }, body: JSON.stringify(args) });
    res = await r.json();
  } catch (e) { res = { ok: false, error: 'NO_APP' }; }
  if (!res || !res.ok) {
    const raw = res ? res.error : 'ERROR';
    const code = (res && res.code) || raw;
    const key = ERR_KEYS[code] || ERR_KEYS[raw];
    const err = new Error(key ? t(key, res && res.args) : raw);
    err.code = code; err.pos = res && res.pos; err.raw = raw;
    if (res) { err.state = res.state || null; err.hint = res.hint || null; err.detail = res.detail || null; err.args = res.args || {}; }
    throw err;
  }
  return res.data;
}

// коды ошибок из Python → понятный текст
const ERR_KEYS = {
  NOT_CONNECTED: 'notConnected', NO_PK: 'noPk', ONLY_SELECT: 'onlySelect', READ_ONLY: 'errReadOnly',
  TIMEOUT: 'errTimeout', STOPPED: 'queryStopped', TX_ABORTED: 'errTxAborted', TX_OPEN: 'errTxOpen',
  TX_LOST: 'errTxLost', ROW_GONE: 'errRowGone', BAD_TYPE: 'errBadType', NO_COLUMNS: 'errNoColumns',
  NOT_NOIR_ZIP: 'errNotNoirZip', BAD_ZIP: 'errNotNoirZip', NO_MAPPING: 'errNoMapping', NO_WINDOW: 'errNoWindow',
  FK_DELETE: 'errFkDelete', FK_INSERT: 'errFkInsert', UNIQUE: 'errUnique', NOT_NULL: 'errNotNull', CHECK: 'errCheck', BAD_VALUE: 'errBadValue', BAD_DATE: 'errBadDate',
  NO_COLUMN: 'errNoColumn', NO_TABLE: 'errNoTable', SYNTAX: 'errSyntax', SYNTAX_END: 'errSyntaxEnd', NO_FUNCTION: 'errNoFunction',
  GROUP_BY: 'errGroupBy', EXISTS: 'errExists', NO_RIGHTS: 'errNoRights', BAD_PASSWORD: 'errBadPassword', NO_DATABASE: 'errNoDatabase',
  NO_ROLE: 'errNoRole', NO_SERVER: 'errNoServer', NO_HOST: 'errNoHost', CONN_CLOSED: 'errConnClosed', BAD_FILTER: 'errBadFilter', DB_IN_USE: 'errDbInUse', STATS_ONLY_SELECT: 'errStatsOnlySelect', PIVOT_TOO_WIDE: 'errPivotTooWide',
  SAVE_ONLY_SELECT: 'errSaveOnlySelect', NO_ALIAS: 'errNoAlias',
  AMBIGUOUS: 'errAmbiguous', DIV_ZERO: 'errDivZero', MANY_ROWS: 'errManyRows', NO_OPERATOR: 'errNoOperator', UNCLOSED_QUOTE: 'errUnclosedQuote', SUB_ALIAS: 'errSubAlias', DISTINCT_ORDER: 'errDistinctOrder', NO_TABLE_NAME: 'errNoTableName', VIEW_VARS: 'errViewVars',
  SSH_AUTH: 'errSshAuth', SSH_HOSTKEY: 'errSshHostKey', SSH_HOST: 'errSshHost', SSH_CONN: 'errSshConn', SSH_FORWARD: 'errSshForward', SSH_FIELDS: 'errSshFields', SSH_FAIL: 'errSshFail', SSH_TIMEOUT: 'errSshTimeout',
};

// ================= состояние =================
const S = {
  conns: [],
  active: null,         // id выбранного подключения
  info: {},             // conn_id -> {db, usr, ver}
  dbs: {},              // conn_id -> [базы]
  schemas: {},          // conn_id -> [{name, tables, open}]
  filter: '',
  tabs: [],
  tab: null,            // id активной вкладки
  meta: {},             // conn_id -> таблицы и колонки для автодополнения
  settings: {},
  restored: {},         // для каких подключений уже восстановлены черновики
  manual: {},           // conn_id -> ручной режим транзакций в редакторе
  tx: {},               // conn_id -> none | open | error
  saved: [],            // сохранённые запросы
};
let tabSeq = 0, querySeq = 0;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const curTab = () => S.tabs.find(x => x.id === S.tab);
const conn = id => S.conns.find(c => c.id === id);
// сколько строк таблицы показывать на странице: своё число из настроек (10–100 000), по умолчанию 100
const clampRows = (v, def) => { const n = Math.round(+v); return Number.isFinite(n) && n >= 10 ? Math.min(100000, n) : def; };
const pageSizeSetting = () => clampRows(S.settings.pageSize, 100);
const fmtCount = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : String(n);

// ================= оформление: тёмное, светлое или как в системе =================
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(mode) {
  const light = mode === 'light' || (mode === 'auto' && !darkMQ.matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  syncGlass();
  // иконка в Dock под тему (в том числе «Как в системе» – при смене системной темы)
  if (NATIVE && applyTheme.icon !== light) { applyTheme.icon = light; api('set_app_icon', light).catch(() => {}); }
}
// Liquid Glass – в обеих темах: плавающие стеклянные панели на ровном фоне, без лишних цветов
let GLASS = false;
function applyGlass(on) { GLASS = !!on; syncGlass(); }
function syncGlass() {
  const root = document.documentElement;
  root.classList.toggle('glass', GLASS);
}
darkMQ.addEventListener('change', () => { if (S.settings.theme === 'auto') { applyTheme('auto'); rerenderCharts(); } });
// графики рисуются с цветами темы – после смены темы перерисовываем открытый
function rerenderCharts() { const tab = curTab(); if (tab && tab.type === 'query' && tab.resView === 'chart') renderQueryResult(tab); }

// ================= уведомления =================
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = icon(kind === 'err' ? 'alert' : 'check', 15) + `<span>${esc(msg)}</span>`;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 2600);
}

// ================= меню =================
function closeMenu() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
function openMenu(x, y, items) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  items.forEach(it => {
    if (it === '-') { m.insertAdjacentHTML('beforeend', '<div class="sep"></div>'); return; }
    if (it.head) { m.insertAdjacentHTML('beforeend', `<div class="mh">${esc(it.head)}</div>`); return; }
    const el = document.createElement('div');
    el.className = 'it' + (it.red ? ' red' : '') + (it.hint ? ' two' : '');
    el.innerHTML = icon(it.icon, 15) + (it.hint ? `<span class="tl"><span>${esc(it.label)}</span><i>${esc(it.hint)}</i></span>` : `<span>${esc(it.label)}</span>`)
      + (it.kbd ? `<span class="mk">${esc(it.kbd)}</span>` : '');
    el.onclick = () => { closeMenu(); it.action(); };
    m.appendChild(el);
  });
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
document.addEventListener('mousedown', e => { if (!e.target.closest('.menu')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('resize', () => closeMenu());

// ================= всплывающее окошко у кнопки (фильтр, статистика) =================
// anchor – элемент, под которым показать. Закрывается кликом мимо и Esc. Возвращает сам элемент.
function closePop() { document.querySelectorAll('.pop').forEach(p => { p.remove(); if (p._onClose) p._onClose(); }); }
function openPop(anchor, html, cls = '') {
  closePop(); closeMenu();
  const p = document.createElement('div');
  p.className = 'pop ' + cls;
  p.innerHTML = html;
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect(), pr = p.getBoundingClientRect();
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - pr.width - 8)) + 'px';
  const below = r.bottom + 6;
  p.style.top = (below + pr.height > innerHeight - 8 ? Math.max(8, r.top - pr.height - 6) : below) + 'px';
  return p;
}
document.addEventListener('mousedown', e => { if (!e.target.closest('.pop, .menu')) closePop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.pop')) { e.stopPropagation(); closePop(); } }, true);
window.addEventListener('resize', () => closePop());

// ================= модальные окна =================
function modal({ title, tile = 'database', red = false, body, buttons, cls = '' }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay ' + cls;
    ov.innerHTML = `<div class="modal">
      <div class="modal-h"><div class="tile ${red ? 'red' : ''}">${icon(tile, 18)}</div><h3>${esc(title)}</h3></div>
      <div class="modal-b">${body}</div>
      <div class="modal-f"><div class="grow"></div></div></div>`;
    const foot = $('.modal-f', ov);
    const close = val => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    buttons.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || '');
      btn.textContent = b.label;
      if (b.left) foot.insertBefore(btn, foot.firstChild); else foot.appendChild(btn);
      btn.onclick = async () => {
        if (b.onClick) { const r = await b.onClick(ov, btn); if (r === false) return; }
        close(b.value);
      };
      b.el = btn;
    });
    const onKey = e => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !e.target.matches('textarea')) {
        const main = buttons.find(b => b.main);
        if (main && !main.el.disabled) { e.preventDefault(); main.el.click(); }
      }
    };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    document.body.appendChild(ov);
    const first = $('input', ov);
    if (first) first.focus();
    if (buttons.onMount) buttons.onMount(ov);
  });
}

// «Сохранить / Не сохранять / Отмена» – возвращает 'save', 'discard' или null
function askSave(title, text) {
  return modal({
    title, tile: 'alert', body: `<p>${esc(text)}</p>`,
    buttons: [
      { label: t('cancel'), value: null, left: true, cls: 'ghost' },
      { label: t('dontSave'), value: 'discard', cls: 'danger-soft' },
      { label: t('save'), value: 'save', cls: 'primary', main: true },
    ],
  });
}

function confirmDanger(title, text, okLabel, typeToConfirm) {
  const body = `<p>${esc(text)}</p>` + (typeToConfirm
    ? `<input class="input" id="cf-name" placeholder="${esc(typeToConfirm)}" autocomplete="off" spellcheck="false">` : '');
  const buttons = [
    { label: t('cancel'), value: false },
    { label: okLabel, value: true, cls: 'danger', main: true },
  ];
  const p = modal({ title, tile: 'trash', red: true, body, buttons });
  if (typeToConfirm) {
    const ok = buttons[1].el;
    ok.disabled = true;
    $('#cf-name').addEventListener('input', e => { ok.disabled = e.target.value !== typeToConfirm; });
  }
  return p;
}


// простое окно «введите название»
function promptText(title, label, value = '') {
  let out = null;
  return modal({
    title, tile: 'edit',
    body: `<div class="field"><label>${esc(label)}</label><input class="input" id="f-prompt" value="${esc(value)}" spellcheck="false" autocomplete="off"></div>`,
    buttons: [
      { label: t('cancel'), value: null },
      { label: t('save'), cls: 'primary', main: true, onClick: ov => { out = $('#f-prompt', ov).value.trim(); if (!out) return false; } },
    ],
  }).then(() => out);
}
