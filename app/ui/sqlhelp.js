// Подсказки к запросу: где ошибка и как её исправить.
// 1) После выполнения – разбор ошибки PostgreSQL (sqlDiagnose): точное место (красная волна в редакторе),
//    объяснение и варианты исправления в один клик – в панели результата.
// 2) Пока пишешь – проверка без обращения к базе (sqlLint): скобки, кавычки, неизвестные таблицы и колонки,
//    опечатки в командах, = NULL, подсчёты без GROUP BY (жёлтая волна, подсказка при наведении).
// Исправление – это список правок {s, e, text} по тексту редактора; вставляются через execCommand, поэтому ⌘Z работает.

Object.assign(I18N.ru, {
  sqAliasTitle: 'Таблица «{a}» не подключена', sqAliasWhy: 'В запросе есть {v}, но в FROM и JOIN нет таблицы с псевдонимом {a}.',
  sqFixAllLabel: 'Исправленный запрос – правок: {n}', sqOnlyThis: 'Исправить по одной ({n})', sqRemove: 'убрать',
  sqHowFix: 'Как исправить', sqOther: 'Другие варианты ({n})', sqPgText: 'Текст ошибки PostgreSQL', sqAtLine: 'Строка {n}', sqFix: 'Исправить', sqFixed: 'Исправлено – выполни запрос ещё раз', sqStale: 'Текст запроса изменился – выполни его заново, чтобы увидеть подсказки',
  sqReplace: 'Заменить на {v}', sqMaybe: 'Возможно, имелось в виду {v}',
  sqColText: 'Это текст? Текст пишется в одинарных кавычках: {v}. В двойных кавычках PostgreSQL ищет колонку',
  sqColOther: 'Колонка {c} есть в таблице {t} – подключи её через JOIN',
  sqColAlias: '{c} – это название из SELECT (после AS). В WHERE и GROUP BY его использовать нельзя – повтори само выражение или оберни запрос в подзапрос',
  sqColCase: 'Имя в двойных кавычках учитывает регистр букв: «{v}» и «{w}» – разные имена',
  sqTblWrongDb: 'Сейчас открыта база {d} – может, таблица в другой базе или схеме?',
  sqAliasMissing: 'Псевдоним {a} не объявлен в FROM или JOIN', sqJoin: 'Подключить {t} – она связана с {r}',
  sqAddGroup: 'Добавить в GROUP BY: {v}', sqAggTip: 'Или посчитай эту колонку: MAX({c}), COUNT({c}) или другой подсчёт',
  sqAmbig: 'Колонка {c} есть в нескольких таблицах запроса – укажи, из какой', sqTake: 'Взять из {t}: {v}',
  sqKw: 'Опечатка в команде? {v}', sqTrailingComma: 'Лишняя запятая перед {v}', sqRemoveComma: 'Убрать запятую',
  sqMissingComma: 'Похоже, пропущена запятая между колонками', sqAddComma: 'Поставить запятую',
  sqDoubleEq: 'В SQL сравнение пишется одним знаком =', sqQuoteKw: '{v} – служебное слово SQL. Если это колонка, возьми её в двойные кавычки: {w}',
  sqUnclosedQuote: 'Кавычка не закрыта', sqCloseQuote: 'Закрыть кавычку', sqUnclosedParen: 'Скобка не закрыта', sqCloseParen: 'Закрыть скобку',
  sqExtraParen: 'Лишняя закрывающая скобка', sqRemoveParen: 'Убрать скобку', sqUnclosedComment: 'Комментарий /* не закрыт – закрой его */',
  sqEndKw: 'После {v} чего-то не хватает – допиши условие или убери слово', sqEndGeneric: 'Запрос оборвался: проверь скобки, кавычки и последние слова',
  sqSubAlias: 'Подзапросу в FROM нужно имя', sqAddAlias: 'Дать имя: … ) AS q',
  sqNearGeneric: 'Проверь текст рядом с отмеченным местом: опечатки, запятые, кавычки, скобки и порядок частей (SELECT → FROM → WHERE → GROUP BY → ORDER BY → LIMIT)',
  sqFn: 'Функции {v} нет', sqRound: 'ROUND с числом знаков работает с типом numeric: ROUND(x::numeric, 2)', sqRoundFix: 'Добавить ::numeric',
  sqSumText: 'Колонка текстовая – посчитать {v} по тексту нельзя. Если там хранятся числа, приведи тип: {v}(колонка::numeric)',
  sqFnArgs: 'Функции {v} переданы значения не того типа – проверь колонки внутри скобок',
  sqOp: 'Слева и справа от {o} разные типы: {a} и {b}. Сравнивать можно только одинаковые – приведи одно к другому, например колонка::text или \'5\'::integer',
  sqOpFix: 'Привести к {v}',
  sqDivZero: 'Чтобы вместо ошибки получить пусто, дели на NULLIF(делитель, 0)', sqDivFix: 'Делить на NULLIF(…, 0)',
  sqBadNum: 'Значение {v} не число, а колонка числовая. Проверь значение или кавычки',
  sqBadDate: 'Неверная дата {v}. Даты пиши так: \'2026-10-11\' или \'2026-10-11 14:30\'', sqDateFix: 'Записать как {v}',
  sqManyRows: 'Знак = ждёт одно значение. Используй IN или добавь в подзапрос LIMIT 1', sqUseIn: 'Заменить = на IN',
  sqWhereBool: 'В WHERE нужно условие, например колонка = значение', sqCaseTypes: 'Все ветки CASE должны давать один тип – например, везде текст или везде числа',
  sqUnion: 'В каждой части UNION должно быть одинаковое число колонок', sqDistinctOrder: 'При SELECT DISTINCT в ORDER BY можно только колонки из SELECT',
  sqDupTable: 'Таблица указана дважды – дай им разные псевдонимы: FROM t a JOIN t b',
  sqNullEq: 'Сравнение с NULL через = всегда пустое – пиши {v}', sqDqValue: 'В двойных кавычках PostgreSQL ищет колонку. Текст – в одинарных: {v}',
  sqNoTable: 'Таблицы {t} нет в базе', sqNoCol: 'Колонки {c} нет в {t}', sqNoColAny: 'Колонки {c} нет в таблицах запроса',
  sqAggNoGroup: 'В запросе есть подсчёт (COUNT, SUM…) без GROUP BY – колонку {c} нужно добавить в GROUP BY',
  sqColsOf: 'Колонки {t}: {v}', sqDateAmbig: 'Дату {v} PostgreSQL может понять как месяц.день – пиши в формате год-месяц-день: {w}', sqOutOfRange: 'Число слишком большое для этого типа колонки', sqTimeoutTip: 'Запрос шёл дольше лимита из настроек. Добавь условия в WHERE или LIMIT, или увеличь лимит',
});
Object.assign(I18N.en, {
  sqAliasTitle: 'Table “{a}” isn’t in the query', sqAliasWhy: 'The query uses {v}, but no table in FROM or JOIN has the alias {a}.',
  sqFixAllLabel: 'Fixed query – changes: {n}', sqOnlyThis: 'Fix one at a time ({n})', sqRemove: 'remove',
  sqHowFix: 'How to fix', sqOther: 'Other options ({n})', sqPgText: 'PostgreSQL error text', sqAtLine: 'Line {n}', sqFix: 'Fix', sqFixed: 'Fixed – run the query again', sqStale: 'The query text has changed – run it again to see hints',
  sqReplace: 'Replace with {v}', sqMaybe: 'Did you mean {v}?',
  sqColText: 'Is this text? Text goes in single quotes: {v}. In double quotes PostgreSQL looks for a column',
  sqColOther: 'Column {c} is in table {t} – add that table with a JOIN',
  sqColAlias: '{c} is a name from SELECT (after AS). It can’t be used in WHERE or GROUP BY – repeat the expression or wrap the query in a subquery',
  sqColCase: 'Names in double quotes are case-sensitive: “{v}” and “{w}” are different names',
  sqTblWrongDb: 'The open database is {d} – maybe the table is in another database or schema?',
  sqAliasMissing: 'Alias {a} isn’t declared in FROM or JOIN', sqJoin: 'Add {t} – it’s linked to {r}',
  sqAddGroup: 'Add to GROUP BY: {v}', sqAggTip: 'Or aggregate this column: MAX({c}), COUNT({c}) or another function',
  sqAmbig: 'Column {c} is in several tables of the query – say which one', sqTake: 'Take it from {t}: {v}',
  sqKw: 'Typo in a keyword? {v}', sqTrailingComma: 'Extra comma before {v}', sqRemoveComma: 'Remove the comma',
  sqMissingComma: 'Looks like a comma between columns is missing', sqAddComma: 'Add a comma',
  sqDoubleEq: 'SQL compares with a single =', sqQuoteKw: '{v} is an SQL keyword. If it’s a column, put it in double quotes: {w}',
  sqUnclosedQuote: 'Unclosed quote', sqCloseQuote: 'Close the quote', sqUnclosedParen: 'Unclosed parenthesis', sqCloseParen: 'Close the parenthesis',
  sqExtraParen: 'Extra closing parenthesis', sqRemoveParen: 'Remove it', sqUnclosedComment: 'Comment /* isn’t closed – close it with */',
  sqEndKw: 'Something is missing after {v} – finish the condition or remove the word', sqEndGeneric: 'The query ends too early: check parentheses, quotes and the last words',
  sqSubAlias: 'A subquery in FROM needs a name', sqAddAlias: 'Name it: … ) AS q',
  sqNearGeneric: 'Check the text near the marked spot: typos, commas, quotes, parentheses and clause order (SELECT → FROM → WHERE → GROUP BY → ORDER BY → LIMIT)',
  sqFn: 'There’s no function {v}', sqRound: 'ROUND with decimal places works with numeric: ROUND(x::numeric, 2)', sqRoundFix: 'Add ::numeric',
  sqSumText: 'The column is text – {v} can’t add up text. If it stores numbers, cast it: {v}(column::numeric)',
  sqFnArgs: 'Function {v} got values of the wrong type – check the columns inside the parentheses',
  sqOp: 'The two sides of {o} have different types: {a} and {b}. Cast one to the other, e.g. column::text or \'5\'::integer',
  sqOpFix: 'Cast to {v}',
  sqDivZero: 'To get empty instead of an error, divide by NULLIF(divisor, 0)', sqDivFix: 'Divide by NULLIF(…, 0)',
  sqBadNum: 'Value {v} isn’t a number, but the column is numeric. Check the value or the quotes',
  sqBadDate: 'Invalid date {v}. Write dates like \'2026-10-11\' or \'2026-10-11 14:30\'', sqDateFix: 'Write it as {v}',
  sqManyRows: 'The = sign expects one value. Use IN or add LIMIT 1 to the subquery', sqUseIn: 'Replace = with IN',
  sqWhereBool: 'WHERE needs a condition, e.g. column = value', sqCaseTypes: 'All CASE branches must return one type – all text or all numbers',
  sqUnion: 'Every part of a UNION must have the same number of columns', sqDistinctOrder: 'With SELECT DISTINCT, ORDER BY may use only columns from SELECT',
  sqDupTable: 'The table is used twice – give them different aliases: FROM t a JOIN t b',
  sqNullEq: 'Comparing with NULL using = is always empty – write {v}', sqDqValue: 'Double quotes mean a column name. Text goes in single quotes: {v}',
  sqNoTable: 'There’s no table {t} in the database', sqNoCol: 'There’s no column {c} in {t}', sqNoColAny: 'None of the query’s tables has column {c}',
  sqAggNoGroup: 'The query aggregates (COUNT, SUM…) without GROUP BY – add column {c} to GROUP BY',
  sqColsOf: 'Columns of {t}: {v}', sqDateAmbig: 'PostgreSQL may read {v} as month.day – write year-month-day: {w}', sqOutOfRange: 'The number is too large for this column type', sqTimeoutTip: 'The query ran longer than the limit in Settings. Narrow it with WHERE or LIMIT, or raise the limit',
});

