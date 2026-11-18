Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!define APPNAME "Clipwerk Studio"
!define VERSION "1.3.0"
!ifndef ELECTRON_VERSION
  !error "ELECTRON_VERSION fehlt (build-windows.sh setzt es)"
!endif
!ifndef ELECTRON_SHA256
  !error "ELECTRON_SHA256 fehlt (build-windows.sh setzt es)"
!endif
!define ELECTRON "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClipwerkStudio"
Name "${APPNAME}"
OutFile "../dist/Clipwerk-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Clipwerk Studio"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
VIProductVersion "1.3.0.0"
VIAddVersionKey /LANG=1031 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1031 "FileDescription" "${APPNAME} Setup"
VIAddVersionKey /LANG=1031 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1031 "LegalCopyright" "Kostenlos"
!define MUI_ICON "clipwerk.ico"
!define MUI_UNICON "clipwerk.ico"
!define MUI_WELCOMEPAGE_TITLE "Willkommen bei ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Kostenloser Video-Editor für TikTok, Reels, Shorts und YouTube.$\r$\n$\r$\nDas Setup lädt während der Installation ca. 150 MB Programmteile aus dem Internet. Das dauert je nach Verbindung 1–5 Minuten.$\r$\n$\r$\nKlicke auf Weiter."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Clipwerk Studio.exe"
!define MUI_FINISHPAGE_RUN_TEXT "${APPNAME} jetzt starten"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
Section "Install"
  SetOutPath "$INSTDIR"
  DetailPrint "Programmteile werden heruntergeladen (ca. 150 MB) – bitte warten …"
  ; Download + Prüfung der SHA-256-Prüfsumme: eine beschädigte oder veränderte Datei wird abgelehnt.
  nsExec::ExecToLog `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ErrorActionPreference='Stop'; $$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $$z=Join-Path '$INSTDIR' 'runtime.zip'; try { Invoke-WebRequest -UseBasicParsing -Uri '${ELECTRON}' -OutFile $$z } catch { exit 2 }; if ((Get-FileHash -Algorithm SHA256 $$z).Hash -ne '${ELECTRON_SHA256}') { Remove-Item $$z -Force; exit 3 }; Expand-Archive -Force -Path $$z -DestinationPath '$INSTDIR'; Remove-Item $$z -Force; exit 0"`
  Pop $0
  ${If} $0 == "2"
    MessageBox MB_ICONSTOP "Der Download hat nicht geklappt. Bitte prüfe deine Internetverbindung und starte das Setup erneut."
    Abort
  ${ElseIf} $0 == "3"
    MessageBox MB_ICONSTOP "Die heruntergeladene Datei ist beschädigt oder wurde verändert und wurde aus Sicherheitsgründen gelöscht. Bitte starte das Setup erneut."
    Abort
  ${ElseIfNot} ${FileExists} "$INSTDIR\electron.exe"
  ${AndIfNot} ${FileExists} "$INSTDIR\Clipwerk Studio.exe"
    MessageBox MB_ICONSTOP "Die Installation ist fehlgeschlagen (Code $0). Bitte starte das Setup erneut."
    Abort
  ${EndIf}
  Delete "$INSTDIR\Clipwerk Studio.exe"
  Rename "$INSTDIR\electron.exe" "$INSTDIR\Clipwerk Studio.exe"
  Delete "$INSTDIR\resources\default_app.asar"
  RMDir /r "$INSTDIR\resources\app"
  SetOutPath "$INSTDIR\resources\app"
  File /r "../build/app/resources/app/*"
  SetOutPath "$INSTDIR"
  File "clipwerk.ico"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\Clipwerk Studio.exe" "" "$INSTDIR\clipwerk.ico" 0
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\Clipwerk Studio.exe" "" "$INSTDIR\clipwerk.ico" 0
  WriteUninstaller "$INSTDIR\Deinstallieren.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\clipwerk.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Deinstallieren.exe"'
  DetailPrint "Fertig!"
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
