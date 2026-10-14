// Конструктор таблиц – как «Конструктор» в Access: каждое поле – строка, тип выбирается из списка,
// свойства поля – внизу. Работает и для новой таблицы, и для существующей. SQL писать не нужно,
// но готовые команды всегда видны в «Показать SQL» – конструктор не заменяет редактор, а дополняет его.

Object.assign(I18N.ru, {
  dzDesigner: 'Конструктор', dzField: 'Имя поля', dzType: 'Тип данных',
  dzKey: 'Ключ', dzRequired: 'Обязательное', dzUnique: 'Уникальное', dzDefault: 'По умолчанию', dzComment: 'Описание',
  dzNewField: 'Новое поле…', dzTableName: 'Имя таблицы', dzShowSql: 'Показать SQL',
  dzCreate: 'Создать таблицу', dzSave: 'Сохранить структуру', dzRevert: 'Отменить изменения', dzProps: 'Свойства поля',
  dzPropsOf: 'Свойства поля «{c}»', dzLength: 'Длина, символов',
  dzPrecision: 'Всего цифр', dzScale: 'Знаков после запятой', dzRawType: 'Тип PostgreSQL',
  dzSqlTitle: 'Что выполнится в базе', dzSqlNone: 'Изменений нет.', dzToEditor: 'Открыть в редакторе',
  dzSaved: 'Структура «{t}» сохранена', dzDropTitle: 'Удалить поля: {n}?',
  dzDropText: 'Поля {c} будут удалены вместе со всеми данными в них. Отменить это нельзя.', dzSaveDrop: 'Сохранить и удалить',
  dzDelField: 'Удалить поле', dzRestore: 'Вернуть поле', dzCounterLocked: 'Номера ставятся сами',
  dzDefHint: 'Например: 0, Москва, true или now() – текущее время. Пусто – без значения по умолчанию.',
  dzPkHint: 'Ключ – поле, по которому строка однозначно находится. Обычно это id со счётчиком.',
  dzHelp: 'Заполни поля как в таблице: имя, тип из списка, отметки. Enter – следующая строка.',
  errNeedName: 'Укажи имя таблицы', errDupColumn: 'Поле «{v}» встречается дважды',
  errNoCounterChange: 'Существующее поле нельзя превратить в счётчик – добавь новое поле со счётчиком',
  errDuplicates: 'В колонке «{c}» есть повторяющиеся значения ({v}) – ключ или уникальность не поставить',
  errHasNulls: 'В колонке «{c}» есть пустые значения – сначала заполни их, потом делай поле обязательным',
  errDepends: 'От этого поля зависит представление {t} – сначала измени или удали его',
  errCantCast: 'Данные в колонке нельзя перевести в тип {v}',
  dzT_serial: 'Счётчик', dzT_bigserial: 'Большой счётчик', dzT_text: 'Текст', dzT_varchar: 'Текст ограниченной длины',
  dzT_integer: 'Целое число', dzT_bigint: 'Большое целое число', dzT_smallint: 'Малое целое число',
  dzT_numeric: 'Число с дробью (точное)', dzT_double: 'Дробное число (приблизительное)', dzT_boolean: 'Да/Нет',
  dzT_date: 'Дата', dzT_timestamp: 'Дата и время', dzT_timestamptz: 'Дата и время с поясом', dzT_time: 'Время',
  dzT_uuid: 'UUID', dzT_jsonb: 'JSON', dzT_bytea: 'Двоичные данные', dzT_other: 'Другой тип…',
  dzH_serial: 'Номер 1, 2, 3… ставится сам при добавлении строки. Подходит для ключевого поля id.',
  dzH_bigserial: 'Как счётчик, но для очень больших таблиц – больше 2 млрд строк.',
  dzH_text: 'Строка любой длины: имена, адреса, описания.',
  dzH_varchar: 'Строка не длиннее заданного числа символов – например, телефон или артикул.',
  dzH_integer: 'Целые числа примерно до ±2 млрд: количество, возраст, год.',
  dzH_bigint: 'Целые числа без практического предела: суммы в копейках, идентификаторы.',
  dzH_smallint: 'Небольшие целые числа до ±32 767: оценки, номера.',
  dzH_numeric: 'Точное число без ошибок округления: деньги, цены, веса.',
  dzH_double: 'Для измерений и расчётов, где не важна точность до последнего знака.',
  dzH_boolean: 'Флажок: да или нет.', dzH_date: 'Только дата, без времени.',
  dzH_timestamp: 'Дата и время без часового пояса.', dzH_timestamptz: 'Дата и время с учётом часового пояса – надёжнее для событий.',
  dzH_time: 'Только время суток.', dzH_uuid: 'Уникальный идентификатор вида 9b2c…',
  dzH_jsonb: 'Произвольные данные в формате JSON.', dzH_bytea: 'Файлы и другие двоичные данные.',
  dzH_other: 'Любой тип PostgreSQL, например character(2) или integer[].',
});
Object.assign(I18N.en, {
  dzDesigner: 'Design', dzField: 'Field name', dzType: 'Data type',
  dzKey: 'Key', dzRequired: 'Required', dzUnique: 'Unique', dzDefault: 'Default', dzComment: 'Description',
  dzNewField: 'New field…', dzTableName: 'Table name', dzShowSql: 'Show SQL',
  dzCreate: 'Create table', dzSave: 'Save structure', dzRevert: 'Revert changes', dzProps: 'Field properties',
  dzPropsOf: 'Properties of “{c}”', dzLength: 'Length, characters',
  dzPrecision: 'Total digits', dzScale: 'Decimal places', dzRawType: 'PostgreSQL type',
  dzSqlTitle: 'What will run in the database', dzSqlNone: 'No changes.', dzToEditor: 'Open in editor',
  dzSaved: 'Structure of “{t}” saved', dzDropTitle: 'Delete fields: {n}?',
  dzDropText: 'Fields {c} will be deleted with all their data. This can’t be undone.', dzSaveDrop: 'Save and delete',
  dzDelField: 'Delete field', dzRestore: 'Restore field', dzCounterLocked: 'Numbered automatically',
  dzDefHint: 'For example: 0, London, true or now() – current time. Empty – no default.',
  dzPkHint: 'The key identifies each row. Usually it is an id with AutoNumber.',
  dzHelp: 'Fill in fields like a table: name, type from the list, checkboxes. Enter – next row.',
  errNeedName: 'Enter a table name', errDupColumn: 'Field “{v}” appears twice',
  errNoCounterChange: 'An existing field can’t become AutoNumber – add a new AutoNumber field instead',
  errDuplicates: 'Column “{c}” has duplicate values ({v}) – can’t make it a key or unique',
  errHasNulls: 'Column “{c}” has empty values – fill them first, then make the field required',
  errDepends: 'View {t} depends on this field – change or drop it first',
  errCantCast: 'The column’s data can’t be converted to {v}',
  dzT_serial: 'AutoNumber', dzT_bigserial: 'Big AutoNumber', dzT_text: 'Text', dzT_varchar: 'Text with max length',
  dzT_integer: 'Integer', dzT_bigint: 'Big integer', dzT_smallint: 'Small integer',
  dzT_numeric: 'Decimal (exact)', dzT_double: 'Floating point', dzT_boolean: 'Yes/No',
  dzT_date: 'Date', dzT_timestamp: 'Date and time', dzT_timestamptz: 'Date and time with zone', dzT_time: 'Time',
  dzT_uuid: 'UUID', dzT_jsonb: 'JSON', dzT_bytea: 'Binary data', dzT_other: 'Other type…',
  dzH_serial: 'Numbers 1, 2, 3… are assigned automatically. Good for an id key.',
  dzH_bigserial: 'Like AutoNumber, but for tables with more than 2 billion rows.',
  dzH_text: 'A string of any length: names, addresses, notes.',
  dzH_varchar: 'A string no longer than the given length – e.g. a phone or SKU.',
  dzH_integer: 'Whole numbers up to about ±2 billion: quantity, age, year.',
  dzH_bigint: 'Whole numbers with no practical limit.', dzH_smallint: 'Small whole numbers up to ±32,767.',
  dzH_numeric: 'Exact numbers without rounding errors: money, prices, weights.',
  dzH_double: 'For measurements where the last digit doesn’t matter.',
  dzH_boolean: 'A checkbox: yes or no.', dzH_date: 'A date without time.',
  dzH_timestamp: 'Date and time without a time zone.', dzH_timestamptz: 'Date and time with a time zone – safer for events.',
  dzH_time: 'Time of day only.', dzH_uuid: 'A unique identifier like 9b2c…',
  dzH_jsonb: 'Arbitrary JSON data.', dzH_bytea: 'Files and other binary data.',
  dzH_other: 'Any PostgreSQL type, e.g. character(2) or integer[].',
});
Object.assign(ERR_KEYS, {
  NEED_NAME: 'errNeedName', DUP_COLUMN: 'errDupColumn', NO_COUNTER_CHANGE: 'errNoCounterChange',
  DUPLICATES: 'errDuplicates', HAS_NULLS: 'errHasNulls', DEPENDS: 'errDepends', CANT_CAST: 'errCantCast',
});

