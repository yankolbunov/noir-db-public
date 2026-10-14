"""Режим разработки: интерфейс в обычном браузере без pywebview.
Запуск: python3 dev/dev_server.py, затем открыть http://127.0.0.1:8765/?dev=1
NOIRDB_TRACE=1 – печатать время каждого вызова.
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app import server  # noqa: E402
from app.api import Api  # noqa: E402

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server.start(Api(), ROOT / "app" / "ui", token="", port=port)
    print(f"http://127.0.0.1:{port}/?dev=1", flush=True)
    while True:
        time.sleep(3600)
