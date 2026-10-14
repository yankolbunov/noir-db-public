// Схема базы картинкой: таблицы – карточки с полями, связи – линии от колонки-ссылки к ключу.
// Карточки двигаются, есть масштаб, позиции запоминаются в настройках. Без внешних библиотек.

const DG = { W: 220, HEAD: 34, ROW: 22, MAX: 16, GAP_X: 110, GAP_Y: 34 };

function openDiagram(cid, schema) {
  if (!cid || !S.info[cid]) return;
  let tab = S.tabs.find(x => x.type === 'diagram' && x.conn === cid && x.schema === schema);
  if (!tab) {
    tab = { id: ++tabSeq, type: 'diagram', conn: cid, schema, data: null, zoom: 1, panX: 24, panY: 24 };
    S.tabs.push(tab);
  }
  S.tab = tab.id;
  renderTabs(); renderPane();
}

const dgKey = tab => `${tab.conn}|${S.info[tab.conn] ? S.info[tab.conn].db : ''}|${tab.schema}`;
const dgRows = tb => Math.min(tb.columns.length, DG.MAX) + (tb.columns.length > DG.MAX ? 1 : 0);
const dgH = tb => DG.HEAD + dgRows(tb) * DG.ROW + 8;

async function renderDiagramTab(pane, tab) {
  pane.innerHTML = `<div class="dg" id="dg"><div class="dg-world" id="dg-world"><svg class="dg-lines" id="dg-lines"></svg></div>
    <div class="dg-ctl"><button class="btn ghost icon" id="dg-out" title="${t('dgZoomOut')}">${icon('minus', 14)}</button>
      <button class="btn ghost sm" id="dg-fit" title="${t('dgFit')}"></button>
      <button class="btn ghost icon" id="dg-in" title="${t('dgZoomIn')}">${icon('plus', 14)}</button>
      <span class="dg-sep"></span><button class="btn ghost sm" id="dg-auto">${t('dgArrange')}</button>
      <button class="btn ghost icon" id="dg-reload" title="${t('refresh')}">${icon('refresh', 14)}</button></div></div>`;
  $('#dg-reload').onclick = () => { tab.data = null; renderPane(); };
  if (!tab.data) {
    $('#dg').insertAdjacentHTML('beforeend', `<div class="grid-empty dg-wait"><span class="spin" style="display:inline-block"></span></div>`);
    try { tab.data = await api('schema_diagram', tab.conn, tab.schema); }
    catch (e) { toast(e.message, 'err'); return; }
    if (curTab() !== tab) return;
    const w = $('.dg-wait'); if (w) w.remove();
    const saved = ((S.settings.diagrams || {})[dgKey(tab)]) || {};
    tab.pos = {};
    tab.data.tables.forEach(tb => { if (saved[tb.name]) tab.pos[tb.name] = { x: saved[tb.name][0], y: saved[tb.name][1] }; });
    if (tab.data.tables.some(tb => !tab.pos[tb.name])) dgLayout(tab, Object.keys(tab.pos).length > 0);
  }
  if (!tab.data.tables.length) { $('#dg').insertAdjacentHTML('beforeend', `<div class="grid-empty dg-wait">${t('dgEmpty')}</div>`); return; }
  dgDraw(tab);
}