// ================= типы =================
const DZ_TYPES = ['serial', 'text', 'varchar', 'integer', 'bigint', 'numeric', 'double', 'boolean', 'date',
  'timestamp', 'timestamptz', 'time', 'uuid', 'jsonb', 'bytea', 'smallint', 'bigserial', 'other'];
const DZ_PLAIN = { text: 'text', integer: 'integer', bigint: 'bigint', smallint: 'smallint', 'double precision': 'double',
  boolean: 'boolean', date: 'date', 'timestamp without time zone': 'timestamp', 'timestamp with time zone': 'timestamptz',
  'time without time zone': 'time', uuid: 'uuid', jsonb: 'jsonb', bytea: 'bytea' };

// тип из базы (format_type) → вид в конструкторе
function dzParseType(type, counter) {
  const f = { k: 'other', len: 100, p: 12, s: 2, raw: type };
  let m;
  if (counter && type === 'integer') f.k = 'serial';
  else if (counter && type === 'bigint') f.k = 'bigserial';
  else if (DZ_PLAIN[type]) f.k = DZ_PLAIN[type];
  else if ((m = type.match(/^character varying\((\d+)\)$/))) { f.k = 'varchar'; f.len = +m[1]; }
  else if ((m = type.match(/^numeric\((\d+),(\d+)\)$/))) { f.k = 'numeric'; f.p = +m[1]; f.s = +m[2]; }
  return f;
}

