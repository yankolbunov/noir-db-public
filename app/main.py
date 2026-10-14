"""Запуск приложения: окно pywebview с интерфейсом из папки ui."""
import os
import sys
import threading
import time
from pathlib import Path

import webview

from app import server, store
from app.api import Api


def ui_path():
    # внутри собранного .app файлы лежат во временной папке PyInstaller
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return base / "app" / "ui" / "index.html"


def apply_icon(light):
    """Иконка в Dock под тему интерфейса: в светлой – светлая, иначе – обычная тёмная из самого приложения.
    Пока приложение закрыто, Dock и Finder показывают тёмную (её задаёт сборка)."""
    try:
        import AppKit
        from PyObjCTools import AppHelper
    except Exception:
        return
    path = ui_path().parent / "img" / "icon-light.png"

    def apply():
        try:
            img = AppKit.NSImage.alloc().initWithContentsOfFile_(str(path)) if light and path.exists() else None
            AppKit.NSApp.setApplicationIconImage_(img)
        except Exception as e:
            print("macOS icon:", e)

    AppHelper.callAfter(apply)


def apply_theme(window, mode):
    """Оформление окна macOS под тему: dark – тёмное, light – светлое, auto – как в системе.
    От него зависят цвет за интерфейсом и то, что видит prefers-color-scheme в странице."""
    try:
        import AppKit
        from PyObjCTools import AppHelper
    except Exception:
        return

    def apply():
        try:
            w = window.native
            if mode == "light":
                w.setAppearance_(AppKit.NSAppearance.appearanceNamed_(AppKit.NSAppearanceNameAqua))
                w.setBackgroundColor_(AppKit.NSColor.whiteColor())
            elif mode == "auto":
                w.setAppearance_(None)
                w.setBackgroundColor_(AppKit.NSColor.windowBackgroundColor())
            else:
                w.setAppearance_(AppKit.NSAppearance.appearanceNamed_(AppKit.NSAppearanceNameDarkAqua))
                w.setBackgroundColor_(AppKit.NSColor.blackColor())
        except Exception as e:
            print("macOS theme:", e)

    AppHelper.callAfter(apply)


def zoom_window(window):
    """Двойной клик по заголовку – как в других приложениях macOS: по настройке системы
    «Двойной клик по заголовку окна» окно растягивается (по умолчанию) или сворачивается."""
    try:
        import AppKit
        from PyObjCTools import AppHelper
    except Exception:
        return

    def apply():
        try:
            w = window.native
            action = AppKit.NSUserDefaults.standardUserDefaults().stringForKey_("AppleActionOnDoubleClick") or "Maximize"
            if action == "Minimize":
                w.miniaturize_(None)
            elif action != "None":
                w.zoom_(None)
        except Exception as e:
            print("macOS zoom:", e)

    AppHelper.callAfter(apply)


# кнопки окна (красная, жёлтая, зелёная): насколько сдвинуть вправо и вниз от стандартного места, в пунктах
LIGHTS_DX, LIGHTS_DY = 6, 4
_lights_base = {}
_lights_observer = None


def place_lights(w):
    """Сдвигает кнопки окна правее и ниже – дальше от края окна, как у плавающего сайдбара в новых macOS.
    macOS возвращает их на место при каждом изменении размера, поэтому вызывается снова после resize и полноэкранного режима."""
    import AppKit
    if w.styleMask() & AppKit.NSWindowStyleMaskFullScreen:
        return
    btns = [w.standardWindowButton_(b) for b in (AppKit.NSWindowCloseButton, AppKit.NSWindowMiniaturizeButton, AppKit.NSWindowZoomButton)]
    if not all(btns):
        return
    container = btns[0].superview().superview()          # контейнер заголовка, в котором лежат кнопки
    if container is None:
        return
    key = id(w)
    if key not in _lights_base:                          # стандартные места – запоминаем один раз
        _lights_base[key] = ([b.frame().origin.x for b in btns], container.frame().size.height)
    xs, h0 = _lights_base[key]
    h = h0 + 2 * LIGHTS_DY
    r = container.frame()
    container.setFrame_(AppKit.NSMakeRect(r.origin.x, w.frame().size.height - h, r.size.width, h))
    for b, x in zip(btns, xs):
        f = b.frame()
        b.setFrameOrigin_(AppKit.NSMakePoint(x + LIGHTS_DX, (h - f.size.height) / 2))