// ================= общее =================
const SQ_RESERVED = new Set(('all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create ' +
  'current_catalog current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else end ' +
  'except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime localtimestamp not ' +
  'null offset on only or order placing primary references returning select session_user some symmetric table then to trailing true ' +
  'union unique user using variadic when where window with').split(' '));
const SQ_CLAUSE_KW = ['select', 'from', 'where', 'group', 'order', 'having', 'limit', 'join', 'inner', 'left', 'right', 'update',
  'delete', 'insert', 'into', 'values', 'distinct', 'between', 'offset', 'union', 'returning'];
const SQ_TYPES = 'integer int int2 int4 int8 smallint bigint numeric decimal real double precision float float4 float8 text varchar char character varying ' +
  'boolean bool date time timestamp timestamptz interval json jsonb uuid bytea money serial bigserial zone without';
const SQ_DATEPARTS = 'year month day hour minute second week quarter dow doy epoch isodow isoyear century decade millennium millisecond microsecond milliseconds microseconds';
const SQ_WORDS = new Set([...FMT_KW, ...KW, ...FMT_FN, ...SQ_RESERVED, ...SQ_TYPES.split(' '), ...SQ_DATEPARTS.split(' '),
  ...'current_time localtime localtimestamp session_user current_user user null true false not ilike similar any some array row excluded new old ties percent'.split(' ')]);
const SQ_AGG = new Set(['count', 'sum', 'avg', 'min', 'max', 'string_agg', 'array_agg', 'json_agg', 'jsonb_agg', 'bool_and', 'bool_or', 'every',
  'stddev', 'variance', 'percentile_cont', 'percentile_disc', 'mode', 'corr']);
const SQ_ENDERS = new Set(['where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'on', 'group', 'order', 'limit', 'having', 'union', 'set',
  'values', 'natural', 'using', 'offset', 'returning', 'window', 'except', 'intersect', 'fetch', 'for', 'lateral', 'select', 'from']);

// расстояние между словами (с перестановкой соседних букв: «form» → «from» – одна правка)
function sqDist(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
// похожие названия: до 3, самые близкие первыми
function sqClosest(word, names, max = 3) {
  const w = word.toLowerCase(), lim = w.length <= 3 ? 1 : w.length <= 6 ? 2 : 3;
  const seen = new Set(), out = [];
  names.forEach(n => {
    const k = n.toLowerCase();
    if (seen.has(k)) return; seen.add(k);
    const dd = k === w ? 0 : sqDist(w, k);
    const pre = k.length >= 3 && (k.startsWith(w) || w.startsWith(k)) && Math.abs(k.length - w.length) <= 3;
    if (dd <= lim || pre) out.push({ n, dd: pre ? Math.min(dd, lim) : dd });
  });
  return out.sort((a, b) => a.dd - b.dd || a.n.length - b.n.length).slice(0, max).map(x => x.n);
}
const sqCode = s => `<code>${esc(s)}</code>`;
const sqName = raw => (raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase());
const sqKeepCase = (orig, kw) => (orig === orig.toUpperCase() ? kw.toUpperCase() : orig[0] === orig[0].toUpperCase() ? kw[0].toUpperCase() + kw.slice(1) : kw);

// токены с позициями; значимые – без пробелов и комментариев
function sqTokens(text) {
  let p = 0;
  return sqlTokens(text).map(x => { const o = { ...x, s: p, e: p + x.v.length }; p = o.e; return o; });
}
const sqSig = toks => toks.filter(x => x.t !== 'ws' && x.t !== 'lcom' && x.t !== 'bcom');
const isIdent = x => x && (x.t === 'word' || (x.t === 'lit' && x.v.startsWith('"')));

// значимые токены по запросам (через ;)
function sqStatements(sig) {
  const out = [];
  let cur = [];
  sig.forEach(x => { if (x.t === 'p' && x.v === ';') { if (cur.length) out.push(cur); cur = []; } else cur.push(x); });
  if (cur.length) out.push(cur);
  return out;
}

// таблицы запроса и их псевдонимы
function sqScope(st, meta) {
  const refs = [], ctes = new Set(), outAl = new Set();
  let derived = false;
  const owners = [];          // слово перед каждой открытой скобкой: FROM внутри EXTRACT(… FROM …) – не таблица
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    if (x.v === '(') owners.push(st[i - 1] ? st[i - 1].lw : '');
    else if (x.v === ')') owners.pop();
    if (x.lw === 'from' && ['extract', 'substring', 'trim', 'overlay', 'position', 'substr'].includes(owners[owners.length - 1])) continue;
    if (isIdent(x) && st[i + 1] && st[i + 1].lw === 'as' && st[i + 2] && st[i + 2].v === '(') ctes.add(sqName(x.v));
    if (x.lw === 'as' && isIdent(st[i + 1]) && !(st[i + 2] && st[i + 2].v === '(')) outAl.add(sqName(st[i + 1].v));
    if (!['from', 'join', 'update', 'into'].includes(x.lw)) continue;
    let j = i + 1;
    for (;;) {
      if (st[j] && st[j].lw === 'lateral') j++;
      if (st[j] && st[j].lw === 'only') j++;
      let ref = null;
      if (st[j] && st[j].v === '(') {             // подзапрос в FROM
        let d = 0, k = j;
        for (; k < st.length; k++) { if (st[k].v === '(') d++; else if (st[k].v === ')' && --d === 0) break; }
        j = k + 1;
        ref = { derived: true };
        derived = true;
      } else if (isIdent(st[j])) {
        const s = st[j].s;
        let raw = st[j].v, e = st[j].e;
        j++;
        while (st[j] && st[j].v === '.' && isIdent(st[j + 1])) { raw += '.' + st[j + 1].v; e = st[j + 1].e; j += 2; }
        if (st[j] && st[j].v === '(' && x.lw !== 'into') {          // функция в FROM: generate_series(…); после INTO – список колонок
          let d = 0, k = j;
          for (; k < st.length; k++) { if (st[k].v === '(') d++; else if (st[k].v === ')' && --d === 0) break; }
          j = k + 1; ref = { derived: true }; derived = true;
        } else {
          const name = sqName(raw.split('.').pop());
          ref = { raw, name, s, e, cte: ctes.has(name), tbl: ctes.has(name) ? null : findTable(meta, raw) };
          if (ref.cte) derived = true;
        }
      } else break;
      if (st[j] && st[j].lw === 'as') j++;
      if (isIdent(st[j]) && !SQ_ENDERS.has(st[j].lw)) { ref.alias = sqName(st[j].v); ref.aliasTok = st[j]; j++; }
      if (st[j] && st[j].v === '(' && ref.alias) {   // псевдоним со списком колонок: AS q(a, b)
        let d = 0, k = j;
        for (; k < st.length; k++) { if (st[k].v === '(') d++; else if (st[k].v === ')' && --d === 0) break; }
        j = k + 1; ref.derived = true; derived = true;
      }
      refs.push(ref);
      if (x.lw === 'from' && st[j] && st[j].v === ',') { j++; continue; }   // FROM a, b
      break;
    }
  }
  // псевдонимы без AS в списке SELECT: price * 0.9 discounted
  (sqSelectItems(st) || []).forEach(it => {
    const l = it[it.length - 1], pl = it[it.length - 2];
    if (it.length >= 2 && isIdent(l) && !SQ_WORDS.has(l.lw) && pl && pl.v !== '.' && pl.v !== '::'
      && (isIdent(pl) || pl.v === ')' || pl.v === ']' || pl.lw === 'end' || pl.t === 'num' || pl.t === 'lit' || pl.v === '*')) outAl.add(sqName(l.v));
  });
  const byName = n => refs.find(r => r.alias === n) || refs.find(r => !r.alias && r.name === n) || refs.find(r => r.name === n);
  const cols = [...new Set(refs.flatMap(r => (r.tbl ? r.tbl.cols.map(c => c.name) : [])))];
  const known = refs.length > 0 && refs.every(r => r.tbl) && !derived;
  return { refs, ctes, outAl, derived, byName, cols, known };
}

