// Графики по результату запроса: линия, столбцы, круговая, гистограмма, точки – в SVG без внешних библиотек.
// Палитра проверена на чёрном фоне (контраст, различимость при дальтонизме): не больше 4 рядов.
const CHART_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'];

const isNumVal = v => v !== null && v !== '' && !isNaN(Number(v));

// «красивые» деления оси: 0, 2 000, 4 000 …
function niceTicks(min, max, count = 5) {
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

function fmtAxis(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.0', '') + (LANG === 'ru' ? ' млрд' : 'B');
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '') + (LANG === 'ru' ? ' млн' : 'M');
  if (a >= 1e4) return (v / 1e3).toFixed(0) + (LANG === 'ru' ? ' тыс' : 'K');
  return String(+v.toFixed(2));
}

function fmtFull(v) {
  if (!isNumVal(v)) return 'NULL';
  const s = String(+Number(v).toFixed(2));
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(s);
  return m ? m[1] + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (m[3] || '') : s;
}

// какие колонки годятся для оси Y (все значения – числа) и что взять по умолчанию
function chartDefaults(columns, rows) {
  const numeric = columns.map((c, i) => {
    const vals = rows.slice(0, 500).map(r => r[i]).filter(v => v !== null);
    return vals.length > 0 && vals.every(isNumVal) && !/(^|_)id$/i.test(c.name);
  });
  const ys = numeric.map((n, i) => n ? i : -1).filter(i => i >= 0);
  let x = columns.findIndex((c, i) => !numeric[i]);
  if (x < 0) x = 0;
  const first = ys.filter(i => i !== x)[0];
  return { numeric, cfg: { type: rows.length > 40 ? 'line' : 'bar', x, ys: first != null ? [first] : [],
    val: first ?? null, sx: ys.find(i => i !== first) ?? null, bins: 0 } };
}

