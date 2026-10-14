"""Иконка Noir DB: глянцевый синий цилиндр на чёрном (вариант glass=True в svg() остался как набросок, не используется).
Рисует SVG по сетке иконок macOS (сквиркл 824×824 в квадрате 1024) и переводит в PNG через WebKit.
Запуск: .venv/bin/python dev/make_icon.py  →  assets/icon.png (иконка сборки, тёмная), assets/icon-light.png (светлая тема) и .svg рядом;
    копия светлой 512 px – app/ui/img/icon-light.png (Dock, пока приложение открыто)."""
import base64, math, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
C, H = 512, 412                       # центр и половина стороны сквиркла (824 / 2)


def squircle(cx=C, cy=C, h=H, n=5.0, steps=240):
    pts = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        c, s = math.cos(a), math.sin(a)
        x = cx + h * math.copysign(abs(c) ** (2 / n), c)
        y = cy + h * math.copysign(abs(s) ** (2 / n), s)
        pts.append(f"{x:.1f},{y:.1f}")
    return "M" + " L".join(pts) + " Z"


SQ = squircle()
# цилиндр: три диска, сверху вниз
CX, RX, RY = 512, 236, 70
DISCS = [(292, 412), (442, 562), (592, 712)]      # (верх диска, низ диска): 120 высота, щель 30


def disc(top, bottom, i, glass):
    body = f"M{CX-RX},{top} L{CX-RX},{bottom} A{RX},{RY} 0 0 0 {CX+RX},{bottom} L{CX+RX},{top} A{RX},{RY} 0 0 1 {CX-RX},{top} Z"
    # верх нижних дисков светится – из щели между дисками виден только светящийся серп
    top_fill = "url(#gTop)" if i == 0 else "url(#gSlot)"
    rim = "" if i else f'<ellipse cx="{CX}" cy="{top}" rx="{RX-2}" ry="{RY-2}" fill="none" stroke="url(#gRim)" stroke-width="{4 if glass else 3}"/>'
    low = f'<path d="M{CX-RX},{bottom} A{RX},{RY} 0 0 0 {CX+RX},{bottom}" fill="none" stroke="url(#gRimLow)" stroke-width="2.5"/>' if glass else ""
    glow = "" if i == 0 else f'<ellipse cx="{CX}" cy="{top+6}" rx="{RX+6}" ry="{RY+4}" fill="#3aa0ff" opacity="{.4 if glass else .55}" filter="url(#blur8)"/>'
    return f"""
  {glow}
  <path d="{body}" fill="url(#gBody)"/>
  <path d="{body}" fill="url(#gSide)"/>
  {low}
  <ellipse cx="{CX}" cy="{top}" rx="{RX}" ry="{RY}" fill="{top_fill}"/>
  {rim}"""


def glows(glass):
    return ""


def svg(glass):
    if glass:
        bg = """<linearGradient id="gBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161b28"/><stop offset=".55" stop-color="#090c14"/><stop offset="1" stop-color="#030408"/></linearGradient>"""
        body = """<linearGradient id="gBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0a84ff" stop-opacity=".16"/><stop offset=".5" stop-color="#0a84ff" stop-opacity=".05"/><stop offset="1" stop-color="#0a84ff" stop-opacity=".2"/></linearGradient>
    <linearGradient id="gSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".08" stop-color="#fff" stop-opacity=".02"/><stop offset=".3" stop-color="#fff" stop-opacity=".0"/>
      <stop offset=".72" stop-color="#fff" stop-opacity=".0"/><stop offset=".88" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".24"/></linearGradient>
    <linearGradient id="gTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".12"/><stop offset="1" stop-color="#5aa8ff" stop-opacity=".05"/></linearGradient>
    <linearGradient id="gRim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#8fc8ff" stop-opacity=".5"/></linearGradient>
    <linearGradient id="gRimLow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".32"/></linearGradient>
    <linearGradient id="gSlot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4aa3ff"/><stop offset=".6" stop-color="#0a84ff"/><stop offset="1" stop-color="#0656c8"/></linearGradient>"""
        edge = '<path d="{sq}" fill="none" stroke="url(#gEdge)" stroke-width="5"/>'
    else:
        bg = """<linearGradient id="gBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1e2230"/><stop offset=".5" stop-color="#0c0e15"/><stop offset="1" stop-color="#030406"/></linearGradient>"""
        body = """<linearGradient id="gBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#062a6e"/><stop offset=".22" stop-color="#0a5fe0"/><stop offset=".5" stop-color="#1f86ff"/><stop offset=".78" stop-color="#0a5fe0"/><stop offset="1" stop-color="#04225c"/></linearGradient>
    <linearGradient id="gSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".18" stop-color="#fff" stop-opacity=".04"/><stop offset=".34" stop-color="#fff" stop-opacity=".22"/>
      <stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="gTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6fb4ff"/><stop offset="1" stop-color="#0a6cf0"/></linearGradient>
    <linearGradient id="gRim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6f2ff"/><stop offset=".5" stop-color="#7fbcff"/><stop offset="1" stop-color="#cfe6ff"/></linearGradient>"""
        edge = '<path d="{sq}" fill="none" stroke="url(#gEdge)" stroke-width="3"/>'
    discs = "".join(disc(t, b, i, glass) for i, (t, b) in reversed(list(enumerate(DISCS))))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    {bg}
    {body}
    <linearGradient id="gEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="{.32 if glass else .22}"/><stop offset=".25" stop-color="#fff" stop-opacity="{.06 if glass else .04}"/>
      <stop offset=".8" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="{.25 if glass else .06}"/></linearGradient>
    {'' if glass else """<linearGradient id="gSlot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9e6ff"/><stop offset=".6" stop-color="#5ac8ff"/><stop offset="1" stop-color="#2f9bff"/></linearGradient>"""}
    <radialGradient id="gGlow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#0a84ff" stop-opacity="{.4 if glass else .6}"/><stop offset="1" stop-color="#0a84ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="gSheen" cx=".5" cy="0" r=".9">
      <stop offset="0" stop-color="#fff" stop-opacity="{.06 if glass else .07}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="blur8" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".35"/></filter>
    <clipPath id="clip"><path d="{SQ}"/></clipPath>
  </defs>
  <path d="{SQ}" fill="url(#gBg)" filter="url(#shadow)"/>
  <g clip-path="url(#clip)">
    <path d="{SQ}" fill="url(#gSheen)"/>
    <ellipse cx="{CX}" cy="790" rx="300" ry="70" fill="url(#gGlow)" filter="url(#blur30)"/>
    <ellipse cx="{CX}" cy="520" rx="330" ry="300" fill="url(#gGlow)" opacity="{.18 if glass else .22}" filter="url(#blur30)"/>
    {discs}
    {glows(glass)}
  </g>
  {edge.format(sq=SQ)}
