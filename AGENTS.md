# Clipwerk Studio – Übergabe für Entwickler / KI-Agenten

Kostenloser Video-Editor für TikTok, Reels, Shorts und YouTube (Windows), ähnlich CapCut.
Zielgruppe: Laien. **Oberstes Ziel: so einfach wie möglich („ein Klick“).** Oberfläche komplett auf Deutsch.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/index.html` | HTML-Gerüst (Platzhalter `/*CSS*/`, `/*MEDIABUNNY*/`, `/*JS*/`) |
| `src/style.css` | Alle Styles (dunkles Design, Akzent Bernstein `#ffb547`) |
| `src/js/01-core.js` | Hilfsfunktionen, Datenmodell (`State`), Clips, Keyframes, Rückgängig (`commit/undo`), IndexedDB-Autosave (`Store`), Medienimport (`addMediaBlob`) |
| `src/js/02-render.js` | Render-Engine (`Renderer`): Clips, Übergänge, Filter, Text-Animationen, Effekte, Hintergrundentfernung (`BgRemoval`, MediaPipe + Chroma-Key) |
| `src/js/03-preview.js` | Vorschau, Wiedergabe, Maus-Bearbeitung im Bild |
| `src/js/04-timeline.js` | Mehrspur-Timeline, Trimmen, Teilen, Kontextmenüs |
| `src/js/05-inspector.js` | Rechte Eigenschaftenleiste (Profi-Modus) |
| `src/js/06-audio.js` | Musik-Generator (8 Stile, WebAudio offline), Soundeffekte, Mikrofonaufnahme, Rauschunterdrückung (RNNoise) |
| `src/js/07-ai.js` | KI über Pollinations.ai (Bild, Text, Stimme, Transkription), lokale Whisper/Piper, Stock-Medien (Openverse, Wikimedia, Pexels), Untertitel |
| `src/js/08-export.js` | MP4/WebM-Export mit Mediabunny + WebCodecs, Audio-Mix, Projektdatei `.clipwerk` |
| `src/js/09-panels.js` | Linke Werkzeug-Tabs (Profi-Modus) |
| `src/js/10-templates.js` | Vorlagen + „KI-Video aus Idee“ (`Templates.buildStory`) |
| `src/js/11-main.js` | Start (`boot`), Tastenkürzel, Drag & Drop, Optionen, Beispielprojekt |
| `src/js/12-easy.js` | **Einfach-Modus**: Startbildschirm, Auto-Schnitt im Takt (`Easy.build`), Stimmungen (`VIBES`), Ein-Klick-Export |
| `src/js/13-stockpicker.js` | Dialog „Kostenlose Videos & Fotos aus dem Internet“ |
| `desktop/` | Electron-Hülle: `main.js` (eigenes Protokoll `app://clipwerk`, Content-Security-Policy, Berechtigungen, Datenzugriff ohne CORS via `net:fetch`, Speichern nach `Videos\Clipwerk`), `preload.js` (`window.native`) |
| `tools/libs/` | Lokale KI-Bibliotheken (fest versioniert in `package-lock.json`): `build.mjs` bündelt MediaPipe + Modell, RNNoise, transformers.js (nur WASM), Piper nach `resources/app/lib` |
| `installer/` | NSIS-Skripte: `web.nsi` (kleines Setup, lädt Electron bei Installation), `desktop.nsi` (Vollsetup ~105 MB), `clipwerk.nsi` (alt: HTML im Edge-App-Modus) |
| `vendor/mediabunny.min.cjs` | Mediabunny 1.62.1 (MPL-2.0), wird in die HTML eingebettet |
| `tools/` | `build-windows.sh` (kompletter Build inkl. Prüfsummen-Abgleich), `seticon.mjs` (Symbol in die .exe) |

Alle JS-Dateien sind klassische Skripte im globalen Scope und werden in Dateinamen-Reihenfolge zusammengefügt.

## Bauen

```bash
python3 build.py vendor/mediabunny.min.cjs   # -> dist/Clipwerk-Studio.html (läuft direkt in Chrome/Edge)
./tools/build-windows.sh                      # -> dist/Clipwerk-Setup.exe + dist/Clipwerk-Studio-Setup-Windows.exe
```
Benötigt unter Linux: python3, node/npm, unzip, curl, `makensis` (apt: nsis). Electron-Version per `ELECTRON_VERSION` (Standard 45.0.0).
`Clipwerk-Setup.exe` im Repo-Hauptordner ist die Datei hinter dem Download-Link in der README – nach einem neuen Build dorthin kopieren.

## Sicherheit (Desktop)

- Die App läuft unter `app://clipwerk/` (eigenes, als „secure“ registriertes Protokoll; kein Ausbruch aus dem App-Ordner möglich).
- CSP: Skripte/Worker nur `'self'`, `blob:` und Inline (alles JS ist eingebettet); Daten (Bilder, Medien, Modelle, APIs) per https erlaubt.
- KI-**Code** (JS/WASM) ist komplett lokal (`LOCAL_LIBS` in `01-core.js`). Nur **Modelldaten** für Whisper/Piper kommen beim ersten Benutzen von huggingface.co.
- IPC-Handler prüfen den Absender (Protokoll + Host, nicht `origin` – Node liefert für eigene Protokolle `"null"`), erlauben nur https, begrenzen Downloads auf 500 MB und Dateitypen beim Speichern.
- Berechtigungen: nur Mikrofon (nur Audio), Vollbild, Zwischenablage-Schreiben – und nur für die eigene App.
- Das kleine Setup (`web.nsi`) lädt Electron von GitHub und prüft die SHA-256-Prüfsumme; `build-windows.sh` gleicht diese vorher mit der offiziellen `SHASUMS256.txt` ab.

## Stand

Getestet (headless Chromium + Electron 45 unter Linux): `app://`-Protokoll + CSP (fremdes Skript wird blockiert), lokale KI-Bausteine (MediaPipe-Freistellung, RNNoise, transformers.js- und Piper-Module laden), Ein-Klick-Ablauf (Dateien wählen → Video entsteht sofort → Format wechseln → speichern), Start, Beispielprojekt, Timeline-Bedienung, alle Effekte/Übergänge/Text-Animationen, Greenscreen, Musik-Generator, Einfach-Modus (Clips → Stimmung → Video erstellen → Neu mischen → Speichern), MP4-Export (H.264), automatisches Speichern nach `Videos\Clipwerk`.

**Nicht getestet:**
- Setup und Programm auf echtem Windows.
- Alle Online-Dienste (Pollinations-KI, Openverse, Wikimedia, Pexels): die Testumgebung hatte kein freies Internet. Pollinations verlangt laut aktueller Doku evtl. einen kostenlosen Schlüssel (enter.pollinations.ai); die App zeigt dann `KeyWizard`.
- Whisper- und Piper-**Modelle** (Download von huggingface.co war in der Testumgebung gesperrt) – die Bibliotheken selbst laden.

## Offene Punkte / Ideen

- Einfach-Modus (seit 1.3): Start = nur Ablagefläche; Dateien rein → Video entsteht sofort; Stimmung/Format/Länge per Klick; Profi-Editor nur als kleiner Link. Weiteres Feedback des Nutzers abwarten.
- Setup ist nicht signiert → Windows-SmartScreen-Warnung beim ersten Start.
- `web.nsi` nutzt PowerShell `Invoke-WebRequest` + `Get-FileHash` + `Expand-Archive` zum Nachladen von Electron.
- Im Electron-Export kann der Ton Opus statt AAC sein, falls AAC-Encoding fehlt.