// куда вставить новую часть запроса (GROUP BY, JOIN): перед ORDER/LIMIT/… верхнего уровня или в конец запроса
function sqClauseEnd(st, stops) {
  let d = 0;
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    if (x.v === '(') d++; else if (x.v === ')') d--;
    else if (d === 0 && i > 0 && stops.includes(x.lw)) return { at: st[i - 1].e, before: x };
  }
  return { at: st[st.length - 1].e, before: null };
}

// элементы списка SELECT верхнего уровня (между SELECT и FROM)
function sqSelectItems(st) {
  if (!st.length || st[0].lw !== 'select') return null;
  let i = 1;
  if (st[i] && st[i].lw === 'distinct') { if (st[i + 1] && st[i + 1].lw === 'on') return null; i++; }
  const items = [];
  let cur = [], d = 0;
  for (; i < st.length; i++) {
    const x = st[i];
    if (x.v === '(') d++; else if (x.v === ')') d--;
    if (d === 0 && (x.lw === 'from' || x.lw === 'into' || x.v === ';')) break;
    if (d === 0 && x.v === ',') { items.push(cur); cur = []; continue; }
    cur.push(x);
  }
  if (cur.length) items.push(cur);
  return items;
}
// подсчёт в элементе SELECT – но не внутри подзапроса (SELECT SUM(…) FROM …) и не оконный (OVER)
function sqHasAgg(it) {
  if (it.some(x => x.lw === 'over')) return false;
  for (let k = 0; k < it.length; k++) {
    if (it[k].v === '(' && it[k + 1] && it[k + 1].lw === 'select') {
      let d = 0;
      for (; k < it.length; k++) { if (it[k].v === '(') d++; else if (it[k].v === ')' && --d === 0) break; }
      continue;
    }
    if (it[k].t === 'word' && SQ_AGG.has(it[k].lw) && it[k + 1] && it[k + 1].v === '(') return true;
  }
  return false;
}
// простая колонка: col, t.col, с псевдонимом или без
function sqPlainCol(it) {
  let k = 0;
  if (!isIdent(it[k])) return null;
  let e = it[k].e; const s = it[k].s; k++;
  if (it[k] && it[k].v === '.' && isIdent(it[k + 1])) { e = it[k + 1].e; k += 2; }
  if (it[k] && it[k].lw === 'as') k++;
  if (it[k] && isIdent(it[k])) k++;
  return k === it.length ? { s, e } : null;
}
const sqHasGroup = st => { let d = 0; return st.some((x, i) => { if (x.v === '(') d++; else if (x.v === ')') d--; return d === 0 && x.lw === 'group' && st[i + 1] && st[i + 1].lw === 'by'; }); };

// связи таблиц (для подсказки JOIN) – один раз на базу и схему
const SQ_FKS = {};
async function sqFks(conn, schema) {
  const k = `${conn}|${S.info[conn] && S.info[conn].db}|${schema}`;
  if (!SQ_FKS[k]) SQ_FKS[k] = api('schema_diagram', conn, schema).then(d => d.fks || []).catch(() => []);
  return SQ_FKS[k];
}

