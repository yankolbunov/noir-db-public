"""Выгрузка таблиц в CSV и Excel (.xlsx). Excel пишется вручную, без сторонних библиотек."""
import csv
import datetime
import decimal
import io
import re
import zipfile
from xml.sax.saxutils import escape

_BAD_XML = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")


def _text(v):
    if v is None:
        return ""
    if isinstance(v, (datetime.datetime,)):
        return v.isoformat(sep=" ")
    if isinstance(v, (datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return "\\x" + bytes(v).hex()
    return str(v)


def write_csv(path, columns, rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(columns)
    for r in rows:
        w.writerow(["" if v is None else _text(v) for v in r])
    with open(path, "w", encoding="utf-8-sig", newline="") as f:   # BOM – чтобы Excel понял кириллицу
        f.write(buf.getvalue())


def _col_letter(i):
    s = ""
    i += 1
    while i:
        i, rem = divmod(i - 1, 26)
        s = chr(65 + rem) + s
    return s


def _is_number(v):
    if isinstance(v, bool):
        return False
    if isinstance(v, (int, float, decimal.Decimal)):
        return True
    return False


def _cell(ref, v, style=0):
    st = f' s="{style}"' if style else ""
    if v is None or v == "":
        return ""
    if isinstance(v, bool):
        return f'<c r="{ref}" t="b"{st}><v>{1 if v else 0}</v></c>'
    if _is_number(v):
        if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
            return f'<c r="{ref}" t="inlineStr"{st}><is><t>{v}</t></is></c>'
        return f'<c r="{ref}"{st}><v>{v}</v></c>'
    t = _BAD_XML.sub("", _text(v))[:32000]
    return f'<c r="{ref}" t="inlineStr"{st}><is><t xml:space="preserve">{escape(t)}</t></is></c>'


def _image_parts(chart):
    """Лист «График» с картинкой: файлы drawing и media для xlsx. chart = {png: bytes, w, h, name}."""
    emu = 9525                                           # 1 пиксель = 9525 EMU
    cx, cy = int(chart["w"]) * emu, int(chart["h"]) * emu
    ns_r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    return {
        "xl/worksheets/sheet2.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="{ns_r}">'
            '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetData/><drawing r:id="rId1"/></worksheet>',
        "xl/worksheets/_rels/sheet2.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{ns_r}/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
        "xl/drawings/drawing1.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
            f'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{ns_r}">'
            '<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
            f'<xdr:ext cx="{cx}" cy="{cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Chart"/>'
            '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'
            '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            f'<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
            '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>',
        "xl/drawings/_rels/drawing1.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{ns_r}/image" Target="../media/image1.png"/></Relationships>',
        "xl/media/image1.png": chart["png"],
    }


def write_xlsx(path, columns, rows, sheet_name="Data", chart=None):
    sheet_name = re.sub(r"[\[\]:*?/\\]", "_", sheet_name)[:31] or "Data"
    chart_name = re.sub(r"[\[\]:*?/\\]", "_", (chart or {}).get("name") or "Chart")[:31]
    if chart_name == sheet_name:
        chart_name = (chart_name[:28] + " 2")
    ncols = max(1, len(columns))
    # ширина колонок по содержимому (первые 500 строк), от 8 до 60 символов
    widths = [len(str(c)) for c in columns]
    for r in rows[:500]:
        for i, v in enumerate(r):
            if i < len(widths):
                widths[i] = max(widths[i], min(60, len(_text(v))))
    cols_xml = "".join(f'<col min="{i + 1}" max="{i + 1}" width="{min(60, max(8, w + 2))}" customWidth="1"/>'
                       for i, w in enumerate(widths))
    out = io.StringIO()
    out.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
              '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
              f'<cols>{cols_xml}</cols><sheetData>')
    out.write('<row r="1">' + "".join(_cell(f"{_col_letter(i)}1", str(c), 1) for i, c in enumerate(columns)) + "</row>")
    for ri, r in enumerate(rows, start=2):
        out.write(f'<row r="{ri}">' + "".join(_cell(f"{_col_letter(i)}{ri}", v) for i, v in enumerate(r)) + "</row>")
    last = f"{_col_letter(ncols - 1)}{len(rows) + 1}"
    out.write(f'</sheetData><autoFilter ref="A1:{last}"/></worksheet>')

    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + ('<Default Extension="png" ContentType="image/png"/>'
               '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
               '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
               if chart else '') +
            '</Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheets><sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/>'
            + (f'<sheet name="{escape(chart_name)}" sheetId="2" r:id="rId3"/>' if chart else '') + '</sheets>'
            f'<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'{escape(sheet_name)}\'!$A$1:${_col_letter(ncols - 1)}${len(rows) + 1}</definedName></definedNames>'
            '</workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            + ('<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
               if chart else '') +
            '</Relationships>',
        "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2"><font><sz val="12"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font></fonts>'
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            '</styleSheet>',
        "xl/worksheets/sheet1.xml": out.getvalue(),
    }
    if chart:
        files.update(_image_parts(chart))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)


def write(path, fmt, columns, rows, sheet_name="Data", chart=None):
    """chart – картинка графика для отдельного листа Excel (в CSV не попадает)."""
    if fmt == "xlsx":
        write_xlsx(path, columns, rows, sheet_name, chart)
    else:
        write_csv(path, columns, rows)
