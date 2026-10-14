"""Сохранённые подключения и настройки. Пароли хранятся в Связке ключей macOS."""
import json
import os
import sys
import threading
import uuid
from pathlib import Path

try:
    import keyring
except Exception:  # keyring не установлен – пароли не сохраняем
    keyring = None

SERVICE = "NoirDB"


def data_dir():
    if os.environ.get("NOIRDB_HOME"):
        d = Path(os.environ["NOIRDB_HOME"])
    elif sys.platform == "darwin":
        d = Path.home() / "Library" / "Application Support" / "NoirDB"
    else:
        d = Path.home() / ".noirdb"
    d.mkdir(parents=True, exist_ok=True)
    return d


# вызовы из интерфейса идут параллельно (черновики каждые 700 мс, настройки, история): «прочитать → изменить →
# записать» – под одной блокировкой, иначе одно из двух одновременных изменений терялось
_lock = threading.RLock()


def _locked(fn):
    def wrapper(*a, **kw):
        with _lock:
            return fn(*a, **kw)
    wrapper.__name__, wrapper.__doc__ = fn.__name__, fn.__doc__
    return wrapper


def _read(name, default):
    p = data_dir() / name
    if p.exists():
        try:
            return json.loads(p.read_text("utf-8"))
        except Exception:
            # испорченный файл не затираем молча – откладываем рядом, чтобы данные можно было достать
            try:
                p.replace(p.with_suffix(p.suffix + ".broken"))
            except OSError:
                pass
            return default
    return default


def _write(name, data):
    p = data_dir() / name
    tmp = p.with_name(f"{p.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
    tmp.replace(p)          # атомарно: файл либо старый, либо новый целиком


# ---------- пароли ----------
def set_password(conn_id, password):
    _pw_cache.pop(conn_id, None)
    if keyring is None:
        return False
    try:
        if password:
            keyring.set_password(SERVICE, conn_id, password)
        else:
            delete_password(conn_id)
        return True
    except Exception:
        return False


_pw_cache = {}


def get_password(conn_id):
    # Связка ключей отвечает не мгновенно – держим пароль в памяти до выхода из приложения
    if conn_id in _pw_cache:
        return _pw_cache[conn_id]
    if keyring is None:
        return None
    try:
        pw = keyring.get_password(SERVICE, conn_id)
    except Exception:
        return None
    _pw_cache[conn_id] = pw
    return pw


def delete_password(conn_id):
    _pw_cache.pop(conn_id, None)
    if keyring is None:
        return
    try:
        keyring.delete_password(SERVICE, conn_id)
    except Exception:
        pass


# ---------- подключения ----------
def list_connections():
    return _read("connections.json", [])


def get_connection(conn_id):
    for c in list_connections():
        if c["id"] == conn_id:
            return c
    return None


@_locked
def save_connection(data):
    """Создаёт или обновляет подключение. Пароль уходит в Связку ключей, не в файл."""
    conns = list_connections()
    password = data.pop("password", None)
    ssh_password = data.pop("ssh_password", None)
    if not data.get("id"):
        data["id"] = uuid.uuid4().hex[:12]
    fields = ("id", "name", "host", "port", "user", "dbname", "sslmode", "color", "read_only", "ssh")
    item = {k: data.get(k) for k in fields}
    for i, c in enumerate(conns):
        if c["id"] == item["id"]:
            conns[i] = item
            break
    else:
        conns.append(item)
    _write("connections.json", conns)
    if password is not None:
        set_password(item["id"], password)
    if ssh_password is not None:
        set_password(item["id"] + ":ssh", ssh_password)
    return item


@_locked
def delete_connection(conn_id):
    conns = [c for c in list_connections() if c["id"] != conn_id]
    _write("connections.json", conns)
    delete_password(conn_id)
    delete_password(conn_id + ":ssh")


# ---------- настройки и история ----------
DEFAULT_SETTINGS = {"lang": "ru"}


def get_settings():
    s = dict(DEFAULT_SETTINGS)
    s.update(_read("settings.json", {}))
    return s


@_locked
def save_settings(values):
    s = get_settings()
    s.update(values)
    _write("settings.json", s)
    return s


def get_history():
    return _read("history.json", [])


@_locked
def add_history(conn_id, query):
    h = [x for x in get_history() if x.get("sql") != query]
    h.insert(0, {"conn": conn_id, "sql": query})
    _write("history.json", h[:200])


@_locked
def history_delete(query):
    _write("history.json", [x for x in get_history() if x.get("sql") != query])


@_locked
def history_clear():
    _write("history.json", [])


# ---------- сохранённые запросы ----------
def saved_list():
    return _read("saved_queries.json", [])


@_locked
def saved_save(item):
    """Создаёт или обновляет пункт «Сохранённых таблиц» {id?, name, sql, mode}.
    mode: query – запрос, открывается в редакторе; live – таблица, которая при открытии выполняет запрос заново;
    fixed – данные на момент сохранения, лежат таблицей в базе (conn, db, schema, table, created)."""
    items = saved_list()
    if not item.get("id"):
        item["id"] = uuid.uuid4().hex[:12]
    mode = item.get("mode") if item.get("mode") in ("live", "fixed") else "query"
    out = {"id": item["id"], "name": (item.get("name") or "").strip() or "Query", "sql": item.get("sql") or "", "mode": mode}
    # подключение и база, в которых сохранили, – чтобы показывать пункт только там
    out.update({k: item.get(k) for k in ("conn", "db") if item.get(k)})
    if mode == "fixed":
        out.update({k: item.get(k) for k in ("schema", "table", "created")})
    item = out
    for i, x in enumerate(items):
        if x["id"] == item["id"]:
            items[i] = item
            break
    else:
        items.append(item)
    items.sort(key=lambda x: x["name"].lower())
    _write("saved_queries.json", items)
    return item


@_locked
def saved_delete(item_id):
    _write("saved_queries.json", [x for x in saved_list() if x["id"] != item_id])

