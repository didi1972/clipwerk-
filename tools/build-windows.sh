#!/usr/bin/env bash
# Baut Clipwerk Studio für Windows (unter Linux): HTML-App, Electron-Programm und Setups.
# Voraussetzungen: python3, node + npm, unzip, curl, makensis (Paket "nsis"), Internet.
# Hinweis: Die SHA-256-Prüfsumme der Electron-Datei wird beim Bauen berechnet und ins Setup geschrieben.
# Sie wird vorher mit der offiziellen SHASUMS256.txt des Electron-Releases abgeglichen (Abbruch bei Abweichung).
set -euo pipefail
cd "$(dirname "$0")/.."
ELECTRON_VERSION="${ELECTRON_VERSION:-45.0.0}"
mkdir -p dist build
python3 build.py vendor/mediabunny.min.cjs
ZIP="build/electron-v$ELECTRON_VERSION-win32-x64.zip"
[ -f "$ZIP" ] || curl -fL -o "$ZIP" "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron-v$ELECTRON_VERSION-win32-x64.zip"
rm -rf build/app && mkdir -p build/app && unzip -q "$ZIP" -d build/app
rm -f build/app/resources/default_app.asar
( cd build/app/locales && ls | grep -v -E '^(de|en-US)\.pak$' | xargs -r rm -f )
mkdir -p build/app/resources/app
# Lokale KI-Bibliotheken (kein Code aus dem Netz zur Laufzeit)
( cd tools/libs && npm ci --no-audit --no-fund && node build.mjs ../../build/app/resources/app/lib )
cp desktop/main.js desktop/preload.js desktop/package.json build/app/resources/app/
cp dist/Clipwerk-Studio.html build/app/resources/app/index.html
cp installer/clipwerk.ico build/app/resources/app/icon.ico
mv build/app/electron.exe build/app/Clipwerk.exe
( cd tools && [ -d node_modules/resedit ] || npm install --no-save resedit@2 pe-library )
node tools/seticon.mjs build/app/Clipwerk.exe installer/clipwerk.ico
SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)
OFFICIAL=$(curl -fsSL "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/SHASUMS256.txt" | grep " \*electron-v$ELECTRON_VERSION-win32-x64.zip$" | cut -d' ' -f1)
[ -n "$OFFICIAL" ] && [ "$OFFICIAL" = "$SHA" ] || { echo "FEHLER: Prüfsumme der Electron-Datei stimmt nicht mit der offiziellen Liste überein." >&2; exit 1; }
SHA=$(echo "$SHA" | tr 'a-f' 'A-F')
echo "Electron $ELECTRON_VERSION SHA-256: $SHA"
( cd installer && makensis -V2 -DELECTRON_VERSION="$ELECTRON_VERSION" -DELECTRON_SHA256="$SHA" web.nsi && makensis -V2 desktop.nsi )
ls -la dist
