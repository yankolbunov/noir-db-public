"""API, которое вызывает интерфейс (window.pywebview.api.*)."""
import base64
import functools
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from decimal import Decimal
from pathlib import Path

import psycopg

from . import exporters
from . import store
from .db import PgSession
from . import tablefile
from .sshtunnel import Tunnel
from .version import VERSION, AUTHOR, COPYRIGHT

# понятные сообщения вместо технических текстов PostgreSQL
FRIENDLY = [
    (re.compile(r"read-only transaction", re.I), "READ_ONLY"),
    (re.compile(r"statement timeout", re.I), "TIMEOUT"),
    (re.compile(r"canceling statement due to user request", re.I), "STOPPED"),
    (re.compile(r"current transaction is aborted", re.I), "TX_ABORTED"),
]


def safe(fn):
    """Каждый метод возвращает {ok, data} или {ok: False, error, pos}."""
    @functools.wraps(fn)
    def wrapper(self, *args, **kwargs):
        try:
            return {"ok": True, "data": fn(self, *args, **kwargs)}
        except psycopg.Error as e:
            diag = getattr(e, "diag", None)
            msg = (diag.message_primary if diag and diag.message_primary else str(e)).strip()
            pos = None
            if diag and diag.statement_position:
                try:
                    pos = int(diag.statement_position) - getattr(e, "noir_pos_shift", 0)
                    pos = pos if pos > 0 else None
                except ValueError:
                    pos = None
            code = next((c for r, c in FRIENDLY if r.search(msg)), None)
            args = {}
            state = diag.sqlstate if diag else None
            detail = (diag.message_detail or "") if diag else ""
            if state == "23503":            # внешний ключ
                m = re.findall(r'table "([^"]+)"', msg)
                if "still referenced" in detail or "is still referenced" in msg:
                    code, args = "FK_DELETE", {"t": m[-1] if m else ""}
                else:
                    ref = re.search(r'is not present in table "([^"]+)"', detail)
                    code, args = "FK_INSERT", {"t": ref.group(1) if ref else (m[-1] if m else "")}
            elif state == "23505" and "is duplicated" in detail:   # ключ/уникальность на колонку с повторами
                m = re.search(r"Key \((.+?)\)=\((.*)\) is duplicated", detail)
                code, args = "DUPLICATES", {"c": m.group(1) if m else "", "v": m.group(2) if m else ""}
            elif state == "23505":          # уникальность
                m = re.search(r"Key \((.+?)\)=\((.*)\) already exists", detail)
                code, args = "UNIQUE", {"c": m.group(1) if m else "", "v": m.group(2) if m else ""}
            elif state == "23502" and "contains null values" in msg:   # «обязательное» на колонку с пустыми
                m = re.search(r'column "([^"]+)"', msg)
                code, args = "HAS_NULLS", {"c": m.group(1) if m else ""}
            elif state == "23502":          # обязательная колонка
                code, args = "NOT_NULL", {"c": diag.column_name or ""}
            elif state == "23514":          # CHECK
                code, args = "CHECK", {"c": diag.constraint_name or ""}
            elif state in ("22P02", "22007", "22008", "22003"):   # значение не того формата
                m = re.search(r'type (\w[\w ]*): "(.*)"', msg)
                d = re.search(r'date/time field value out of range: "(.*)"', msg)
                if m:
                    code, args = "BAD_VALUE", {"c": m.group(1), "v": m.group(2)}
                elif d:
                    code, args = "BAD_DATE", {"v": d.group(1)}
            elif state == "42703":          # нет такой колонки
                m = re.search(r'column "?([^"]+?)"? of relation', msg) or re.search(r'column "?([^"]+?)"? does not exist', msg)
                code, args = "NO_COLUMN", {"c": m.group(1) if m else ""}
            elif state == "42P01" and "missing FROM-clause entry" in msg:   # псевдоним не объявлен
                m = re.search(r'for table "([^"]+)"', msg)
                code, args = "NO_ALIAS", {"t": m.group(1) if m else ""}
            elif state == "42P01":          # нет такой таблицы
                m = re.search(r'relation "([^"]+)" does not exist', msg)
                code, args = "NO_TABLE", {"t": m.group(1) if m else ""}
            elif state == "42702":          # колонка есть в нескольких таблицах
                m = re.search(r'column reference "([^"]+)" is ambiguous', msg)
                code, args = "AMBIGUOUS", {"c": m.group(1) if m else ""}
            elif state == "22012":
                code, args = "DIV_ZERO", {}
            elif state == "21000" and "more than one row" in msg:
                code, args = "MANY_ROWS", {}
            elif state == "42883" and msg.startswith("operator does not exist"):
                code, args = "NO_OPERATOR", {}
            elif state == "42601" and "unterminated quoted" in msg:
                code, args = "UNCLOSED_QUOTE", {}
            elif state == "42601" and "subquery in FROM must have an alias" in msg:
                code, args = "SUB_ALIAS", {}
            elif state == "42P10":
                code, args = "DISTINCT_ORDER", {}
            elif state == "42601":          # синтаксис
                m = re.search(r'at or near "(.*)"', msg)
                code, args = ("SYNTAX", {"v": m.group(1)}) if m else ("SYNTAX_END", {})
            elif state == "42883":          # нет такой функции/оператора
                code, args = "NO_FUNCTION", {}
            elif state == "42803":          # GROUP BY
                m = re.search(r'column "([^"]+)" must appear in the GROUP BY', msg)
                code, args = "GROUP_BY", {"c": m.group(1) if m else ""}
            elif state in ("42P07", "42701", "42710", "42P04"):    # уже существует
                m = re.search(r'"([^"]+)" already exists', msg)
                code, args = "EXISTS", {"t": m.group(1) if m else ""}
            elif state == "2BP01":          # от объекта зависят представления и т. п.
                m = re.search(r'(view|представление) ([\w."]+)', detail)
                code, args = "DEPENDS", {"t": m.group(2).strip('"') if m else ""}
            elif state in ("42846", "42804"):   # нельзя привести тип
                m = re.search(r"to (?:type )?([\w ]+?)\s*$", msg) or re.search(r"type ([\w ]+)", msg)
                code, args = "CANT_CAST", {"v": m.group(1) if m else ""}
            elif state == "55006":         # базу держат другие подключения
                code, args = "DB_IN_USE", {}
            elif state == "42501":
                code, args = "NO_RIGHTS", {}
            elif state == "28P01" or "password authentication failed" in msg:
                code, args = "BAD_PASSWORD", {}
            elif state == "3D000" or re.search(r'database "[^"]+" does not exist', msg):
                m = re.search(r'database "([^"]+)" does not exist', msg)
                code, args = "NO_DATABASE", {"t": m.group(1) if m else ""}
            elif re.search(r'role "[^"]+" does not exist', msg):
                m = re.search(r'role "([^"]+)" does not exist', msg)
                code, args = "NO_ROLE", {"t": m.group(1) if m else ""}
            elif "could not translate host name" in msg or "nodename nor servname" in msg:
                m = re.search(r'host name "([^"]+)"', msg)
                code, args = "NO_HOST", {"t": m.group(1) if m else ""}
            elif "server closed the connection unexpectedly" in msg and "connection to server" in msg:
                code, args = "CONN_CLOSED", {}
            elif "Connection refused" in msg or "could not connect" in msg or "timeout expired" in msg:
                code, args = "NO_SERVER", {}
            hint = (diag.message_hint or "") if diag else ""
            # state и hint – для подсказок «как исправить» в редакторе (sqlhelp.js)
            return {"ok": False, "error": msg, "code": code, "args": args, "pos": pos, "detail": detail or None,
                    "state": state, "hint": hint or None}
        except Exception as e:
            msg = str(e) or e.__class__.__name__
            m = re.match(r"^([A-Z_]+):(.*)$", msg)     # «КОД:значение» – код ошибки с подстановкой
            if m:
                return {"ok": False, "error": msg, "code": m.group(1), "args": {"v": m.group(2)}}
            return {"ok": False, "error": msg}
    return wrapper


