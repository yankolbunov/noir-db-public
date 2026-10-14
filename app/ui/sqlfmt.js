// Форматирование SQL: ключевые слова ЗАГЛАВНЫМИ, каждая часть запроса с новой строки, отступы для подзапросов.
// Строки в кавычках, "имена", комментарии, $$-тела функций и {{переменные}} не меняются ни на символ.
// После форматирования проверяем, что запрос остался тем же (те же слова в том же порядке), – иначе не трогаем текст.

const FMT_KW = new Set(('select from where and or not in is null as on join left right inner outer full cross natural group by order having ' +
  'limit offset fetch first next rows row only insert into values update set delete create table view index drop alter add column ' +
  'primary key foreign references default distinct union all except intersect case when then else end with recursive returning ' +
  'truncate begin commit rollback exists between like ilike similar asc desc nulls last any some cast over partition window range ' +
  'preceding following unbounded current filter lateral using materialized replace function returns language cascade restrict ' +
  'if constraint unique check do nothing conflict interval true false grant revoke explain analyze verbose temporary temp ' +
  'schema database sequence trigger to for each execute procedure within group escape collate at zone').split(' '));

// функции тоже ЗАГЛАВНЫМИ – так же, как их вставляет автодополнение
const FMT_FN = new Set(('count sum avg min max round coalesce nullif greatest least abs ceil floor trunc mod power sqrt ' +
  'now date_trunc date_part extract age to_char to_date to_timestamp to_number make_date current_date current_timestamp ' +
  'lower upper length substring substr trim ltrim rtrim concat concat_ws replace split_part left right position strpos lpad rpad ' +
  'string_agg array_agg json_agg jsonb_agg json_build_object jsonb_build_object row_number rank dense_rank ntile lag lead ' +
  'first_value last_value percentile_cont percentile_disc mode stddev variance corr bool_and bool_or every generate_series unnest ' +
  'exists nextval currval setval random format md5 regexp_replace regexp_matches array_length cardinality').split(' '));

// после этих слов «(» – не вызов функции, а скобка выражения: ставим пробел
const FMT_SPACE_PAREN = new Set(['in', 'exists', 'values', 'as', 'on', 'and', 'or', 'not', 'over', 'using', 'any', 'some', 'all',
  'filter', 'within', 'from', 'join', 'where', 'select', 'by', 'when', 'then', 'else', 'returning', 'into', 'table', 'conflict', 'with', 'lateral']);

// части запроса, которые начинаются с новой строки (составные – по первому слову)
const FMT_CLAUSES = ['select', 'from', 'where', 'group by', 'order by', 'having', 'limit', 'offset', 'fetch', 'window',
  'union all', 'union', 'except', 'intersect', 'values', 'set', 'returning', 'insert into', 'update', 'delete from', 'on conflict',
  'left outer join', 'right outer join', 'full outer join', 'left join', 'right join', 'full join', 'inner join', 'cross join',
  'natural join', 'join', 'with'];