function renderChart(box, columns, rows, cfg) {
  if (cfg.type === 'pie') return renderPie(box, columns, rows, cfg);
  if (cfg.type === 'hist') return renderHist(box, columns, rows, cfg);
  if (cfg.type === 'scatter') return renderScatter(box, columns, rows, cfg);
  const W = Math.max(320, box.clientWidth), H = Math.max(220, box.clientHeight);
  const ys = cfg.ys.slice(0, 4);
  if (!ys.length || !rows.length) {
    box.innerHTML = `<div class="grid-empty">${t('chartPickY')}</div>`;
    return;
  }
  const n = rows.length;
  const labels = rows.map(r => r[cfg.x] === null ? 'NULL' : String(r[cfg.x]));
  const vals = ys.map(c => rows.map(r => isNumVal(r[c]) ? Number(r[c]) : null));
  let min = Infinity, max = -Infinity;
  vals.forEach(s => s.forEach(v => { if (v !== null) { min = Math.min(min, v); max = Math.max(max, v); } }));
  if (min === Infinity) { box.innerHTML = `<div class="grid-empty">${t('chartNoNumbers')}</div>`; return; }
  if (cfg.type === 'bar' || min > 0 && min < max * 0.5) min = Math.min(0, min);   // столбцы – всегда от нуля
  if (max < 0) max = 0;
  const ticks = niceTicks(min, max);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const legendH = ys.length > 1 ? 30 : 8;
  const left = Math.max(...ticks.map(v => textW(fmtAxis(v), 400, 11))) + 18;
  const pad = { l: left, r: 16, t: legendH + 8, b: 30 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const Y = v => pad.t + ph - (v - y0) / (y1 - y0) * ph;
  const bar = cfg.type === 'bar';
  const band = pw / n;
  const X = i => pad.l + (bar ? band * (i + 0.5) : (n === 1 ? pw / 2 : i / (n - 1) * pw));

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(ys.map(c => columns[c].name).join(', '))}">`;
  // сетка и ось Y
  ticks.forEach(v => {
    const y = Y(v);
    svg += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>`;
    svg += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" class="ch-tick">${esc(fmtAxis(v))}</text>`;
  });
  // подписи оси X – не чаще одной на 90px
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 90))));
  for (let i = 0; i < n; i += every) {
    let s = labels[i];
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) s = s.slice(0, 10);
    if (s.length > 14) s = s.slice(0, 13) + '…';
    // крайние подписи прижимаем к краю, чтобы не обрезались
    const anchor = X(i) - textW(s, 400, 11) / 2 < 0 ? 'start' : X(i) + textW(s, 400, 11) / 2 > W ? 'end' : 'middle';
    svg += `<text x="${X(i)}" y="${H - 10}" text-anchor="${anchor}" class="ch-tick">${esc(s)}</text>`;
  }
  // ряды
  if (bar) {
    const gap = 2, inner = Math.max(2, band * 0.72), bw = Math.max(1, (inner - gap * (ys.length - 1)) / ys.length);
    const base = Y(Math.max(y0, Math.min(0, y1)));
    vals.forEach((s, si) => s.forEach((v, i) => {
      if (v === null) return;
      const x = X(i) - inner / 2 + si * (bw + gap), y = Y(v), h = Math.abs(base - y);
      const r = Math.min(4, bw / 2, h);
      const top = Math.min(y, base);
      // скругляем только конец столбца, основание – прямое
      const d = v >= 0
        ? `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`
        : `M${x},${base}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + bw - r}Q${x + bw},${top + h} ${x + bw},${top + h - r}V${base}Z`;
      svg += `<path d="${d}" fill="${CHART_COLORS[si]}" data-i="${i}" class="ch-bar"/>`;
    }));
  } else {
    vals.forEach((s, si) => {
      let d = '', pen = false;
      s.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
        pen = true;
      });
      svg += `<path d="${d}" fill="none" stroke="${CHART_COLORS[si]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (n <= 40) s.forEach((v, i) => {
        if (v !== null) svg += `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${CHART_COLORS[si]}" style="stroke:var(--bg)" stroke-width="2"/>`;
      });
    });
  }
  // легенда – только когда рядов больше одного
  if (ys.length > 1) {
    let lx = pad.l;
    ys.forEach((c, si) => {
      svg += `<rect x="${lx}" y="10" width="10" height="10" rx="3" fill="${CHART_COLORS[si]}"/>`;
      svg += `<text x="${lx + 16}" y="19" class="ch-legend">${esc(columns[c].name)}</text>`;
      lx += 32 + textW(columns[c].name, 400, 12);
    });
  }
  svg += `<line class="ch-cross hidden" y1="${pad.t}" y2="${pad.t + ph}"/>`;
  svg += `<rect class="ch-hit" x="${pad.l}" y="${pad.t}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  svg += `<div class="ch-tip hidden"></div>`;
  box.innerHTML = svg;

  // подсказка при наведении: ближайшая точка по X
  const hit = $('.ch-hit', box), tip = $('.ch-tip', box), cross = $('.ch-cross', box);
  hit.onmousemove = e => {
    const rect = box.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const i = bar ? Math.max(0, Math.min(n - 1, Math.floor((mx - pad.l) / band)))
      : Math.max(0, Math.min(n - 1, Math.round((mx - pad.l) / (pw / Math.max(1, n - 1)))));
    if (!bar) { cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.classList.remove('hidden'); }
    box.querySelectorAll('.ch-bar').forEach(b => b.classList.toggle('dim', +b.dataset.i !== i));
    tip.innerHTML = `<div class="ch-tip-h">${esc(labels[i])}</div>` + ys.map((c, si) =>
      `<div class="ch-tip-r"><span class="sw" style="background:${CHART_COLORS[si]}"></span><span>${esc(columns[c].name)}</span><b>${fmtFull(rows[i][c])}</b></div>`).join('');
    tip.classList.remove('hidden');
    const tx = X(i) + 14 + tip.offsetWidth > W ? X(i) - tip.offsetWidth - 14 : X(i) + 14;
    tip.style.left = tx + 'px';
    tip.style.top = Math.max(4, e.clientY - rect.top - tip.offsetHeight / 2) + 'px';
  };
  hit.onmouseleave = () => {
    tip.classList.add('hidden'); cross.classList.add('hidden');
    box.querySelectorAll('.ch-bar').forEach(b => b.classList.remove('dim'));
  };
}

// ================= круговая, гистограмма, точки =================
// до 16 долей: первые четыре – основная палитра графиков, дальше – цвета, различимые на тёмном и светлом фоне
const PIE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#8f6ad9', '#d6457a', '#2aa7b8', '#7f9a1f',
  '#b36b3c', '#5b6fd6', '#c94f4f', '#3fae8c', '#a57f00', '#a35bc4', '#e07b39', '#4f8fbf'];
const PIE_OTHER = '#636366';

function chartMsg(box, key) { box.innerHTML = `<div class="grid-empty">${t(key)}</div>`; }

// подсказка рядом с курсором внутри box
function chartTip(box, html, e) {
  const tip = $('.ch-tip', box), rect = box.getBoundingClientRect();
  tip.innerHTML = html; tip.classList.remove('hidden');
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  tip.style.left = (mx + 14 + tip.offsetWidth > rect.width ? mx - tip.offsetWidth - 14 : mx + 14) + 'px';
  tip.style.top = Math.max(4, Math.min(rect.height - tip.offsetHeight - 4, my - tip.offsetHeight / 2)) + 'px';
}

// Круговая: до 5 самых больших долей, остальное – «Другое». Одинаковые подписи складываются.
function renderPie(box, columns, rows, cfg) {
  const W = Math.max(320, box.clientWidth), H = Math.max(220, box.clientHeight);
  if (cfg.val == null) return chartMsg(box, 'chartPickY');
  const sums = new Map();
  rows.forEach(r => {
    const v = isNumVal(r[cfg.val]) ? Number(r[cfg.val]) : null;
    if (v === null || v <= 0) return;
    const k = r[cfg.x] === null ? 'NULL' : String(r[cfg.x]);
    const cur = sums.get(k) || { v: 0, rows: 0 };
    sums.set(k, { v: cur.v + v, rows: cur.rows + 1 });
  });
  // одинаковые подписи – одна доля (например, продажи по городу); сколько строк сложено, видно в подсказке
  let parts = [...sums].map(([label, x]) => ({ label, v: x.v, rows: x.rows })).sort((a, b) => b.v - a.v);
  if (!parts.length) return chartMsg(box, 'chartNoPositive');
  const maxParts = Math.max(2, Math.min(16, cfg.slices || 6));     // сколько долей показать (последняя – «Другое»)
  if (parts.length > maxParts) {
    const rest = parts.slice(maxParts - 1);
    parts = parts.slice(0, maxParts - 1).concat({ label: t('chartOther'), v: rest.reduce((a, b) => a + b.v, 0), other: true, n: rest.length,
      rows: rest.reduce((a, b) => a + b.rows, 0) });
  }
  const total = parts.reduce((a, b) => a + b.v, 0);
  const R = Math.max(60, Math.min(H / 2 - 24, W * 0.28)), r0 = R * 0.6;
  const cx = Math.min(W * 0.32, R + 40), cy = H / 2;
  let a = -Math.PI / 2, svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(columns[cfg.val].name)}">`;
  const pt = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
  parts.forEach((p, i) => {
    const da = p.v / total * Math.PI * 2, b = a + da, big = da > Math.PI ? 1 : 0;
    const col = p.other ? PIE_OTHER : PIE_COLORS[i];
    const d = parts.length === 1
      ? `M${pt(R, 0)}A${R},${R} 0 1 1 ${pt(R, Math.PI)}A${R},${R} 0 1 1 ${pt(R, 0)}M${pt(r0, 0)}A${r0},${r0} 0 1 0 ${pt(r0, Math.PI)}A${r0},${r0} 0 1 0 ${pt(r0, 0)}Z`
      : `M${pt(R, a)}A${R},${R} 0 ${big} 1 ${pt(R, b)}L${pt(r0, b)}A${r0},${r0} 0 ${big} 0 ${pt(r0, a)}Z`;
    svg += `<path d="${d}" fill="${col}" style="stroke:var(--bg)" stroke-width="2" class="ch-slice" data-i="${i}" fill-rule="evenodd"/>`;
    a = b;
  });
  svg += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="ch-total">${esc(fmtAxis(total))}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="ch-tick">${esc(columns[cfg.val].name)}</text>`;
  // легенда справа
  const lx = cx + R + 36, lw = W - lx - 16, rowH = Math.max(15, Math.min(26, (H - 24) / parts.length)), top = cy - parts.length * rowH / 2;
  parts.forEach((p, i) => {
    const y = top + i * rowH;
    let name = p.label + (p.rows > 1 && !p.other ? ` (×${p.rows})` : ''); while (name.length > 3 && textW(name, 400, 12) > lw - 110) name = name.slice(0, -2) + '…';
    svg += `<g class="ch-leg" data-i="${i}"><rect x="${lx}" y="${y + 3}" width="10" height="10" rx="3" fill="${p.other ? PIE_OTHER : PIE_COLORS[i]}"/>
      <text x="${lx + 18}" y="${y + 12}" class="ch-legend">${esc(name)}</text>
      <text x="${W - 16}" y="${y + 12}" text-anchor="end" class="ch-tick">${Math.round(p.v / total * 1000) / 10}%</text></g>`;
  });
  box.innerHTML = svg + '</svg><div class="ch-tip hidden"></div>';
  const tipOf = i => { const p = parts[i];
    return `<div class="ch-tip-h">${esc(p.label)}${p.other ? ` (${p.n})` : ''}</div><div class="ch-tip-r"><span class="sw" style="background:${p.other ? PIE_OTHER : PIE_COLORS[i]}"></span><span>${esc(columns[cfg.val].name)}</span><b>${fmtFull(p.v)}</b></div>
      <div class="ch-tip-r"><span></span><span>${t('chartShare')}</span><b>${Math.round(p.v / total * 1000) / 10}%</b></div>
      ${p.rows > 1 ? `<div class="ch-tip-r"><span></span><span>${t('chartSummed')}</span><b>${p.rows}</b></div>` : ''}`; };
  box.querySelectorAll('[data-i]').forEach(el => {
    el.onmousemove = e => { box.querySelectorAll('.ch-slice').forEach(s => s.classList.toggle('dim', s.dataset.i !== el.dataset.i)); chartTip(box, tipOf(+el.dataset.i), e); };
    el.onmouseleave = () => { box.querySelectorAll('.ch-slice').forEach(s => s.classList.remove('dim')); $('.ch-tip', box).classList.add('hidden'); };
  });
}

// оси для гистограммы и точек: числовые деления по X и Y
function axesSvg(W, H, pad, xt, yt, X, Y, xFmt = fmtAxis) {
  let s = '';
  yt.forEach(v => { s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" class="${v === 0 ? 'ch-zero' : 'ch-grid'}"/>
    <text x="${pad.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="ch-tick">${esc(fmtAxis(v))}</text>`; });
  xt.forEach(v => { s += `<text x="${X(v)}" y="${H - 10}" text-anchor="middle" class="ch-tick">${esc(xFmt(v))}</text>`; });
  return s;
}