// ================= разбор ошибки PostgreSQL =================
// err – ошибка из api(), base – где в редакторе начинается выполненный текст, bound – были ли {{переменные}}
// → {at: {s, e} | null, fixes: [{label, edits}], tips: [html], text}
async function sqlDiagnose(tab, err, base, bound, textArg) {
  const text = textArg ?? tab.sql, meta = S.meta[tab.conn] || [];
  const toks = sqTokens(text), sig = sqSig(toks), stmts = sqStatements(sig);
  const out = { at: null, fixes: [], tips: [], text };
  const p = err.pos && !bound ? base + err.pos - 1 : null;
  const st = (p != null ? stmts.find(s => s[0].s <= p && p <= s[s.length - 1].e) : null)
    || stmts.find(s => s[0].s >= base) || stmts[0] || [];
  const sc = sqScope(st, meta);
  const tokAt = pos => sig.find(x => x.s <= pos && pos < x.e) || sig.find(x => x.s >= pos);
  const idx = tk => sig.indexOf(tk);
  const fix = (label, edits) => { if (!out.fixes.some(f => f.label === label)) out.fixes.push({ label, edits }); };
  const tip = h => out.tips.push(h);
  const msg = err.raw || '';
  const state = err.state;
  // квалифицированное имя на позиции: t.col → {s, e, parts: [токены]}
  const qualAt = tk => {
    let i = idx(tk); const parts = [sig[i]];
    while (sig[i + 1] && sig[i + 1].v === '.' && isIdent(sig[i + 2])) { parts.push(sig[i + 2]); i += 2; }
    return { s: parts[0].s, e: parts[parts.length - 1].e, parts };
  };
  const tk = p != null ? tokAt(p) : null;
  if (tk) out.at = { s: tk.s, e: tk.e };

  if (state === '42703') {                                   // нет колонки
    const m = /column (?:"?([^"\s.]+)"?\.)?"?([^"]+?)"? of relation/.exec(msg) || /column (?:"?([^"\s.]+)"?\.)?"?(.+?)"? does not exist/.exec(msg) || /"(?:([^"\s.]+)\.)?([^"]+)"/.exec(msg);
    const name = m ? m[2] : (tk ? sqName(tk.v) : '');
    let q = tk && isIdent(tk) ? qualAt(tk) : null;
    if (!q && name) {                                        // без позиции (с переменными) – ищем по имени
      const f = sig.find(x => isIdent(x) && sqName(x.v) === name.toLowerCase());
      if (f) q = qualAt(f);
    }
    if (q) {
      out.at = { s: q.s, e: q.e };
      const last = q.parts[q.parts.length - 1], qual = q.parts.length > 1 ? q.parts[q.parts.length - 2] : null;
      const ref = qual ? sc.byName(sqName(qual.v)) : null;
      const pool = ref && ref.tbl ? ref.tbl.cols.map(c => c.name) : sc.cols;
      const exact = pool.find(c => c.toLowerCase() === sqName(last.v).toLowerCase() && c !== sqName(last.v));
      if (exact) { tip(t('sqColCase', { v: esc(sqName(last.v)), w: esc(exact) })); fix(t('sqReplace', { v: sqCode(exact) }), [{ s: last.s, e: last.e, text: quoteId(exact) }]); }
      const near = sqClosest(sqName(last.v), pool).filter(c => c !== exact);
      near.forEach(c => fix(t('sqReplace', { v: sqCode(c) }), [{ s: last.s, e: last.e, text: quoteId(c) }]));
      // "Москва" – это текст, а не колонка
      if (last.v.startsWith('"') && !near.length && !exact) {
        const lit = `'${sqName(last.v).replace(/'/g, "''")}'`;
        tip(t('sqColText', { v: sqCode(lit) }));
        fix(t('sqReplace', { v: sqCode(lit) }), [{ s: last.s, e: last.e, text: lit }]);
      }
      // status = delivered – значение без кавычек сравнивается, как будто это колонка
      const before = sig[idx(q.parts[0]) - 1];
      if (!last.v.startsWith('"') && !qual && !near.length && !exact && before && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(before.v)) {
        const lit = `'${sqName(last.v).replace(/'/g, "''")}'`;
        tip(t('sqColText', { v: sqCode(lit) }));
        fix(t('sqReplace', { v: sqCode(lit) }), [{ s: last.s, e: last.e, text: lit }]);
      }
      if (sc.outAl.has(sqName(last.v))) tip(t('sqColAlias', { c: sqCode(sqName(last.v)) }));
      if (!near.length && !exact) {
        const other = meta.filter(x => !sc.refs.some(r => r.tbl === x) && x.cols.some(c => c.name === sqName(last.v))).slice(0, 3);
        if (other.length) tip(t('sqColOther', { c: sqCode(sqName(last.v)), t: other.map(x => sqCode(x.name)).join(', ') }));
        const tbls = ref && ref.tbl ? [ref] : sc.refs.filter(r => r.tbl);
        if (!last.v.startsWith('"')) tbls.slice(0, 3).forEach(r => tip(t('sqColsOf', { t: sqCode(r.tbl.name), v: r.tbl.cols.slice(0, 24).map(c => sqCode(c.name)).join(' ') })));
      }
    }
    // подсказка самого PostgreSQL: Perhaps you meant to reference the column "o.total"
    const hm = /column "([^"]+)"/.exec(err.hint || '');
    if (hm && q && !out.fixes.some(f => f.edits[0].text === quoteId(hm[1].split('.').pop()))) fix(t('sqReplace', { v: sqCode(hm[1]) }), [{ s: q.s, e: q.e, text: hm[1] }]);
  } else if (state === '42P01' && /\bFROM\b/.test(msg) && /"([^"]+)"/.test(msg)) {   // псевдоним не объявлен (в тексте на любом языке есть «FROM»)
    const a = (/missing FROM-clause entry for table "([^"]+)"/.exec(msg) || /"([^"]+)"/.exec(msg))[1];
    const atk = tk && isIdent(tk) ? tk : sig.find(x => isIdent(x) && sqName(x.v) === a && sig[idx(x) + 1] && sig[idx(x) + 1].v === '.');
    if (atk) out.at = { s: atk.s, e: atk.e };
    // короткий заголовок и пояснение: «Таблица «o» не подключена»
    out.title = t('sqAliasTitle', { a });
    if (atk && sig[idx(atk) + 2]) tip(t('sqAliasWhy', { v: sqCode(text.slice(atk.s, sig[idx(atk) + 2].e)), a: esc(a) }));
    const names = sc.refs.flatMap(r => [r.alias, r.name]).filter(Boolean);
    if (atk && a.length >= 3) sqClosest(a, names).forEach(n => fix(t('sqReplace', { v: sqCode(n) }), [{ s: atk.s, e: atk.e, text: n }]));
    // подключить таблицу по связи: o → orders, связанная с таблицей из FROM
    const known = sc.refs.filter(r => r.tbl);
    if (known.length) {
      const schema = known[0].tbl.schema;
      const fks = await sqFks(tab.conn, schema);
      const cands = meta.filter(x => x.schema === schema && !known.some(r => r.tbl === x) && (x.name.toLowerCase() === a.toLowerCase() || x.name.toLowerCase().startsWith(a.toLowerCase())));
      const where = sqClauseEnd(st, ['where', 'group', 'order', 'limit', 'offset', 'having', 'union', 'window', 'returning']);
      cands.slice(0, 4).forEach(c => {
        for (const r of known) {
          const ra = r.alias || r.name;
          const f1 = fks.find(f => f.src === c.name && f.ref === r.tbl.name), f2 = fks.find(f => f.src === r.tbl.name && f.ref === c.name);
          const on = f1 ? f1.columns.map((col, k) => `${a}.${quoteId(col)} = ${ra}.${quoteId(f1.ref_columns[k])}`).join(' AND ')
            : f2 ? f2.columns.map((col, k) => `${ra}.${quoteId(col)} = ${a}.${quoteId(f2.ref_columns[k])}`).join(' AND ') : null;
          if (!on) continue;
          const clause = `JOIN ${quoteId(c.name)} ${a} ON ${on}`;
          fix(t('sqJoin', { t: `<b>${esc(c.name)}</b>`, r: esc(r.tbl.name) }), [{ s: where.at, e: where.at, text: '\n' + clause }]);
          break;
        }
      });
    }
  } else if (state === '42P01') {                            // нет таблицы
    const m = /relation "([^"]+)" does not exist/.exec(msg) || /"([^"]+)"/.exec(msg);
    const name = m ? m[1] : '';
    let q = tk && isIdent(tk) ? qualAt(tk) : null;
    if (!q && name) { const f = sig.find(x => isIdent(x) && sqName(x.v) === name.split('.').pop().toLowerCase()); if (f) q = qualAt(f); }
    if (q) {
      out.at = { s: q.s, e: q.e };
      const last = sqName(q.parts[q.parts.length - 1].v);
      sqClosest(last, meta.map(x => x.name)).forEach(n => {
        const tb = meta.find(x => x.name === n);
        const full = tb && tb.schema !== 'public' ? `${quoteId(tb.schema)}.${quoteId(n)}` : quoteId(n);
        fix(t('sqReplace', { v: sqCode(full) }), [{ s: q.s, e: q.e, text: full }]);
      });
    }
    if (!out.fixes.length) tip(t('sqTblWrongDb', { d: sqCode(S.info[tab.conn] ? S.info[tab.conn].db : '') }));
  } else if (state === '42702') {                            // колонка есть в нескольких таблицах
    const m = /column reference "([^"]+)" is ambiguous/.exec(msg) || /"([^"]+)"/.exec(msg);
    const c = m ? m[1] : (tk ? sqName(tk.v) : '');
    const at = tk && isIdent(tk) ? tk : sig.find(x => isIdent(x) && sqName(x.v) === c);
    if (at) {
      out.at = { s: at.s, e: at.e };
      sc.refs.filter(r => r.tbl && r.tbl.cols.some(x => x.name === c)).forEach(r => {
        const v = `${r.alias || quoteId(r.name)}.${quoteId(c)}`;
        fix(t('sqTake', { t: sqCode(r.name), v: sqCode(v) }), [{ s: at.s, e: at.e, text: v }]);
      });
    }
  } else if (state === '42803') {                            // колонка не в GROUP BY
    const m = /column "([^"]+)" must appear in the GROUP BY/.exec(msg) || /"([^"]+)"/.exec(msg);
    const col = m ? m[1] : '';
    const q = tk && isIdent(tk) ? qualAt(tk) : null;
    if (q) out.at = { s: q.s, e: q.e };
    const expr = q ? text.slice(q.s, q.e) : col;
    const items = sqSelectItems(st) || [];
    let add = [expr];
    if (!sqHasGroup(st)) {     // GROUP BY ещё нет – добавить сразу все простые колонки из SELECT
      add = items.filter(it => !sqHasAgg(it)).map(sqPlainCol).filter(Boolean).map(r => text.slice(r.s, r.e).trim());
      if (!add.includes(expr)) add.unshift(expr);
      const at = sqClauseEnd(st, ['having', 'order', 'limit', 'offset', 'union', 'window', 'fetch']);
      fix(t('sqAddGroup', { v: sqCode(add.join(', ')) }), [{ s: at.at, e: at.at, text: '\nGROUP BY ' + add.join(', ') }]);
    } else {
      const at = sqClauseEnd(st, ['having', 'order', 'limit', 'offset', 'union', 'window', 'fetch']);
      fix(t('sqAddGroup', { v: sqCode(expr) }), [{ s: at.at, e: at.at, text: ', ' + expr }]);
    }
    tip(t('sqAggTip', { c: esc(expr) }));
  } else if (state === '42601' && /unterminated quoted string|unterminated quoted identifier/.test(msg)) {
    const q = tk || tokAt(p || 0);
    if (q) {
      const lineEnd = text.indexOf('\n', q.s) < 0 ? text.length : text.indexOf('\n', q.s);
      let at = lineEnd; while (at > q.s + 1 && /[\s;]/.test(text[at - 1])) at--;
      out.at = { s: q.s, e: Math.min(lineEnd, q.s + 1) };
      fix(t('sqCloseQuote'), [{ s: at, e: at, text: q.v[0] === '"' ? '"' : "'" }]);
    }
  } else if (state === '42601' && /subquery in FROM must have an alias/.test(msg)) {
    const open = tk && tk.v === '(' ? tk : null;
    if (open) {
      let d = 0, k = idx(open);
      for (; k < sig.length; k++) { if (sig[k].v === '(') d++; else if (sig[k].v === ')' && --d === 0) break; }
      if (sig[k]) { out.at = { s: open.s, e: open.e }; fix(t('sqAddAlias'), [{ s: sig[k].e, e: sig[k].e, text: ' AS q' }]); }
    }
  } else if (state === '42601' && /at end of input/.test(msg)) {
    sqEndAdvice(st, text, out, fix, tip);
  } else if (state === '42601' && /each UNION query must have the same number of columns/.test(msg)) {
    tip(t('sqUnion'));
  } else if (state === '42601' && tk) {                      // синтаксис рядом со словом
    sqSyntaxAdvice(tk, sig, sc, text, out, fix, tip);
  } else if (state === '42883' && /^function /.test(msg)) {   // нет функции или не те аргументы
    const m = /function ([\w.]+)\(([^)]*)\) does not exist/.exec(msg);
    const fn = m ? m[1].split('.').pop() : '';
    const args = m ? m[2] : '';
    const ftk = tk && tk.t === 'word' ? tk : sig.find(x => x.lw === fn && sig[idx(x) + 1] && sig[idx(x) + 1].v === '(');
    if (ftk) out.at = { s: ftk.s, e: ftk.e };
    if (fn === 'round' && /double precision|real/.test(args) && ftk) {
      tip(t('sqRound'));
      const open = sig[idx(ftk) + 1];
      let d = 0, k = idx(open);
      for (; k < sig.length; k++) { const x = sig[k]; if (x.v === '(') d++; else if (x.v === ')') { if (--d === 0) break; } else if (x.v === ',' && d === 1) break; }
      if (sig[k]) fix(t('sqRoundFix'), [{ s: sig[k - 1].e, e: sig[k - 1].e, text: '::numeric' }]);
    } else if (['sum', 'avg'].includes(fn) && /text|character/.test(args)) {
      tip(t('sqSumText', { v: fn.toUpperCase() }));
    } else if (FMT_FN.has(fn) || SQ_AGG.has(fn)) {
      tip(t('sqFnArgs', { v: sqCode(fn.toUpperCase()) }));
    } else {
      tip(t('sqFn', { v: sqCode(fn) }));
      if (ftk) sqClosest(fn, [...FMT_FN]).forEach(n => fix(t('sqReplace', { v: sqCode(n.toUpperCase()) }), [{ s: ftk.s, e: ftk.e, text: sqKeepCase(ftk.v, n) }]));
    }
  } else if (state === '42883') {                            // оператор между разными типами
    const m = /operator does not exist: (.+?) (\S+) (.+)$/.exec(msg);
    if (m && /^={2,}$/.test(m[2])) {
      // «==» токенизатор делит на два «=» – берём всю серию
      let op = tk && tk.t === 'op' && /^=+$/.test(tk.v) ? tk : sig.find(x => x.v === '=' && sig[idx(x) + 1] && sig[idx(x) + 1].v === '=');
      tip(t('sqDoubleEq'));
      if (op) {
        let e = op.e, k = idx(op);
        while (sig[k + 1] && sig[k + 1].v === '=' && sig[k + 1].s === e) { e = sig[k + 1].e; k++; }
        out.at = { s: op.s, e }; fix(t('sqReplace', { v: sqCode('=') }), [{ s: op.s, e, text: '=' }]);
      }
    } else if (m) {
      tip(t('sqOp', { o: sqCode(m[2]), a: sqCode(m[1]), b: sqCode(m[3]) }));
      // справа число в кавычках или колонка-число против текста: предложим привести правую часть к типу левой
      if (tk && tk.t === 'op') {
        const r = sig[idx(tk) + 1];
        if (r && (isIdent(r) || r.t === 'num' || r.t === 'lit')) {
          let re = r.e, i = idx(r);
          while (sig[i + 1] && sig[i + 1].v === '.' && isIdent(sig[i + 2])) { re = sig[i + 2].e; i += 2; }
          const ty = m[1].replace(/^character varying$/, 'text');
          fix(t('sqOpFix', { v: sqCode(ty) }), [{ s: re, e: re, text: '::' + ty }]);
        }
      }
    } else tip(t('sqFnArgs', { v: '' }));
  } else if (state === '22012') {
    tip(t('sqDivZero'));
    const slash = sig.find((x, i) => x.v === '/' && st.includes(x) && sig[i + 1] && (isIdent(sig[i + 1]) || sig[i + 1].v === '('));
    if (slash) {
      const i = idx(slash), a = sig[i + 1];
      let e = a.e, k = i + 1;
      if (a.v === '(') { let d = 0; for (; k < sig.length; k++) { if (sig[k].v === '(') d++; else if (sig[k].v === ')' && --d === 0) break; } e = sig[k].e; }
      else while (sig[k + 1] && sig[k + 1].v === '.' && isIdent(sig[k + 2])) { e = sig[k + 2].e; k += 2; }
      out.at = { s: slash.s, e };
      fix(t('sqDivFix'), [{ s: a.s, e, text: `NULLIF(${text.slice(a.s, e)}, 0)` }]);
    }
  } else if (['22P02', '22007', '22008'].includes(state)) {   // значение не того формата
    const m = /type ([\w ]+): "(.*)"/.exec(msg) || /(date\/time)[^:]*: "(.*)"/.exec(msg);
    const ty = m ? m[1] : '', v = m ? m[2] : '';
    if (/date|time/.test(ty) || state !== '22P02') {
      tip(t('sqBadDate', { v: sqCode(v) }));
      const dm = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(.*)$/.exec(v);
      const lt = tk && tk.t === 'lit' ? tk : sig.find(x => x.t === 'lit' && x.v === `'${v}'`);
      if (dm && lt) {
        const iso = `'${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}${dm[4]}'`;
        out.at = { s: lt.s, e: lt.e };
        fix(t('sqDateFix', { v: sqCode(iso) }), [{ s: lt.s, e: lt.e, text: iso }]);
      }
    } else tip(t('sqBadNum', { v: sqCode(v) }));
  } else if (state === '21000') {
    tip(t('sqManyRows'));
    const eq = st.find((x, i) => x.v === '=' && st[i + 1] && st[i + 1].v === '(' && st[i + 2] && st[i + 2].lw === 'select');
    if (eq) { out.at = { s: eq.s, e: eq.e }; fix(t('sqUseIn'), [{ s: eq.s, e: eq.e, text: 'IN' }]); }
  } else if (state === '42804' && /argument of WHERE/.test(msg)) tip(t('sqWhereBool'));
  else if (state === '42804' && /CASE types/.test(msg)) tip(t('sqCaseTypes'));
  else if (state === '42P10') tip(t('sqDistinctOrder'));
  else if (state === '42712') tip(t('sqDupTable'));
  else if (state === '22003') tip(t('sqOutOfRange'));
  else if (state === '57014' && err.code === 'TIMEOUT') tip(t('sqTimeoutTip'));

  if (out.at && out.at.e <= out.at.s) out.at.e = out.at.s + 1;
  return out;
}

