"""Чтение таблиц из файлов для импорта: CSV/TSV и Excel (.xlsx) – без сторонних библиотек.
Excel – это zip с XML: берётся первый лист, общие строки, даты распознаются по формату ячейки."""
import csv
import datetime
import io
import re
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
DATE_IDS = set(range(14, 23)) | {27, 30, 36, 45, 46, 47, 50, 57}


def read_csv(path):
    """Определяет кодировку (utf-8 / cp1251) и разделитель, возвращает заголовок и строки."""
    raw = Path(path).read_bytes()
    text = None
    for enc in ("utf-8-sig", "cp1251"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode("utf-8", errors="replace")
    sample = text[:20000]
    try:
        delim = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        delim = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    header = next(reader, [])
    rows = [r for r in reader if any(x.strip() for x in r)]
    return header, rows, delim


def _col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def _excel_date(v, with_time):
    d = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(v))
    if with_time and (d.hour or d.minute or d.second):
        return d.strftime("%Y-%m-%d %H:%M:%S")
    return d.strftime("%Y-%m-%d")


def _num(v):
    """Число Excel как текст: 5.0 → 5, 0.1+0.2 → 0.3 (без хвостов плавающей точки)."""
    try:
        f = float(v)
    except ValueError:
        return v
    if f.is_integer() and abs(f) < 1e15:
        return str(int(f))
    return repr(round(f, 10)).rstrip("0").rstrip(".") if "e" not in repr(f) else v


def read_xlsx(path):
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared = []
        if "xl/sharedStrings.xml" in names:
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(x.text or "" for x in si.iter("{%s}t" % NS["m"])))
        # стили: какие ячейки – даты
        date_xf = []
        if "xl/styles.xml" in names:
            st = ET.fromstring(z.read("xl/styles.xml"))
            custom = {}
            for nf in st.findall("m:numFmts/m:numFmt", NS):
                code = re.sub(r'"[^"]*"|\[[^\]]*\]', "", nf.get("formatCode", "")).lower()
                custom[int(nf.get("numFmtId"))] = (bool(re.search(r"[dy]", code) or re.search(r"m.*[ds]|[hs].*m", code)), bool(re.search(r"[hs]", code)))
            for xf in st.findall("m:cellXfs/m:xf", NS):
                i = int(xf.get("numFmtId", 0))
                date_xf.append((i in DATE_IDS, i in (22, 45, 46, 47)) if i not in custom else custom[i])
        # первый лист книги
        sheet = "xl/worksheets/sheet1.xml"
        try:
            wb = ET.fromstring(z.read("xl/workbook.xml"))
            first = wb.find("m:sheets/m:sheet", NS)
            rid = first.get("{%s}id" % NS["r"])
            rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
            for rel in rels.findall("rel:Relationship", NS):
                if rel.get("Id") == rid:
                    tgt = rel.get("Target").lstrip("/")
                    sheet = tgt if tgt.startswith("xl/") else "xl/" + tgt
        except Exception:
            pass
        data = ET.fromstring(z.read(sheet))
    table = []
    for row in data.findall("m:sheetData/m:row", NS):
        vals = {}
        for c in row.findall("m:c", NS):
            ref, typ = c.get("r", ""), c.get("t", "n")
            v = c.find("m:v", NS)
            v = v.text if v is not None else None
            if typ == "s" and v is not None:
                out = shared[int(v)]
            elif typ == "inlineStr":
                out = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
            elif typ == "b":
                out = "true" if v == "1" else "false"
            elif typ in ("str", "e"):
                out = v or ""
            elif v is None:
                out = ""
            else:
                s = int(c.get("s", 0))
                is_date, with_time = date_xf[s] if s < len(date_xf) else (False, False)
                out = _excel_date(v, with_time) if is_date else _num(v)
            vals[_col_index(ref) if ref else len(vals)] = out
        if vals:
            table.append([vals.get(i, "") for i in range(max(vals) + 1)])
    table = [r for r in table if any(str(x).strip() for x in r)]
    if not table:
        return [], [], None
    width = max(len(r) for r in table)
    table = [r + [""] * (width - len(r)) for r in table]
    return table[0], table[1:], "xlsx"


def read_table_file(path):
    """(заголовок, строки, разделитель или 'xlsx') – по расширению файла."""
    if str(path).lower().endswith((".xlsx", ".xlsm")):
        return read_xlsx(path)
    return read_csv(path)


# ---------- типы колонок для новой таблицы ----------
_INT = re.compile(r"^-?\d{1,18}$")
_NUM = re.compile(r"^-?(\d{1,3}([   ]\d{3})+|\d+)([.,]\d+)?$")
_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})$")
_TS = re.compile(r"^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})[ T]\d{1,2}:\d{2}(:\d{2})?")
_BOOL = {"true", "false", "да", "нет", "yes", "no"}
TYPES = ("integer", "bigint", "numeric", "date", "timestamp", "boolean", "text")


def guess_type(values):
    vals = [v.strip() for v in values if v is not None and str(v).strip() != ""]
    if not vals:
        return "text"
    if all(_INT.match(v) for v in vals):
        return "integer" if all(abs(int(v)) < 2_000_000_000 for v in vals) else "bigint"
    if all(_NUM.match(v) for v in vals):
        return "numeric"
    if all(_DATE.match(v) for v in vals):
        return "date"
    if all(_TS.match(v) or _DATE.match(v) for v in vals):
        return "timestamp"
    if all(v.lower() in _BOOL for v in vals):
        return "boolean"
    return "text"


def normalize(v, typ):
    """Значение из файла → вид, который понимает PostgreSQL (запятая в дробях, 31.12.2024, да/нет)."""
    if v is None:
        return None
    v = str(v).strip()
    if v == "":
        return None
    if typ in ("integer", "bigint", "numeric"):
        return re.sub(r"[   ]", "", v).replace(",", ".")
    if typ in ("date", "timestamp"):
        m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})(.*)$", v)
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}{m.group(4)}" if m else v
    if typ == "boolean":
        return {"да": "true", "yes": "true", "нет": "false", "no": "false"}.get(v.lower(), v)
    return v


def column_name(h, i, used):
    """Имя колонки из заголовка файла: латиница, цифры, _ (кириллица – транслитом)."""
    tr = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
                  ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
                   "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))
    base = "".join(tr.get(ch, ch) for ch in (h or "").strip().lower())
    base = re.sub(r"[^a-z0-9]+", "_", base).strip("_")[:50] or f"col{i + 1}"
    if base[0].isdigit():
        base = "c_" + base
    name, n = base, 2
    while name in used:
        name, n = f"{base}_{n}", n + 1
    used.add(name)
    return name