// Гистограмма: сколько значений попало в каждый интервал (по строкам результата)
function renderHist(box, columns, rows, cfg) {
  const W = Math.max(320, box.clientWidth), H = Math.max(220, box.clientHeight);
  if (cfg.val == null) return chartMsg(box, 'chartPickNum');
  const vals = rows.map(r => r[cfg.val]).filter(isNumVal).map(Number);
  if (!vals.length) return chartMsg(box, 'chartNoNumbers');
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mn === mx) { mn -= 0.5; mx += 0.5; }
  const k = cfg.bins || Math.max(5, Math.min(40, Math.ceil(Math.log2(vals.length) + 1)));
  const step = (mx - mn) / k, bins = new Array(k).fill(0);
  vals.forEach(v => { bins[Math.min(k - 1, Math.floor((v - mn) / step))]++; });
  const yt = niceTicks(0, Math.max(...bins));
  const left = Math.max(...yt.map(v => textW(fmtAxis(v), 400, 11))) + 18;
  const pad = { l: left, r: 16, t: 14, b: 30 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const X = v => pad.l + (v - mn) / (mx - mn) * pw, Y = v => pad.t + ph - v / yt[yt.length - 1] * ph;
  const xt = niceTicks(mn, mx, Math.max(2, Math.floor(pw / 90))).filter(v => v >= mn - 1e-9 && v <= mx + 1e-9);
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(columns[cfg.val].name)}">` + axesSvg(W, H, pad, xt, yt, X, Y);
  bins.forEach((n, i) => {
    const x = X(mn + i * step) + 1, w = Math.max(1, pw / k - 2), y = Y(n), h = Y(0) - y;
    if (n) svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(3, w / 2)}" fill="${CHART_COLORS[0]}" class="ch-bar" data-i="${i}"/>`;
    svg += `<rect x="${x - 1}" y="${pad.t}" width="${w + 2}" height="${ph}" fill="transparent" data-h="${i}"/>`;
  });
  box.innerHTML = svg + '</svg><div class="ch-tip hidden"></div>';
  box.querySelectorAll('[data-h]').forEach(el => {
    const i = +el.dataset.h;
    el.onmousemove = e => {
      box.querySelectorAll('.ch-bar').forEach(b => b.classList.toggle('dim', +b.dataset.i !== i));
      chartTip(box, `<div class="ch-tip-h">${fmtFull(mn + i * step)} – ${fmtFull(mn + (i + 1) * step)}</div>
        <div class="ch-tip-r"><span class="sw" style="background:${CHART_COLORS[0]}"></span><span>${t('chartCount')}</span><b>${fmtFull(bins[i])}</b></div>`, e);
    };
    el.onmouseleave = () => { box.querySelectorAll('.ch-bar').forEach(b => b.classList.remove('dim')); $('.ch-tip', box).classList.add('hidden'); };
  });
}