function sqlTokens(src) {
  // слова – любые буквы, в том числе русские: PostgreSQL разрешает их в именах без кавычек
  const re = /(\s+)|(--[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|(\{\{[^}]*\}\})|([Ee]'(?:[^'\\]|\\.|'')*'?|'(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(\$([A-Za-z_]\w*)?\$[\s\S]*?(?:\$\8\$|$))|(\$\d+)|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|([\p{L}_][\p{L}\p{N}_$]*)|(::|<>|!=|<=|>=|\|\||->>|->|#>>|#>|@>|<@|&&|:=|=>|[-+*\/%^<>=~!@#&|?])|([(),;.\[\]:])|([\s\S])/gu;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const v = m[0];
    if (m[1]) out.push({ t: 'ws', v });
    else if (m[2]) out.push({ t: 'lcom', v });
    else if (m[3]) out.push({ t: 'bcom', v });
    else if (m[4] || m[5] || m[6] || m[7] || m[9]) out.push({ t: 'lit', v });
    else if (m[10]) out.push({ t: 'num', v });
    else if (m[11]) out.push({ t: 'word', v, lw: v.toLowerCase() });
    else if (m[12]) out.push({ t: 'op', v });
    else if (m[13]) out.push({ t: 'p', v });
    else out.push({ t: 'lit', v });          // всё остальное – как есть
    if (!v.length) re.lastIndex++;
  }
  return out;
}

function formatSql(src) {
  const sig = sqlTokens(src).filter(x => x.t !== 'ws');
  const IND = '  ';
  let line = '';
  const lines = [];
  const pushLine = () => { if (line.trim()) lines.push(line.replace(/\s+$/, '')); line = ''; };
  // стек скобок: sub – подзапрос (с переносами), inline – функция, список, OVER (…)
  const stack = [{ kind: 'sub', depth: 0, clause: '' }];
  const top = () => stack[stack.length - 1];
  const peekWords = (i, n) => {
    const w = [];
    for (let k = i; k < sig.length && w.length < n; k++) { if (sig[k].t !== 'word') break; w.push(sig[k].lw); }
    return w.join(' ');
  };
  const matchClause = i => {
    if (sig[i].t !== 'word') return null;
    for (const c of FMT_CLAUSES) {
      const n = c.split(' ').length;
      if (peekWords(i, n) === c) return c;
    }
    return null;
  };
  let prev = null, prev2 = null;          // два предыдущих значимых токена
  const needSpace = (x) => {
    if (!line.trim()) return false;
    if (!prev) return true;
    const pv = prev.v;
    if (x.t === 'p' && [',', ';', ')', ']', '.', ':'].includes(x.v)) return false;
    if (x.t === 'op' && x.v === '::') return false;
    if (pv === '(' || pv === '[' || pv === '.' || pv === '::' || pv === ':') return false;
    // «count(» – вызов функции; «INSERT INTO t (a, b)» и «CREATE TABLE t (» – скобка после имени таблицы
    if (x.v === '(' && prev.t === 'word' && !FMT_SPACE_PAREN.has(prev.lw) && !prev.kwClause
      && !(prev2 && prev2.t === 'word' && /(^| )(into|table|exists|view|index|conflict)$/.test(prev2.lw))) return false;
    if (x.v === '[') return false;
    if (prev.unary) return false;
    return true;
  };
  const emit = (x, text) => {
    if (needSpace(x)) line += ' ';
    line += text;
    prev2 = prev; prev = x;
  };
  const newLine = (lvl) => { pushLine(); line = IND.repeat(lvl); prev = null; };
  const lvlOf = () => Math.floor((line.match(/^ */)[0].length) / IND.length);

  for (let i = 0; i < sig.length; i++) {
    const x = sig[i];
    const fr = top();
    if (x.t === 'lcom') {
      if (line.trim()) line += ' ';
      line += x.v; newLine(lvlOf() || (fr.kind === 'sub' ? fr.depth + (fr.clause ? 1 : 0) : fr.depth));
      continue;
    }
    if (x.t === 'bcom') { emit(x, x.v); continue; }
    if (x.v === ';') {
      line += ';'; pushLine(); lines.push(''); prev = null;
      stack.length = 1; stack[0].clause = '';
      continue;
    }
    if (x.v === '(') {
      // подзапрос: ( SELECT … ) или ( WITH … ); у CTE «AS (» – тоже подзапрос
      const nx = sig[i + 1];
      const isSub = nx && nx.t === 'word' && ['select', 'with', 'values', 'insert', 'update', 'delete'].includes(nx.lw)
        && fr.kind === 'sub';
      const base = lvlOf();
      emit(x, '(');
      stack.push({ kind: isSub ? 'sub' : 'inline', depth: isSub ? base + 1 : fr.depth, base, clause: '' });
      if (isSub) newLine(base + 1);
      continue;
    }
    if (x.v === ')') {
      const was = stack.length > 1 ? stack.pop() : fr;
      if (was.kind === 'sub') newLine(was.base);
      emit(x, ')');
      continue;
    }
    if (fr.kind === 'sub') {
      const c = matchClause(i);
      const start = ['', 'with'].includes(fr.clause || '');
      if (c && !(c === 'set' && fr.clause !== 'update') && !(c === 'values' && fr.clause !== 'insert into' && fr.clause !== '')
        && !(c === 'with' && !start) && !(['insert into', 'update', 'delete from'].includes(c) && !start)
        && !(c === 'from' && prev && prev.lw === 'distinct')) {
        const n = c.split(' ').length;
        newLine(fr.depth);
        const kw = sig.slice(i, i + n).map(w => w.v.toUpperCase()).join(' ');
        emit({ t: 'word', v: kw, lw: c, kwClause: true }, kw);
        fr.clause = c; fr.items = 0;
        i += n - 1;
        // список SELECT из нескольких колонок – каждая с новой строки
        if (c === 'select') {
          let k = i + 1;
          if (sig[k] && sig[k].t === 'word' && sig[k].lw === 'distinct') { emit(sig[k], 'DISTINCT'); i = k; k++; }
          fr.multi = hasTopComma(sig, i + 1);
          if (fr.multi) newLine(fr.depth + 1);
        } else if (c === 'set' || c === 'with' || c === 'values') {
          fr.multi = hasTopComma(sig, i + 1);
          if (fr.multi && c !== 'with') newLine(fr.depth + 1);
        } else fr.multi = false;
        continue;
      }
      if (x.t === 'word' && (x.lw === 'and' || x.lw === 'or') && ['where', 'having', 'on'].includes(fr.clause || '') && !fr.between) {
        newLine(fr.depth + 1);
        emit(x, x.v.toUpperCase());
        continue;
      }
      if (x.t === 'word' && x.lw === 'on' && fr.clause && fr.clause.endsWith('join')) fr.clause = 'on';
      if (x.v === ',' && fr.multi && ['select', 'set'].includes(fr.clause)) {
        line += ','; newLine(fr.depth + 1);
        continue;
      }
      if (x.v === ',' && fr.clause === 'with') {
        line += ','; newLine(fr.depth);
        continue;
      }
      if (x.v === ',' && fr.clause === 'values' && fr.multi && prev && prev.v === ')') {
        line += ','; newLine(fr.depth + 1);
        continue;
      }
    }
    // BETWEEN a AND b: это AND не переносим
    if (x.t === 'word' && x.lw === 'between') fr.between = true;
    else if (x.t === 'word' && x.lw === 'and' && fr.between) fr.between = false;
    let text = x.v;
    if (x.t === 'word' && (FMT_KW.has(x.lw) || (FMT_FN.has(x.lw) && sig[i + 1] && sig[i + 1].v === '('))) text = x.v.toUpperCase();
    // унарный минус/плюс: «= -1», «(-5)»
    if (x.t === 'op' && (x.v === '-' || x.v === '+') && (!prev || prev.t === 'op' || ['(', ',', '['].includes(prev.v) || (prev.t === 'word' && FMT_KW.has(prev.lw)))) {
      emit(x, text); prev = { ...x, unary: true };
      continue;
    }
    emit(x, text);
  }
  pushLine();
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function hasTopComma(sig, i) {
  let d = 0;
  for (; i < sig.length; i++) {
    const v = sig[i].v;
    if (v === '(' || v === '[') d++;
    else if (v === ')' || v === ']') { if (d === 0) return false; d--; }
    else if (v === ';') return false;
    else if (d === 0 && v === ',') return true;
    else if (d === 0 && sig[i].t === 'word' && ['from', 'where', 'into', 'returning', 'group', 'order', 'limit', 'union', 'except', 'intersect', 'having', 'window'].includes(sig[i].lw)) return false;
  }
  return false;
}

// запрос после форматирования тот же: значимые токены совпадают (слова – без учёта регистра)
function sameSql(a, b) {
  const norm = s => sqlTokens(s).filter(x => x.t !== 'ws').map(x => (x.t === 'word' ? x.lw : x.v.trim()));
  const x = norm(a), y = norm(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// ⇧⌘F: выделенный кусок или весь текст редактора. Через insertText – чтобы ⌘Z вернул как было.
function formatEditor(tab) {
  const ta = $('#sql');
  if (!ta || !tab || tab.type !== 'query') return;
  const sel = ta.selectionStart !== ta.selectionEnd;
  const from = sel ? ta.selectionStart : 0, to = sel ? ta.selectionEnd : ta.value.length;
  const src = ta.value.slice(from, to);
  if (!src.trim()) return;
  let res;
  try { res = formatSql(src); } catch (e) { res = null; }
  if (!res || !sameSql(src, res)) { toast(t('fmtFailed'), 'err'); return; }
  if (!sel) res += src.endsWith('\n') ? '\n' : '';
  if (res === src) return;
  ta.focus();
  ta.setSelectionRange(from, to);
  if (!document.execCommand('insertText', false, res)) ta.setRangeText(res, from, to, 'end');
  if (sel) ta.setSelectionRange(from, from + res.length);
  ta.dispatchEvent(new Event('input'));
}
