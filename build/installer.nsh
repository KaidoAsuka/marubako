; Extra uninstaller steps, included by electron-builder through nsis.include.
; This file is UTF-8 with a byte order mark: NSIS only reads non-ASCII text (the zh and ja
; messages below) correctly from such a file.
;
; Uninstalling (and only that: an upgrade runs this uninstaller too, with isUpdated set, and must
; change nothing the user chose or has) does two things for the user:
;
;  1. It removes the "start with Windows" entry. app.setLoginItemSettings() stores it under HKCU
;     with the app user model id as the value name (${APP_ID} is the appId of the builder config,
;     which src/main/config.ts repeats as APP_ID); without this a deleted program would stay in
;     the start-up list.
;
;  2. It asks whether to delete the data Marubako keeps on this computer (the items, settings and
;     saved passwords in %APPDATA%\<package name>, which is where Electron puts userData). The
;     answer defaults to "No", so pressing Enter or closing the box keeps the data, and so does an
;     uninstall that was started with /S. Data that is kept is found again by a later installation.
;     Why the command line and not MessageBox /SD: the one-click uninstaller of electron-builder
;     switches NSIS to silent mode for every uninstall that was not started with /S, and in silent
;     mode a box with /SD is answered at once without being shown.
;
; The message follows the Windows display language: Chinese, Japanese, English for the rest.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Declared here, not at the top of the file: the installer includes this script too and NSIS
    ; refuses a variable that is never used there.
    Var /GLOBAL marubakoDataPrompt

    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${APP_ID}"

    ; electron always uses the per-user application data folder.
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endIf}

    ${if} ${FileExists} "$APPDATA\${APP_PACKAGE_NAME}\*.*"
      Push $2
      System::Call 'kernel32::GetUserDefaultUILanguage() i.r2'
      IntOp $2 $2 & 0x3FF
      ${if} $2 = 0x04
        StrCpy $marubakoDataPrompt "是否同时删除 Marubako 保存在这台电脑上的数据（包括条目、设置和已保存的密码）？$\r$\n$\r$\n选择“否”会保留这些数据，以后重新安装即可继续使用。"
      ${elseIf} $2 = 0x11
        StrCpy $marubakoDataPrompt "Marubako がこのパソコンに保存したデータ（項目、設定、保存したパスワード）も削除しますか？$\r$\n$\r$\n「いいえ」を選ぶとデータは残り、再インストールすると再び使えます。"
      ${else}
        StrCpy $marubakoDataPrompt "Also delete the data Marubako keeps on this computer (items, settings and saved passwords)?$\r$\n$\r$\nChoose No to keep it; it will be there again if you reinstall."
      ${endIf}
      Pop $2
      ; Asked unless the uninstall was started with /S (then the data is kept).
      ClearErrors
      ${GetParameters} $R0
      ${GetOptions} $R0 "/S" $R1
      ${if} ${Errors}
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$marubakoDataPrompt" IDNO marubakoKeepData
        RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      ${endIf}
      marubakoKeepData:
    ${endIf}

    ; The installer that the updater downloaded is not the user's data; it goes with the program.
    RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"

    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
  ${endIf}
!macroend