// синтаксическая ошибка рядом со словом: опечатка в команде, лишняя/пропущенная запятая, ==, служебное слово вместо колонки
function sqSyntaxAdvice(tk, sig, sc, text, out, fix, tip) {
  const i = sig.indexOf(tk), prev = sig[i - 1], prev2 = sig[i - 2];
  const meta = (curTab() && S.meta[curTab().conn]) || [];
  // псевдоним не считается «известным» словом: WHER и ORDR PostgreSQL принимает за псевдоним таблицы
  const known = n => sc.cols.includes(n) || sc.refs.some(r => r.name === n) || meta.some(x => x.name === n);
  // опечатка в команде: SELCT, FORM, WHER, GRUOP…
  for (const w of [tk, prev]) {
    if (!w || w.t !== 'word' || SQ_WORDS.has(w.lw) || known(w.lw) || w.v.length < 3) continue;
    const kw = sqClosest(w.lw, SQ_CLAUSE_KW, 1).filter(k => sqDist(k, w.lw) <= (w.v.length <= 4 ? 1 : 2))[0];
    if (kw) {
      out.at = { s: w.s, e: w.e };
      tip(t('sqKw', { v: sqCode(kw.toUpperCase()) }));
      fix(t('sqReplace', { v: sqCode(sqKeepCase(w.v, kw)) }), [{ s: w.s, e: w.e, text: sqKeepCase(w.v, kw) }]);
      return;
    }
  }
  // лишняя запятая: «a, b, FROM» и «(a, b,)»
  if (prev && prev.v === ',' && (tk.v === ')' || SQ_ENDERS.has(tk.lw))) {
    out.at = { s: prev.s, e: prev.e };
    tip(t('sqTrailingComma', { v: sqCode(tk.v.toUpperCase()) }));
    fix(t('sqRemoveComma'), [{ s: prev.s, e: prev.e, text: '' }]);
    return;
  }
  // ==
  if (tk.v === '=' && prev && prev.v === '=') {
    tip(t('sqDoubleEq')); fix(t('sqReplace', { v: sqCode('=') }), [{ s: prev.s, e: tk.e, text: '=' }]);
    return;
  }
  if (tk.v === '==') { tip(t('sqDoubleEq')); fix(t('sqReplace', { v: sqCode('=') }), [{ s: tk.s, e: tk.e, text: '=' }]); return; }
  // служебное слово как имя колонки: order, user, group…
  if (tk.t === 'word' && SQ_RESERVED.has(tk.lw) && sc.cols.includes(tk.lw)) {
    tip(t('sqQuoteKw', { v: sqCode(tk.v), w: sqCode(`"${tk.lw}"`) }));
    fix(t('sqReplace', { v: sqCode(`"${tk.lw}"`) }), [{ s: tk.s, e: tk.e, text: `"${tk.lw}"` }]);
    return;
  }
  // пропущенная запятая: «SELECT name salary bonus» – имя за именем
  if (isIdent(tk) && isIdent(prev) && !SQ_WORDS.has(prev.lw) && (isIdent(prev2) || (prev2 && (prev2.v === ')' || prev2.t === 'num' || prev2.t === 'lit')))) {
    out.at = { s: prev.e, e: tk.e };
    tip(t('sqMissingComma'));
    const edits = [{ s: prev.e, e: prev.e, text: ',' }];
    if (isIdent(prev2) && sc.cols.includes(sqName(prev.v)) && !SQ_WORDS.has(prev2.lw)) edits.unshift({ s: prev2.e, e: prev2.e, text: ',' });
    fix(t('sqAddComma'), edits);
    return;
  }
  if (tk.v === ')') {
    let d = 0; for (let k = 0; k <= i; k++) { if (sig[k].v === '(') d++; else if (sig[k].v === ')') d--; }
    if (d < 0) { tip(t('sqExtraParen')); fix(t('sqRemoveParen'), [{ s: tk.s, e: tk.e, text: '' }]); return; }
  }
  tip(t('sqNearGeneric'));
}

