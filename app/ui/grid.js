// Таблица с данными: ширина столбцов, порционная отрисовка, выбор и копирование.
// ================= таблица результатов =================
const CHUNK = 200;            // сколько строк дорисовывать за раз при прокрутке
const isNumType = ty => /^(int|smallint|bigint|integer|numeric|decimal|real|double|float|money|oid|serial)/i.test(ty || '');
const isIdName = n => /(^|_)id$/i.test(n);

// ширина текста – через canvas, без перерисовки страницы
const _cv = document.createElement('canvas').getContext('2d');
function textW(s, weight = 400, size = 12.5) {
  _cv.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`;
  return _cv.measureText(s).width;
}

// 12644599.5 → 12 644 599.5 (только для показа; копируется и выгружается исходное значение)
function fmtNum(s) {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
  if (!m) return s;
  return m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (m[3] ? (LANG === 'ru' ? ',' + m[3].slice(1) : m[3]) : '');
}

function colMeta(columns, rows) {
  return columns.map((c, i) => {
    let num = isNumType(c.type);
    if (!c.type) {
      const sample = rows.slice(0, 200).map(r => r[i]).filter(v => v !== null && v !== undefined);
      num = sample.length > 0 && sample.every(v => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)));
    }
    return { num, group: num && !isIdName(c.name) };
  });
}

function shown(v, meta) {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v);
  return meta.group ? fmtNum(s) : s;
}

// отступы ячейки берём из стилей: поменяли отступы в CSS – ширина подстроится сама, текст не обрежется
let _cellPad = null;
function cellPad() {
  if (_cellPad === null) {
    const t = document.createElement('table'); t.className = 'grid'; t.style.cssText = 'position:absolute;visibility:hidden';
    t.innerHTML = '<thead><tr><th>x</th></tr></thead><tbody><tr><td>x</td></tr></tbody>';
    document.body.appendChild(t);
    const p = el => { const cs = getComputedStyle(el); return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); };
    _cellPad = { td: p(t.querySelector('td')), th: p(t.querySelector('th')) };
    t.remove();
  }
  return _cellPad;
}

function autoWidth(col, rows, i, meta, max) {
  const pad = cellPad();
  // заголовок: имя, тип, ключ и место под кнопки «⌄» и воронку, которые появляются при наведении
  let w = textW(col.name, 500) + pad.th + 10 + (col.pk ? 18 : 0);
  if (col.type) w += textW(tyWord(col.type), 400, 11) + 8;
  // по центру и по правому краю у заголовка отступ под кнопки «⌄» и воронку (styles.css: .grid th.al-c/.al-r .th), у сортировки – стрелка
  if (meta && (meta.align === 'c' || meta.align === 'r')) w += 26;
  if (meta && meta.sorted) w += 18;
  const n = Math.min(rows.length, 300);
  for (let r = 0; r < n; r++) {
    const v = rows[r][i];
    // NULL показывается курсивом – чуть шире
    const tw = v === null || v === undefined ? textW('NULL', 400) * 1.06 : textW(shown(v, meta));
    w = Math.max(w, tw + pad.td + 6);
  }
  return Math.round(Math.max(64, Math.min(max, w)));
}

// короткое понятное название типа для заголовка колонки; точный тип – во всплывающей подсказке
function tyWord(ty) {
  const s = (ty || '').toLowerCase();
  const k = /^(smallint|integer|bigint|int\d?|numeric|decimal|real|double precision|money)\b/.test(s) ? 'num'
    : /^(text|character|varchar|char|citext|name)\b/.test(s) ? 'text'
    : /^timestamp/.test(s) ? 'dt' : /^date\b/.test(s) ? 'date' : /^time\b/.test(s) ? 'time'
    : /^boolean\b/.test(s) ? 'bool' : /^jsonb?\b/.test(s) ? 'json' : /^uuid\b/.test(s) ? 'uuid' : '';
  return k ? t('ty_' + k) : shortType(ty);
}
const shortType = ty => (ty || '').replace(/character varying/, 'varchar').replace(/timestamp with time zone/, 'timestamptz')
  .replace(/timestamp without time zone/, 'timestamp').replace(/double precision/, 'float8');

function cellHtml(v, ri, i, meta) {
  const al = meta.align ? ' al-' + meta.align : '';          // выравнивание, выбранное в меню колонки
  if (v === null || v === undefined) return `<td class="null${al}" data-c="${i}">NULL</td>`;
  if (v === true) return `<td class="bool-t${al}" data-c="${i}">true</td>`;
  if (v === false) return `<td class="bool-f${al}" data-c="${i}">false</td>`;
  const s = String(v);
  const txt = meta.fk ? `<span class="fk">${esc(shown(s, meta))}</span>` : esc(shown(s, meta));   // значение-ссылка на другую таблицу
  return `<td class="${meta.num ? 'num' : ''}${al}" data-c="${i}"${s.length > 40 ? ` title="${esc(s.slice(0, 2000))}"` : ''}>${txt}</td>`;
}

// одна строка таблицы; info – состояние несохранённых правок: new (добавлена), gone (удалена), mod (изменённые колонки)
function rowHtml(g, ri) {
  const r = g.rows[ri];
  const info = g.rowInfo ? g.rowInfo(ri) : null;
  const kind = info ? info.kind : '';
  const on = g.sel && g.sel.has(ri);
  let h = `<tr data-r="${ri}" class="${on ? 'sel del' : ''} ${kind}">`;
  if (g.sel) {
    if (kind === 'new') h += `<td class="idx"><span class="undo" data-undo="${ri}" title="${t('undoRow')}">${icon('x', 12)}</span></td>`;
    else if (kind === 'gone') h += `<td class="idx"><span class="undo" data-undo="${ri}" title="${t('restoreRow')}">${icon('refresh', 12)}</span></td>`;
    else h += `<td class="idx"><span class="chk ${on ? 'on red' : ''}" data-pick="${ri}">${on ? icon('check', 10) : ''}</span></td>`;
  }
  for (let i = 0; i < r.length; i++) {
    h += cellOf(g, ri, i, info);
  }
  return h + '</tr>';
}

// одна ячейка с учётом правок: пустая ячейка новой строки – просто пустая (база подставит значение по умолчанию)
function cellOf(g, ri, i, info) {
  const v = g.rows[ri][i];
  let c = info && info.kind === 'new' && v === '' ? `<td data-c="${i}"></td>` : cellHtml(v, ri, i, g.meta[i]);
  if (info && info.mod && info.mod.has(i)) c = c.replace('<td class="', '<td class="mod ');
  return c;
}

function rowsHtml(g, from, to) {
  let h = '';
  for (let ri = from; ri < to; ri++) h += rowHtml(g, ri);
  return h;
}

// перерисовать одну ячейку (после правки) – соседние ячейки не трогаем, чтобы клик по ним не терялся
function redrawCell(wrap, ri, ci) {
  const g = wrap._grid, td = $(`tr[data-r="${ri}"] td[data-c="${ci}"]`, wrap);
  if (!g || !td) return;
  const tmp = document.createElement('tr');
  tmp.innerHTML = cellOf(g, ri, ci, g.rowInfo ? g.rowInfo(ri) : null);
  td.replaceWith(tmp.firstChild);
}

// новая строка сверху без перерисовки всей таблицы: остальные строки только меняют номер
function gridInsertTop(wrap, values) {
  const g = wrap._grid, tbody = $('tbody', wrap);
  if (!g || !tbody) return false;
  g.rows.unshift(values);
  if (g.cur) g.cur.r++;
  for (const tr of tbody.rows) tr.dataset.r = +tr.dataset.r + 1;
  tbody.insertAdjacentHTML('afterbegin', rowHtml(g, 0));
  g.shown++;
  const empty = $('.grid-empty', wrap); if (empty) empty.remove();
  refreshAllBox(wrap);
  return true;
}

// Где поставить курсор при начале правки: место клика в тексте ячейки → позиция в исходном значении.
// В ячейке число может быть показано с пробелами между разрядами – их пропускаем.
function caretFromPoint(td, x, y, raw) {
  let node = null, off = 0;
  if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  if (!node || node.nodeType !== 3 || !td.contains(node)) return raw.length;
  const shownPart = node.textContent.slice(0, off).replace(/\u202f/g, '');
  return Math.min(raw.length, shownPart.length);
}

// Рисует таблицу в контейнер wrap. opts: colW (ширины по имени колонки), sel (Set выбранных строк),
// sort {by, dir}, onSort(col), onPick(), onEdit(r, c).
const GRID_MANUAL = new WeakMap();
const GRID_SIG = new WeakMap();         // colW → для каких данных ширины уже подобраны      // colW → имена колонок, ширину которых задали руками

function mountGrid(wrap, columns, rows, opts) {
  if (!columns.length) { wrap.innerHTML = `<div class="grid-empty">${t('noRows')}</div>`; return; }
  const meta = colMeta(columns, rows);
  if (opts.fkCols) opts.fkCols.forEach(i => { meta[i].fk = true; });
  const colW = opts.colW || {};
  // выравнивание колонок запоминается в настройках: для таблицы – по её имени, для результатов запросов – общее по имени колонки
  const alignKey = opts.alignKey || 'query';
  const aligns = ((S.settings.colAlign || {})[alignKey]) || {};
  columns.forEach((c, i) => { meta[i].align = aligns[c.name] || null; meta[i].sorted = !!(opts.sort && opts.sort.by === c.name); });
  // ширина по содержимому; на новой странице или после сортировки колонка только расширяется под более длинные значения.
  // Колонки, которые подогнали руками, не трогаем.
  const manual = GRID_MANUAL.get(colW) || new Set();
  GRID_MANUAL.set(colW, manual);
  // те же данные (переключение вкладок, перерисовка) – ширины уже посчитаны, measureText по 300 строкам не повторяем
  const sig = [rows.length, rows[0], rows[rows.length - 1], columns.length, meta.map(m => (m.align || '') + (m.sorted ? 's' : '')).join()];
  const prev = GRID_SIG.get(colW);
  if (!prev || prev.some((x, k) => x !== sig[k]) || columns.some(c => !colW[c.name])) {
    columns.forEach((c, i) => {
      if (manual.has(c.name) && colW[c.name]) return;
      colW[c.name] = Math.max(colW[c.name] || 0, autoWidth(c, rows, i, meta[i], 320));
    });
    GRID_SIG.set(colW, sig);
  }
  const widths = columns.map(c => colW[c.name]);
  const g = { columns, rows, meta, sel: opts.sel || null, shown: Math.min(rows.length, CHUNK), cur: null,
    rowInfo: opts.rowInfo || null, alignKey };
  wrap._grid = g;
  const idxW = g.sel ? 38 : 0;
  const total = () => widths.reduce((a, b) => a + b, 0) + idxW;

  let h = `<table class="grid fixed" style="width:${total()}px"><colgroup>${g.sel ? '<col style="width:38px">' : ''}`;
  h += widths.map(w => `<col style="width:${w}px">`).join('') + '</colgroup><thead><tr>';
  if (g.sel) {
    const all = rows.length && g.sel.size === rows.length;
    h += `<th class="idx"><span class="chk ${all ? 'on red' : ''}" data-all>${all ? icon('check', 10) : ''}</span></th>`;
  }
  columns.forEach((c, i) => {
    const sorted = opts.sort && opts.sort.by === c.name;
    const fon = opts.filtered && opts.filtered(c.name);
    h += `<th class="${opts.onSort ? 'sortable' : ''} ${fon ? 'fon' : ''} ${i === columns.length - 1 ? 'lastc' : ''} ${meta[i].align ? 'al-' + meta[i].align : ''}" data-col="${esc(c.name)}"><div class="th">
      ${c.pk ? `<span class="pk">${icon('key', 12)}</span>` : ''}<span class="cn">${esc(c.name)}</span>
      ${c.type ? `<span class="ty" title="${esc(c.type)}">${esc(tyWord(c.type))}</span>` : ''}
      ${sorted ? icon('chevronDown', 12, opts.sort.dir === 'asc' ? 'flip' : '') : ''}
      ${opts.onColMenu ? `<span class="th-m ${opts.onFilter ? 'with-f' : ''}" data-cmenu="${i}" title="${t('colMenu')}">${icon('chevronDown', 12)}</span>` : ''}
      ${opts.onFilter ? `<span class="th-f ${fon ? 'on' : ''}" data-filter="${i}" title="${t('filter')}">${icon('funnel', 12)}</span>` : ''}</div><span class="rz" data-rz="${i}"></span></th>`;
  });
  h += `</tr></thead><tbody>${rowsHtml(g, 0, g.shown)}</tbody></table>`;
  if (!rows.length) h += `<div class="grid-empty">${t('noRows')}${opts.emptyHint ? `<div class="grid-empty-h">${esc(opts.emptyHint)}</div>` : ''}</div>`;
  wrap.innerHTML = h;
  const table = $('table', wrap), tbody = $('tbody', wrap);
  const cols = [...wrap.querySelectorAll('col')].slice(g.sel ? 1 : 0);
  // блок заканчивается сразу после последней колонки: ширина = колонки + рамка + полоса прокрутки (если она есть)
  // сначала все чтения, потом записи – иначе браузер пересчитывает раскладку несколько раз подряд;
  // ручка у края – в следующем кадре, когда раскладка уже готова
  let edgeRaf = 0;
  const fitW = sb => Math.max(total(), rows.length ? 0 : 360) + 2 + sb;   // пустой таблице – место под подсказку
  const fit = () => {
    if (wrap._grid !== g || !table.isConnected) return;
    const border = wrap.clientLeft * 2, th = table.tHead.offsetHeight;
    const sb = wrap.scrollHeight > wrap.clientHeight ? wrap.offsetWidth - wrap.clientWidth - border : 0;
    const w = (fitW(sb) - 2 + border) + 'px', hh = th + 'px';
    if (wrap.style.getPropertyValue('--fit-w') !== w) wrap.style.setProperty('--fit-w', w);
    if (wrap.style.getPropertyValue('--th-h') !== hh) wrap.style.setProperty('--th-h', hh);
    cancelAnimationFrame(edgeRaf);
    edgeRaf = requestAnimationFrame(placeEdge);
  };
  // правый край блока можно тянуть: колонки растягиваются (или сжимаются) пропорционально, двойной клик – обратно по содержимому
  const host = wrap.parentElement;
  let edge = host && host.querySelector(':scope > .grid-edge');
  if (host && !edge) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    edge = document.createElement('div'); edge.className = 'grid-edge'; edge.title = t('gridStretch');
    host.appendChild(edge);
  }
  function placeEdge() {
    if (!edge) return;
    const on = wrap.isConnected && wrap.offsetParent === host && !wrap.classList.contains('chart-box');
    edge.classList.toggle('hidden', !on);
    if (!on) return;
    edge.style.left = (wrap.offsetLeft + wrap.offsetWidth - 5) + 'px';
    edge.style.top = (wrap.offsetTop + 14) + 'px';
    edge.style.height = Math.max(0, wrap.offsetHeight - 28) + 'px';
  }
  if (edge) {
    edge.onmousedown = e => {
      if (wrap._grid !== g) return;
      e.preventDefault();
      const x0 = e.clientX, w0 = widths.slice(), sum0 = w0.reduce((a, b) => a + b, 0) || 1;
      document.body.classList.add('col-resize'); edge.classList.add('on');
      const mv = ev => {
        const k = Math.max(48 * w0.length, sum0 + ev.clientX - x0) / sum0;
        w0.forEach((w, i) => { manual.add(columns[i].name); widths[i] = colW[columns[i].name] = Math.max(48, Math.round(w * k)); cols[i].style.width = widths[i] + 'px'; });
        table.style.width = total() + 'px'; fit();
      };
      const up = () => { document.body.classList.remove('col-resize'); edge.classList.remove('on'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    };
    edge.ondblclick = () => {
      if (wrap._grid !== g) return;
      columns.forEach((c, i) => { manual.delete(c.name); widths[i] = colW[c.name] = autoWidth(c, rows, i, meta[i], 320); cols[i].style.width = widths[i] + 'px'; });
      table.style.width = total() + 'px'; fit();
    };
  }
  // ширина без замеров (ResizeObserver сразу после раскладки поправит на полосу прокрутки) – без лишней раскладки при показе
  wrap.style.setProperty('--fit-w', fitW(0) + 'px');
  if (wrap._ro) wrap._ro.disconnect();
  wrap._ro = new ResizeObserver(fit);
  wrap._ro.observe(wrap);

  // дорисовка строк при прокрутке
  const more = () => {
    if (g.shown < rows.length && wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 600) {
      const to = Math.min(rows.length, g.shown + CHUNK);
      tbody.insertAdjacentHTML('beforeend', rowsHtml(g, g.shown, to));
      g.shown = to;
      if (g.range) paintRange(wrap);
    }
  };
  g.range = null;
  g.onRange = opts.onRange || null;
  g.onEdit = opts.onEdit || null;
  if (g.onRange) g.onRange(null);
  // «пружинка» macOS: при оттягивании за край scrollTop/scrollLeft становятся отрицательными – шапку держим на месте
  let osY = 0, osX = 0;
  wrap.onscroll = () => {
    const y = Math.min(0, wrap.scrollTop), x = Math.min(0, wrap.scrollLeft);
    if (y !== osY) { osY = y; wrap.style.setProperty('--os-y', y + 'px'); }
    if (x !== osX) { osX = x; wrap.style.setProperty('--os-x', x + 'px'); }
    more();
  };
  wrap.scrollTop = 0;
  requestAnimationFrame(more);

  // после смены выравнивания: колонку шире, если заголовку теперь не хватает места (заданные руками не трогаем)
  g.fitCol = i => {
    if (manual.has(columns[i].name)) return;
    const need = autoWidth(columns[i], rows, i, meta[i], 320);
    if (need > widths[i]) setW(i, need);
  };
  const setW = (i, w) => {
    widths[i] = w; colW[columns[i].name] = w;
    cols[i].style.width = w + 'px';
    table.style.width = total() + 'px';
    fit();
  };

  // изменение ширины столбцов: тянуть границу, двойной клик – подогнать по содержимому
  wrap.onmousedown = e => {
    const rz = e.target.closest('.rz');
    if (!rz) return selectStart(e);
    e.preventDefault(); e.stopPropagation();
    const i = +rz.dataset.rz, x0 = e.clientX, w0 = widths[i];
    document.body.classList.add('col-resize');
    const mv = ev => { manual.add(columns[i].name); setW(i, Math.max(48, Math.round(w0 + ev.clientX - x0))); };
    const up = () => {
      document.body.classList.remove('col-resize');
      wrap._resized = true; setTimeout(() => { wrap._resized = false; }, 0);
      removeEventListener('mousemove', mv); removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  };

  // выделение ячеек мышью: потянуть или Shift+клик. Внизу – сумма, среднее и т. п., ⌘C копирует кусок таблицей
  const selectStart = e => {
    const td = e.target.closest('td[data-c]');
    if (e.button !== 0 || !td || td.classList.contains('editing') || e.target.closest('[data-pick], [data-undo]')) return;
    // закончить правку ячейки и убрать фокус из редактора – иначе ⌘C скопирует не ячейки, а текст запроса
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) a.blur();
    e.preventDefault();
    const at = el => { const x = el && el.closest && el.closest('td[data-c]'); return x && wrap.contains(x) && !x.classList.contains('editing') ? { r: +x.parentElement.dataset.r, c: +x.dataset.c } : null; };
    const p = at(td);
    if (!p) return;
    // клик по уже выбранной ячейке – правка (как в Numbers и Excel): решаем на «click», если мышь не тянули
    const R = g.range;
    wrap._editArm = !e.shiftKey && opts.onEdit && R && R.r0 === p.r && R.r1 === p.r && R.c0 === p.c && R.c1 === p.c ? p : null;
    if (e.shiftKey && g.range) { g.range.r1 = p.r; g.range.c1 = p.c; } else g.range = { r0: p.r, c0: p.c, r1: p.r, c1: p.c };
    paintRange(wrap);
    const mv = ev => {
      const q = at(document.elementFromPoint(ev.clientX, ev.clientY));
      if (q && (q.r !== g.range.r1 || q.c !== g.range.c1)) { g.range.r1 = q.r; g.range.c1 = q.c; paintRange(wrap); }
    };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  };

  // все клики – одним обработчиком
  wrap.onclick = e => {
    if (e.target.closest('.rz') || wrap._resized) return;
    const undo = e.target.closest('[data-undo]');
    if (undo) { opts.onUndo && opts.onUndo(+undo.dataset.undo); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick && g.sel) { togglePick(wrap, +pick.dataset.pick); opts.onPick && opts.onPick(); return; }
    if (e.target.closest('[data-all]') && g.sel) {
      const avail = g.rowInfo ? rows.filter((_, i) => !g.rowInfo(i).kind).length : rows.length;
      const allOn = g.sel.size === avail;
      g.sel.clear();
      if (!allOn) rows.forEach((_, i) => { if (!g.rowInfo || !g.rowInfo(i).kind) g.sel.add(i); });
      refreshPicks(wrap); opts.onPick && opts.onPick(); return;
    }
    const cm = e.target.closest('[data-cmenu]');
    if (cm) { colMenu(cm.closest('th'), columns[+cm.dataset.cmenu], +cm.dataset.cmenu, opts.onColMenu); return; }
    const fl = e.target.closest('[data-filter]');
    if (fl) { opts.onFilter(columns[+fl.dataset.filter], fl.closest('th')); return; }
    const th = e.target.closest('th[data-col]');
    if (th) { opts.onSort && opts.onSort(th.dataset.col); return; }
    const td = e.target.closest('td[data-c]');
    const arm = wrap._editArm; wrap._editArm = null;
    if (td && arm && e.detail === 1 && +td.parentElement.dataset.r === arm.r && +td.dataset.c === arm.c && g.range
        && g.range.r0 === arm.r && g.range.r1 === arm.r && g.range.c0 === arm.c && g.range.c1 === arm.c) {
      clearTimeout(wrap._linkT);
      opts.onEdit(arm.r, arm.c, td, { x: e.clientX, y: e.clientY });
      return;
    }
    // клик по ссылке – переход; ждём чуть-чуть, вдруг это двойной клик (правка)
    const fk = e.target.closest('.fk');
    if (fk && td && opts.onLink && e.detail === 1) {
      const at = { r: +td.parentElement.dataset.r, c: +td.dataset.c };
      clearTimeout(wrap._linkT);
      wrap._linkT = setTimeout(() => opts.onLink(at.r, at.c), 260);
    }
  };
  // правый клик по заголовку – то же меню колонки
  wrap.oncontextmenu = e => {
    const tdm = e.target.closest('td[data-c]');
    if (tdm && !tdm.classList.contains('editing')) {
      e.preventDefault();
      const r = +tdm.parentElement.dataset.r, c = +tdm.dataset.c;
      if (opts.onRowMenu) { opts.onRowMenu(r, c, e.clientX, e.clientY); return; }
      // результат запроса: значение в буфер или целиком в окне
      const v = rows[r][c];
      openMenu(e.clientX, e.clientY, [
        { icon: 'copy', label: t('copyValue'), action: () => copyText(v === null || v === undefined ? '' : String(v)).then(ok => ok && toast(t('copied'))) },
        { icon: 'columns', label: t('showValue'), action: () => showValue(columns[c], v) },
      ]);
      return;
    }
    const th = e.target.closest('th[data-col]');
    if (!th || !opts.onColMenu) return;
    e.preventDefault();
    const i = columns.findIndex(c => c.name === th.dataset.col);
    colMenu(th, columns[i], i, opts.onColMenu, e.clientX, e.clientY);
  };
  wrap.ondblclick = e => {
    clearTimeout(wrap._linkT);
    const rz = e.target.closest('.rz');
    if (rz) { const i = +rz.dataset.rz; manual.add(columns[i].name); setW(i, autoWidth(columns[i], rows, i, meta[i], 720)); return; }
    const td = e.target.closest('td[data-c]');
    // двойной клик внутри поля правки – обычное выделение слова, а не новая правка
    if (!td || td.classList.contains('editing')) return;
    // где править нельзя (результат запроса) – двойной клик открывает значение целиком
    if (!opts.onEdit) { const c = +td.dataset.c; showValue(columns[c], rows[+td.parentElement.dataset.r][c]); return; }
    opts.onEdit(+td.parentElement.dataset.r, +td.dataset.c, td, { x: e.clientX, y: e.clientY });
  };
}

// ================= просмотр значения ячейки целиком (длинный текст, JSON) =================
function jsonHtml(v, ind = '') {
  const pad = ind + '  ';
  if (v === null) return '<span class="jv-null">null</span>';
  if (Array.isArray(v)) return v.length ? `[\n${v.map(x => pad + jsonHtml(x, pad)).join(',\n')}\n${ind}]` : '[]';
  if (typeof v === 'object') {
    const ks = Object.keys(v);
    return ks.length ? `{\n${ks.map(k => `${pad}<span class="jv-key">${esc(JSON.stringify(k))}</span>: ${jsonHtml(v[k], pad)}`).join(',\n')}\n${ind}}` : '{}';
  }
  if (typeof v === 'string') return `<span class="jv-str">${esc(JSON.stringify(v))}</span>`;
  if (typeof v === 'number') return `<span class="jv-num">${v}</span>`;
  return `<span class="jv-bool">${v}</span>`;
}
function showValue(col, v) {
  const raw = v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  let json = null;
  if (raw && /^\s*[[{]/.test(raw)) { try { json = JSON.parse(raw); } catch (e) { json = null; } }
  const text = json !== null ? JSON.stringify(json, null, 2) : raw;
  const len = raw === null ? 0 : [...raw].length;
  const info = raw === null ? 'NULL' : `${col.type ? tyWord(col.type) + ' · ' : ''}${t('valChars', { n: len.toLocaleString(LANG) })}${json !== null ? ' · JSON' : ''}`;
  const body = `<div class="val-meta">${esc(info)}</div>
    <pre class="val-box ${raw === null ? 'null' : ''}">${raw === null ? 'NULL' : json !== null ? jsonHtml(json) : esc(raw)}</pre>`;
  return modal({ title: col.name, tile: 'columns', body, cls: 'val-dlg', buttons: [
    { label: t('copyValue'), cls: 'ghost', left: true, value: null, onClick: () => { copyText(text === null ? '' : text).then(ok => ok && toast(t('copied'))); return false; } },
    { label: t('close'), value: null, main: true },
  ] });
}

// ================= выделенный кусок таблицы =================
const normRange = R => ({ ra: Math.min(R.r0, R.r1), rb: Math.max(R.r0, R.r1), ca: Math.min(R.c0, R.c1), cb: Math.max(R.c0, R.c1) });

function paintRange(wrap) {
  const g = wrap._grid;
  wrap.querySelectorAll('td.rsel, td.cur').forEach(x => x.classList.remove('rsel', 'cur'));
  if (!g || !g.range) return;
  const { ra, rb, ca, cb } = normRange(g.range);
  g.cur = { r: g.range.r0, c: g.range.c0 };
  const multi = ra !== rb || ca !== cb;
  for (const tr of $('tbody', wrap).rows) {
    const r = +tr.dataset.r;
    if (r < ra || r > rb) continue;
    for (let c = ca; c <= cb; c++) {
      const td = tr.querySelector(`td[data-c="${c}"]`);
      if (td) td.classList.add(multi ? 'rsel' : 'cur');
    }
  }
  if (g.onRange) g.onRange(multi ? rangeStats(g) : null);
}

// сумма, среднее, минимум, максимум и количество по выделенным ячейкам
function rangeStats(g) {
  const { ra, rb, ca, cb } = normRange(g.range);
  let count = 0, n = 0, sum = 0, min = Infinity, max = -Infinity;
  for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) {
    const v = g.rows[r] && g.rows[r][c];
    if (v === null || v === undefined || v === '') continue;
    count++;
    if (typeof v === 'boolean' || !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(String(v).trim())) continue;
    const x = Number(v);
    n++; sum += x; min = Math.min(min, x); max = Math.max(max, x);
  }
  return { count, n, sum, avg: n ? sum / n : null, min: n ? min : null, max: n ? max : null };
}

function rangeText(s) {
  if (!s) return '';
  const f = v => fmtNum(String(+v.toFixed(2)));
  return (s.n ? `${t('selSum')} ${f(s.sum)} · ${t('selAvg')} ${f(s.avg)} · ${t('selMin')} ${f(s.min)} · ${t('selMax')} ${f(s.max)} · ` : '') + `${t('selCount')} ${s.count}`;
}

// кусок таблицы в буфер: текстом с табуляцией (Excel, Numbers, Google Таблицы вставляют по ячейкам)
// и HTML-таблицей с рамками (Заметки, Pages, Word, Почта показывают колонки и границы)
function rangeRows(g) {
  const { ra, rb, ca, cb } = normRange(g.range);
  const out = [];
  for (let r = ra; r <= rb; r++) out.push(g.rows[r].slice(ca, cb + 1));
  return { head: g.columns.slice(ca, cb + 1).map(c => c.name), rows: out };
}

const clipCell = v => (v === null || v === undefined ? '' : String(v).replace(/[\t\n\r]+/g, ' '));
function clipHtml(head, rows) {
  const bd = 'border:1px solid #c7c7cc;padding:4px 8px;';
  const isNum = v => typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v));
  const td = v => `<td style="${bd}${isNum(v) ? 'text-align:right;' : ''}">${esc(clipCell(v))}</td>`;
  return '<meta charset="utf-8"><table style="border-collapse:collapse;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12px">'
    + (head ? `<thead><tr>${head.map(h => `<th style="${bd}background:#f2f2f7;font-weight:600;text-align:left">${esc(h)}</th>`).join('')}</tr></thead>` : '')
    + `<tbody>${rows.map(r => `<tr>${r.map(td).join('')}</tr>`).join('')}</tbody></table>`;
}
// обычный текст для мессенджеров (Telegram, WhatsApp, Slack): колонки выровнены пробелами в блоке ``` –
// там он показывается моноширинным шрифтом. Excel, Numbers и Google Таблицы берут HTML-версию и вставляют по ячейкам.
function clipText(head, rows) {
  const all = [...(head ? [head] : []), ...rows].map(r => r.map(clipCell));
  if (!all.length) return '';
  if (all.length === 1 && all[0].length === 1) return all[0][0];
  const n = Math.max(...all.map(r => r.length));
  const w = Array.from({ length: n }, (_, i) => Math.max(...all.map(r => [...(r[i] || '')].length)));
  const num = Array.from({ length: n }, (_, i) => rows.length && rows.every(r => r[i] === null || r[i] === undefined || /^-?\d+(\.\d+)?$/.test(String(r[i]))));
  const pad = (v, i) => { const k = w[i] - [...v].length; return num[i] ? ' '.repeat(k) + v : v + ' '.repeat(k); };
  const line = r => Array.from({ length: n }, (_, i) => pad(r[i] || '', i)).join('  ').replace(/\s+$/, '');
  const out = all.map(line);
  if (head) out.splice(1, 0, w.map(x => '─'.repeat(x)).join('  '));
  return '```\n' + out.join('\n') + '\n```';
}
async function copyRows(head, rows) {
  const tsv = clipText(head, rows);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([tsv], { type: 'text/plain' }), 'text/html': new Blob([clipHtml(head, rows)], { type: 'text/html' }) })]);
    return true;
  } catch (e) {
    // запасной путь: системное копирование с обеими версиями через событие copy
    const html = clipHtml(head, rows);
    const on = ev => { ev.clipboardData.setData('text/plain', tsv); ev.clipboardData.setData('text/html', html); ev.preventDefault(); };
    document.addEventListener('copy', on, { once: true });
    const ok = document.execCommand('copy');
    document.removeEventListener('copy', on);
    return ok || copyText(tsv);
  }
}