// вид в конструкторе → тип PostgreSQL
function dzSql(f) {
  switch (f.k) {
    case 'varchar': return `varchar(${Math.max(1, parseInt(f.len, 10) || 1)})`;
    case 'numeric': { const p = Math.max(1, parseInt(f.p, 10) || 1); return `numeric(${p},${Math.min(p, Math.max(0, parseInt(f.s, 10) || 0))})`; }
    case 'double': return 'double precision';
    case 'other': return (f.raw || '').trim() || 'text';
    default: return f.k;
  }
}
const dzCounter = f => f.k === 'serial' || f.k === 'bigserial';

// ================= состояние =================
let dzSeq = 0;
const dzBlank = () => ({ uid: ++dzSeq, orig: null, name: '', k: 'text', len: 100, p: 12, s: 2, raw: '',
  pk: false, req: false, def: '', uniq: false, com: '', del: false });

// 'Москва'::text → Москва: в конструкторе значение показываем так, как его вводили
function dzShowDefault(v) {
  const m = (v || '').match(/^'((?:[^']|'')*)'::[\w ]+$/);
  return m ? m[1].replace(/''/g, "'") : (v || '');
}

function dzFromColumn(c) {
  const ty = dzParseType(c.type, c.counter);
  const shown = c.counter ? '' : dzShowDefault(c.default);
  const f = Object.assign(dzBlank(), ty, { orig: c.name, name: c.name, pk: c.pk, req: !c.nullable,
    def: shown, origDef: c.default || '', shownDef: shown, uniq: !!c.unique, com: c.comment || '' });
  f.origSql = dzSql(f);
  return f;
}