// запрос оборвался: незакрытые скобки, запятая или служебное слово в конце
function sqEndAdvice(st, text, out, fix, tip) {
  if (!st.length) { tip(t('sqEndGeneric')); return; }
  const last = st[st.length - 1];
  let d = 0; st.forEach(x => { if (x.v === '(') d++; else if (x.v === ')') d--; });
  if (last.t === 'bcom' || /\/\*(?![\s\S]*\*\/)/.test(text.slice(st[0].s))) { tip(t('sqUnclosedComment')); return; }
  if (last.v === ',') {
    out.at = { s: last.s, e: last.e };
    tip(t('sqTrailingComma', { v: '…' })); fix(t('sqRemoveComma'), [{ s: last.s, e: last.e, text: '' }]);
    return;
  }
  if (d > 0) {
    const open = [...st].reverse().find((x, k, arr) => { let dd = 0; for (let j = arr.length - 1; j >= k; j--) { if (arr[j].v === '(') dd++; else if (arr[j].v === ')') dd--; } return x.v === '(' && dd > 0; });
    if (open) out.at = { s: open.s, e: open.e };
    tip(t('sqUnclosedParen')); fix(t('sqCloseParen'), [{ s: last.e, e: last.e, text: ')'.repeat(d) }]);
    return;
  }
  if (last.t === 'word' && (SQ_ENDERS.has(last.lw) || ['and', 'or', 'by', 'not', 'in', 'is', 'like', 'ilike', 'between', 'as'].includes(last.lw)) || last.t === 'op') {
    out.at = { s: last.s, e: last.e };
    tip(t('sqEndKw', { v: sqCode(last.v.toUpperCase()) }));
    return;
  }
  tip(t('sqEndGeneric'));
}

// ================= проверка, пока пишешь =================
// Только то, в чём можно быть уверенным без базы; при подзапросах и WITH колонки без таблицы не проверяются.
function sqlLint(text, conn) {
  const meta = S.meta[conn];
  if (!meta || text.length > 40000) return [];
  const marks = [];
  const add = (s, e, msg, fixes = []) => { if (!marks.some(m => m.s === s)) marks.push({ s, e: Math.max(e, s + 1), msg, fixes }); };
  const toks = sqTokens(text);
  // незакрытые кавычки и комментарии
  for (const x of toks) {
    const bad = (x.t === 'lit' && x.v[0] === "'" && !/^'(?:[^']|'')*'$/.test(x.v))
      || (x.t === 'lit' && /^[Ee]'/.test(x.v) && !/'$/.test(x.v.slice(2)))
      || (x.t === 'lit' && x.v[0] === '"' && !/^"(?:[^"]|"")*"$/.test(x.v));
    if (bad) {
      const nl = text.indexOf('\n', x.s), lineEnd = nl < 0 ? text.length : nl;
      let at = lineEnd; while (at > x.s + 1 && /[\s;]/.test(text[at - 1])) at--;
      add(x.s, x.s + 1, t('sqUnclosedQuote'), [{ label: t('sqCloseQuote'), edits: [{ s: at, e: at, text: x.v[0] === '"' ? '"' : "'" }] }]);
      return marks;              // дальше текст «съеден» кавычкой – проверять бессмысленно
    }
    if (x.t === 'bcom' && !x.v.endsWith('*/')) { add(x.s, x.s + 2, t('sqUnclosedComment')); return marks; }
  }
  const sig = sqSig(toks), meta2 = meta;
  const schemas = new Set((S.schemas[conn] || []).map(s => s.name.toLowerCase()));
  const allTables = new Set(meta2.map(x => x.name.toLowerCase()));
  sqStatements(sig).forEach(st => {
    // скобки
    const stack = [];
    st.forEach(x => {
      if (x.v === '(') stack.push(x);
      else if (x.v === ')') { if (stack.length) stack.pop(); else add(x.s, x.e, t('sqExtraParen'), [{ label: t('sqRemoveParen'), edits: [{ s: x.s, e: x.e, text: '' }] }]); }
    });
    const last = st[st.length - 1];
    stack.forEach(x => add(x.s, x.e, t('sqUnclosedParen'), [{ label: t('sqCloseParen'), edits: [{ s: last.e, e: last.e, text: ')'.repeat(stack.length) }] }]));
    const sc = sqScope(st, meta2);
    const kind = st[0].lw;
    let inSet = false;
    st.forEach((x, i) => {
      const nx = st[i + 1], pv = st[i - 1];
      if (x.lw === 'set' && kind === 'update') inSet = true;
      if (x.lw === 'where') inSet = false;
      // лишняя запятая перед FROM / ) / WHERE…
      if (x.v === ',' && nx && (nx.v === ')' || ['from', 'where', 'group', 'order', 'having', 'limit', 'union'].includes(nx.lw)))
        add(x.s, x.e, t('sqTrailingComma', { v: sqCode(nx.v.toUpperCase()) }), [{ label: t('sqRemoveComma'), edits: [{ s: x.s, e: x.e, text: '' }] }]);
      // = NULL
      if (!inSet && (x.v === '=' || x.v === '<>' || x.v === '!=') && nx && nx.lw === 'null' && pv && pv.lw !== 'set') {
        const v = x.v === '=' ? 'IS NULL' : 'IS NOT NULL';
        add(x.s, nx.e, t('sqNullEq', { v: sqCode(v) }), [{ label: t('sqReplace', { v: sqCode(v) }), edits: [{ s: x.s, e: nx.e, text: sqKeepCase(nx.v, v.toLowerCase()) }] }]);
      }
      // "Москва" после сравнения – значение в двойных кавычках
      if (x.t === 'lit' && x.v[0] === '"' && pv && (['=', '<>', '!=', '<', '>', '<=', '>='].includes(pv.v) || ['like', 'ilike'].includes(pv.lw))) {
        const n = sqName(x.v);
        if (!sc.cols.includes(n) && (sc.known || /[^\w]/.test(n))) {
          const lit = `'${n.replace(/'/g, "''")}'`;
          add(x.s, x.e, t('sqDqValue', { v: sqCode(lit) }), [{ label: t('sqReplace', { v: sqCode(lit) }), edits: [{ s: x.s, e: x.e, text: lit }] }]);
        }
      }
      // дата «11.10.2025»: PostgreSQL поймёт её как 10 ноября – пиши '2025-10-11'
      const dm = x.t === 'lit' && /^'(\d{1,2})[./](\d{1,2})[./](\d{4})(.*)'$/.exec(x.v);
      if (dm) {
        const iso = `'${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}${dm[4]}'`;
        add(x.s, x.e, t('sqDateAmbig', { v: sqCode(x.v), w: sqCode(iso) }), [{ label: t('sqDateFix', { v: sqCode(iso) }), edits: [{ s: x.s, e: x.e, text: iso }] }]);
      }
      // опечатка в команде: FORM, WHER, GRUOP, ODER…
      if (x.t === 'word' && x.v.length >= 4 && !SQ_WORDS.has(x.lw) && !(nx && (nx.v === '(' || nx.v === '.')) && !(pv && (pv.v === '.' || pv.v === '::'))
        && !sc.cols.includes(x.lw) && !allTables.has(x.lw) && !sc.outAl.has(x.lw)) {
        const kw = SQ_CLAUSE_KW.find(k => k.length >= 4 && sqDist(k, x.lw) === 1);
        if (kw) add(x.s, x.e, t('sqKw', { v: sqCode(kw.toUpperCase()) }), [{ label: t('sqReplace', { v: sqCode(sqKeepCase(x.v, kw)) }), edits: [{ s: x.s, e: x.e, text: sqKeepCase(x.v, kw) }] }]);
      }
    });
    // неизвестные таблицы
    sc.refs.forEach(r => {
      if (r.derived || r.cte || r.tbl || !r.name) return;
      if (/^pg_/.test(r.name) || /^(pg_catalog|information_schema)\./i.test(r.raw)) return;     // системные таблицы
      if (kind === 'create' || kind === 'drop' || kind === 'alter') return;
      const near = sqClosest(r.name, meta2.map(x => x.name));
      add(r.s, r.e, t('sqNoTable', { t: sqCode(r.name) }), near.map(n => ({ label: t('sqReplace', { v: sqCode(n) }), edits: [{ s: r.s, e: r.e, text: quoteId(n) }] })));
    });
    if (!['select', 'update', 'delete'].includes(kind)) return;
    // t.колонка: есть ли такая колонка в таблице псевдонима
    st.forEach((x, i) => {
      if (!isIdent(x) || !st[i + 1] || st[i + 1].v !== '.' || !isIdent(st[i + 2])) return;
      if (st[i - 1] && st[i - 1].v === '.') return;
      const qn = sqName(x.v), cn = st[i + 2];
      if (schemas.has(qn) && !sc.refs.some(r => r.alias === qn)) return;          // схема.таблица
      const ref = sc.byName(qn);
      if (!ref) {
        if (sc.known && !sc.ctes.has(qn)) {
          const names = sc.refs.flatMap(r => [r.alias, r.name]).filter(Boolean);
          add(x.s, x.e, t('sqAliasMissing', { a: sqCode(qn) }), (qn.length >= 3 ? sqClosest(qn, names) : []).map(n => ({ label: t('sqReplace', { v: sqCode(n) }), edits: [{ s: x.s, e: x.e, text: n }] })));
        }
        return;
      }
      if (!ref.tbl || ref.derived || cn.v === '*') return;
      const n = sqName(cn.v);
      if (ref.tbl.cols.some(c => c.name === n)) return;
      const near = sqClosest(n, ref.tbl.cols.map(c => c.name));
      add(cn.s, cn.e, t('sqNoCol', { c: sqCode(n), t: sqCode(ref.tbl.name) }), near.map(c => ({ label: t('sqReplace', { v: sqCode(c) }), edits: [{ s: cn.s, e: cn.e, text: quoteId(c) }] })));
    });
    if (!sc.known) return;
    // колонки без таблицы: только если все таблицы запроса известны
    const tablePos = new Set(sc.refs.flatMap(r => [r.s, r.aliasTok && r.aliasTok.s]));
    st.forEach((x, i) => {
      if (x.t !== 'word' || SQ_WORDS.has(x.lw) || tablePos.has(x.s)) return;
      const pv = st[i - 1], nx = st[i + 1];
      if (nx && (nx.v === '(' || nx.v === '.')) return;
      if (pv && (pv.v === '.' || pv.v === '::' || pv.lw === 'as')) return;
      // имя сразу после выражения без запятой – это псевдоним (price p), кроме случая «две колонки подряд»
      const afterExpr = pv && ((isIdent(pv) && !SQ_WORDS.has(pv.lw)) || pv.v === ')' || pv.v === ']' || pv.lw === 'end' || pv.t === 'num' || pv.t === 'lit');
      const n = x.lw;
      if (sc.cols.includes(n) || sc.outAl.has(n) || sc.refs.some(r => r.alias === n || r.name === n) || sc.ctes.has(n)) {
        // пропущенная запятая: SELECT name salary – обе колонки
        if (afterExpr && isIdent(pv) && sc.cols.includes(sqName(pv.v)) && sc.cols.includes(n) && (sqSelectItems(st) || []).some(it => it.includes(x)))
          add(x.s, x.e, t('sqMissingComma'), [{ label: t('sqAddComma'), edits: [{ s: pv.e, e: pv.e, text: ',' }] }]);
        return;
      }
      if (afterExpr) return;
      const near = sqClosest(n, sc.cols);
      const other = meta2.filter(tb => !sc.refs.some(r => r.tbl === tb) && tb.cols.some(c => c.name === n)).slice(0, 2);
      const msg = t('sqNoColAny', { c: sqCode(n) }) + (other.length ? '. ' + t('sqColOther', { c: sqCode(n), t: other.map(tb => sqCode(tb.name)).join(', ') }) : '');
      add(x.s, x.e, msg, near.map(c => ({ label: t('sqReplace', { v: sqCode(c) }), edits: [{ s: x.s, e: x.e, text: quoteId(c) }] })));
    });
    // подсчёт без GROUP BY: SELECT brand, COUNT(*) FROM products
    const items = sqSelectItems(st);
    if (items && !sqHasGroup(st) && items.some(sqHasAgg)) {
      const plain = items.filter(it => !sqHasAgg(it)).map(sqPlainCol).filter(Boolean);
      if (plain.length) {
        const names = plain.map(r => text.slice(r.s, r.e).trim().split(/\s+/)[0]);
        const at = sqClauseEnd(st, ['having', 'order', 'limit', 'offset', 'union', 'window', 'fetch']);
        const f = [{ label: t('sqAddGroup', { v: sqCode(names.join(', ')) }), edits: [{ s: at.at, e: at.at, text: '\nGROUP BY ' + names.join(', ') }] }];
        plain.forEach((r, k) => add(r.s, r.s + names[k].length, t('sqAggNoGroup', { c: sqCode(names[k]) }), f));
      }
    }
  });
  return marks.sort((a, b) => a.s - b.s);
}