// Автораскладка: таблицы, на которые ссылаются, – левее; кто ссылается – правее. Внутри колонки – ближе к связанным.
function dgLayout(tab, keepPlaced) {
  const { tables, fks } = tab.data;
  const refs = {};
  tables.forEach(tb => { refs[tb.name] = new Set(); });
  fks.forEach(f => { if (f.src !== f.ref && refs[f.src]) refs[f.src].add(f.ref); });
  const level = {}, busy = new Set();
  const lv = n => {
    if (level[n] != null) return level[n];
    if (busy.has(n)) return 0;             // кольцо связей – не уходим в бесконечность
    busy.add(n);
    let m = 0;
    refs[n].forEach(r => { if (refs[r]) m = Math.max(m, lv(r) + 1); });
    busy.delete(n);
    return (level[n] = m);
  };
  const linked = new Set();
  fks.forEach(f => { if (f.src !== f.ref) { linked.add(f.src); linked.add(f.ref); } });
  const cols = [];
  tables.filter(tb => linked.has(tb.name)).forEach(tb => { (cols[lv(tb.name)] = cols[lv(tb.name)] || []).push(tb); });
  const lonely = tables.filter(tb => !linked.has(tb.name));
  const order = {};
  // два прохода: в каждой колонке – по среднему месту соседей слева
  for (let pass = 0; pass < 2; pass++) {
    cols.forEach((list, ci) => {
      if (!list) return;
      if (ci > 0 || pass > 0) list.sort((a, b) => dgBary(tab, a, order) - dgBary(tab, b, order));
      list.forEach((tb, i) => { order[tb.name] = i; });
    });
  }
  const placed = keepPlaced ? new Set(Object.keys(tab.pos)) : new Set();
  if (!keepPlaced) tab.pos = {};
  let x = 0;
  cols.forEach(list => {
    if (!list) return;
    let y = 0;
    list.forEach(tb => { if (!placed.has(tb.name)) tab.pos[tb.name] = { x, y }; y += dgH(tb) + DG.GAP_Y; });
    x += DG.W + DG.GAP_X;
  });
  // таблицы без связей – сеткой справа
  const per = Math.max(1, Math.ceil(Math.sqrt(lonely.length)));
  let y = 0, row = 0;
  lonely.forEach((tb, i) => {
    const cx = x + Math.floor(i / per) * (DG.W + 40);
    if (i % per === 0) { y = 0; row = 0; }
    if (!placed.has(tb.name)) tab.pos[tb.name] = { x: cx, y };
    y += dgH(tb) + DG.GAP_Y; row++;
  });
}