def _watch_lights(w):
    """После изменения размера, выхода из полноэкранного режима и т. п. macOS раскладывает кнопки заново – двигаем их снова."""
    global _lights_observer
    if _lights_observer is not None:
        return
    import AppKit
    from Foundation import NSObject

    class NoirLights(NSObject):
        def relayout_(self, note):
            try:
                place_lights(note.object())
            except Exception:
                pass

    _lights_observer = NoirLights.alloc().init()
    nc = AppKit.NSNotificationCenter.defaultCenter()
    for name in ("NSWindowDidResizeNotification", "NSWindowDidEndLiveResizeNotification", "NSWindowDidExitFullScreenNotification",
                 "NSWindowDidBecomeKeyNotification", "NSWindowDidResignKeyNotification", "NSWindowDidDeminiaturizeNotification"):
        nc.addObserver_selector_name_object_(_lights_observer, "relayout:", name, w)


def setup_macos_window(window, api):
    """Системные кнопки окна и тёмный стиль. pywebview в режиме frameless прячет кнопки – возвращаем их.
    Заголовок остаётся прозрачным: под ним наш чёрный интерфейс, без серой полосы."""
    try:
        import AppKit
        from PyObjCTools import AppHelper
    except Exception:
        return

    def apply():
        try:
            w = window.native
            # «текстурный» фон рисует серую полосу под заголовком – убираем
            w.setStyleMask_(w.styleMask() & ~(1 << 8))
            if w.toolbar() is not None:
                w.setToolbar_(None)
            w.setTitlebarAppearsTransparent_(True)
            for b in (AppKit.NSWindowCloseButton, AppKit.NSWindowMiniaturizeButton, AppKit.NSWindowZoomButton):
                btn = w.standardWindowButton_(b)
                if btn is not None:
                    btn.setHidden_(False)
            # зелёная кнопка – полноэкранный режим, как у остальных приложений
            w.setCollectionBehavior_(w.collectionBehavior() | (1 << 7))
            api._titlebar = int(w.frame().size.height - w.contentLayoutRect().size.height)
            try:
                place_lights(w)
                _watch_lights(w)
            except Exception as e:
                print("macOS buttons:", e)
        except Exception as e:
            print("macOS window setup:", e)

    AppHelper.callAfter(apply)
    apply_theme(window, store.get_settings().get("theme") or "dark")


def hard_exit(api, delay=0.0):
    """Быстрый выход: закрываем соединения с базой не дольше секунды и завершаем процесс.
    Без этого Python ждёт фоновые потоки, а macOS – следующего события, и приложение «висит» при закрытии."""
    def run():
        if delay:
            time.sleep(delay)
        closers = [threading.Thread(target=s.close, daemon=True) for s in list(api._sessions.values())]
        for t in closers:
            t.start()
        for t in closers:
            t.join(1.0)
        os._exit(0)
    threading.Thread(target=run, daemon=True).start()


def patch_reopen(window):
    """Клик по иконке в Dock – окно выходит на передний план (свёрнутое – разворачивается), как в других приложениях."""
    try:
        import AppKit
        import objc
        from webview.platforms import cocoa
    except Exception:
        return

    def reopen(self, app, has_visible):
        try:
            w = window.native
            if w is not None:
                if w.isMiniaturized():
                    w.deminiaturize_(None)
                w.makeKeyAndOrderFront_(None)
            AppKit.NSApp.activateIgnoringOtherApps_(True)
        except Exception as e:
            print("macOS reopen:", e)
        return True

    try:
        objc.classAddMethods(cocoa.BrowserView.AppDelegate, [
            objc.selector(reopen, selector=b"applicationShouldHandleReopen:hasVisibleWindows:", signature=b"Z@:@Z")])
    except Exception as e:
        print("macOS reopen patch:", e)