// ================= в редакторе: волна, подсказка при наведении, исправление =================
function sqPaint(tab) {
  const dm = $('#dm'), ta = $('#sql');
  if (!dm || !ta || curTab() !== tab) return;
  const marks = [...(tab.lint || []).map(m => ({ ...m, k: 'w' }))];
  if (tab.errMark) {
    const em = { ...tab.errMark, k: 'e' };
    for (let i = marks.length - 1; i >= 0; i--) if (marks[i].s < em.e && em.s < marks[i].e) marks.splice(i, 1);
    marks.push(em);
  }
  marks.sort((a, b) => a.s - b.s);
  const v = ta.value;
  let h = '', last = 0;
  marks.forEach(m => {
    if (m.s < last || m.s > v.length) return;
    const e = Math.min(m.e, v.length);
    h += esc(v.slice(last, m.s));
    const part = v.slice(m.s, e);
    // в конце строки отмечать нечего – рисуем точку
    if (!part.trim()) h += `<span class="sq-pt ${m.k}"></span>` + esc(part);
    else h += `<span class="sq ${m.k}">${esc(part)}</span>`;
    last = e;
  });
  dm.innerHTML = h + esc(v.slice(last)) + '\n';
  dm.scrollTop = ta.scrollTop; dm.scrollLeft = ta.scrollLeft;
}

let sqLintT = 0;
function sqLintSoon(tab, ms = 800) {
  clearTimeout(sqLintT);
  sqLintT = setTimeout(() => {
    if (curTab() !== tab) return;
    tab.lint = sqlLint(tab.sql, tab.conn);
    tab.lintText = tab.sql;
    sqPaint(tab);
  }, ms);
}

// номер символа под мышью (шрифт моноширинный – считаем по ширине символа)
function sqPosAt(ta, x, y) {
  const cs = getComputedStyle(ta), r = ta.getBoundingClientRect();
  if (!sqPosAt.cw || sqPosAt.font !== cs.font) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `${cs.fontSize} ${cs.fontFamily}`;
    sqPosAt.cw = c.measureText('MMMMMMMMMM').width / 10; sqPosAt.font = cs.font;
  }
  const lh = parseFloat(cs.lineHeight) || 21;
  const line = Math.floor((y - r.top - parseFloat(cs.paddingTop) + ta.scrollTop) / lh);
  const col = Math.floor((x - r.left - parseFloat(cs.paddingLeft) + ta.scrollLeft) / sqPosAt.cw);
  const lines = ta.value.split('\n');
  if (line < 0 || line >= lines.length || col < 0) return -1;
  let pos = 0;
  for (let i = 0; i < line; i++) pos += lines[i].length + 1;
  let vis = 0, k = 0;
  const ln = lines[line], tabSize = parseInt(cs.tabSize, 10) || 2;
  for (; k < ln.length; k++) { const w = ln[k] === '\t' ? tabSize - (vis % tabSize) : 1; if (vis + w > col) break; vis += w; }
  return k >= ln.length && col > vis ? -1 : pos + k;
}

function sqBindHover(tab, ta) {
  let hideT = 0;
  const hide = () => { clearTimeout(hideT); hideT = setTimeout(() => { const tip = $('#sqtip'); if (tip && !tip.matches(':hover')) tip.remove(); }, 200); };
  ta.addEventListener('mousemove', e => {
    if (e.buttons) return;
    const pos = sqPosAt(ta, e.clientX, e.clientY);
    const lint = tab.lintText === tab.sql ? tab.lint || [] : [];
    const err = tab.errMark && tab.diag && tab.diag.text === tab.sql ? [{ ...tab.errMark, err: true }] : [];
    const m = pos < 0 ? null : [...err, ...lint].find(x => x.s <= pos && pos < Math.max(x.e, x.s + 1));
    const cur = $('#sqtip');
    if (!m) { if (cur) hide(); return; }
    clearTimeout(hideT);
    if (cur && cur.dataset.k === `${m.s}:${m.e}`) return;
    if (cur) cur.remove();
    const tip = document.createElement('div');
    tip.id = 'sqtip'; tip.className = 'sqtip ' + (m.err ? 'e' : 'w'); tip.dataset.k = `${m.s}:${m.e}`;
    const msgHtml = m.err ? `<b>${esc(tab.result && tab.result.error || '')}</b>${(tab.diag.tips || []).slice(0, 1).map(x => `<div>${x}</div>`).join('')}` : `<div>${m.msg}</div>`;
    const fixes = m.err ? tab.diag.fixes : m.fixes;
    tip.innerHTML = msgHtml + (fixes || []).slice(0, 3).map((f, i) => `<button class="btn ghost sm sqtip-fix" data-f="${i}">${icon('check', 12)}<span>${f.label}</span></button>`).join('');
    document.body.appendChild(tip);
    const xy = caretXY(ta, m.s), er = ta.parentElement.getBoundingClientRect();
    const left = Math.min(er.left + xy.x, innerWidth - tip.offsetWidth - 8), top = er.top + xy.y + xy.lh + 4;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = (top + tip.offsetHeight > innerHeight - 8 ? er.top + xy.y - tip.offsetHeight - 4 : top) + 'px';
    tip.onmouseleave = hide;
    tip.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { tip.remove(); sqApply(tab, fixes[+b.dataset.f]); });
  });
  ta.addEventListener('mouseleave', hide);
}

