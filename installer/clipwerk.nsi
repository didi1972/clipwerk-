Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!define APPNAME "Clipwerk Studio"
!define VERSION "1.1.0"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClipwerkStudio"
Name "${APPNAME}"
OutFile "../dist/Clipwerk-Studio-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\Clipwerk"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=1031 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1031 "FileDescription" "${APPNAME} Setup"
VIAddVersionKey /LANG=1031 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1031 "LegalCopyright" "Kostenlos"
!define MUI_ICON "clipwerk.ico"
!define MUI_UNICON "clipwerk.ico"
!define MUI_WELCOMEPAGE_TITLE "Willkommen bei ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Kostenloser Video-Editor mit KI für TikTok, Reels, Shorts und YouTube.$\r$\n$\r$\nClipwerk ist sehr leicht (unter 2 MB) und nutzt den bereits vorhandenen Microsoft Edge bzw. Google Chrome als Grundlage. Es werden keine Administratorrechte benötigt.$\r$\n$\r$\nKlicke auf Weiter, um fortzufahren."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "${APPNAME} jetzt starten"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchApp
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "German"

Var Browser
Var Args

Function FindBrowser
  StrCpy $Browser ""
  ReadRegStr $Browser HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${If} $Browser == ""
    ReadRegStr $Browser HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${EndIf}
  ${If} $Browser == ""
  ${AndIf} ${FileExists} "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
    StrCpy $Browser "$PROGRAMFILES32\Microsoft\Edge\Application\msedge.exe"
  ${EndIf}
  ${If} $Browser == ""
    ReadRegStr $Browser HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${EndIf}
  ${If} $Browser == ""
    ReadRegStr $Browser HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${EndIf}
  StrCpy $Args '--app="file:///$INSTDIR\Clipwerk-Studio.html" --start-maximized'
FunctionEnd

Function LaunchApp
  ${If} $Browser != ""
    Exec '"$Browser" $Args'
  ${Else}
    ExecShell "open" "$INSTDIR\Clipwerk-Studio.html"
  ${EndIf}
FunctionEnd

Section "Install"
  SetOutPath "$INSTDIR"
  File "../dist/Clipwerk-Studio.html"
  File "clipwerk.ico"
  File "LIESMICH.txt"
  Call FindBrowser
  ${If} $Browser != ""
    CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$Browser" "$Args" "$INSTDIR\clipwerk.ico" 0
    CreateDirectory "$SMPROGRAMS\${APPNAME}"
    CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$Browser" "$Args" "$INSTDIR\clipwerk.ico" 0
  ${Else}
    CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\Clipwerk-Studio.html" "" "$INSTDIR\clipwerk.ico" 0
    CreateDirectory "$SMPROGRAMS\${APPNAME}"
    CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\Clipwerk-Studio.html" "" "$INSTDIR\clipwerk.ico" 0
  ${EndIf}
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME} deinstallieren.lnk" "$INSTDIR\Deinstallieren.exe"
  WriteUninstaller "$INSTDIR\Deinstallieren.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Clipwerk"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\clipwerk.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Deinstallieren.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" 2000
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  Delete "$INSTDIR\Clipwerk-Studio.html"
  Delete "$INSTDIR\clipwerk.ico"
  Delete "$INSTDIR\LIESMICH.txt"
  Delete "$INSTDIR\Deinstallieren.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
SectionEnd