// Точки: каждая строка – точка (X и Y – числа). Подсказка – ближайшая точка.
function renderScatter(box, columns, rows, cfg) {
  const W = Math.max(320, box.clientWidth), H = Math.max(220, box.clientHeight);
  if (cfg.sx == null || cfg.val == null) return chartMsg(box, 'chartPickNum');
  const pts = [];
  rows.forEach((r, i) => { if (isNumVal(r[cfg.sx]) && isNumVal(r[cfg.val])) pts.push({ x: Number(r[cfg.sx]), y: Number(r[cfg.val]), i }); });
  if (!pts.length) return chartMsg(box, 'chartNoNumbers');
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const xt = niceTicks(Math.min(...xs), Math.max(...xs), 5), yt = niceTicks(Math.min(...ys), Math.max(...ys));
  const left = Math.max(...yt.map(v => textW(fmtAxis(v), 400, 11))) + 18;
  const pad = { l: left, r: 20, t: 14, b: 30 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1];
  const X = v => pad.l + (v - x0) / (x1 - x0) * pw, Y = v => pad.t + ph - (v - y0) / (y1 - y0) * ph;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(columns[cfg.sx].name)} – ${esc(columns[cfg.val].name)}">` + axesSvg(W, H, pad, xt, yt, X, Y);
  const r = pts.length > 600 ? 2.5 : 3.5;
  pts.forEach(p => { svg += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${r}" fill="${CHART_COLORS[0]}" fill-opacity=".7"/>`; });
  svg += `<circle class="ch-hl hidden" r="6" fill="none" style="stroke:var(--text)" stroke-width="2"/>`;
  svg += `<rect class="ch-hit" x="${pad.l}" y="${pad.t}" width="${pw}" height="${ph}" fill="transparent"/>`;
  box.innerHTML = svg + '</svg><div class="ch-tip hidden"></div>';
  const label = columns.findIndex((c, i) => i !== cfg.sx && i !== cfg.val && rows.some(r => r[i] !== null && !isNumVal(r[i])));
  const hit = $('.ch-hit', box), hl = $('.ch-hl', box);
  hit.onmousemove = e => {
    const rect = box.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = null, bd = 400;
    pts.forEach(p => { const d = (X(p.x) - mx) ** 2 + (Y(p.y) - my) ** 2; if (d < bd) { bd = d; best = p; } });
    if (!best) { hl.classList.add('hidden'); $('.ch-tip', box).classList.add('hidden'); return; }
    hl.setAttribute('cx', X(best.x)); hl.setAttribute('cy', Y(best.y)); hl.classList.remove('hidden');
    const row = rows[best.i];
    chartTip(box, `${label >= 0 ? `<div class="ch-tip-h">${esc(row[label] ?? 'NULL')}</div>` : ''}
      <div class="ch-tip-r"><span></span><span>${esc(columns[cfg.sx].name)}</span><b>${fmtFull(best.x)}</b></div>
      <div class="ch-tip-r"><span></span><span>${esc(columns[cfg.val].name)}</span><b>${fmtFull(best.y)}</b></div>`, e);
  };
  hit.onmouseleave = () => { hl.classList.add('hidden'); $('.ch-tip', box).classList.add('hidden'); };
}

// ================= график картинкой (PNG) =================
// SVG рисуется со стилями из styles.css – для картинки переносим их прямо в элементы, потом рисуем на холсте в 2× чёткости.
const SVG_STYLE = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric', 'text-anchor', 'dominant-baseline'];

function chartPng(box, scale = 2) {
  const svg = box && box.querySelector('svg.chart-svg');
  if (!svg) return Promise.resolve(null);
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value;
  const copy = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')], dst = [copy, ...copy.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el), d = dst[i];
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.classList.contains('ch-hit')) { d.remove(); return; }
    SVG_STYLE.forEach(p => { const v = cs.getPropertyValue(p); if (v) d.style.setProperty(p, v); });
  });
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.insertAdjacentHTML('afterbegin', `<rect width="${w}" height="${h}" fill="${getComputedStyle(document.body).backgroundColor}"/>`);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = w * scale; cv.height = h * scale;
      const g = cv.getContext('2d');
      g.scale(scale, scale);
      g.drawImage(img, 0, 0);
      resolve({ data: cv.toDataURL('image/png').split(',')[1], w: Math.round(w), h: Math.round(h) });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