// снимок для сравнения «изменено или нет» (пустая последняя строка не считается)
function dzSnap(d) {
  return JSON.stringify([d.name.trim(), d.schema, d.fields.filter(f => f.orig || f.name.trim())
    .map(f => [f.orig, f.name.trim(), dzSql(f), f.pk, f.req || f.pk, f.def.trim(), f.uniq, f.com.trim(), f.del])]);
}

function designCount(tab) {
  const d = tab.d;
  if (!d || !d.fields) return 0;
  return dzSnap(d) !== d.snap ? 1 : 0;
}

function resetDesign(tab) {
  if (!tab.d) return;
  if (tab.type === 'design') tab.d = dzNewState(tab.conn, tab.d.schema);
  else tab.d = null;          // перечитаем из базы при следующем показе
}

function dzEnsureBlank(d) {
  const last = d.fields[d.fields.length - 1];
  if (!last || last.orig || last.name.trim()) d.fields.push(dzBlank());
}

function dzNewState(cid, schema) {
  const id = Object.assign(dzBlank(), { name: 'id', k: 'serial', pk: true, req: true });
  const d = { name: '', schema, fields: [id], sel: id.uid, sqlOpen: false, table: null };
  dzEnsureBlank(d);
  d.snap = dzSnap(d);
  return d;
}

async function loadDesign(tab) {
  const info = await api('design_info', tab.conn, tab.schema, tab.table);
  const fields = info.columns.map(dzFromColumn);
  const d = { name: tab.table, schema: tab.schema, fields, sel: fields[0] && fields[0].uid, sqlOpen: tab.d ? tab.d.sqlOpen : false, table: tab.table };
  dzEnsureBlank(d);
  d.snap = dzSnap(d);
  tab.d = d;
}

// поля в том виде, который понимает Python
function dzPayload(d) {
  return d.fields.filter(f => !f.del && f.name.trim()).map(f => ({
    orig: f.orig, name: f.name.trim(),
    type: f.orig && dzSql(f) === f.origSql ? null : dzSql(f),
    nullable: !(f.req || f.pk), pk: f.pk, default: dzCounter(f) ? '' : (f.orig && f.def.trim() === f.shownDef ? f.origDef : f.def.trim()), unique: f.uniq, comment: f.com.trim(),
  }));
}

// ================= открытие =================
function openNewDesign(cid) {
  if (!cid || !S.info[cid]) return;
  const schemas = (S.schemas[cid] || []).map(s => s.name);
  const schema = schemas.includes('public') ? 'public' : (schemas[0] || 'public');
  const tab = { id: ++tabSeq, type: 'design', conn: cid, schema, d: dzNewState(cid, schema) };
  S.tabs.push(tab);
  S.tab = tab.id;
  renderTabs(); renderPane();
  setTimeout(() => { const el = $('#dz-name'); if (el) el.focus(); }, 30);
}

function renderDesignTab(pane, tab) {
  pane.innerHTML = `<div class="toolbar" id="tbar"></div>
    <div id="tbody" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:10px"></div>`;
  renderDesigner(tab, $('#tbar'), $('#tbody'));
}

// ================= отрисовка =================
const dzTypeOptions = k => DZ_TYPES.map(x => `<option value="${x}" ${x === k ? 'selected' : ''}>${esc(t('dzT_' + x))}</option>`).join('');