// вся таблица в буфер – с названиями колонок
function copyTable(columns, rows) { return copyRows(columns.map(c => c.name), rows); }

// меню колонки: статистика, выравнивание и имя в буфер обмена
function colMenu(th, col, i, onColMenu, x, y) {
  const r = th.getBoundingClientRect();
  const wrap = th.closest('.grid-wrap'), g = wrap && wrap._grid;
  const cur = g ? g.meta[i].align : null;
  const al = (v, ic, key) => ({ icon: ic, label: t(key), kbd: cur === v ? '✓' : '', action: () => setColAlign(wrap, i, v) });
  openMenu(x ?? r.left, y ?? r.bottom + 4, [
    { icon: 'chart', label: t('colStats'), action: () => onColMenu('stats', col, i, th) },
    '-',
    ...(g ? [al(null, 'alignL', 'alAuto'), al('l', 'alignL', 'alLeft'), al('c', 'alignC', 'alCenter'), al('r', 'alignR', 'alRight'), '-'] : []),
    { icon: 'copy', label: t('copyColName'), action: () => copyText(col.name).then(ok => ok && toast(t('copied'))) },
  ]);
}

// выравнивание колонки: меняем классы у уже нарисованных ячеек и запоминаем в настройках
function setColAlign(wrap, i, v) {
  const g = wrap._grid, name = g.columns[i].name;
  g.meta[i].align = v;
  const all = { ...(S.settings.colAlign || {}) };
  const m = { ...(all[g.alignKey] || {}) };
  if (v) m[name] = v; else delete m[name];
  all[g.alignKey] = m;
  S.settings.colAlign = all;
  api('save_settings', { colAlign: all }).catch(() => {});
  const set = el => { el.classList.remove('al-l', 'al-c', 'al-r'); if (v) el.classList.add('al-' + v); };
  wrap.querySelectorAll(`td[data-c="${i}"]`).forEach(set);
  const th = wrap.querySelectorAll('thead th:not(.idx)')[i];
  if (th) set(th);
  if (g.fitCol) g.fitCol(i);
}

