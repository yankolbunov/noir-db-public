"""Автотесты Noir DB (стандартный unittest, без новых зависимостей).

Запуск:   .venv/bin/python -m unittest discover -s tests -v
Тесты с базой выполняются, только если задан тестовый сервер (никогда – на рабочей базе):
          NOIR_TEST_DSN="host=127.0.0.1 port=55432 user=postgres dbname=shop" .venv/bin/python -m unittest discover -s tests
База для них – demo/noir_shop.sql; тесты создают и удаляют только свои таблицы с префиксом t_noirtest_."""
import datetime
import decimal
import json
import os
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

os.environ.setdefault("NOIRDB_HOME", tempfile.mkdtemp(prefix="noirdb-test-"))

from app import exporters, server, store, tablefile  # noqa: E402
from app.api import Api, safe  # noqa: E402
from app.db import PgSession, to_json_value  # noqa: E402
from app.sshtunnel import _error_code  # noqa: E402

DSN = os.environ.get("NOIR_TEST_DSN")


def dsn_parts():
    return dict(x.split("=", 1) for x in DSN.split())


class TableFileTests(unittest.TestCase):
    def test_xlsx_roundtrip(self):
        p = Path(tempfile.mkdtemp()) / "t.xlsx"
        exporters.write_xlsx(str(p), ["id", "Фамилия", "Зарплата", "Дата приёма", "Активен"],
                             [[1, "Иванов", decimal.Decimal("120000.50"), datetime.date(2024, 3, 1), True],
                              [2, "Петров", 95000, datetime.date(2023, 1, 15), False]])
        header, rows, kind = tablefile.read_table_file(p)
        self.assertEqual(kind, "xlsx")
        self.assertEqual(header, ["id", "Фамилия", "Зарплата", "Дата приёма", "Активен"])
        self.assertEqual(rows[0], ["1", "Иванов", "120000.5", "2024-03-01", "true"])

    def test_csv_cp1251_and_types(self):
        p = Path(tempfile.mkdtemp()) / "t.csv"
        p.write_text("Номер;Название;Цена;Дата;Есть\n1;Стол;1 200,50;31.12.2024;да\n2;Стул;350;01.02.2025;нет\n", encoding="cp1251")
        header, rows, delim = tablefile.read_table_file(p)
        self.assertEqual(delim, ";")
        types = [tablefile.guess_type([r[i] for r in rows]) for i in range(len(header))]
        self.assertEqual(types, ["integer", "text", "numeric", "date", "boolean"])
        self.assertEqual(tablefile.normalize("1 200,50", "numeric"), "1200.50")
        self.assertEqual(tablefile.normalize("31.12.2024", "date"), "2024-12-31")
        self.assertEqual(tablefile.normalize("да", "boolean"), "true")
        used = set()
        self.assertEqual([tablefile.column_name(h, i, used) for i, h in enumerate(header)], ["nomer", "nazvanie", "tsena", "data", "est"])


class ValueTests(unittest.TestCase):
    def test_nonfinite_floats_are_valid_json(self):
        out = json.dumps([to_json_value(float("nan")), to_json_value(float("inf")), to_json_value(float("-inf")), to_json_value(1.5)])
        self.assertEqual(json.loads(out), ["NaN", "Infinity", "-Infinity", 1.5])

    def test_plain_select_detection(self):
        ps = PgSession._plain_select
        self.assertTrue(ps("select * from t"))
        self.assertTrue(ps("  WITH a AS (select 1) SELECT * FROM a;"))
        self.assertTrue(ps("select ';' as semi, 'insert' as word"))
        self.assertFalse(ps("select 1; select 2"))
        self.assertFalse(ps("with d as (delete from t returning *) select * from d"))
        self.assertFalse(ps("insert into t values (1) returning *"))
        self.assertFalse(ps("select * into newt from t"))