// исправление: правки с конца, чтобы позиции не сдвигались; через insertText – работает ⌘Z
function sqApply(tab, f) {
  const ta = $('#sql');
  if (!ta || !f) return;
  ta.focus();
  [...f.edits].sort((a, b) => b.s - a.s).forEach(ed => {
    ta.setSelectionRange(ed.s, ed.e);
    ta._acSkip = true;
    if (!document.execCommand('insertText', false, ed.text)) { ta.setRangeText(ed.text, ed.s, ed.e, 'end'); ta.dispatchEvent(new Event('input')); }
  });
  ta._acSkip = false;
  if (tab.result && tab.result.error) { tab.result.fixed = true; renderQueryResult(tab); }
}

// запрос после правок: строки, которые изменятся (– убрать, + добавить) и по строке вокруг
function sqApplyText(text, edits) {
  let out = text;
  [...edits].sort((a, b) => b.s - a.s).forEach(ed => { out = out.slice(0, ed.s) + ed.text + out.slice(ed.e); });
  return out;
}
// ================= исправить весь запрос =================
// Первое исправление → PostgreSQL только разбирает запрос (EXPLAIN, без выполнения, только чтение) → если есть следующая
// ошибка – её исправление → … пока запрос не станет правильным (не больше 8 шагов). Только для одного запроса без {{переменных}}.
async function sqFixAll(tab, diag) {
  const text = diag.text;
  const stmts = sqStatements(sqSig(sqTokens(text)));
  if (stmts.length !== 1 || !diag.fixes.length || /\{\{/.test(text)) return null;
  let cur = text, d = diag;
  const steps = [];
  for (let k = 0; k < 8; k++) {
    const f = d.fixes[0];
    if (!f) return null;
    [...f.edits].sort((x, y) => x.s - y.s).forEach(ed => steps.push({ old: cur.slice(ed.s, ed.e), now: ed.text }));
    cur = sqApplyText(cur, f.edits);
    const body = cur.replace(/;\s*$/, '');
    const lead = body.length - body.trimStart().length;
    let e2 = null;
    try { await api('check_sql', tab.conn, body.trim()); } catch (e) { e2 = e; }
    if (!e2) return { text: cur, steps };
    if (!e2.state) return null;
    // позиция ошибки EXPLAIN считается от «explain » (8 символов) и без начальных пробелов
    d = await sqlDiagnose(tab, e2, lead - 8, false, cur);
  }
  return null;
}

// одна правка вместо замены всего текста: общее начало и конец не трогаем – так ⌘Z возвращает аккуратно
function sqMinEdit(a, b) {
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0; while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  return { s: p, e: a.length - q, text: b.slice(p, b.length - q) };
}

// предпросмотр: исправленный запрос, изменённые места мягко выделены (по словам, а не строками)
function sqPreviewHtml(oldText, newText) {
  const A = sqlTokens(oldText), B = sqlTokens(newText);
  const changed = new Array(B.length).fill(true);
  if (A.length * B.length <= 400000) {
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i].v === B[j].v ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (A[i].v === B[j].v) { changed[j] = false; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
  }
  // раскладываем по строкам: у каждой строки – html и есть ли в ней правка
  const lines = [{ h: '', hit: false }];
  B.forEach((tk, j) => {
    const parts = tk.v.split('\n');
    parts.forEach((part, k) => {
      if (k > 0) lines.push({ h: '', hit: false });
      if (!part) return;
      const L = lines[lines.length - 1];
      if (changed[j] && tk.t !== 'ws') { L.h += `<mark>${esc(part)}</mark>`; L.hit = true; } else L.h += highlight(part).replace(/\n$/, '');
    });
  });
  let show = lines.map((l, i) => i);
  if (lines.length > 10) {
    const keep = new Set();
    lines.forEach((l, i) => { if (l.hit) [i - 1, i, i + 1].forEach(x => { if (x >= 0 && x < lines.length) keep.add(x); }); });
    show = [...keep].sort((a, b) => a - b);
  }
  let h = '', prev = -1;
  show.forEach(i => {
    if (prev >= 0 && i > prev + 1) h += `<div class="gap"><i></i><span>…</span></div>`;
    h += `<div class="${lines[i].hit ? 'hit' : ''}"><i>${i + 1}</i><span>${lines[i].h || ' '}</span></div>`;
    prev = i;
  });
  return `<div class="sqd">${h}</div>`;
}

// список правок: «fll_name → full_name», «+ JOIN orders o …», «убрать ,»
function sqStepsHtml(steps) {
  const cut = s => { s = s.replace(/\s+/g, ' ').trim(); return s.length > 42 ? s.slice(0, 41) + '…' : s; };
  const seen = new Set();
  return `<div class="sqc-steps">${steps.filter(st => { const k = st.old + '→' + st.now; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8).map(st => {
    const o = cut(st.old), n = cut(st.now);
    if (!o) return `<span class="sqc-step"><em>+</em><code>${esc(n)}</code></span>`;
    if (!n) return `<span class="sqc-step"><em>${t('sqRemove')}</em><code>${esc(o)}</code></span>`;
    return `<span class="sqc-step"><s>${esc(o)}</s><em>→</em><code>${esc(n)}</code></span>`;
  }).join('')}</div>`;
}

const sqFixCard = (tab, f, key, main) => {
  const after = sqApplyText(tab.diag.text, f.edits);
  const steps = f.steps || [...f.edits].sort((x, y) => x.s - y.s).map(ed => ({ old: tab.diag.text.slice(ed.s, ed.e), now: ed.text }));
  return `<div class="sqc-fix ${main ? 'main' : ''}">
  <div class="sqc-fix-h"><span>${f.label}</span><button class="btn ${main ? 'primary' : ''} sm" data-sqfix="${key}">${t('sqFix')}</button></div>
  ${steps.length > 1 ? sqStepsHtml(steps) : ''}${sqPreviewHtml(tab.diag.text, after)}</div>`;
};

// панель ошибки (вариант «Карточка»): что случилось простыми словами, главное исправление с предпросмотром,
// другие варианты и текст PostgreSQL – свёрнуты
function sqErrorHtml(tab) {
  const r = tab.result, d = tab.diag;
  const stale = d && d.text !== tab.sql;
  const tips = d && !stale ? d.tips : [];
  const line = r.errLine ? t('sqAtLine', { n: r.errLine }) : '';
  const sub = stale ? t('sqStale') : (tips[0] || line);
  let h = `<div class="sqc"><div class="sqc-top"><div class="sqc-ic">${icon('alert', 16)}</div>
    <div><b>${esc(d && !stale && d.title ? d.title : r.error)}</b>${sub ? `<p>${sub}${tips[0] && line ? ` <span class="sqc-ln">· ${line}</span>` : ''}</p>` : ''}</div></div>`;
  if (r.fixed) return h + `<div class="sqc-ok">${icon('check', 14)}${t('sqFixed')}<button class="btn primary sm" id="sq-run">${icon('play', 11)}${t('run')}</button></div></div>`;
  const fixes = d && !stale ? d.fixes : [];
  const all = d && !stale ? d.fixAll : null;
  if (all) h += sqFixCard(tab, all, 'all', true);
  else if (fixes.length) h += sqFixCard(tab, fixes[0], 0, true);
  else if (d && d.at && !stale) {
    // исправить автоматически нечего – показываем саму строку с отметкой
    const v = d.text, ls = v.lastIndexOf('\n', d.at.s - 1) + 1, nl = v.indexOf('\n', d.at.s), le = nl < 0 ? v.length : nl;
    const ln = v.slice(ls, le), from = d.at.s - ls, to = Math.max(Math.min(le, d.at.e) - ls, from + 1);
    h += `<div class="sqd sqd-line"><div><i>${r.errLine || ''}</i><span>${esc(ln.slice(0, from))}<u>${esc(ln.slice(from, to)) || ' '}</u>${esc(ln.slice(to))}</span></div></div>`;
  }
  if (tips.length > 1) h += `<div class="sqc-tips">${tips.slice(1).map(x => `<div>${x}</div>`).join('')}</div>`;
  const more = [];
  const others = all ? fixes : fixes.slice(1), base = all ? 0 : 1;
  if (others.length) more.push(`<span class="sqc-tg" data-tg="sq-more">${t(all ? 'sqOnlyThis' : 'sqOther', { n: others.length })} ${icon('chevronDown', 11)}</span>`);
  if (r.raw) more.push(`<span class="sqc-tg" data-tg="sq-raw">${t('sqPgText')} ${icon('chevronDown', 11)}</span>`);
  if (more.length) h += `<div class="sqc-more">${more.join('')}</div>`;
  if (others.length) h += `<div class="sqc-list hidden" id="sq-more">${others.map((f, k) => sqFixCard(tab, f, k + base, false)).join('')}</div>`;
  if (r.raw) h += `<div class="sqc-raw hidden" id="sq-raw">${esc(r.raw)}${r.hint ? `<br>${esc(r.hint)}` : ''}</div>`;
  return h + '</div>';
}

function sqBindError(tab, box) {
  box.querySelectorAll('[data-sqfix]').forEach(b => b.onclick = () => sqApply(tab, b.dataset.sqfix === 'all' ? tab.diag.fixAll : tab.diag.fixes[+b.dataset.sqfix]));
  box.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { $('#' + b.dataset.tg, box).classList.toggle('hidden'); b.classList.toggle('on'); });
  const run = $('#sq-run', box); if (run) run.onclick = () => runQuery(tab);
}
