#!/usr/bin/env bash
# Baut Clipwerk Studio für Windows (unter Linux): HTML-App, Electron-Programm und Setups.
# Voraussetzungen: python3, node + npm, unzip, makensis (Paket "nsis"), Internet.
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
cp desktop/main.js desktop/preload.js desktop/package.json build/app/resources/app/
cp dist/Clipwerk-Studio.html build/app/resources/app/index.html
cp installer/clipwerk.ico build/app/resources/app/icon.ico
mv build/app/electron.exe build/app/Clipwerk.exe
( cd tools && [ -d node_modules/resedit ] || npm install --no-save resedit@2 pe-library )
node tools/seticon.mjs build/app/Clipwerk.exe installer/clipwerk.ico
( cd installer && makensis -V2 web.nsi && makensis -V2 desktop.nsi )
ls -la dist
