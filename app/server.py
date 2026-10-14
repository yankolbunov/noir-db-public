"""Локальный сервер, через который интерфейс вызывает методы Api.

Почему не мост pywebview: там каждый ответ проходит через главный поток macOS и огромную строку eval,
поэтому большие таблицы и частые вызовы заметно тормозят интерфейс. Здесь ответы идут обычным HTTP
на 127.0.0.1, каждый запрос – в своём потоке.

Сервер слушает только 127.0.0.1 на случайном порту. Методы Api доступны только с токеном,
который знает лишь окно приложения."""
import json
import os
import secrets
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


TRACE = bool(os.environ.get("NOIRDB_TRACE"))


class _Server(ThreadingHTTPServer):
    daemon_threads = True          # незавершённые запросы не мешают выходу из приложения
    allow_reuse_address = True


def start(api, ui_dir, token=None, port=0):
    token = token if token is not None else secrets.token_urlsafe(24)
    allowed_hosts = set()

    class Handler(SimpleHTTPRequestHandler):
        protocol_version = "HTTP/1.1"   # соединения переиспользуются – меньше задержка на вызов

        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ui_dir), **kw)

        def log_message(self, *a):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _host_ok(self):
            # защита от DNS rebinding: принимаем только запросы на 127.0.0.1:порт
            return self.headers.get("Host", "") in allowed_hosts

        def do_GET(self):
            if not self._host_ok():
                self.send_error(403)
                return
            super().do_GET()

        def do_HEAD(self):
            self.do_GET()

        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b""
            # заголовок обязателен даже с пустым токеном (режим разработки): из-за него браузер делает
            # предварительную проверку, и чужой сайт не может вызвать методы простым POST
            if (not self._host_ok() or "X-Noir-Token" not in self.headers
                    or not secrets.compare_digest(self.headers.get("X-Noir-Token", ""), token)):
                self.send_error(403)
                return
            name = self.path.split("/api/", 1)[-1].split("?", 1)[0]
            fn = getattr(api, name, None)
            if not name or name.startswith("_") or not callable(fn):
                res = {"ok": False, "error": "unknown method"}
            else:
                try:
                    args = json.loads(raw or b"[]")
                    t0 = time.perf_counter()
                    res = fn(*args)
                    if TRACE:
                        print(f"{(time.perf_counter() - t0) * 1000:8.1f} ms  {name}", flush=True)
                except Exception as e:    # методы Api сами ловят ошибки; это – на случай кривого запроса
                    res = {"ok": False, "error": str(e)}
            body = json.dumps(res, ensure_ascii=False, default=str).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    httpd = _Server(("127.0.0.1", port), Handler)
    real_port = httpd.server_address[1]
    allowed_hosts.update({f"127.0.0.1:{real_port}", f"localhost:{real_port}"})
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{real_port}/index.html?t={token}"
