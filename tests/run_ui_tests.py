"""Прогон проверок интерфейса в настоящем WebKit (как в приложении).
Нужно: тестовая база (demo/noir_shop.sql) и dev-сервер на 8765 с подключением к ней:
    NOIRDB_HOME=<папка с тестовым подключением> .venv/bin/python dev/dev_server.py
    .venv/bin/python tests/run_ui_tests.py        (другой адрес – NOIR_UI_URL)"""
import sys
import time
from pathlib import Path

import webview

HERE = Path(__file__).resolve().parent
URL = __import__("os").environ.get("NOIR_UI_URL", "http://127.0.0.1:8765/?dev=1")
SCRIPTS = sys.argv[1:] or [str(HERE / "ui_sqlhelp.js")]


def go(w):
    time.sleep(0.5)
    for path in SCRIPTS:
        w.evaluate_js(Path(path).read_text("utf-8"))
        for _ in range(600):
            time.sleep(0.5)
            r = w.evaluate_js("window.__result")
            if r:
                print(Path(path).name, r, flush=True)
                break
        w.evaluate_js("location.reload()")
        time.sleep(1)
    w.destroy()


w = webview.create_window("Noir DB tests", URL, width=1280, height=800)
webview.start(go, w)