function dzRowHtml(d, f, i) {
  const counter = dzCounter(f);
  const cls = [f.uid === d.sel ? 'sel' : '', f.del ? 'gone' : '', !f.orig && f.name.trim() ? 'new' : '',
    f.orig && !f.del && dzFieldChanged(f) ? 'mod' : '', !f.orig && !f.name.trim() ? 'blank' : ''].join(' ');
  const dis = f.del ? 'disabled' : '';
  return `<tr class="${cls}" data-u="${f.uid}">
    <td class="dz-mark">${f.pk ? icon('key', 12) : ''}</td>
    <td><input type="text" data-k="name" value="${esc(f.name)}" placeholder="${!f.orig && !f.name ? esc(t('dzNewField')) : ''}" spellcheck="false" autocomplete="off" ${dis}></td>
    <td><select data-k="k" ${dis || (f.orig && counter ? 'disabled' : '')}>${dzTypeOptions(f.k)}</select></td>
    <td class="c"><input type="checkbox" data-k="pk" ${f.pk ? 'checked' : ''} ${dis} title="${esc(t('dzKey'))}"></td>
    <td class="c"><input type="checkbox" data-k="req" ${f.req || f.pk ? 'checked' : ''} ${dis || (f.pk ? 'disabled' : '')} title="${esc(t('dzRequired'))}"></td>
    <td class="c"><input type="checkbox" data-k="uniq" ${f.uniq && !f.pk ? 'checked' : ''} ${dis || (f.pk ? 'disabled' : '')} title="${esc(t('dzUnique'))}"></td>
    <td><input type="text" data-k="def" value="${esc(counter ? '' : f.def)}" placeholder="${counter ? esc(t('dzCounterLocked')) : ''}" spellcheck="false" autocomplete="off" ${dis || (counter ? 'disabled' : '')}></td>
    <td><input type="text" data-k="com" value="${esc(f.com)}" spellcheck="false" autocomplete="off" ${dis}></td>
    <td class="dz-act">${!f.orig && !f.name.trim() ? '' : f.del
      ? `<button class="btn ghost icon" data-undo title="${esc(t('dzRestore'))}">${icon('refresh', 13)}</button>`
      : `<button class="btn ghost icon red-ic" data-rm title="${esc(t('dzDelField'))}">${icon('trash', 13)}</button>`}</td></tr>`;
}

function dzFieldChanged(f) {
  if (!f.orig) return false;
  const o = f._o || (f._o = JSON.stringify([f.orig, f.origSql, f.pk, f.req, f.def, f.uniq, f.com]));
  return o !== JSON.stringify([f.name.trim(), dzSql(f), f.pk, f.req || f.pk, f.def.trim(), f.uniq, f.com.trim()]);
}