def patch_quit(window, api):
    """⌘Q в pywebview сразу останавливает приложение, минуя вопрос о несохранённом.
    Перехватываем: ⌘Q закрывает окно обычным путём (с плашкой), а сама остановка не ждёт событий."""
    try:
        import AppKit
        from webview.platforms import cocoa
    except Exception:
        return
    real = cocoa.BrowserView.app

    class AppProxy:
        def __getattr__(self, name):
            return getattr(real, name)

        def stop_(self, sender):
            from_window = isinstance(sender, cocoa.BrowserView.WindowDelegate)
            if not from_window and not api._allow_close and window.native is not None:
                window.native.performClose_(None)     # ⌘Q – как красная кнопка
                return
            real.stop_(sender)
            # run loop проверяет флаг остановки только после события – подталкиваем его
            try:
                ev = AppKit.NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
                    AppKit.NSEventTypeApplicationDefined, AppKit.NSMakePoint(0, 0), 0, 0, 0, None, 0, 0, 0)
                real.postEvent_atStart_(ev, True)
            except Exception:
                pass
            hard_exit(api, 0.5)

    cocoa.BrowserView.app = AppProxy()


def main():
    api = Api()
    _httpd, url = server.start(api, ui_path().parent)
    window = webview.create_window(
        "Noir DB",
        url=url,
        width=1280,
        height=800,
        min_size=(900, 560),
        background_color="#ffffff" if store.get_settings().get("theme") == "light" else "#000000",
        frameless=True,        # прозрачный заголовок, контент на всё окно
        easy_drag=False,       # окно двигается за заголовок
        text_select=True,
    )
    api._window = window
    api._theme_cb = lambda mode: apply_theme(window, mode)
    api._icon_cb = apply_icon
    api._zoom_cb = lambda: zoom_window(window)

    attempts = []

    def on_closing():
        """Вместо мгновенного закрытия показываем свою плашку «Закрыть Noir DB?»."""
        if api._allow_close:
            return True
        settings = store.get_settings()
        # «больше не спрашивать» не действует, если в базе есть несохранённые изменения
        if not settings.get("closeAsk", True) and not api._has_unsaved():
            if settings.get("closeAction") == "discard":
                store.save_settings({"drafts": []})
            return True
        now = time.time()
        # аварийный выход: три попытки закрыть за 4 секунды – закрываемся, что бы ни случилось с интерфейсом
        attempts.append(now)
        del attempts[:-3]
        if len(attempts) == 3 and now - attempts[0] < 4:
            api._allow_close = True
            return True
        # подстраховка: если интерфейс не показал плашку, повторное закрытие срабатывает сразу
        if api._close_asked and not api._dialog_shown and now - api._close_asked > 1.5:
            return True
        if api._dialog_shown:
            return False          # плашка уже на экране – ждём выбора
        api._close_asked = now
        js("window.askClose && askClose()")
        return False

    def js(code):
        # из обработчиков событий – в отдельном потоке и только пока окно живо
        if not api._allow_close:
            threading.Thread(target=lambda: window.evaluate_js(code), daemon=True).start()

    window.events.closing += on_closing
    window.events.shown += lambda: setup_macos_window(window, api)
    window.events.maximized += lambda: js("window.setFullscreen && setFullscreen(true)")
    window.events.restored += lambda: js("window.setFullscreen && setFullscreen(false)")
    window.events.closed += lambda: hard_exit(api)
    patch_quit(window, api)
    patch_reopen(window)
    webview.start(debug="--debug" in sys.argv)
    hard_exit(api)
    time.sleep(3)
    os._exit(0)


if __name__ == "__main__":
    main()