</svg>"""


def light(s):
    """Светлый вариант: белый фон с лёгким серым переходом, тот же синий цилиндр, мягче тень и свечение."""
    s = s.replace('<stop offset="0" stop-color="#1e2230"/><stop offset=".5" stop-color="#0c0e15"/><stop offset="1" stop-color="#030406"/>',
                  '<stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f1f3f7"/><stop offset="1" stop-color="#dfe3ea"/>')
    # край – тонкая тёмная линия вместо светлого блика
    s = s.replace('<linearGradient id="gEdge" x1="0" y1="0" x2="0" y2="1">',
                  '<linearGradient id="gEdge" x1="0" y1="0" x2="0" y2="1" gradientTransform="scale(1)">', 1)
    s = s.replace('stop-color="#fff" stop-opacity=".22"/><stop offset=".25" stop-color="#fff" stop-opacity=".04"/>',
                  'stop-color="#000" stop-opacity=".06"/><stop offset=".25" stop-color="#000" stop-opacity=".05"/>')
    s = s.replace('<stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>',
                  '<stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>', 1)
    s = s.replace('flood-opacity=".35"', 'flood-opacity=".22"')
    # свечение под цилиндром и вокруг – слабее, на белом оно читается как грязь
    s = s.replace('<stop offset="0" stop-color="#0a84ff" stop-opacity=".6"/>', '<stop offset="0" stop-color="#0a84ff" stop-opacity=".28"/>')
    s = s.replace('opacity=".22" filter="url(#blur30)"', 'opacity=".12" filter="url(#blur30)"')
    return s


def render(svgs):
    import webview
    out = {}
    def go(w):
        time.sleep(1)
        for name, s in svgs.items():
            b64 = base64.b64encode(s.encode()).decode()
            w.evaluate_js(f"""window.__png=null; (()=>{{const im=new Image(); im.onload=()=>{{const c=document.createElement('canvas'); c.width=c.height=1024;
              c.getContext('2d').drawImage(im,0,0,1024,1024); window.__png=c.toDataURL('image/png');}}; im.src='data:image/svg+xml;base64,{b64}';}})()""")
            for _ in range(100):
                time.sleep(0.1)
                r = w.evaluate_js("window.__png")
                if r: out[name] = base64.b64decode(r.split(",", 1)[1]); break
        w.destroy()
    w = webview.create_window("icon", html="<html><body style='margin:0;background:#000'></body></html>", width=300, height=200)
    webview.start(go, w)
    return out


if __name__ == "__main__":
    svgs = {"icon": svg(False), "icon-light": light(svg(False))}
    for name, s in svgs.items():
        (ROOT / "assets" / f"{name}.svg").write_text(s)
    for name, data in render(svgs).items():
        (ROOT / "assets" / f"{name}.png").write_bytes(data)
        print("saved", name, len(data))
    import subprocess
    (ROOT / "app" / "ui" / "img").mkdir(exist_ok=True)
    subprocess.run(["sips", "-z", "512", "512", str(ROOT / "assets" / "icon-light.png"), "--out", str(ROOT / "app" / "ui" / "img" / "icon-light.png")], check=True, capture_output=True)

