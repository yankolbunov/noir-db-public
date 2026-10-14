#!/bin/bash
# Установщик Noir DB: собирает приложение и кладёт его в «Программы».
# Запуск: правый клик по этому файлу → «Открыть». Нужно один раз.
cd "$(dirname "$0")"
clear
echo "Установка Noir DB"
echo "-----------------"

# 0. Если Noir DB открыт – просим закрыться и ждём (при обновлении из настроек он закрывается сам)
if pgrep -x "Noir DB" >/dev/null 2>&1; then
  echo "Жду, пока закроется Noir DB…"
  osascript -e 'tell application "Noir DB" to quit' >/dev/null 2>&1
  for i in $(seq 1 60); do
    pgrep -x "Noir DB" >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -x "Noir DB" >/dev/null 2>&1; then
    echo "Закрой Noir DB вручную и запусти установщик ещё раз."
    read -p "Нажми Enter, чтобы закрыть окно…"
    exit 1
  fi
fi

# 1. Python
PY=""
for p in /Library/Frameworks/Python.framework/Versions/Current/bin/python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [ -x "$p" ] && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then PY="$p"; break; fi
done
if [ -z "$PY" ]; then
  echo ""
  echo "Не найден Python 3.9 или новее."
  echo "Сейчас откроется сайт python.org – скачай и установи Python (кнопка Download),"
  echo "потом снова запусти этот установщик."
  open "https://www.python.org/downloads/macos/"
  read -p "Нажми Enter, чтобы закрыть окно…"
  exit 1
fi
echo "Python: $("$PY" --version)"

# 2. Зависимости и сборка
echo "Ставлю зависимости (1–3 минуты)…"
rm -rf .venv
"$PY" -m venv .venv || { echo "Не получилось создать окружение Python"; read -p "Enter…"; exit 1; }
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt pyinstaller || { echo "Не удалось установить зависимости. Проверь интернет и попробуй снова."; read -p "Enter…"; exit 1; }

echo "Собираю приложение…"
rm -rf build dist && mkdir -p build/icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s $s assets/icon.png --out build/icon.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) assets/icon.png --out build/icon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns build/icon.iconset -o build/NoirDB.icns
.venv/bin/pyinstaller --noconfirm --clean --windowed --log-level ERROR \
  --name "Noir DB" --icon build/NoirDB.icns --osx-bundle-identifier com.kolbunov.noirdb \
  --add-data "app/ui:app/ui" --collect-all psycopg_binary --collect-submodules keyring \
  run.py || { echo "Сборка не удалась – пришли скриншот этого окна."; read -p "Enter…"; exit 1; }

# подпись автора в паспорт приложения (Finder → «Свойства»), затем заново подписать сборку
COPY=$(sed -n 's/^COPYRIGHT = "\(.*\)"$/\1/p' app/version.py)
plutil -replace NSHumanReadableCopyright -string "$COPY" "dist/Noir DB.app/Contents/Info.plist" 2>/dev/null
codesign --force --deep --sign - "dist/Noir DB.app" >/dev/null 2>&1

# 3. В «Программы»
echo "Копирую в «Программы»…"
rm -rf "/Applications/Noir DB.app"
cp -R "dist/Noir DB.app" /Applications/ 2>/dev/null || { mkdir -p ~/Applications; rm -rf ~/Applications/"Noir DB.app"; cp -R "dist/Noir DB.app" ~/Applications/; APP=~/Applications/"Noir DB.app"; }
APP="${APP:-/Applications/Noir DB.app}"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null

echo ""
echo "Готово! Noir DB установлен: $APP"
echo "Дальше открывай его через Launchpad или Spotlight (⌘ + пробел → Noir DB)."
open "$APP"
sleep 2
osascript -e 'tell application "Terminal" to close (every window whose name contains "Установить Noir DB")' >/dev/null 2>&1 &
exit 0