function dgBary(tab, tb, order) {
  const ns = tab.data.fks.filter(f => f.src !== f.ref && (f.src === tb.name || f.ref === tb.name)).map(f => (f.src === tb.name ? f.ref : f.src));
  const vals = ns.map(n => order[n]).filter(v => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 999;
}

function dgDraw(tab) {
  const world = $('#dg-world');
  if (!world) return;
  const fkCols = new Set(tab.data.fks.map(f => f.src + '.' + f.columns[0]));
  world.querySelectorAll('.dg-card').forEach(c => c.remove());
  tab.data.tables.forEach(tb => {
    const p = tab.pos[tb.name];
    const rows = tb.columns.slice(0, DG.MAX).map(c => `<div class="dg-row" data-col="${esc(c.name)}">
      <span class="dg-ic">${c.pk ? icon('key', 11) : fkCols.has(tb.name + '.' + c.name) ? icon('link', 11) : ''}</span>
      <span class="dg-cn ${c.pk ? 'pk' : fkCols.has(tb.name + '.' + c.name) ? 'fk' : ''}">${esc(c.name)}</span><span class="dg-ty">${esc(shortType(c.type))}</span></div>`).join('')
      + (tb.columns.length > DG.MAX ? `<div class="dg-row dg-more">${t('dgMore', { n: tb.columns.length - DG.MAX })}</div>` : '');
    world.insertAdjacentHTML('beforeend', `<div class="dg-card" data-t="${esc(tb.name)}" style="left:${p.x}px;top:${p.y}px;width:${DG.W}px">
      <div class="dg-head" title="${esc(t('dgOpenHint'))}">${icon('table', 14)}<span>${esc(tb.name)}</span></div>${rows}</div>`);
  });
  dgApply(tab);
  dgLines(tab);
  dgBind(tab);
}

function dgApply(tab) {
  const world = $('#dg-world'), fit = $('#dg-fit');
  if (world) world.style.transform = `translate(${tab.panX}px, ${tab.panY}px) scale(${tab.zoom})`;
  if (fit) fit.textContent = Math.round(tab.zoom * 100) + '%';
}

// точка на краю карточки напротив колонки (side: 1 – справа, -1 – слева)
function dgAnchor(tab, table, col, side) {
  const tb = tab.data.tables.find(x => x.name === table), p = tab.pos[table];
  let i = tb.columns.findIndex(c => c.name === col);
  if (i < 0 || i >= DG.MAX) i = Math.min(DG.MAX, tb.columns.length);
  return { x: p.x + (side > 0 ? DG.W : 0), y: p.y + DG.HEAD + i * DG.ROW + DG.ROW / 2 + 2 };
}

function dgLines(tab, only) {
  const svg = $('#dg-lines');
  if (!svg) return;
  let maxX = 0, maxY = 0;
  tab.data.tables.forEach(tb => { const p = tab.pos[tb.name]; maxX = Math.max(maxX, p.x + DG.W + 80); maxY = Math.max(maxY, p.y + dgH(tb) + 80); });
  svg.setAttribute('width', maxX); svg.setAttribute('height', maxY);
  svg.innerHTML = tab.data.fks.map((f, i) => {
    let d;
    if (f.src === f.ref) {              // ссылка на саму себя – петля справа
      const a = dgAnchor(tab, f.src, f.columns[0], 1), b = dgAnchor(tab, f.ref, f.ref_columns[0], 1);
      d = `M${a.x},${a.y} C${a.x + 46},${a.y} ${b.x + 46},${b.y} ${b.x},${b.y}`;
    } else {
      const ps = tab.pos[f.src], pr = tab.pos[f.ref];
      const right = ps.x + DG.W / 2 < pr.x + DG.W / 2;
      const a = dgAnchor(tab, f.src, f.columns[0], right ? 1 : -1), b = dgAnchor(tab, f.ref, f.ref_columns[0], right ? -1 : 1);
      const k = Math.max(40, Math.abs(b.x - a.x) / 2) * (right ? 1 : -1);
      d = `M${a.x},${a.y} C${a.x + k},${a.y} ${b.x - k},${b.y} ${b.x},${b.y}`;
    }
    const tip = f.src === f.ref ? t('dgSelfTip', { t: f.src, c: f.columns.join(', '), r: f.ref_columns.join(', ') })
      : `${f.src}.${f.columns.join(', ')} → ${f.ref}.${f.ref_columns.join(', ')}`;
    return `<g class="dg-link" data-fk="${i}" data-a="${esc(f.src)}" data-b="${esc(f.ref)}"><title>${esc(tip)}</title><path d="${d}" class="dg-hit"/><path d="${d}" class="dg-path"/></g>`;
  }).join('');
}

function dgSave(tab) {
  clearTimeout(tab._saveT);
  tab._saveT = setTimeout(() => {
    const all = { ...(S.settings.diagrams || {}) };
    all[dgKey(tab)] = Object.fromEntries(Object.entries(tab.pos).map(([k, p]) => [k, [Math.round(p.x), Math.round(p.y)]]));
    S.settings.diagrams = all;
    api('save_settings', { diagrams: all }).catch(() => {});
  }, 500);
}

function dgBind(tab) {
  const box = $('#dg'), world = $('#dg-world');
  const setZoom = (z, cx, cy) => {
    z = Math.max(0.3, Math.min(2, z));
    const r = box.getBoundingClientRect();
    cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
    tab.panX = cx - (cx - tab.panX) * z / tab.zoom;
    tab.panY = cy - (cy - tab.panY) * z / tab.zoom;
    tab.zoom = z;
    dgApply(tab);
  };
  $('#dg-in').onclick = () => setZoom(tab.zoom * 1.2);
  $('#dg-out').onclick = () => setZoom(tab.zoom / 1.2);
  $('#dg-fit').onclick = () => { tab.zoom = 1; tab.panX = 24; tab.panY = 24; dgApply(tab); };
  $('#dg-auto').onclick = () => { dgLayout(tab, false); tab.panX = 24; tab.panY = 24; dgDraw(tab); dgSave(tab); };
  // ⌘ + колесо или щипок на трекпаде – масштаб; просто колесо – прокрутка схемы
  box.onwheel = e => {
    e.preventDefault();
    const r = box.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) setZoom(tab.zoom * Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top);
    else { tab.panX -= e.deltaX; tab.panY -= e.deltaY; dgApply(tab); }
  };
  // перетаскивание: карточка – за заголовок, схема целиком – за пустое место
  box.onmousedown = e => {
    if (e.button !== 0 || e.target.closest('.dg-ctl, .pop')) return;
    const card = e.target.closest('.dg-card');
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    if (card) {
      const name = card.dataset.t, p = tab.pos[name], px = p.x, py = p.y;
      world.appendChild(card);         // поверх остальных
      const mv = ev => {
        const dx = (ev.clientX - x0) / tab.zoom, dy = (ev.clientY - y0) / tab.zoom;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        p.x = px + dx; p.y = py + dy;
        card.style.left = p.x + 'px'; card.style.top = p.y + 'px';
        dgLines(tab);
      };
      const up = () => {
        removeEventListener('mousemove', mv); removeEventListener('mouseup', up);
        if (moved) dgSave(tab);
        else if (e.target.closest('.dg-head')) openTable(tab.conn, tab.schema, name, 'table');   // клик без движения – открыть таблицу
      };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
      e.preventDefault();
      return;
    }
    if (e.target.closest('.dg-link')) return;
    const px = tab.panX, py = tab.panY;
    box.classList.add('panning');
    const mv = ev => { tab.panX = px + ev.clientX - x0; tab.panY = py + ev.clientY - y0; dgApply(tab); };
    const up = () => { box.classList.remove('panning'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
    e.preventDefault();
  };
  // наведение на карточку подсвечивает её связи
  box.onmouseover = e => {
    const card = e.target.closest('.dg-card');
    const name = card ? card.dataset.t : null;
    box.querySelectorAll('.dg-link').forEach(l => l.classList.toggle('on', !!name && (l.dataset.a === name || l.dataset.b === name)));
  };
  // клик по связи – подсказка, как написать JOIN
  box.onclick = e => {
    const link = e.target.closest('.dg-link');
    if (!link) return;
    dgJoinTip(tab, tab.data.fks[+link.dataset.fk], e);
  };
}

function dgAlias(name, taken) {
  let a = name.split('_').map(w => w[0]).join('').toLowerCase() || 't';
  if (KW.has(a)) a += '1';
  let r = a, i = 2;
  while (taken.includes(r)) r = a + i++;
  return r;
}

function dgJoinTip(tab, f, e) {
  const q = n => quoteId(n);
  const self = f.src === f.ref;
  // ссылка на саму себя: второй экземпляр таблицы называем по колонке (manager_id → manager, parent_id → parent)
  const a = dgAlias(f.src, []);
  let b = self ? f.columns[0].replace(/_id$/i, '').toLowerCase() : dgAlias(f.ref, [a]);
  if (self && (!/^[a-z_][a-z0-9_]*$/.test(b) || KW.has(b) || b === a)) b = dgAlias(f.ref + '_ref', [a]);
  const on = f.columns.map((c, i) => `${b}.${q(f.ref_columns[i])} = ${a}.${q(c)}`).join(' AND ');
  const join = `JOIN ${q(f.ref)} ${b} ON ${on}`;
  const full = `SELECT *\nFROM ${q(f.src)} ${a}\n${join}\nLIMIT 100;`;
  const anchor = document.createElement('div');
  Object.assign(anchor.style, { position: 'fixed', left: e.clientX + 'px', top: e.clientY + 'px', width: '1px', height: '1px' });
  document.body.appendChild(anchor);
  const p = openPop(anchor, `<div class="pop-h">${esc(f.src)}.${esc(f.columns.join(', '))} → <b>${esc(f.ref)}.${esc(f.ref_columns.join(', '))}</b></div>
    ${self ? `<p class="dg-note">${esc(t('dgSelfNote', { t: f.src, c: f.columns.join(', '), r: f.ref_columns.join(', ') }))}</p>` : ''}
    <pre class="code dg-code">${highlight(full).trim()}</pre>
    <div class="pop-f"><button class="btn ghost" id="dg-copy">${icon('copy', 13)}${t('dgCopyJoin')}</button><div class="grow"></div>
      <button class="btn primary" id="dg-ed">${icon('sql', 13)}${t('dzToEditor')}</button></div>`, 'wide');
  anchor.remove();
  $('#dg-copy', p).onclick = () => copyText(join).then(ok => { if (ok) { toast(t('copied')); closePop(); } });
  $('#dg-ed', p).onclick = () => { closePop(); newQueryTab(full); };
}
