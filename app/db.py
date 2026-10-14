"""Работа с PostgreSQL: подключение, структура базы, данные, запросы, транзакции."""
import csv
import datetime
import decimal
import io
import json
import math
import re
import threading
import time
import uuid

import psycopg
from psycopg import sql

from . import tablefile
from psycopg.pq import TransactionStatus


def _strip_literals(q):
    """Текст запроса без строк в кавычках и комментариев – чтобы искать в нём «;» и ключевые слова."""
    return re.sub(r"--[^\n]*|/\*.*?\*/|'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"|\$(\w*)\$.*?\$\1\$", " ", q, flags=re.S)


def to_json_value(v):
    """Приводит значение из базы к виду, который можно отдать в интерфейс."""
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        # NaN и Infinity – недопустимый JSON: без этого ответ не разбирался и интерфейс писал «нет связи»
        return v if math.isfinite(v) else {"nan": "NaN", "inf": "Infinity", "-inf": "-Infinity"}[str(v)]
    if isinstance(v, decimal.Decimal):
        return str(v)
    if isinstance(v, datetime.datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, (datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, datetime.timedelta):
        return str(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        b = bytes(v)
        return "\\x" + b[:64].hex() + ("…" if len(b) > 64 else "")
    if isinstance(v, (dict, list)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


# типы, которые можно выбрать в конструкторе таблицы; остальное – вручную текстом
TYPE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_ ]*(\(\s*\d+\s*(,\s*\d+\s*)?\))?(\[\])?$")


def check_type(t):
    t = (t or "").strip()
    if not TYPE_RE.match(t):
        raise ValueError("BAD_TYPE")
    return t


# команды, после которых в ручном режиме есть что сохранять
CHANGING = {"INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "TRUNCATE",
            "COPY", "GRANT", "REVOKE", "COMMENT", "SELECT INTO"}


class PgSession:
    """Подключение к серверу: conn – для дерева и таблиц, qconn – для SQL-редактора."""

    IDLE_PING = 30   # через сколько секунд простоя проверять, живо ли соединение

    def __init__(self, host, port, user, password, dbname, sslmode="prefer", read_only=False, timeout=0, tunnel=None):
        self.params = dict(host=host, port=int(port or 5432), user=user,
                           password=password or None, dbname=dbname or "postgres",
                           sslmode=sslmode or "prefer", connect_timeout=5)
        self.read_only = bool(read_only)
        self.tunnel = tunnel                 # SSH-туннель (sshtunnel.Tunnel) или None
        self.timeout = int(timeout or 0)     # лимит времени запроса в редакторе, секунды (0 – без лимита)
        self.manual = False                  # ручной режим транзакций в редакторе
        self.dirty = False                   # в ручном режиме были команды, которые меняют данные
        self.conn = None
        self.qconn = None
        self.sconn = None                    # поиск по всей базе – отдельно, чтобы не мешать остальному
        # транзакции на conn – по одной: блоки отчёта, статистика и подсказки приходят из разных потоков одновременно
        self._tx_lock = threading.RLock()
        self._used = {}
        self.connect()

    # ---------- подключение ----------
    def _open(self, autocommit=True):
        kw = dict(self.params)
        if self.tunnel is not None:
            # база за SSH: подключаемся к своему концу туннеля; после сна Mac туннель поднимается заново
            kw["host"], kw["port"] = "127.0.0.1", self.tunnel.ensure()
        if self.read_only:
            # «только чтение» проверяет сам PostgreSQL – изменить данные нельзя ни кнопками, ни запросом
            kw["options"] = "-c default_transaction_read_only=on"
        try:
            c = psycopg.connect(**kw, autocommit=autocommit)
        except psycopg.OperationalError as e:
            # SSH пустил, но с SSH-сервера база по этому адресу не отвечает
            if self.tunnel is not None and re.search(r"closed the connection unexpectedly|server closed|connection refused", str(e), re.I):
                raise RuntimeError("SSH_FORWARD")
            raise
        self._english_messages(c)
        self._used[id(c)] = time.time()
        return c

    @staticmethod
    def _english_messages(c):
        """Сообщения сервера – по-английски: по ним приложение узнаёт имя колонки, таблицы и т. п.
        (PostgreSQL с русской локалью пишет «столбец "x" не существует»). Менять язык сообщений может
        только суперпользователь – у остальных разбор берёт имя из кавычек, на любом языке."""
        try:
            c.execute("set lc_messages to 'C'")
            if not c.autocommit:
                c.commit()
        except psycopg.Error:
            try:
                c.rollback()
            except Exception:
                pass

    def connect(self, dbname=None):
        if dbname:
            self.params["dbname"] = dbname
        self.close()
        self.conn = self._open()

    def close(self):
        for c in (self.conn, self.qconn, self.sconn):
            if c is not None:
                try:
                    c.close()
                except Exception:
                    pass
        self.conn = self.qconn = self.sconn = None

    def _alive(self, c):
        """После простоя (сон Mac, смена сети) соединение могло умереть – проверяем запросом."""
        if c is None or c.closed or c.broken:
            return False
        if time.time() - self._used.get(id(c), 0) < self.IDLE_PING:
            return True
        try:
            idle = c.info.transaction_status == TransactionStatus.IDLE
            c.execute("select 1")
            if idle and not c.autocommit:
                c.rollback()          # пинг не должен оставлять открытую транзакцию
            self._used[id(c)] = time.time()
            return True
        except Exception:
            return False

    def _cur(self):
        if not self._alive(self.conn):
            try:
                if self.conn is not None:
                    self.conn.close()
            except Exception:
                pass
            self.conn = self._open()
        self._used[id(self.conn)] = time.time()
        return self.conn.cursor()

    def _qcur(self, client=False):
        """Курсор SQL-редактора. client=True – значения переменных {{…}} подставляет psycopg
        (с правильным экранированием), так работают и скрипты из нескольких запросов."""
        c = self.qconn
        lost = False
        if c is not None:
            # было ли что терять – смотрим до проверки, пока статус соединения ещё известен
            had_tx = (not c.closed and not c.autocommit and
                      (self.dirty or c.info.transaction_status in (TransactionStatus.INTRANS, TransactionStatus.INERROR)))
            if not self._alive(c):
                lost = had_tx and self.dirty
                self.dirty = False
                try:
                    c.close()
                except Exception:
                    pass
                self.qconn = None
        if self.qconn is None:
            self.qconn = self._open(autocommit=not self.manual)
        self._used[id(self.qconn)] = time.time()
        if lost:
            raise RuntimeError("TX_LOST")
        return psycopg.ClientCursor(self.qconn) if client else self.qconn.cursor()

    def _fetch(self, query, args=None):
        with self._cur() as cur:
            cur.execute(query, args)
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

    def cancel(self):
        """Останавливает запрос, который сейчас выполняется в SQL-редакторе."""
        c = self.qconn
        if c is None or c.closed:
            return False
        if hasattr(c, "cancel_safe"):
            c.cancel_safe()
        else:
            c.cancel()
        return True

    # ---------- транзакции SQL-редактора ----------
    def tx_state(self):
        """none – изменений нет, open – есть несохранённые изменения, error – транзакция сломана ошибкой."""
        c = self.qconn
        if c is None or c.closed or c.autocommit:
            return "none"
        st = c.info.transaction_status
        if st == TransactionStatus.INERROR:
            return "error"
        if st == TransactionStatus.INTRANS and self.dirty:
            return "open"
        return "none"

    def set_manual(self, on):
        on = bool(on)
        if on == self.manual:
            return True
        if self.tx_state() != "none":
            raise RuntimeError("TX_OPEN")
        self.manual = on
        if self.qconn is not None and not self.qconn.closed:
            if self.qconn.info.transaction_status != TransactionStatus.IDLE:
                self.qconn.rollback()      # открыта только транзакция чтения – изменений нет
            self.qconn.autocommit = not on
        return True

    def commit(self):
        if self.qconn is not None and not self.qconn.closed and not self.qconn.autocommit:
            self.qconn.commit()
        self.dirty = False
        return self.tx_state()

    def rollback(self):
        if self.qconn is not None and not self.qconn.closed and not self.qconn.autocommit:
            self.qconn.rollback()
        self.dirty = False
        return self.tx_state()

    # ---------- структура ----------
    def server_info(self):
        r = self._fetch("select current_database() db, current_user usr, "
                        "split_part(version(), ' ', 2) ver")[0]
        r["read_only"] = self.read_only
        return r

    def databases(self):
        rows = self._fetch("select datname from pg_database "
                           "where not datistemplate order by datname")
        return [r["datname"] for r in rows]

    def schemas(self):
        rows = self._fetch("""
            select nspname from pg_namespace
            where nspname not in ('pg_catalog','information_schema','pg_toast')
              and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%'
            order by nspname = 'public' desc, nspname""")
        return [r["nspname"] for r in rows]

    def tables(self, schema):
        return self._fetch("""
            select c.relname as name,
                   case c.relkind when 'r' then 'table' when 'p' then 'table'
                        when 'v' then 'view' when 'm' then 'matview'
                        when 'f' then 'foreign' end as kind,
                   greatest(c.reltuples, 0)::bigint as rows_estimate
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = %s and c.relkind in ('r','p','v','m','f')
            order by c.relkind in ('v','m'), c.relname""", (schema,))

    def columns(self, schema, table):
        return self._fetch("""
            select a.attname as name,
                   format_type(a.atttypid, a.atttypmod) as type,
                   not a.attnotnull as nullable,
                   pg_get_expr(d.adbin, d.adrelid) as default,
                   coalesce(a.attnum = any(i.indkey), false) as pk
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            left join pg_index i on i.indrelid = c.oid and i.indisprimary
            where n.nspname = %s and c.relname = %s and a.attnum > 0 and not a.attisdropped
            order by a.attnum""", (schema, table))

    def indexes(self, schema, table):
        return self._fetch("""
            select i.relname as name, pg_get_indexdef(i.oid) as definition
            from pg_index x
            join pg_class i on i.oid = x.indexrelid
            join pg_class t on t.oid = x.indrelid
            join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = %s and t.relname = %s order by i.relname""", (schema, table))

    def foreign_keys(self, schema, table):
        """Связи таблицы: out – куда ссылаются её колонки, refs – какие таблицы ссылаются на неё."""
        q = """
            select con.conname as name,
                   sn.nspname as src_schema, sc.relname as src_table,
                   tn.nspname as ref_schema, tc.relname as ref_table,
                   array(select a.attname from unnest(con.conkey) with ordinality k(n, i)
                         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as columns,
                   array(select a.attname from unnest(con.confkey) with ordinality k(n, i)
                         join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as ref_columns
            from pg_constraint con
            join pg_class sc on sc.oid = con.conrelid join pg_namespace sn on sn.oid = sc.relnamespace
            join pg_class tc on tc.oid = con.confrelid join pg_namespace tn on tn.oid = tc.relnamespace
            where con.contype = 'f' and {side} = to_regclass(format('%%I.%%I', %s::text, %s::text))
            order by 3, 1"""
        fix = lambda rows: [dict(r, columns=list(r["columns"]), ref_columns=list(r["ref_columns"])) for r in rows]
        return {"out": fix(self._fetch(q.format(side="con.conrelid"), (schema, table))),
                "refs": fix(self._fetch(q.format(side="con.confrelid"), (schema, table)))}

    def table_ddl(self, schema, table):
        """CREATE TABLE для вкладки «Структура»: колонки и ограничения (ключ, уникальность, связи, проверки).
        Для представления – его запрос."""
        view = self._fetch("""
            select c.relkind, pg_get_viewdef(c.oid, true) as def from pg_class c
            where c.oid = to_regclass(format('%%I.%%I', %s::text, %s::text)) and c.relkind in ('v','m')""", (schema, table))
        if view:
            word = "MATERIALIZED VIEW" if view[0]["relkind"] == "m" else "VIEW"
            return f'CREATE {word} "{schema}"."{table}" AS\n' + view[0]["def"].rstrip()
        cols = self.columns(schema, table)
        lines = []
        for c in cols:
            line = f'  "{c["name"]}" {c["type"]}'
            if not c["nullable"]:
                line += " NOT NULL"
            if c["default"]:
                line += f' DEFAULT {c["default"]}'
            lines.append(line)
        cons = self._fetch("""
            select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = to_regclass(format('%%I.%%I', %s::text, %s::text)) and contype in ('p','u','f','c')
            order by position(contype in 'pucf'), conname""", (schema, table))
        lines += [f'  CONSTRAINT "{r["conname"]}" {r["def"]}' for r in cons]
        return f'CREATE TABLE "{schema}"."{table}" (\n' + ",\n".join(lines) + "\n);"

    def completion_meta(self):
        """Схемы, таблицы и колонки для автодополнения в редакторе."""
        rows = self._fetch("""
            select n.nspname as schema, c.relname as name, c.relkind in ('v','m') as is_view,
                   coalesce(array_agg(a.attname order by a.attnum) filter (where a.attnum > 0), '{}') as cols,
                   coalesce(array_agg(format_type(a.atttypid, a.atttypmod) order by a.attnum) filter (where a.attnum > 0), '{}') as types
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            where c.relkind in ('r','p','v','m','f')
              and n.nspname not in ('pg_catalog','information_schema','pg_toast')
              and n.nspname not like 'pg_temp%'
            group by 1, 2, 3
            order by 1, 2
            limit 3000""")
        return [{"schema": r["schema"], "name": r["name"], "view": r["is_view"],
                 "cols": list(r["cols"]), "types": list(r["types"])} for r in rows]

    # ---------- данные ----------
    @staticmethod
    def _filter_sql(f, names):
        """Один фильтр колонки → (условие, параметры). Колонка и условие – только из списка, значения – параметрами."""
        col = f.get("col")
        if col not in names:
            raise ValueError("BAD_FILTER")
        c = sql.Identifier(col)
        op, v, v2 = f.get("op"), f.get("v"), f.get("v2")
        like = lambda s: "%" + re.sub(r"([\\%_])", r"\\\1", str(s)) + "%"
        if op == "contains":
            return sql.SQL("{}::text ilike %s").format(c), [like(v)]
        if op == "eq":                      # текст: точное совпадение
            return sql.SQL("{}::text = %s").format(c), [str(v)]
        if op == "eqv":                     # число, дата, ссылка: сравнение по типу колонки (100 = 100.00)
            return sql.SQL("{} = %s").format(c), [str(v)]
        if op == "empty":
            return sql.SQL("({} is null or {}::text = '')").format(c, c), []
        if op == "notempty":
            return sql.SQL("({} is not null and {}::text <> '')").format(c, c), []
        if op in ("gt", "lt", "gte", "lte"):
            sign = {"gt": ">", "lt": "<", "gte": ">=", "lte": "<="}[op]
            return sql.SQL("{} " + sign + " %s").format(c), [str(v)]
        if op == "between":
            return sql.SQL("{} between %s and %s").format(c), [str(v), str(v2)]
        if op == "is":                      # Да/Нет: true, false или пусто
            if v is None:
                return sql.SQL("{} is null").format(c), []
            return sql.SQL("{} = %s").format(c), [bool(v)]
        raise ValueError("BAD_FILTER")

    def _select_parts(self, cols, order_by, order_dir, search, filters=None):
        names = [c["name"] for c in cols]
        conds, args = [], []
        if search:
            parts = [sql.SQL("{}::text ilike %s").format(sql.Identifier(n)) for n in names]
            conds.append(sql.SQL("(") + sql.SQL(" or ").join(parts) + sql.SQL(")"))
            args += [f"%{search}%"] * len(names)
        for f in filters or []:
            cond, a = self._filter_sql(f, names)
            conds.append(cond)
            args += a
        where = sql.SQL(" where ") + sql.SQL(" and ").join(conds) if conds else sql.SQL("")
        order = sql.SQL("")
        if order_by in names:
            direction = sql.SQL("desc" if order_dir == "desc" else "asc")
            order = sql.SQL(" order by {} {} nulls last").format(sql.Identifier(order_by), direction)
        elif any(c["pk"] for c in cols):
            pk_cols = [sql.Identifier(c["name"]) for c in cols if c["pk"]]
            order = sql.SQL(" order by ") + sql.SQL(", ").join(pk_cols)
        return where, order, args

    def table_all(self, schema, table, order_by=None, order_dir="asc", search=None, filters=None):
        """Вся таблица целиком (для выгрузки) с учётом поиска и фильтров, значения без преобразований."""
        cols = self.columns(schema, table)
        where, order, args = self._select_parts(cols, order_by, order_dir, search, filters)
        q = sql.SQL("select * from {}{}{}").format(sql.Identifier(schema, table), where, order)
        with self._cur() as cur:
            cur.execute(q, args)
            return [c["name"] for c in cols], cur.fetchall()

    def table_data(self, schema, table, limit=100, offset=0,
                   order_by=None, order_dir="asc", search=None, with_count=True, filters=None, with_fks=True):
        cols = self.columns(schema, table)
        ident = sql.Identifier(schema, table)
        where, order, args = self._select_parts(cols, order_by, order_dir, search, filters)
        q = sql.SQL("select * from {}{}{} limit %s offset %s").format(ident, where, order)
        cq = sql.SQL("select count(*) from {}{}").format(ident, where)
        t0 = time.perf_counter()
        total = None
        with self._cur() as cur:
            cur.execute(q, args + [int(limit), int(offset)])
            rows = [[to_json_value(v) for v in r] for r in cur.fetchall()]
            if with_count:
                cur.execute(cq, args)
                total = cur.fetchone()[0]
        return {
            "columns": [{"name": c["name"], "type": c["type"], "pk": c["pk"], "nullable": c["nullable"],
                         "default": c["default"]} for c in cols],
            "rows": rows,
            "total": total,
            "ms": round((time.perf_counter() - t0) * 1000, 1),
            "editable": any(c["pk"] for c in cols) and not self.read_only,
            "fks": self.foreign_keys(schema, table) if with_fks else None,
        }

    def column_profile(self, schema, table, sample=5000):
        """Какие колонки годятся для сниппетов: тип, сколько разных значений и сколько заполнено (по первым строкам).
        По этому сниппет понимает, где категория (статус, город), где дата, где сумма, а где почти уникальное значение."""
        cols = self.columns(schema, table)
        fks = {c for f in self.foreign_keys(schema, table)["out"] for c in f["columns"]}
        usable = [c for c in cols if c["type"] not in ("bytea",)]
        out = [{"name": c["name"], "type": c["type"], "pk": c["pk"], "fk": c["name"] in fks, "distinct": None, "filled": None} for c in cols]
        if not usable:
            return {"rows": 0, "cols": out}
        parts = []
        for c in usable:
            ci = sql.Identifier(c["name"])
            parts.append(sql.SQL("count(distinct {}::text), count({})").format(ci, ci))
        cur = self._cur()
        try:
            with self._tx_lock, self.conn.transaction():
                cur.execute("select set_config('statement_timeout', '3s', true)")
                cur.execute(sql.SQL("select count(*), {} from (select * from {} limit %s) s").format(
                    sql.SQL(", ").join(parts), sql.Identifier(schema, table)), [int(sample)])
                r = cur.fetchone()
        finally:
            cur.close()
        by = {c["name"]: c for c in out}
        for i, c in enumerate(usable):
            by[c["name"]]["distinct"], by[c["name"]]["filled"] = r[1 + i * 2], r[2 + i * 2]
        return {"rows": r[0], "cols": out}

    def column_values(self, schema, table, col, prefix="", limit=30):
        """Частые значения колонки, начинающиеся с prefix, – для подсказок в редакторе (WHERE status = '…')."""
        if col not in [c["name"] for c in self.columns(schema, table)]:
            return []
        c = sql.Identifier(col)
        pat = re.sub(r"([\\%_])", r"\\\1", prefix or "") + "%"
        cur = self._cur()
        try:
            with self._tx_lock, self.conn.transaction():
                cur.execute("select set_config('statement_timeout', '3s', true)")
                cur.execute(sql.SQL("select {c}::text, count(*) from {t} where {c} is not null and {c}::text ilike %s "
                                    "group by 1 order by 2 desc, 1 limit %s").format(c=c, t=sql.Identifier(schema, table)),
                            [pat, int(limit)])
                return [{"v": v, "n": n} for v, n in cur.fetchall()]
        finally:
            cur.close()

    # подпись строки для выпадающего списка ссылок: «Иванов Пётр», «Ноутбуки», «MacBook Air» вместо одного номера
    _LABEL_NAMES = ("full_name", "fio", "фио", "name", "title", "название", "наименование", "last_name", "surname",
                    "фамилия", "model", "модель", "email", "login", "code", "sku", "number", "госномер", "vin")

    def fk_options(self, schema, table, col, search="", limit=50):
        """Варианты для колонки-ссылки: значение ключа и понятная подпись из той же строки связанной таблицы."""
        cols = self.columns(schema, table)
        names = [c["name"] for c in cols]
        if col not in names:
            return []
        texty = [c["name"] for c in cols if c["name"] != col and re.match(r"(text|character|varchar|citext)", c["type"])]
        low = {n.lower(): n for n in texty}
        first = next((low[k] for k in ("first_name", "имя") if k in low), None)
        last = next((low[k] for k in ("last_name", "surname", "фамилия") if k in low), None)
        if last and first:
            label = sql.SQL("concat_ws(' ', {}, {})").format(sql.Identifier(last), sql.Identifier(first))
        else:
            pick = next((low[k] for k in self._LABEL_NAMES if k in low), texty[0] if texty else None)
            label = sql.SQL("{}::text").format(sql.Identifier(pick)) if pick else sql.SQL("null::text")
        c = sql.Identifier(col)
        pat = "%" + re.sub(r"([\\%_])", r"\\\1", search or "") + "%"
        cur = self._cur()
        try:
            with self._tx_lock, self.conn.transaction():
                cur.execute("select set_config('statement_timeout', '3s', true)")
                cur.execute(sql.SQL("select {c}::text, {l} from {t} where %s = '%%' or {c}::text ilike %s or {l} ilike %s "
                                    "order by {l} nulls last, {c} limit %s").format(c=c, l=label, t=sql.Identifier(schema, table)),
                            [pat, pat, pat, int(limit)])
                return [{"v": v, "l": l} for v, l in cur.fetchall()]
        finally:
            cur.close()

    def table_count(self, schema, table, search=None, filters=None):
        """Сколько строк с учётом поиска и фильтров – отдельно от данных, чтобы большая таблица показалась сразу."""
        cols = self.columns(schema, table)
        where, _, args = self._select_parts(cols, None, "asc", search, filters)
        with self._cur() as cur:
            cur.execute(sql.SQL("select count(*) from {}{}").format(sql.Identifier(schema, table), where), args)
            return cur.fetchone()[0]

    def where_used(self, schema, table, values):
        """Какие строки других таблиц ссылаются на эту строку. values – значения строки {колонка: значение}."""
        out = []
        with self._cur() as cur:
            for f in self.foreign_keys(schema, table)["refs"]:
                if not all(c in values and values[c] is not None for c in f["ref_columns"]):
                    continue
                vals = [values[c] for c in f["ref_columns"]]
                cond = sql.SQL(" and ").join(sql.SQL("{} = %s").format(sql.Identifier(c)) for c in f["columns"])
                cur.execute(sql.SQL("select count(*) from {} where {}").format(
                    sql.Identifier(f["src_schema"], f["src_table"]), cond), [str(v) for v in vals])
                out.append({"schema": f["src_schema"], "table": f["src_table"], "columns": f["columns"],
                            "values": vals, "n": cur.fetchone()[0]})
        return out

    @staticmethod
    def _pk_where(pk):
        """WHERE по первичному ключу. pk – словарь {колонка: значение}."""
        if not pk:
            raise ValueError("NO_PK")
        parts = [sql.SQL("{} = %s").format(sql.Identifier(k)) for k in pk]
        return sql.SQL(" and ").join(parts), list(pk.values())

    def apply_changes(self, schema, table, changes):
        """Все накопленные правки таблицы – одной транзакцией: либо всё сохранится, либо ничего.
        changes = {updates: [{pk, values}], deletes: [pk], inserts: [{колонка: значение}]}"""
        ident = sql.Identifier(schema, table)
        done = {"updated": 0, "deleted": 0, "inserted": 0}
        cur = self._cur()
        with self._tx_lock, self.conn.transaction():
            for i, u in enumerate(changes.get("updates") or []):
                if not u.get("values"):
                    continue
                where, args = self._pk_where(u["pk"])
                sets = sql.SQL(", ").join(sql.SQL("{} = %s").format(sql.Identifier(k)) for k in u["values"])
                cur.execute(sql.SQL("update {} set {} where {}").format(ident, sets, where),
                            list(u["values"].values()) + args)
                if cur.rowcount != 1:
                    raise RuntimeError("ROW_GONE")
                done["updated"] += 1
            for pk in changes.get("deletes") or []:
                where, args = self._pk_where(pk)
                cur.execute(sql.SQL("delete from {} where {}").format(ident, where), args)
                done["deleted"] += cur.rowcount
            for values in changes.get("inserts") or []:
                values = {k: v for k, v in values.items() if v != ""}   # пусто – значение по умолчанию
                if values:
                    cur.execute(sql.SQL("insert into {} ({}) values ({})").format(
                        ident, sql.SQL(", ").join(sql.Identifier(k) for k in values),
                        sql.SQL(", ").join(sql.Placeholder() for _ in values)), list(values.values()))
                else:
                    cur.execute(sql.SQL("insert into {} default values").format(ident))
                done["inserted"] += 1
        cur.close()
        return done

    def truncate_table(self, schema, table):
        with self._cur() as cur:
            cur.execute(sql.SQL("truncate table {}").format(sql.Identifier(schema, table)))

    def drop_table(self, schema, table, kind="table"):
        word = {"view": "view", "matview": "materialized view"}.get(kind, "table")
        with self._cur() as cur:
            cur.execute(sql.SQL("drop " + word + " {}").format(sql.Identifier(schema, table)))

    def create_database(self, name):
        with self._cur() as cur:
            cur.execute(sql.SQL("create database {}").format(sql.Identifier(name)))

    def drop_database(self, name):
        """Удаляет базу. Из открытой базы её не удалить – сначала переключаемся в другую (postgres)."""
        if self.params["dbname"] == name:
            for other in ("postgres", "template1"):
                if other != name:
                    try:
                        self.connect(other)
                        break
                    except psycopg.Error:
                        continue
        with self._cur() as cur:
            cur.execute(sql.SQL("drop database {}").format(sql.Identifier(name)))

    # ---------- конструктор таблиц (как в Access) ----------
    def design_info(self, schema, table):
        """Поля таблицы для конструктора: тип, обязательность, ключ, уникальность, описание."""
        cols = self._fetch("""
            select a.attname as name,
                   format_type(a.atttypid, a.atttypmod) as type,
                   not a.attnotnull as nullable,
                   pg_get_expr(d.adbin, d.adrelid) as default,
                   a.attidentity <> '' as identity,
                   coalesce(a.attnum = any(i.indkey), false) as pk,
                   col_description(c.oid, a.attnum) as comment,
                   (select con.conname from pg_constraint con
                     where con.conrelid = c.oid and con.contype = 'u' and con.conkey = array[a.attnum]::int2[]
                     limit 1) as unique_name
            from pg_attribute a
            join pg_class c on c.oid = a.attrelid
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
            left join pg_index i on i.indrelid = c.oid and i.indisprimary
            where n.nspname = %s and c.relname = %s and a.attnum > 0 and not a.attisdropped
            order by a.attnum""", (schema, table))
        if not cols:
            raise RuntimeError("NO_TABLE")
        pk = self._fetch("""select conname from pg_constraint
            where conrelid = to_regclass(format('%%I.%%I', %s::text, %s::text)) and contype = 'p'""", (schema, table))
        pk_order = self._fetch("""
            select a.attname from pg_index i
            join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
            where i.indrelid = to_regclass(format('%%I.%%I', %s::text, %s::text)) and i.indisprimary
            order by array_position(i.indkey, a.attnum)""", (schema, table))
        for c in cols:
            c["unique"] = bool(c["unique_name"])
            c["counter"] = bool(c["identity"]) or bool(re.match(r"^nextval\(", c["default"] or ""))
        return {"columns": cols, "pk_name": pk[0]["conname"] if pk else None,
                "pk": [r["attname"] for r in pk_order]}

    @staticmethod
    def _default_expr(v):
        """Значение по умолчанию: числа, true/false, функции и выражения – как есть, остальное – текст в кавычках.
        Так «Москва» работает без кавычек, а now() – как функция."""
        v = (v or "").strip()
        if not v:
            return None
        low = v.lower()
        if (re.fullmatch(r"-?\d+(\.\d+)?", v) or low in ("true", "false", "null", "current_date", "current_time",
                "current_timestamp", "localtimestamp", "current_user") or "(" in v or v.startswith("'") or "::" in v):
            return sql.SQL(v)
        return sql.Literal(v)

    def _design_col(self, f, with_pk=False):
        nullable = f.get("nullable", True) and not f.get("pk")
        parts = [sql.Identifier(f["name"].strip()), sql.SQL(check_type(f["type"]))]
        if not nullable:
            parts.append(sql.SQL("not null"))
        d = self._default_expr(f.get("default"))
        if d is not None:
            parts += [sql.SQL("default"), d]
        if f.get("unique") and not f.get("pk"):
            parts.append(sql.SQL("unique"))
        return sql.SQL(" ").join(parts)

    def design_statements(self, schema, table, name, fields):
        """Команды, которые превращают таблицу в то, что собрано в конструкторе.
        table = None – новая таблица. В fields у существующих полей есть orig – прежнее имя."""
        name = (name or "").strip()
        if not name:
            raise ValueError("NEED_NAME")
        fields = [f for f in fields if (f.get("name") or "").strip()]
        if not fields:
            raise ValueError("NO_COLUMNS")
        seen = set()
        for f in fields:
            n = f["name"].strip()
            if n in seen:
                raise ValueError("DUP_COLUMN:" + n)
            seen.add(n)
        com = lambda ident, f: sql.SQL("comment on column {} is {}").format(
            ident, sql.Literal((f.get("comment") or "").strip() or None))

        if table is None:
            defs = [self._design_col(f) for f in fields]
            pks = [sql.Identifier(f["name"].strip()) for f in fields if f.get("pk")]
            if pks:
                defs.append(sql.SQL("primary key ({})").format(sql.SQL(", ").join(pks)))
            ident = sql.Identifier(schema, name)
            st = [sql.SQL("create table {} (\n  {}\n)").format(ident, sql.SQL(",\n  ").join(defs))]
            st += [com(sql.Identifier(schema, name, f["name"].strip()), f) for f in fields if (f.get("comment") or "").strip()]
            return st

        info = self.design_info(schema, table)
        orig = {c["name"]: c for c in info["columns"]}
        T = sql.Identifier(schema, table)
        col = lambda n: sql.Identifier(schema, table, n)
        drops, pk_drop, renames, changes, adds, pk_add, tail = [], [], [], [], [], [], []

        kept = {f.get("orig") for f in fields if f.get("orig")}
        for n in orig:
            if n not in kept:
                drops.append(sql.SQL("alter table {} drop column {}").format(T, sql.Identifier(n)))

        new_name_of = {}
        for f in fields:
            o = orig.get(f.get("orig")) if f.get("orig") else None
            n = f["name"].strip()
            if f.get("orig") and o is None:
                raise RuntimeError("ROW_GONE")
            if o is None:
                adds.append(sql.SQL("alter table {} add column {}").format(T, self._design_col(f)))
                if (f.get("comment") or "").strip():
                    tail.append(com(col(n), f))
                continue
            new_name_of[o["name"]] = n
            if n != o["name"]:
                renames.append(sql.SQL("alter table {} rename column {} to {}").format(
                    T, sql.Identifier(o["name"]), sql.Identifier(n)))
            ci = sql.Identifier(n)
            if f.get("type"):                    # тип меняли
                ty = check_type(f["type"])
                if ty.lower().endswith("serial"):
                    raise ValueError("NO_COUNTER_CHANGE")
                changes.append(sql.SQL("alter table {} alter column {} type {} using {}::{}").format(
                    T, ci, sql.SQL(ty), ci, sql.SQL(ty)))
            nullable = bool(f.get("nullable", True)) and not f.get("pk")
            if nullable != o["nullable"]:
                changes.append(sql.SQL("alter table {} alter column {} {} not null").format(
                    T, ci, sql.SQL("drop" if nullable else "set")))
            if not o["counter"]:
                new_d = (f.get("default") or "").strip()
                if new_d != (o["default"] or ""):
                    d = self._default_expr(new_d)
                    changes.append(sql.SQL("alter table {} alter column {} drop default").format(T, ci) if d is None else
                                   sql.SQL("alter table {} alter column {} set default {}").format(T, ci, d))
            if bool(f.get("unique")) and not f.get("pk") and not o["unique"]:
                changes.append(sql.SQL("alter table {} add unique ({})").format(T, ci))
            elif (not f.get("unique") or f.get("pk")) and o["unique"]:
                changes.append(sql.SQL("alter table {} drop constraint {}").format(T, sql.Identifier(o["unique_name"])))
            if (f.get("comment") or "").strip() != (o["comment"] or ""):
                tail.append(com(col(n), f))

        old_pk = [new_name_of.get(n, n) for n in info["pk"]]
        new_pk = [f["name"].strip() for f in fields if f.get("pk")]
        if old_pk != new_pk:
            if info["pk_name"] and all(n in new_name_of for n in info["pk"]):
                pk_drop.append(sql.SQL("alter table {} drop constraint {}").format(T, sql.Identifier(info["pk_name"])))
            if new_pk:
                pk_add.append(sql.SQL("alter table {} add primary key ({})").format(
                    T, sql.SQL(", ").join(sql.Identifier(n) for n in new_pk)))
        if name != table:
            tail.append(sql.SQL("alter table {} rename to {}").format(T, sql.Identifier(name)))
        return drops + pk_drop + renames + changes + adds + pk_add + tail

    def design_preview(self, schema, table, name, fields):
        cur = self._cur()
        cur.close()
        return [st.as_string(self.conn) + ";" for st in self.design_statements(schema, table, name, fields)]

    def design_save(self, schema, table, name, fields):
        """Все изменения структуры – одной транзакцией: либо всё, либо ничего."""
        st = self.design_statements(schema, table, name, fields)
        cur = self._cur()
        with self._tx_lock, self.conn.transaction():
            for s in st:
                cur.execute(s)
        cur.close()
        return len(st)

    # ---------- импорт CSV / Excel ----------
    @staticmethod
    def read_csv(path, limit=None):
        """Заголовок и строки файла (CSV/TSV или Excel .xlsx), разделитель (или 'xlsx')."""
        header, rows, delim = tablefile.read_table_file(path)
        return header, (rows[:limit] if limit else rows), delim

    def import_csv(self, schema, table, path, mapping, empty_null=True):
        """mapping – для каждой колонки CSV имя колонки таблицы или None (пропустить).
        Загрузка через COPY – быстро даже для больших файлов; ошибка в любой строке отменяет всё."""
        header, rows, _ = self.read_csv(path)
        idx = [i for i, m in enumerate(mapping) if m]
        if not idx:
            raise ValueError("NO_MAPPING")
        cols = [mapping[i] for i in idx]
        cur = self._cur()
        with self._tx_lock, self.conn.transaction():
            q = sql.SQL("copy {} ({}) from stdin").format(
                sql.Identifier(schema, table), sql.SQL(", ").join(sql.Identifier(c) for c in cols))
            with cur.copy(q) as cp:
                for r in rows:
                    vals = []
                    for i in idx:
                        v = r[i] if i < len(r) else ""
                        vals.append(None if (empty_null and v == "") else v)
                    cp.write_row(vals)
        cur.close()
        return len(rows)

    def import_new_table(self, schema, table, path, columns, key):
        """Новая таблица из файла: columns – [{src: номер колонки файла, name, type}], key – 'add' (добавить id-счётчик),
        имя колонки (она станет ключом) или None. Создание и загрузка – одной транзакцией: ошибка в любой строке отменяет всё."""
        if self.read_only:
            raise RuntimeError("READ_ONLY")
        table = (table or "").strip()
        if not table:
            raise RuntimeError("NO_TABLE_NAME")
        cols = [c for c in columns if c.get("name")]
        if not cols:
            raise ValueError("NO_MAPPING")
        for c in cols:
            if c["type"] not in tablefile.TYPES:
                raise ValueError("BAD_TYPE")
        header, rows, _ = self.read_csv(path)
        defs = [sql.SQL("id serial primary key")] if key == "add" else []
        for c in cols:
            d = sql.SQL("{} {}").format(sql.Identifier(c["name"]), sql.SQL(c["type"]))
            if key == c["name"]:
                d = sql.SQL("{} primary key").format(d)
            defs.append(d)
        cur = self._cur()
        try:
            with self._tx_lock, self.conn.transaction():
                cur.execute(sql.SQL("create table {} ({})").format(sql.Identifier(schema, table), sql.SQL(", ").join(defs)))
                q = sql.SQL("copy {} ({}) from stdin").format(
                    sql.Identifier(schema, table), sql.SQL(", ").join(sql.Identifier(c["name"]) for c in cols))
                with cur.copy(q) as cp:
                    for r in rows:
                        cp.write_row([tablefile.normalize(r[c["src"]] if c["src"] < len(r) else "", c["type"]) for c in cols])
        finally:
            cur.close()
        return len(rows)

    # ---------- SQL-редактор ----------
    @staticmethod
    def _plain_select(query):
        """Один SELECT/WITH/TABLE/VALUES, который ничего не меняет, – его можно читать курсором на сервере.
        Всё остальное (несколько команд, INSERT … RETURNING, WITH … DELETE, SELECT INTO) – обычным путём."""
        clean = _strip_literals(query).strip().rstrip(";").strip()
        if ";" in clean or not re.match(r"^\(*\s*(select|with|table|values)\b", clean, re.I):
            return False
        return not re.search(r"\b(insert|update|delete|merge|into|copy|call|do)\b", clean, re.I)

    def _run_select_cursor(self, query, max_rows):
        """DECLARE … CURSOR → FETCH max_rows+1 → CLOSE: сервер отдаёт только показываемые строки
        (раньше весь результат – хоть миллионы строк – сначала целиком попадал в память).
        Всё уходит одним пакетом (pipeline) – одно обращение к серверу, как и обычный запрос; важно для баз за SSH.
        Ничего не отменяется, поэтому открытая транзакция в ручном режиме не ломается; в автоматическом – своя BEGIN/COMMIT."""
        c = self.qconn
        auto = c.autocommit
        name = sql.Identifier("noir_" + uuid.uuid4().hex[:12])
        declare = sql.SQL("DECLARE {} NO SCROLL CURSOR FOR ").format(name)
        shift = len(declare.as_string(c))
        cur_cfg, cur_dec, cur_fetch, cur_end = c.cursor(), c.cursor(), c.cursor(), c.cursor()
        try:
            with c.pipeline():
                cur_cfg.execute("select set_config('statement_timeout', %s, false)",
                                [f"{self.timeout * 1000}" if self.timeout else "0"])
                if auto:
                    cur_dec.execute("BEGIN")
                cur_dec.execute(declare + sql.SQL(query.strip().rstrip(";")))
                cur_fetch.execute(sql.SQL("FETCH FORWARD {} FROM {}").format(sql.Literal(max_rows + 1), name))
                cur_end.execute(sql.SQL("CLOSE {}").format(name))
                if auto:
                    cur_end.execute("COMMIT")
            cols = [{"name": d.name, "type": self._type_name(d.type_code)} for d in cur_fetch.description or []]
            data = cur_fetch.fetchall() if cur_fetch.description else []
        except psycopg.Error as e:
            # позиция ошибки – в тексте пользователя, а не в «DECLARE … CURSOR FOR …»
            e.noir_pos_shift = shift
            if auto and c.info.transaction_status != TransactionStatus.IDLE:
                try:
                    c.execute("ROLLBACK")          # пакет прервался до COMMIT – закрываем свою транзакцию
                except Exception:
                    pass
            raise
        finally:
            for x in (cur_cfg, cur_dec, cur_fetch, cur_end):
                x.close()
        return {"kind": "rows", "columns": cols,
                "rows": [[to_json_value(v) for v in r] for r in data[:max_rows]],
                "truncated": len(data) > max_rows}

    def run_query(self, query, max_rows=2000, params=None):
        """Выполняет SQL. Если запросов несколько, показывает результат последнего SELECT
        (или статус последней команды, если SELECT не было)."""
        t0 = time.perf_counter()
        if params is None and self._plain_select(query):
            self._qcur().close()           # живо ли соединение, не потерялась ли транзакция
            try:
                res = self._run_select_cursor(query, max_rows)
            except Exception:
                # ручной режим без изменений: ошибка в SELECT откатывается сама (как и в обычном пути)
                if not self.qconn.autocommit and not self.dirty:
                    try:
                        self.qconn.rollback()
                    except Exception:
                        pass
                raise
            return dict(res, ms=round((time.perf_counter() - t0) * 1000, 1), tx=self.tx_state())
        result = None
        with self._qcur(client=params is not None) as cur:
            try:
                cur.execute("select set_config('statement_timeout', %s, false)",
                            [f"{self.timeout * 1000}" if self.timeout else "0"])
                cur.execute(query, params)
            except Exception:
                # в автоматическом режиме закрываем то, что мог открыть BEGIN из файла;
                # в ручном режиме транзакцию откатывает пользователь
                # в ручном режиме без изменений ошибка в SELECT тоже откатывается сама
                if self.qconn.autocommit or not self.dirty:
                    try:
                        self.qconn.execute("rollback") if self.qconn.autocommit else self.qconn.rollback()
                    except Exception:
                        pass
                raise
            while True:
                if cur.description:
                    cols = [{"name": d.name, "type": self._type_name(d.type_code)} for d in cur.description]
                    data = cur.fetchmany(max_rows + 1)
                    res = {"kind": "rows", "columns": cols,
                           "rows": [[to_json_value(v) for v in r] for r in data[:max_rows]],
                           "truncated": len(data) > max_rows}
                else:
                    res = {"kind": "status", "status": cur.statusmessage or "", "affected": cur.rowcount}
                if res["kind"] == "rows" or result is None or result["kind"] == "status":
                    result = res
                word = (cur.statusmessage or "").split(" ")[0].upper()
                if word in CHANGING:
                    self.dirty = True
                elif word in ("COMMIT", "ROLLBACK"):
                    self.dirty = False
                if not cur.nextset():
                    break
        ms = round((time.perf_counter() - t0) * 1000, 1)
        result = result or {"kind": "status", "status": "", "affected": -1}
        return dict(result, ms=ms, tx=self.tx_state())

    # ---------- схема базы картинкой ----------
    def schema_diagram(self, schema):
        """Таблицы схемы с колонками (ключи отмечены) и связи между ними – для вкладки «Схема»."""
        cols = self._fetch("""
            select c.relname as table, a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
                   coalesce(a.attnum = any(i.indkey), false) as pk
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            left join pg_index i on i.indrelid = c.oid and i.indisprimary
            where n.nspname = %s and c.relkind in ('r','p')
            order by c.relname, a.attnum""", (schema,))
        tables = {}
        for c in cols:
            tables.setdefault(c["table"], []).append({"name": c["name"], "type": c["type"], "pk": c["pk"]})
        fks = self._fetch("""
            select sc.relname as src, tc.relname as ref,
                   array(select a.attname from unnest(con.conkey) with ordinality k(n, i)
                         join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as columns,
                   array(select a.attname from unnest(con.confkey) with ordinality k(n, i)
                         join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as ref_columns
            from pg_constraint con
            join pg_class sc on sc.oid = con.conrelid join pg_namespace sn on sn.oid = sc.relnamespace
            join pg_class tc on tc.oid = con.confrelid join pg_namespace tn on tn.oid = tc.relnamespace
            where con.contype = 'f' and sn.nspname = %s and tn.nspname = %s
            order by 1, 2""", (schema, schema))
        return {"tables": [{"name": k, "columns": v} for k, v in tables.items()],
                "fks": [dict(f, columns=list(f["columns"]), ref_columns=list(f["ref_columns"])) for f in fks]}

    # ---------- поиск значения по всей базе ----------
    SEARCH_TIMEOUT = 10      # секунд на одну таблицу – большие таблицы не держат поиск

    def search_table(self, schema, table, value, exact=False):
        """Сколько раз значение встречается в каждой колонке таблицы. Одна проверка таблицы – один проход по ней."""
        value = (value or "").strip()
        if not value:
            return []
        is_num = bool(re.fullmatch(r"-?\d+(\.\d+)?", value))
        conds, args, names = [], [], []
        for c in self.columns(schema, table):
            ty = c["type"]
            if ty == "bytea":
                continue
            col = sql.Identifier(c["name"])
            numeric = bool(re.match(r"^(smallint|integer|bigint|numeric|real|double|money)", ty))
            if exact and numeric:
                if not is_num:
                    continue
                cond = sql.SQL("{} = %s::numeric").format(col)
                args.append(value)
            elif exact:
                cond = sql.SQL("{}::text = %s").format(col)
                args.append(value)
            else:
                cond = sql.SQL("{}::text ilike %s").format(col)
                args.append("%" + re.sub(r"([\\%_])", r"\\\1", value) + "%")
            conds.append(sql.SQL("count(*) filter (where {})").format(cond))
            names.append(c["name"])
        if not conds:
            return []
        c = self.sconn
        if c is None or c.closed or c.broken:
            c = self.sconn = self._open()
        with c.transaction():
            with c.cursor() as cur:
                cur.execute("select set_config('statement_timeout', %s, true)", [f"{self.SEARCH_TIMEOUT}s"])
                cur.execute("set local transaction_read_only = on")
                cur.execute(sql.SQL("select {} from {}").format(sql.SQL(", ").join(conds), sql.Identifier(schema, table)), args)
                counts = cur.fetchone()
        return [{"col": n, "n": k} for n, k in zip(names, counts) if k]

    def cancel_search(self):
        c = self.sconn
        if c is not None and not c.closed:
            c.cancel_safe() if hasattr(c, "cancel_safe") else c.cancel()
        return True

    # ---------- статистика колонки ----------
    def column_stats(self, source, col):
        """Статистика одной колонки по всем строкам (а не только по странице).
        source = {table: {schema, table, search, filters}} – таблица с учётом поиска и фильтров;
        source = {query: {sql, params, ncols}} – результат запроса (только один SELECT), col – номер колонки."""
        if "table" in source:
            s = source["table"]
            cols = self.columns(s["schema"], s["table"])
            if col not in [c["name"] for c in cols]:
                raise ValueError("BAD_FILTER")
            where, _, args = self._select_parts(cols, None, "asc", s.get("search"), s.get("filters"))
            src = sql.SQL("select * from {}{}").format(sql.Identifier(s["schema"], s["table"]), where)
            c = sql.Identifier(col)
            run = self._stats_table
        else:
            src, args = self._query_source(source["query"])
            c = sql.Identifier(f"c{int(col)}")
            run = self._stats_query
        return run(lambda cur: self._stats(cur, src, c, args), client=args is not None and "query" in source)

    def check_sql(self, query):
        """Разобрать запрос без выполнения (EXPLAIN без ANALYZE) – для «исправить весь запрос»: видны ошибки
        в названиях, синтаксисе, GROUP BY и т. п. Транзакция только для чтения, 3 секунды, данные не трогаются."""
        c = self.conn if self._alive(self.conn) else None
        if c is None:
            self._cur().close()
            c = self.conn
        with self._tx_lock, c.transaction():
            with c.cursor() as cur:
                cur.execute("set transaction read only")
                cur.execute("select set_config('statement_timeout', '3000', true)")
                cur.execute(sql.SQL("explain ") + sql.SQL(query))
        return True

    def save_result_table(self, schema, table, query, params=None):
        """Результат запроса → новая таблица в базе (данные на текущий момент). Только один SELECT, одна транзакция."""
        if self.read_only:
            raise RuntimeError("READ_ONLY")
        table = (table or "").strip()
        if not table:
            raise RuntimeError("NO_TABLE_NAME")
        text = query.strip().rstrip(";").strip()
        clean = _strip_literals(text)
        if not re.match(r"^\s*(select|with|table|values)\b", clean, re.I) or ";" in clean:
            raise RuntimeError("SAVE_ONLY_SELECT")
        q = sql.SQL("create table {} as\n{}\n").format(sql.Identifier(schema, table), sql.SQL(text))
        c = self.conn if self._alive(self.conn) else None
        if c is None:
            self._cur().close()
            c = self.conn
        with self._tx_lock, c.transaction():
            cur = psycopg.ClientCursor(c) if params is not None else c.cursor()
            try:
                cur.execute(q, params)
                n = cur.rowcount
            finally:
                cur.close()
        return {"rows": n}

    def save_view(self, schema, name, query):
        """Запрос → представление (VIEW) в базе: его видят pgAdmin, Excel, BI и коллеги. Только один SELECT, без {{переменных}}."""
        if self.read_only:
            raise RuntimeError("READ_ONLY")
        name = (name or "").strip()
        if not name:
            raise RuntimeError("NO_TABLE_NAME")
        text = query.strip().rstrip(";").strip()
        clean = _strip_literals(text)
        if "{{" in clean:
            raise RuntimeError("VIEW_VARS")
        if not re.match(r"^\s*(select|with|table|values)\b", clean, re.I) or ";" in clean:
            raise RuntimeError("SAVE_ONLY_SELECT")
        q = sql.SQL("create view {} as\n{}\n").format(sql.Identifier(schema, name), sql.SQL(text))
        c = self.conn if self._alive(self.conn) else None
        if c is None:
            self._cur().close()
            c = self.conn
        with self._tx_lock, c.transaction():
            with c.cursor() as cur:
                cur.execute(q)
        return True

    @staticmethod
    def _query_source(q):
        """Результат запроса как подзапрос с колонками c0, c1… (так не мешают одинаковые имена колонок).
        Только один SELECT – иначе повтор запроса мог бы что-то изменить в базе."""
        text = q["sql"].strip().rstrip(";").strip()
        clean = _strip_literals(text)
        if not re.match(r"^\s*(select|with|table|values)\b", clean, re.I) or ";" in clean:
            raise RuntimeError("STATS_ONLY_SELECT")
        n = int(q["ncols"])
        names = sql.SQL(", ").join(sql.Identifier(f"c{i}") for i in range(n))
        # перенос строки перед «)» – чтобы комментарий «--» в конце запроса не съел скобку
        return sql.SQL("select * from ({}\n) q ({})").format(sql.SQL(text), names), q.get("params")

    PIVOT_FN = {"sum": "sum", "avg": "avg", "count": "count", "min": "min", "max": "max"}

    def pivot(self, q, rows_col, cols_col, val_col, fn):
        """Сводная таблица по результату запроса: группировка по строкам и (необязательно) колонкам, итоги.
        Считается в PostgreSQL по всему результату, а не только по показанным строкам."""
        if fn not in self.PIVOT_FN:
            raise ValueError("BAD_FILTER")
        src, args = self._query_source(q)
        r = sql.Identifier(f"c{int(rows_col)}")
        c = sql.Identifier(f"c{int(cols_col)}") if cols_col is not None else None
        v = sql.Identifier(f"c{int(val_col)}") if val_col is not None else None
        agg = sql.SQL("count(*)") if v is None else sql.SQL(self.PIVOT_FN[fn] + "({})").format(v)
        if fn == "count" and v is not None:
            agg = sql.SQL("count({})").format(v)
        if c is not None:
            q2 = sql.SQL("select grouping({r})::int, grouping({c})::int, {r}::text, {c}::text, {a} from ({s}) p "
                         "group by grouping sets (({r}, {c}), ({r}), ({c}), ()) order by 1, {r} nulls last, 2, {c} nulls last"
                         ).format(r=r, c=c, a=agg, s=src)
        else:
            q2 = sql.SQL("select grouping({r})::int, 1, {r}::text, null, {a} from ({s}) p "
                         "group by grouping sets (({r}), ()) order by 1, {r} nulls last").format(r=r, a=agg, s=src)

        def run(cur):
            cur.execute(q2, args)
            return [[gr, gc, rv, cv, to_json_value(val)] for gr, gc, rv, cv, val in cur.fetchall()]
        cells = self._stats_query(run, client=args is not None)
        cols = [x[3] for x in cells if x[0] == 0 and x[1] == 0] if c is not None else []
        cols = list(dict.fromkeys(cols))
        if len(cols) > 60:
            raise RuntimeError("PIVOT_TOO_WIDE")
        return {"cells": cells}

    def _stats_table(self, fn, client=False):
        cur = self._cur()
        try:
            with self._tx_lock, self.conn.transaction():
                cur.execute("set local statement_timeout = '30s'")
                return fn(cur)
        finally:
            cur.close()

    def _stats_query(self, fn, client=False):
        """По результату запроса – в соединении редактора (видны и несохранённые изменения).
        В ручном режиме – внутри точки сохранения, чтобы ошибка не сломала транзакцию пользователя."""
        with self._qcur(client=client) as cur:
            in_tx = not self.qconn.autocommit and self.qconn.info.transaction_status == TransactionStatus.INTRANS
            if in_tx:
                cur.execute("savepoint noir_stats")
            try:
                res = fn(cur)
            except Exception:
                if in_tx:
                    cur.execute("rollback to savepoint noir_stats")
                raise
            if in_tx:
                cur.execute("release savepoint noir_stats")
            elif not self.qconn.autocommit:
                self.qconn.rollback()     # только чтение – транзакцию, открытую ради статистики, закрываем
            return res

    def _stats(self, cur, src, c, args):
        cur.execute(sql.SQL("select {} from ({}) s limit 0").format(c, src), args)
        oid = cur.description[0].type_code
        cat = self._fetch_on(cur, "select typcategory from pg_type where oid = %s", [oid])
        kind = {"N": "num", "D": "date", "B": "bool"}.get(cat, "text")
        res = {"kind": kind}
        base = sql.SQL("from ({}) s").format(src)
        cur.execute(sql.SQL("select count(*), count({c}), count(distinct {c}) {b}").format(c=c, b=base), args)
        res["total"], res["filled"], res["distinct"] = cur.fetchone()
        res["nulls"] = res["total"] - res["filled"]
        if kind == "num":
            cur.execute(sql.SQL("select min({c}), max({c}), avg({c}), percentile_cont(0.5) within group (order by {c}) {b}")
                        .format(c=c, b=base), args)
            mn, mx, avg, med = cur.fetchone()
            res.update(min=to_json_value(mn), max=to_json_value(mx), avg=to_json_value(avg), median=to_json_value(med))
            if mn is not None and mx is not None and mn != mx:
                res["hist"] = self._hist(cur, sql.SQL("{}::float8").format(c), base, float(mn), float(mx), args)
        elif kind == "date":
            cur.execute(sql.SQL("select min({c}), max({c}), extract(epoch from min({c})::timestamptz), "
                                "extract(epoch from max({c})::timestamptz) {b}").format(c=c, b=base), args)
            mn, mx, e0, e1 = cur.fetchone()
            res.update(min=to_json_value(mn), max=to_json_value(mx))
            if e0 is not None and e1 is not None and e0 != e1:
                res["hist"] = self._hist(cur, sql.SQL("extract(epoch from {}::timestamptz)").format(c), base, float(e0), float(e1), args)
                res["histEpoch"] = True
        if kind in ("text", "bool") or res["distinct"] <= 12:
            cur.execute(sql.SQL("select {c}::text, count(*) {b} group by 1 order by 2 desc, 1 limit 10").format(c=c, b=base), args)
            res["top"] = [{"v": v, "n": n} for v, n in cur.fetchall()]
        return res

    @staticmethod
    def _fetch_on(cur, q, args):
        cur.execute(q, args)
        r = cur.fetchone()
        return r[0] if r else None

    @staticmethod
    def _hist(cur, expr, base, lo, hi, args, bins=20):
        """Гистограмма: 20 равных интервалов от минимума до максимума."""
        cur.execute(sql.SQL("select least(width_bucket({e}, {lo}, {hi}, {n}), {n}) b, count(*) {base} where {e} is not null group by 1 order by 1")
                    .format(e=expr, lo=sql.Literal(lo), hi=sql.Literal(hi), n=sql.Literal(bins), base=base), args)
        counts = dict(cur.fetchall())
        step = (hi - lo) / bins
        return [{"lo": lo + i * step, "hi": lo + (i + 1) * step, "n": counts.get(i + 1, 0)} for i in range(bins)]

    def _type_name(self, oid):
        try:
            t = self.qconn.adapters.types.get(oid)
            return t.name if t else ""
        except Exception:
            return ""

    def query_all(self, query, params=None):
        """Полный результат SELECT для выгрузки (без ограничения по числу строк)."""
        with self._qcur(client=params is not None) as cur:
            cur.execute(query, params)
            if not cur.description:
                return [], []
            return [d.name for d in cur.description], cur.fetchall()