function renderDesigner(tab, bar, body) {
  const d = tab.d;
  const isNew = tab.type === 'design';
  if (!d) { bar.insertAdjacentHTML('beforeend', ''); body.innerHTML = ''; return; }
  // для старых полей запоминаем исходное состояние до первых правок
  d.fields.forEach(f => { if (f.orig && !f._o) dzFieldChanged(f); });
  const schemas = (S.schemas[tab.conn] || []).map(s => s.name);
  bar.innerHTML = `
    <div class="dz-name">${icon('table', 14)}<input class="input sm" id="dz-name" value="${esc(d.name)}" placeholder="${esc(t('dzTableName'))}" spellcheck="false" autocomplete="off"></div>
    ${isNew && schemas.length > 1 ? `<select class="select sm" id="dz-schema">${schemas.map(s => `<option ${s === d.schema ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
    <div style="flex:1"></div>
    <button class="btn ghost ${d.sqlOpen ? 'on' : ''}" id="dz-sql">${icon('code', 14)}${t('dzShowSql')}</button>
    <button class="btn ghost hidden" id="dz-revert">${t('dzRevert')}</button>
    <button class="btn primary" id="dz-save">${icon('check', 13)}${isNew ? t('dzCreate') : t('dzSave')}<span class="kbd">⌘S</span></button>`;
  body.innerHTML = `<div class="dz">
    <div class="dz-wrap"><table class="dz-grid"><colgroup><col style="width:30px"><col style="width:17%"><col style="width:19%">
      <col style="width:58px"><col style="width:112px"><col style="width:104px"><col style="width:18%"><col><col style="width:40px"></colgroup>
      <thead><tr><th></th><th>${t('dzField')}</th><th>${t('dzType')}</th><th class="c">${t('dzKey')}</th><th class="c">${t('dzRequired')}</th>
      <th class="c">${t('dzUnique')}</th><th>${t('dzDefault')}</th><th>${t('dzComment')}</th><th></th></tr></thead>
      <tbody id="dz-rows">${d.fields.map((f, i) => dzRowHtml(d, f, i)).join('')}</tbody></table></div>
    <div class="dz-bottom">
      <div class="card dz-props" id="dz-props"></div>
      <div class="card dz-sql ${d.sqlOpen ? '' : 'hidden'}" id="dz-sqlbox"><div class="card-h dz-sql-h"><span>${t('dzSqlTitle')}</span>
        <button class="btn ghost sm-btn" id="dz-toeditor">${icon('sql', 13)}${t('dzToEditor')}</button></div><pre class="code" id="dz-sqlpre"></pre></div>
    </div></div>`;

  const rows = $('#dz-rows');
  const fieldOf = el => { const tr = el.closest('tr[data-u]'); return tr && d.fields.find(f => f.uid === +tr.dataset.u); };
  const rerender = (focusSel) => {
    dzEnsureBlank(d);
    rows.innerHTML = d.fields.map((f, i) => dzRowHtml(d, f, i)).join('');
    if (focusSel) { const el = rows.querySelector(focusSel); if (el) { el.focus(); if (el.type === 'text' && el.value) el.setSelectionRange(el.value.length, el.value.length); } }
    changed();
  };
  const select = f => {
    if (!f || d.sel === f.uid) return;
    d.sel = f.uid;
    rows.querySelectorAll('tr.sel').forEach(r => r.classList.remove('sel'));
    const tr = rows.querySelector(`tr[data-u="${f.uid}"]`); if (tr) tr.classList.add('sel');
    renderProps();
  };
  const changed = () => {
    const dirty = designCount(tab) > 0;
    $('#dz-revert').classList.toggle('hidden', !dirty || isNew);
    renderTabs();
    if (tab.type === 'table') markDirty(); else { const v = anyPending(); if (v !== lastDirty) { lastDirty = v; api('set_dirty', v).catch(() => {}); } }
    dzPreviewSoon(tab);
  };
  const markRow = f => {
    const tr = rows.querySelector(`tr[data-u="${f.uid}"]`);
    if (tr) { tr.classList.toggle('mod', !!f.orig && !f.del && dzFieldChanged(f)); tr.classList.toggle('new', !f.orig && !!f.name.trim()); tr.classList.toggle('blank', !f.orig && !f.name.trim()); }
  };

  // ---------- свойства выбранного поля ----------
  const renderProps = () => {
    const box = $('#dz-props');
    const f = d.fields.find(x => x.uid === d.sel && !x.del);
    if (!f || (!f.orig && !f.name.trim() && f !== d.fields[0])) {
      box.innerHTML = `<div class="card-h">${t('dzProps')}</div><div class="dz-props-b"><p class="hint">${esc(t('dzHelp'))}</p></div>`;
      return;
    }
    let extra = '';
    if (f.k === 'varchar') extra = `<div class="field"><label>${t('dzLength')}</label><input class="input sm" data-p="len" type="number" min="1" value="${esc(f.len)}"></div>`;
    else if (f.k === 'numeric') extra = `<div class="row2"><div class="field"><label>${t('dzPrecision')}</label><input class="input sm" data-p="p" type="number" min="1" max="1000" value="${esc(f.p)}"></div>
      <div class="field"><label>${t('dzScale')}</label><input class="input sm" data-p="s" type="number" min="0" value="${esc(f.s)}"></div></div>`;
    else if (f.k === 'other') extra = `<div class="field"><label>${t('dzRawType')}</label><input class="input sm mono" data-p="raw" value="${esc(f.raw)}" placeholder="character(2)" spellcheck="false"></div>`;
    box.innerHTML = `<div class="card-h">${esc(t('dzPropsOf', { c: f.name.trim() || '…' }))}</div>
      <div class="dz-props-b">
        <div class="dz-type"><b>${esc(t('dzT_' + f.k))}</b> <code>${esc(dzSql(f))}</code><p>${esc(t('dzH_' + f.k))}</p></div>
        ${extra}
        <p class="hint">${esc(f.pk ? t('dzPkHint') : t('dzDefHint'))}</p>
      </div>`;
    box.querySelectorAll('[data-p]').forEach(inp => inp.oninput = () => {
      f[inp.dataset.p] = inp.value;
      $('.dz-type code', box).textContent = dzSql(f);
      markRow(f); changed();
    });
  };

  // ---------- правка ячеек ----------
  rows.addEventListener('focusin', e => select(fieldOf(e.target)));
  rows.addEventListener('mousedown', e => { const f = fieldOf(e.target); if (f) select(f); });
  rows.addEventListener('input', e => {
    const f = fieldOf(e.target), k = e.target.dataset.k;
    if (!f || !k || e.target.type === 'checkbox' || k === 'k') return;
    const wasBlank = !f.orig && !f.name.trim();
    f[k] = e.target.value;
    if (k === 'name' && wasBlank && f.name.trim()) {
      // первая буква в пустой строке – появляется новое поле, а под ним снова пустая строка
      dzEnsureBlank(d);
      const last = d.fields[d.fields.length - 1];
      if (last !== f) rows.insertAdjacentHTML('beforeend', dzRowHtml(d, last));
      const tr = e.target.closest('tr'); const act = tr.querySelector('.dz-act');
      act.innerHTML = `<button class="btn ghost icon red-ic" data-rm title="${esc(t('dzDelField'))}">${icon('trash', 13)}</button>`;
      e.target.placeholder = '';
    }
    if (k === 'name') { const h = $('#dz-props .card-h'); if (h && d.sel === f.uid) h.textContent = t('dzPropsOf', { c: f.name.trim() || '…' }); }
    markRow(f); changed();
  });
  rows.addEventListener('change', e => {
    const f = fieldOf(e.target), k = e.target.dataset.k;
    if (!f || !k) return;
    if (k === 'k') {
      f.k = e.target.value;
      if (dzCounter(f)) { f.def = ''; }
      if (f.k === 'other' && !f.raw) f.raw = f.origSql || 'text';
      rerender(`tr[data-u="${f.uid}"] select`);
      renderProps();
      return;
    }
    if (e.target.type === 'checkbox') {
      f[k] = e.target.checked;
      if (k === 'pk' && f.pk) { f.req = true; f.uniq = false; }
      if (!f.orig && !f.name.trim() && f[k]) f.name = k === 'pk' ? 'id' : '';
      rerender(`tr[data-u="${f.uid}"] [data-k="${k}"]`);
      renderProps();
    }
  });
  rows.addEventListener('click', e => {
    const f = fieldOf(e.target);
    if (!f) return;
    if (e.target.closest('[data-rm]')) {
      if (f.orig) f.del = true; else d.fields.splice(d.fields.indexOf(f), 1);
      if (d.sel === f.uid) d.sel = null;
      rerender(); renderProps();
    } else if (e.target.closest('[data-undo]')) { f.del = false; rerender(); renderProps(); }
  });
  rows.addEventListener('keydown', e => {
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key) || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
    const tr = e.target.closest('tr'), k = e.target.dataset.k;
    const next = e.key === 'ArrowUp' ? tr.previousElementSibling : tr.nextElementSibling;
    e.preventDefault();
    if (next) { const el = next.querySelector(`[data-k="${k}"]:not([disabled])`) || next.querySelector('[data-k="name"]'); if (el) el.focus(); }
  });

  // ---------- панель ----------
  $('#dz-name').oninput = e => { d.name = e.target.value; if (isNew) renderTabs(); changed(); };
  const sch = $('#dz-schema'); if (sch) sch.onchange = e => { d.schema = e.target.value; tab.schema = d.schema; changed(); };
  $('#dz-sql').onclick = () => {
    d.sqlOpen = !d.sqlOpen;
    $('#dz-sql').classList.toggle('on', d.sqlOpen);
    $('#dz-sqlbox').classList.toggle('hidden', !d.sqlOpen);
    if (d.sqlOpen) dzPreview(tab);
  };
  $('#dz-toeditor').onclick = () => { if (d.sqlText) newQueryTab(d.sqlText); };
  $('#dz-revert').onclick = () => { tab.d = null; d.fields = []; loadTab(tab); };
  $('#dz-save').onclick = () => saveDesign(tab);

  renderProps();
  changed();
}

// ================= SQL-превью =================
let dzTimer = 0;
function dzPreviewSoon(tab) {
  clearTimeout(dzTimer);
  if (tab.d && tab.d.sqlOpen) dzTimer = setTimeout(() => dzPreview(tab), 250);
}

async function dzPreview(tab) {
  const d = tab.d, pre = $('#dz-sqlpre');
  if (!d || !pre || curTab() !== tab) return;
  if (!designCount(tab)) { d.sqlText = ''; pre.innerHTML = `<span class="hint">${esc(t('dzSqlNone'))}</span>`; return; }
  try {
    const list = await api('design_preview', tab.conn, d.schema, d.table, d.name, dzPayload(d));
    d.sqlText = list.join('\n\n');
    if (curTab() === tab && $('#dz-sqlpre')) $('#dz-sqlpre').innerHTML = highlight(d.sqlText).trim() || esc(t('dzSqlNone'));
  } catch (e) {
    d.sqlText = '';
    if ($('#dz-sqlpre')) $('#dz-sqlpre').innerHTML = `<span class="dz-err">${esc(e.message)}</span>`;
  }
}

// ================= сохранение =================
async function saveDesign(tab) {
  const d = tab.d;
  if (!d || !designCount(tab)) return true;
  const isNew = tab.type === 'design';
  const gone = d.fields.filter(f => f.del).map(f => `«${f.orig}»`);
  if (gone.length && !await confirmDanger(t('dzDropTitle', { n: gone.length }), t('dzDropText', { c: gone.join(', ') }), t('dzSaveDrop'))) return false;
  const btn = $('#dz-save'); if (btn) btn.disabled = true;
  try {
    await api('design_save', tab.conn, d.schema, d.table, d.name, dzPayload(d));
  } catch (e) {
    toast(e.message, 'err');
    if (btn) btn.disabled = false;
    return false;
  }
  const name = d.name.trim();
  if (isNew) {
    toast(t('tableCreated', { t: name }));
    d.snap = dzSnap(d);
    forceCloseTab(tab.id);
    await loadTree(tab.conn);
    openTable(tab.conn, d.schema, name, 'table', 'data');   // сразу можно заполнять строки
  } else {
    toast(t('dzSaved', { t: name }));
    tab.table = name;
    tab.data = null; tab.structure = null; tab.colW = {}; tab.orderBy = null; recount(tab);
    tab.d = null;
    await loadDesign(tab).catch(e => toast(e.message, 'err'));
    markDirty();
    renderTabs();
    if (curTab() === tab) renderPane();
    loadTree(tab.conn);
  }
  return true;
}