// ================= статистика колонки =================
async function showStats(anchor, cid, source, colArg, colName) {
  const p = openPop(anchor, `<div class="pop-h">${t('colStats')} · <b>${esc(colName)}</b></div><div class="st-load"><span class="spin"></span></div>`, 'stats');
  let s;
  try { s = await api('column_stats', cid, source, colArg); }
  catch (e) { if (p.isConnected) $('.st-load', p).outerHTML = `<div class="hint err">${esc(e.message)}</div>`; return; }
  if (!p.isConnected) return;
  const n = v => (v === null || v === undefined ? '–' : fmtNum(String(v)));
  const avg = v => (v === null || v === undefined ? '–' : fmtNum(String(+Number(v).toFixed(2))));
  const pct = s.total ? ` <i>${Math.round(s.nulls / s.total * 1000) / 10}%</i>` : '';
  const rows = [[t('stRows'), n(s.total)], [t('stNulls'), n(s.nulls) + pct], [t('stDistinct'), n(s.distinct)]];
  if (s.kind === 'num') rows.push([t('stMin'), n(s.min)], [t('stMax'), n(s.max)], [t('stAvg'), avg(s.avg)], [t('stMedian'), avg(s.median)]);
  if (s.kind === 'date') rows.push([t('stFirst'), esc(s.min ?? '–')], [t('stLast'), esc(s.max ?? '–')]);
  let html = `<div class="st-grid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
  if (s.hist) html += histSvg(s.hist, s.histEpoch);
  else if (s.top && s.top.length) {
    const max = Math.max(...s.top.map(x => x.n));
    html += `<div class="st-top-h">${t('stTop')}</div><div class="st-top">${s.top.map(x => `<div class="st-tr" title="${esc(x.v ?? 'NULL')}">
      <span class="st-bar" style="width:${Math.max(2, x.n / max * 100)}%"></span><span class="st-v ${x.v === null ? 'null' : ''}">${esc(x.v ?? 'NULL')}</span><span class="st-n">${n(x.n)}</span></div>`).join('')}</div>`;
  }
  $('.st-load', p).outerHTML = html;
  // окошко выросло – возвращаем его в пределы окна
  const pr = p.getBoundingClientRect();
  if (pr.bottom > innerHeight - 8) p.style.top = Math.max(8, innerHeight - pr.height - 8) + 'px';
}

function histSvg(hist, epoch) {
  const W = 276, H = 64, max = Math.max(...hist.map(b => b.n)) || 1, bw = W / hist.length;
  const lab = v => (epoch ? new Date(v * 1000).toISOString().slice(0, 10) : fmtNum(String(+v.toFixed(2))));
  return `<div class="st-top-h">${t('stHist')}</div><svg class="st-hist" width="${W}" height="${H + 16}" viewBox="0 0 ${W} ${H + 16}">
    ${hist.map((b, i) => { const h = b.n ? Math.max(2, b.n / max * H) : 0;
      return `<rect x="${i * bw + 1}" y="${H - h}" width="${bw - 2}" height="${h}" rx="1.5"><title>${esc(lab(b.lo))} – ${esc(lab(b.hi))}: ${b.n}</title></rect>`; }).join('')}
    <text x="0" y="${H + 13}">${esc(lab(hist[0].lo))}</text><text x="${W}" y="${H + 13}" text-anchor="end">${esc(lab(hist[hist.length - 1].hi))}</text></svg>`;
}

function togglePick(wrap, ri) {
  const g = wrap._grid;
  g.sel.has(ri) ? g.sel.delete(ri) : g.sel.add(ri);
  const tr = $(`tr[data-r="${ri}"]`, wrap);
  if (tr) {
    const on = g.sel.has(ri);
    tr.classList.toggle('sel', on); tr.classList.toggle('del', on);
    const chk = $('.chk', tr);
    chk.classList.toggle('on', on); chk.classList.toggle('red', on);
    chk.innerHTML = on ? icon('check', 10) : '';
  }
  refreshAllBox(wrap);
}

function refreshPicks(wrap) {
  const g = wrap._grid;
  wrap.querySelectorAll('tbody tr[data-r]').forEach(tr => {
    const on = g.sel.has(+tr.dataset.r);
    tr.classList.toggle('sel', on); tr.classList.toggle('del', on);
    const chk = $('.chk', tr);
    if (!chk) return;
    chk.classList.toggle('on', on); chk.classList.toggle('red', on);
    chk.innerHTML = on ? icon('check', 10) : '';
  });
  refreshAllBox(wrap);
}

function refreshAllBox(wrap) {
  const g = wrap._grid, box = $('[data-all]', wrap);
  if (!box) return;
  const avail = g.rowInfo ? g.rows.filter((_, i) => !g.rowInfo(i).kind).length : g.rows.length;
  const all = avail && g.sel.size === avail;
  box.classList.toggle('on', !!all); box.classList.toggle('red', !!all);
  box.innerHTML = all ? icon('check', 10) : '';
}

// ⌘C на выбранной ячейке копирует её значение
async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'c') return;
  if (e.target.closest('input, textarea') || String(window.getSelection())) return;
  const wrap = document.querySelector('#tgrid, #qgrid');
  const g = wrap && wrap._grid;
  if (!g || !g.cur) return;
  e.preventDefault();
  if (g.range) { const { ra, rb, ca, cb } = normRange(g.range); if (ra !== rb || ca !== cb) { { const x = rangeRows(g); copyRows(null, x.rows).then(ok => ok && toast(t('copied'))); } return; } }
  const v = g.rows[g.cur.r][g.cur.c];
  copyText(v === null || v === undefined ? '' : String(v)).then(ok => ok && toast(t('copied')));
});

// выбранная ячейка таблицы: Enter – правка, просто начать печатать – правка с этой буквы (как в Numbers и Excel)
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  if (e.target.closest('input, textarea, select') || document.querySelector('.overlay, .menu, .pop')) return;
  const wrap = document.querySelector('#tgrid');
  const g = wrap && wrap._grid, R = g && g.range;
  if (!g || !g.onEdit || !R || R.r0 !== R.r1 || R.c0 !== R.c1) return;
  const typed = e.key.length === 1 && g.sel ? e.key : null;     // печать – только там, где строки можно менять (иначе подсказка на каждую букву)
  if (e.key !== 'Enter' && !typed) return;
  const td = wrap.querySelector(`tr[data-r="${R.r0}"] td[data-c="${R.c0}"]`);
  if (!td || td.classList.contains('editing')) return;
  e.preventDefault();
  g.onEdit(R.r0, R.c0, td, null);
  const inp = td.querySelector('input');
  if (inp && typed) { inp.value = typed; inp.setSelectionRange(1, 1); inp.dispatchEvent(new Event('input')); }
});