class StoreTests(unittest.TestCase):
    def test_parallel_settings_writes_keep_everything(self):
        def w(i):
            for j in range(30):
                store.save_settings({f"race{i}": j})
        ts = [threading.Thread(target=w, args=(i,)) for i in range(8)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        s = store.get_settings()
        self.assertEqual([s.get(f"race{i}") for i in range(8)], [29] * 8)

    def test_broken_file_is_kept_aside(self):
        p = store.data_dir() / "history.json"
        p.write_text("{not json", "utf-8")
        self.assertEqual(store.get_history(), [])
        self.assertTrue((store.data_dir() / "history.json.broken").exists())


class SshErrorTests(unittest.TestCase):
    def test_error_codes(self):
        self.assertEqual(_error_code("user@h: Permission denied (publickey,password)."), "SSH_AUTH")
        self.assertEqual(_error_code("ssh: connect to host h port 22: Connection refused"), "SSH_CONN")
        self.assertEqual(_error_code("ssh: Could not resolve hostname x: nodename nor servname"), "SSH_HOST")
        self.assertEqual(_error_code("WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!"), "SSH_HOSTKEY")
        self.assertEqual(_error_code("something odd"), "SSH_FAIL")


class ServerTests(unittest.TestCase):
    def test_token_header_required_even_when_empty(self):
        httpd, _ = server.start(Api(), Path(__file__).resolve().parent.parent / "app" / "ui", token="", port=0)
        port = httpd.server_address[1]
        try:
            def post(headers):
                req = urllib.request.Request(f"http://127.0.0.1:{port}/api/list_connections", data=b"[]", headers=headers, method="POST")
                try:
                    with urllib.request.urlopen(req) as r:
                        return r.status
                except urllib.error.HTTPError as e:
                    e.close()
                    return e.code
            self.assertEqual(post({"Content-Type": "text/plain"}), 403)          # простой POST чужого сайта
            self.assertEqual(post({"X-Noir-Token": ""}), 200)
            self.assertEqual(post({"X-Noir-Token": "", "Host": "evil.example"}), 403)
        finally:
            httpd.shutdown()
            httpd.server_close()


@unittest.skipUnless(DSN, "нет NOIR_TEST_DSN – тесты с базой пропущены")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        d = dsn_parts()
        cls.s = PgSession(d.get("host"), d.get("port"), d.get("user"), d.get("password"), d.get("dbname"), d.get("sslmode", "disable"))

    @classmethod
    def tearDownClass(cls):
        cls.s.close()

    def q(self, text):
        class A:
            @safe
            def run(_, t):
                return self.s.run_query(t)
        return A().run(text)

    def test_big_result_is_bounded(self):
        r = self.s.run_query("select g from generate_series(1, 500000) g", max_rows=1000)
        self.assertEqual(len(r["rows"]), 1000)
        self.assertTrue(r["truncated"])

    def test_empty_result_has_columns(self):
        r = self.s.run_query("select 1 as a, 'x' as b where false")
        self.assertEqual([c["name"] for c in r["columns"]], ["a", "b"])
        self.assertEqual(r["rows"], [])

    def test_error_position_points_into_user_text(self):
        r = self.q("select nope_col from (select 1) x")
        self.assertEqual(r["code"], "NO_COLUMN")
        self.assertEqual(r["pos"], 8)
        self.assertEqual(self.q("select 7")["data"]["rows"], [[7]])     # соединение после ошибки в порядке

    def test_multi_statement_and_status(self):
        self.assertEqual(self.s.run_query("select 1; select 2 as two")["rows"], [[2]])
        r = self.s.run_query("create temp table t_noirtest_tmp(x int); insert into t_noirtest_tmp values (1),(2)")
        self.assertEqual(r["kind"], "status")
        self.assertEqual(r["affected"], 2)

    def test_manual_transaction_survives_select(self):
        s = self.s
        s.set_manual(True)
        try:
            s.run_query("create temp table t_noirtest_m(x int)")
            s.run_query("insert into t_noirtest_m values (1)")
            s.run_query("select * from t_noirtest_m")
            self.assertEqual(s.tx_state(), "open")
            s.rollback()
            self.assertEqual(s.tx_state(), "none")
        finally:
            s.set_manual(False)

    def test_save_view_rules(self):
        name = "t_noirtest_view"
        try:
            self.s.save_view("public", name, "select 1 as x")
            self.assertEqual(self.s.run_query(f"select * from {name}")["rows"], [[1]])
            with self.assertRaises(RuntimeError):
                self.s.save_view("public", "t_noirtest_v2", "select {{a}}")
            with self.assertRaises(RuntimeError):
                self.s.save_view("public", "t_noirtest_v3", "delete from x")
        finally:
            self.s.run_query(f"drop view if exists {name}")

    def test_import_new_table_from_csv(self):
        p = Path(tempfile.mkdtemp()) / "t.csv"
        p.write_text("Название;Цена;Дата\nСтол;1 200,50;31.12.2024\nСтул;350;01.02.2025\n", "utf-8")
        cols = [{"src": 0, "name": "name", "type": "text"}, {"src": 1, "name": "price", "type": "numeric"},
                {"src": 2, "name": "d", "type": "date"}]
        try:
            self.assertEqual(self.s.import_new_table("public", "t_noirtest_imp", str(p), cols, "add"), 2)
            r = self.s.run_query("select id, name, price::text, d::text from t_noirtest_imp order by id")
            self.assertEqual(r["rows"], [[1, "Стол", "1200.50", "2024-12-31"], [2, "Стул", "350", "2025-02-01"]])
        finally:
            self.s.run_query("drop table if exists t_noirtest_imp")


if __name__ == "__main__":
    unittest.main()