class Api:
    def __init__(self):
        self._window = None         # окно pywebview, задаётся в main.py (с _ – чтобы не уходило в JS)
        self._sessions = {}         # conn_id -> PgSession
        self._spare = {}            # туннели после «Проверить»: ключ -> (Tunnel, время)
        self._conn_lock = threading.Lock()   # подключение одного и того же – по очереди (двойной клик)
        self._titlebar = None       # высота системного заголовка macOS (задаёт main.py)
        self._allow_close = False   # True – окно можно закрывать без вопроса
        self._close_asked = 0.0     # когда последний раз показывали плашку закрытия
        self._dialog_shown = False  # интерфейс подтвердил, что плашка на экране
        self._dirty = False         # в интерфейсе есть несохранённые правки таблиц
        self._theme_cb = None       # main.py: переключить оформление окна macOS
        self._icon_cb = None        # main.py: иконка в Dock под тему (светлая / тёмная)
        self._zoom_cb = None        # main.py: растянуть окно (двойной клик по заголовку)

    # ---------- служебное ----------
    def _session(self, conn_id):
        s = self._sessions.get(conn_id)
        if s is None:
            raise RuntimeError("NOT_CONNECTED")
        return s

    def _has_unsaved(self):
        return self._dirty or any(s.tx_state() != "none" for s in self._sessions.values())

    def _open_dialog(self, kinds):
        if self._window is None:
            raise RuntimeError("NO_WINDOW")
        import webview
        res = self._window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=kinds)
        if not res:
            return None
        return Path(res[0] if not isinstance(res, str) else res)

    def _save_dialog(self, filename, kind, ext):
        """Окно «Сохранить как». Без окна (режим разработки) – сразу в «Загрузки»."""
        if self._window is not None:
            import webview
            res = self._window.create_file_dialog(webview.SAVE_DIALOG, save_filename=filename, file_types=(kind,))
            if not res:
                return None      # пользователь нажал «Отмена»
            path = Path(res if isinstance(res, str) else res[0])
        else:
            path = Path.home() / "Downloads" / filename
            path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix.lower() != "." + ext:
            path = path.with_suffix("." + ext)
        return path

    # ---------- окно ----------
    @safe
    def window_info(self):
        return {"titlebar": self._titlebar, "native": self._window is not None, "version": VERSION, "author": AUTHOR, "copyright": COPYRIGHT}

    @safe
    def window_zoom(self):
        if self._zoom_cb:
            self._zoom_cb()
        return True

    @safe
    def set_theme(self, mode):
        """dark / light / auto – окно macOS под выбранное оформление (в режиме разработки ничего не делает)."""
        if self._theme_cb:
            self._theme_cb(mode if mode in ("dark", "light", "auto") else "dark")
        return True

    @safe
    def set_app_icon(self, light):
        """Иконка в Dock: светлая для светлой темы, иначе тёмная (в режиме разработки ничего не делает)."""
        if self._icon_cb:
            self._icon_cb(bool(light))
        return True

    # ---------- закрытие приложения ----------
    @safe
    def set_dirty(self, dirty):
        self._dirty = bool(dirty)
        return True

    @safe
    def close_dialog_shown(self):
        self._dialog_shown = True
        return True

    @safe
    def close_dialog_dismissed(self):
        self._dialog_shown = False
        self._close_asked = 0.0
        return True

    @safe
    def close_app(self, save=True, remember=False):
        """save – сохранить изменения в базе и вкладки с запросами; иначе откатить и забыть.
        Правки таблиц интерфейс применяет сам до вызова; здесь – транзакции SQL-редактора."""
        for s in self._sessions.values():
            if s.tx_state() == "none":
                continue              # нечего сохранять – не трогаем соединение
            try:
                s.commit() if save else s.rollback()
            except Exception:
                if save:
                    raise
        if remember:
            store.save_settings({"closeAsk": False, "closeAction": "save" if save else "discard"})
        if not save:
            store.save_settings({"drafts": []})
        self._allow_close = True
        if self._window is not None:
            self._window.destroy()
            # страховка: если окно по какой-то причине не закрылось за пару секунд – выходим сами
            def bye():
                time.sleep(2.5)
                os._exit(0)
            threading.Thread(target=bye, daemon=True).start()
        return True

    # ---------- настройки ----------
    @safe
    def get_settings(self):
        return store.get_settings()

    @safe
    def save_settings(self, values):
        s = store.save_settings(values)
        if "timeout" in values:
            for sess in self._sessions.values():
                sess.timeout = int(s.get("timeout") or 0)
        return s

    # ---------- подключения ----------
    @safe
    def list_connections(self):
        conns = store.list_connections()
        for c in conns:
            c["connected"] = c["id"] in self._sessions
        return conns

    @safe
    def save_connection(self, data):
        return store.save_connection(dict(data))

    @safe
    def delete_connection(self, conn_id):
        self._disconnect(conn_id)
        store.delete_connection(conn_id)
        return True

    @safe
    def test_connection(self, data):
        tunnel = self._tunnel(data, data.get("ssh_password"))
        try:
            s = PgSession(data.get("host"), data.get("port"), data.get("user"),
                          data.get("password") or (store.get_password(data["id"]) if data.get("id") else None),
                          data.get("dbname"), data.get("sslmode"), tunnel=tunnel)
            info = s.server_info()
            s.close()
        except Exception:
            if tunnel:
                tunnel.close()
            raise
        if tunnel:
            self._keep_tunnel(tunnel)
        return info

    def _keep_tunnel(self, tunnel):
        """Рабочий туннель после «Проверить» – на минуту в запас: «Подключиться» возьмёт его без повторного входа."""
        now = time.time()
        for k, (t, at) in list(self._spare.items()):
            if now - at > 60:
                t.close()
                del self._spare[k]
        k = tunnel.key()
        old = self._spare.pop(k, None)
        if old and old[0] is not tunnel:
            old[0].close()
        self._spare[k] = (tunnel, now)

        # если «Подключиться» так и не нажали – туннель закрывается через минуту, а не висит до выхода
        def expire():
            item = self._spare.get(k)
            if item and item[0] is tunnel:
                self._spare.pop(k, None)
                tunnel.close()
        t = threading.Timer(61, expire)
        t.daemon = True
        t.start()

    @staticmethod
    def _tunnel(c, ssh_password=None):
        """SSH-туннель для подключения, если он включён (пароль SSH – из окна или из Связки ключей)."""
        ssh = c.get("ssh") or {}
        if not ssh.get("on"):
            return None
        pw = ssh_password or (store.get_password(c["id"] + ":ssh") if c.get("id") and ssh.get("auth") == "password" else None)
        return Tunnel(ssh, c.get("host"), c.get("port"), pw)

    @safe
    def connect(self, conn_id):
        # два одновременных подключения одного и того же раньше оставляли первое открытым навсегда
        with self._conn_lock:
            return self._connect(conn_id)

    def _connect(self, conn_id):
        c = store.get_connection(conn_id)
        if not c:
            raise RuntimeError("NOT_FOUND")
        self._disconnect(conn_id)
        tunnel = self._tunnel(c)
        if tunnel:
            spare = self._spare.pop(tunnel.key(), None)
            if spare and time.time() - spare[1] < 60 and spare[0].alive():
                tunnel = spare[0]
            elif spare:
                spare[0].close()
        try:
            s = PgSession(c["host"], c["port"], c["user"], store.get_password(conn_id),
                          c.get("dbname"), c.get("sslmode"), c.get("read_only"),
                          store.get_settings().get("timeout") or 0, tunnel=tunnel)
        except Exception:
            if tunnel:
                tunnel.close()
            raise
        self._sessions[conn_id] = s
        return s.server_info()

    def _disconnect(self, conn_id):
        s = self._sessions.pop(conn_id, None)
        if s:
            s.close()
            if s.tunnel:
                s.tunnel.close()

    @safe
    def disconnect(self, conn_id):
        self._disconnect(conn_id)
        return True

    @safe
    def switch_database(self, conn_id, dbname):
        s = self._session(conn_id)
        if s.tx_state() != "none":
            raise RuntimeError("TX_OPEN")
        s.connect(dbname)
        return s.server_info()

    @safe
    def drop_database(self, conn_id, name):
        """Удалить базу целиком. Если она была базой подключения по умолчанию – подключение будет открывать postgres."""
        s = self._session(conn_id)
        if s.tx_state() != "none":
            raise RuntimeError("TX_OPEN")
        s.drop_database(name)
        c = store.get_connection(conn_id)
        if c and c.get("dbname") == name:
            store.save_connection(dict(c, dbname=s.params["dbname"]))
        return s.server_info()

    # ---------- структура ----------
    @safe
    def databases(self, conn_id):
        return self._session(conn_id).databases()

    @safe
    def schemas(self, conn_id):
        return self._session(conn_id).schemas()

    @safe
    def tables(self, conn_id, schema):
        return self._session(conn_id).tables(schema)

    @safe
    def structure(self, conn_id, schema, table):
        s = self._session(conn_id)
        return {"columns": s.columns(schema, table),
                "indexes": s.indexes(schema, table),
                "fks": s.foreign_keys(schema, table),
                "ddl": s.table_ddl(schema, table)}

    @safe
    def completion_meta(self, conn_id):
        return self._session(conn_id).completion_meta()

    @safe
    def create_database(self, conn_id, name):
        self._session(conn_id).create_database(name.strip())
        return True

    @safe
    def design_info(self, conn_id, schema, table):
        return self._session(conn_id).design_info(schema, table)

    @safe
    def design_preview(self, conn_id, schema, table, name, fields):
        return self._session(conn_id).design_preview(schema, table, name, fields)

    @safe
    def design_save(self, conn_id, schema, table, name, fields):
        return self._session(conn_id).design_save(schema, table, name, fields)

    @safe
    def truncate_table(self, conn_id, schema, table):
        self._session(conn_id).truncate_table(schema, table)
        return True

    @safe
    def drop_table(self, conn_id, schema, table, kind="table"):
        self._session(conn_id).drop_table(schema, table, kind)
        return True

    # ---------- данные ----------
    @safe
    def table_data(self, conn_id, schema, table, limit=100, offset=0,
                   order_by=None, order_dir="asc", search=None, with_count=True, filters=None, with_fks=True):
        return self._session(conn_id).table_data(schema, table, limit, offset,
                                                 order_by, order_dir, search, with_count, filters, with_fks)

    @safe
    def column_profile(self, conn_id, schema, table):
        return self._session(conn_id).column_profile(schema, table)

    @safe
    def column_values(self, conn_id, schema, table, col, prefix=""):
        return self._session(conn_id).column_values(schema, table, col, prefix)

    @safe
    def fk_options(self, conn_id, schema, table, col, search=""):
        return self._session(conn_id).fk_options(schema, table, col, search)

    @safe
    def table_count(self, conn_id, schema, table, search=None, filters=None):
        return self._session(conn_id).table_count(schema, table, search, filters)

    @safe
    def where_used(self, conn_id, schema, table, values):
        return self._session(conn_id).where_used(schema, table, values)

    @safe
    def pivot(self, conn_id, query, rows_col, cols_col, val_col, fn):
        return self._session(conn_id).pivot(query, rows_col, cols_col, val_col, fn)

    @safe
    def schema_diagram(self, conn_id, schema):
        return self._session(conn_id).schema_diagram(schema)

    @safe
    def search_table(self, conn_id, schema, table, value, exact=False):
        return self._session(conn_id).search_table(schema, table, value, exact)

    @safe
    def cancel_search(self, conn_id):
        s = self._sessions.get(conn_id)
        return s.cancel_search() if s else False

    @safe
    def column_stats(self, conn_id, source, col):
        return self._session(conn_id).column_stats(source, col)

    @safe
    def apply_changes(self, conn_id, schema, table, changes):
        return self._session(conn_id).apply_changes(schema, table, changes)

    # ---------- импорт CSV / Excel ----------
    @safe
    def pick_csv(self):
        path = self._open_dialog(("CSV and Excel (*.csv;*.txt;*.tsv;*.xlsx)", "All files (*.*)"))
        return self._csv_preview(path) if path else None

    @safe
    def csv_preview_text(self, name, text, b64=False):
        """Режим разработки: файл пришёл из браузера (Excel – в base64)."""
        ext = ".xlsx" if str(name).lower().endswith(".xlsx") else ".tmp"
        tmp = store.data_dir() / ("csv_upload" + ext)
        if b64:
            import base64
            tmp.write_bytes(base64.b64decode(text))
        else:
            tmp.write_text(text, "utf-8")
        p = self._csv_preview(tmp)
        p["name"] = name
        p["table"] = tablefile.column_name(Path(name).stem, 0, set())
        return p

    @staticmethod
    def _csv_preview(path):
        header, rows, delim = PgSession.read_csv(str(path))
        used = set()
        names = [tablefile.column_name(h, i, used) for i, h in enumerate(header)]
        types = [tablefile.guess_type([r[i] if i < len(r) else "" for r in rows[:2000]]) for i in range(len(header))]
        # колонка id из целых чисел без повторов – готовый ключ
        key = "add"
        for i, n in enumerate(names):
            if n == "id" and types[i] in ("integer", "bigint"):
                vals = [r[i] for r in rows if i < len(r)]
                if all(v.strip() for v in vals) and len(set(vals)) == len(vals):
                    key = "id"
        return {"path": str(path), "name": Path(path).name, "header": header, "rows": rows[:8],
                "delimiter": delim, "total": len(rows), "names": names, "types": types, "key": key,
                "table": tablefile.column_name(Path(path).stem, 0, set())}

    @safe
    def import_csv(self, conn_id, schema, table, path, mapping, empty_null=True):
        return self._session(conn_id).import_csv(schema, table, path, mapping, empty_null)

    @safe
    def import_new_table(self, conn_id, schema, table, path, columns, key="add"):
        return self._session(conn_id).import_new_table(schema, table, path, columns, key)

    # ---------- SQL-редактор ----------
    @safe
    def run_query(self, conn_id, query, params=None, original=None):
        """params – значения переменных {{…}}: запрос приходит с %(v0)s, original – текст как в редакторе."""
        limit = store.get_settings().get("rowLimit")
        limit = max(10, min(100000, int(limit))) if str(limit).isdigit() else 2000       # «Строк в результате запроса» из настроек
        res = self._session(conn_id).run_query(query, max_rows=limit, params=params)
        store.add_history(conn_id, (original or query).strip())
        return res

    @safe
    def cancel_query(self, conn_id):
        s = self._sessions.get(conn_id)
        return s.cancel() if s else False

    @safe
    def set_tx_mode(self, conn_id, manual):
        self._session(conn_id).set_manual(manual)
        return True

    @safe
    def tx_state(self, conn_id):
        return self._session(conn_id).tx_state()

    @safe
    def commit(self, conn_id):
        return self._session(conn_id).commit()

    @safe
    def rollback(self, conn_id):
        return self._session(conn_id).rollback()

    @safe
    def history(self):
        return store.get_history()

    @safe
    def history_delete(self, query):
        store.history_delete(query)
        return True

    @safe
    def history_clear(self):
        store.history_clear()
        return True

    @safe
    def check_sql(self, conn_id, query):
        return self._session(conn_id).check_sql(query)

    # ---------- сохранённые таблицы ----------
    @safe
    def save_result_table(self, conn_id, schema, table, query, params=None):
        return self._session(conn_id).save_result_table(schema, table, query, params)

    @safe
    def save_view(self, conn_id, schema, name, query):
        return self._session(conn_id).save_view(schema, name, query)

    # ---------- сохранённые запросы ----------
    @safe
    def saved_list(self):
        return store.saved_list()

    @safe
    def saved_save(self, item):
        return store.saved_save(dict(item))

    @safe
    def saved_delete(self, item_id):
        store.saved_delete(item_id)
        return True

    # ---------- SQL-файлы ----------
    @safe
    def pick_sql_file(self):
        """Окно выбора .sql-файла. Текст отдаём только для небольших файлов (для редактора)."""
        path = self._open_dialog(("SQL (*.sql)", "All files (*.*)"))
        if not path:
            return None
        size = path.stat().st_size
        text = path.read_text("utf-8-sig") if size <= 2 * 1024 * 1024 else None
        return {"path": str(path), "name": path.name, "size": size, "text": text}

    @safe
    def save_sql_file(self, text, filename="query.sql", path=None):
        """Сохраняет запрос в .sql-файл. Если путь уже известен – перезаписывает без вопроса."""
        p = Path(path) if path else self._save_dialog(filename, "SQL (*.sql)", "sql")
        if p is None:
            return None
        p.write_text(text, "utf-8")
        return {"path": str(p), "name": p.name}

    @safe
    def import_sql_path(self, conn_id, path):
        """Выполняет .sql-файл целиком (импорт базы). В историю не пишется."""
        text = Path(path).read_text("utf-8-sig")
        return self._session(conn_id).run_query(text, max_rows=200)

    @safe
    def run_script(self, conn_id, text):
        """То же, что import_sql_path, но текст приходит из интерфейса (режим разработки)."""
        return self._session(conn_id).run_query(text, max_rows=200)

    # ---------- экспорт ----------
    def _export_path(self, filename, fmt):
        kind = "Excel (*.xlsx)" if fmt == "xlsx" else "CSV (*.csv)"
        return self._save_dialog(filename, kind, fmt)

    @safe
    def export_rows(self, columns, rows, filename, fmt="csv", types=None, chart=None):
        """Выгрузка того, что уже показано (результат запроса).
        Числа приходят из интерфейса строками – возвращаем им числовой тип, чтобы Excel считал их числами."""
        path = self._export_path(filename, fmt)
        if path is None:
            return None
        if types:
            num = [bool(re.match(r"^(int|numeric|float|money|oid)", t or "")) for t in types]
            rows = [[_to_number(v) if num[i] and isinstance(v, str) else v for i, v in enumerate(r)] for r in rows]
        exporters.write(str(path), fmt, columns, rows, Path(filename).stem, _chart(chart))
        return str(path)

    @safe
    def save_png(self, data, filename="chart.png"):
        """Картинка графика (PNG, base64) – в файл через окно «Сохранить как»."""
        path = self._save_dialog(filename, "PNG (*.png)", "png")
        if path is None:
            return None
        path.write_bytes(base64.b64decode(data))
        return str(path)

    @safe
    def export_query(self, conn_id, query, filename, fmt="csv", params=None, chart=None):
        """Повторяет SELECT без ограничения строк и выгружает весь результат."""
        if not re.match(r"^\s*(select|with|table|values)\b", _strip_comments(query), re.I):
            raise RuntimeError("ONLY_SELECT")
        path = self._export_path(filename, fmt)
        if path is None:
            return None
        cols, rows = self._session(conn_id).query_all(query, params)
        exporters.write(str(path), fmt, cols, rows, Path(filename).stem, _chart(chart))
        return str(path)

    @safe
    def export_table(self, conn_id, schema, table, order_by=None, order_dir="asc", search=None, fmt="csv", filters=None):
        """Вся таблица (с учётом поиска, фильтров и сортировки), а не только текущая страница."""
        path = self._export_path(f"{table}.{fmt}", fmt)
        if path is None:
            return None
        cols, rows = self._session(conn_id).table_all(schema, table, order_by, order_dir, search, filters)
        exporters.write(str(path), fmt, cols, rows, table)
        return str(path)

    # ---------- обновление ----------
    @safe
    def install_update(self):
        """Выбрать архив с новой версией → распаковать → запустить установщик → закрыть приложение.
        Установщик сам дождётся закрытия, соберёт новую версию и откроет её."""
        z = self._open_dialog(("ZIP (*.zip)",))
        if not z:
            return None
        dest = store.data_dir() / "update" / time.strftime("%Y%m%d-%H%M%S")
        dest.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            root = str(dest.resolve())
            for info in zf.infolist():
                target = (dest / info.filename).resolve()
                # защита от «../» в архиве: по частям пути, а не по началу строки (…/upd-1 ≠ …/upd-10)
                if os.path.commonpath([root, str(target)]) != root:
                    raise RuntimeError("BAD_ZIP")
                zf.extract(info, dest)
                mode = (info.external_attr >> 16) & 0o777
                if mode:
                    os.chmod(target, mode)
        installers = list(dest.rglob("Установить Noir DB.command"))
        if not installers:
            shutil.rmtree(dest, ignore_errors=True)
            raise RuntimeError("NOT_NOIR_ZIP")
        inst = installers[0]
        os.chmod(inst, 0o755)
        version = None
        vf = inst.parent / "app" / "version.py"
        if vf.exists():
            m = re.search(r'VERSION\s*=\s*"([^"]+)"', vf.read_text("utf-8"))
            version = m.group(1) if m else None
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-a", "Terminal", str(inst)])
        self._allow_close = True
        if self._window is not None:
            self._window.destroy()
        return {"version": version, "path": str(inst)}


def _chart(chart):
    """{png: base64, w, h, name} из интерфейса → байты картинки для листа Excel."""
    if not chart or not chart.get("png"):
        return None
    return {"png": base64.b64decode(chart["png"]), "w": chart.get("w") or 800, "h": chart.get("h") or 400, "name": chart.get("name")}


def _to_number(v):
    try:
        return int(v) if re.fullmatch(r"-?\d+", v) else Decimal(v)
    except Exception:
        return v


def _strip_comments(q):
    return re.sub(r"--[^\n]*|/\*.*?\*/", " ", q, flags=re.S)
