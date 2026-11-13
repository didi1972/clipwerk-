Unicode true
!include "MUI2.nsh"
!define APPNAME "Clipwerk Studio"
!define VERSION "1.2.0"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClipwerkStudio"
Name "${APPNAME}"
OutFile "../dist/Clipwerk-Studio-Setup-Windows.exe"
InstallDir "$LOCALAPPDATA\Programs\Clipwerk Studio"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "Clipwerk Studio ${VERSION}"
VIProductVersion "1.2.0.0"
VIAddVersionKey /LANG=1031 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1031 "FileDescription" "${APPNAME} Setup"
VIAddVersionKey /LANG=1031 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1031 "LegalCopyright" "Kostenlos"
!define MUI_ICON "clipwerk.ico"
!define MUI_UNICON "clipwerk.ico"
!define MUI_WELCOMEPAGE_TITLE "Willkommen bei ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Kostenloser Video-Editor für TikTok, Reels, Shorts und YouTube – mit Ein-Klick-Schnitt, Musik, Effekten und KI.$\r$\n$\r$\nEigenständiges Windows-Programm, kein Browser nötig. Keine Administratorrechte nötig.$\r$\n$\r$\nKlicke auf Weiter."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Clipwerk.exe"
!define MUI_FINISHPAGE_RUN_TEXT "${APPNAME} jetzt starten"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"
Section "Install"
  SetOutPath "$INSTDIR"
  File /r "../build/app/*"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\Clipwerk.exe"
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\Clipwerk.exe"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME} deinstallieren.lnk" "$INSTDIR\Deinstallieren.exe"
  WriteUninstaller "$INSTDIR\Deinstallieren.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Clipwerk"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\Clipwerk.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Deinstallieren.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" 310000
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
