import type { Lang } from '../shared/types'
import { getCachedLang } from './data-store'
import { detectInitialLang } from './initial-lang'

/**
 * Every sentence the main process puts on screen itself (system dialogs, the tray menu) comes from
 * here, in the language the user saved. The renderer has its own tables; this one exists because
 * the main process cannot ask the window which language it shows.
 */

/** The language of the main process's dialogs: the saved one, else the system's, else English. */
export function getUiLang(): Lang {
  return getCachedLang() ?? detectInitialLang()
}

export interface MainStrings {
  /** The window title of every message box. The product name is not translated. */
  dialogTitle: string
  // The question before an export that would hold passwords in plain text.
  exportPromptMessage: string
  exportPromptDetail: string
  /** The same question before the list for reading (Markdown) is written. */
  exportMarkdownPromptDetail: string
  exportWithoutPasswords: string
  exportWithPasswords: string
  cancel: string
  // The confirmation before an import replaces the data.
  importConfirmMessage: string
  importConfirmDetail: (fileName: string) => string
  importNoPasswords: string
  importConfirmButton: string
  // The file pickers.
  exportDialogTitle: string
  exportDialogButton: string
  importDialogTitle: string
  importDialogButton: string
  jsonFilesName: string
  markdownFilesName: string
  allFilesName: string
  selectFolderTitle: string
  selectAppTitle: string
  appFilesName: string
  // The menu of the tray icon and of the floating ball.
  launcherMenuOpen: string
  launcherMenuQuit: string
  // The box that is all there is when the application cannot start.
  startupFailedTitle: string
  startupFailedDetail: (reason: string, logPath: string) => string
  // Under the same title: a portable folder that comes from another PC and cannot be made ready.
  portableKeyFailedDetail: (reason: string) => string
}

export const mainStrings: Record<Lang, MainStrings> = {
  zh: {
    dialogTitle: 'Marubako',
    exportPromptMessage: '导出文件不加密',
    exportPromptDetail:
      '导出的文件是明文 JSON，包含全部密码，任何拿到这个文件的人都能直接看到。请不要把它放进网盘同步目录，也不要发给别人。\n\n要把密码迁移到另一台电脑，必须选“含密码导出”。',
    exportMarkdownPromptDetail:
      '导出的清单是明文。选“含密码导出”会把全部密码写进去，任何拿到这个文件的人都能直接看到。请不要把它放进会同步到网盘的文件夹，也不要发给别人。',
    exportWithoutPasswords: '不含密码导出',
    exportWithPasswords: '含密码导出',
    cancel: '取消',
    importConfirmMessage: '导入会覆盖当前全部数据，是否继续？',
    importConfirmDetail: (fileName) =>
      `文件：${fileName}\n导入前会先自动备份当前数据。`,
    importNoPasswords:
      '这个文件不含密码：导入后所有密码条目的密码都会是空的，需要重新填写。',
    importConfirmButton: '导入',
    exportDialogTitle: '导出 Marubako 数据',
    exportDialogButton: '导出',
    importDialogTitle: '导入 Marubako 数据',
    importDialogButton: '导入',
    jsonFilesName: 'JSON 文件',
    markdownFilesName: 'Markdown 文件',
    allFilesName: '所有文件',
    selectFolderTitle: '选择文件夹',
    selectAppTitle: '选择程序或快捷方式',
    appFilesName: '程序与快捷方式',
    launcherMenuOpen: '打开 Marubako',
    launcherMenuQuit: '退出 (Quit)',
    startupFailedTitle: 'Marubako 无法启动',
    startupFailedDetail: (reason, logPath) =>
      `原因：${reason}\n\n详细信息已写入日志：${logPath}`,
    portableKeyFailedDetail: (reason) =>
      `这个文件夹上次是在另一台电脑上使用的。启动之前，Marubako 要先把那台电脑的密码密钥收好，但没有成功，所以没有启动：否则那台电脑上保存的密码就再也读不出来了。\n\n请确认这个文件夹可以写入、磁盘没有满，然后再启动一次。\n\n原因：${reason}`,
  },
  en: {
    dialogTitle: 'Marubako',
    exportPromptMessage: 'The export file is not encrypted',
    exportPromptDetail:
      'The file is plain JSON and holds every password in plain text, so anyone who gets it can read them. Do not put it in a cloud-synced folder or send it to others.\n\nTo move your passwords to another computer you need “Export with passwords”.',
    exportMarkdownPromptDetail:
      'The list is plain text. “Export with passwords” writes every password into it, for anyone who gets the file to read. Do not keep it in a folder that syncs to a cloud, and do not send it to anyone.',
    exportWithoutPasswords: 'Export without passwords',
    exportWithPasswords: 'Export with passwords',
    cancel: 'Cancel',
    importConfirmMessage: 'Importing replaces all current data. Continue?',
    importConfirmDetail: (fileName) =>
      `File: ${fileName}\nYour current data is backed up automatically first.`,
    importNoPasswords:
      'This file contains no passwords: after the import every password entry will have an empty password and has to be filled in again.',
    importConfirmButton: 'Import',
    exportDialogTitle: 'Export Marubako Data',
    exportDialogButton: 'Export',
    importDialogTitle: 'Import Marubako Data',
    importDialogButton: 'Import',
    jsonFilesName: 'JSON Files',
    markdownFilesName: 'Markdown Files',
    allFilesName: 'All Files',
    selectFolderTitle: 'Choose a folder',
    selectAppTitle: 'Choose a program or shortcut',
    appFilesName: 'Programs and shortcuts',
    launcherMenuOpen: 'Open Marubako',
    launcherMenuQuit: 'Quit',
    startupFailedTitle: 'Marubako could not start',
    startupFailedDetail: (reason, logPath) =>
      `Reason: ${reason}\n\nDetails were written to the log: ${logPath}`,
    portableKeyFailedDetail: (reason) =>
      `This folder was last used on another PC. Before it starts, Marubako has to put that PC’s password key away, and could not. It did not start: otherwise the passwords saved on that PC could never be read again.\n\nCheck that this folder can be written to and that the disk is not full, then start it again.\n\nReason: ${reason}`,
  },
  ja: {
    dialogTitle: 'Marubako',
    exportPromptMessage: 'エクスポートファイルは暗号化されません',
    exportPromptDetail:
      'ファイルはプレーンテキストの JSON で、すべてのパスワードがそのまま含まれます。入手した人は誰でも読めるため、クラウド同期フォルダーに置いたり、他の人に送ったりしないでください。\n\nパスワードを別のコンピューターへ移すには「パスワードを含めて書き出す」を選ぶ必要があります。',
    exportMarkdownPromptDetail:
      '一覧は平文です。「パスワードを含めて書き出す」を選ぶと、すべてのパスワードが書き込まれ、ファイルを手に入れた人は誰でも読めます。クラウドと同期するフォルダには置かず、他人にも送らないでください。',
    exportWithoutPasswords: 'パスワードなしで書き出す',
    exportWithPasswords: 'パスワードを含めて書き出す',
    cancel: 'キャンセル',
    importConfirmMessage:
      '読み込むと現在のデータをすべて置き換えます。続行しますか？',
    importConfirmDetail: (fileName) =>
      `ファイル: ${fileName}\n読み込む前に、現在のデータを自動でバックアップします。`,
    importNoPasswords:
      'このファイルにはパスワードが含まれていません。読み込み後、すべてのパスワード項目のパスワードが空になり、入力し直す必要があります。',
    importConfirmButton: '読み込む',
    exportDialogTitle: 'Marubako のデータを書き出す',
    exportDialogButton: '書き出す',
    importDialogTitle: 'Marubako のデータを読み込む',
    importDialogButton: '読み込む',
    jsonFilesName: 'JSON ファイル',
    markdownFilesName: 'Markdown ファイル',
    allFilesName: 'すべてのファイル',
    selectFolderTitle: 'フォルダーを選択',
    selectAppTitle: 'プログラムまたはショートカットを選択',
    appFilesName: 'プログラムとショートカット',
    launcherMenuOpen: 'Marubako を開く',
    launcherMenuQuit: '終了 (Quit)',
    startupFailedTitle: 'Marubako を起動できません',
    startupFailedDetail: (reason, logPath) =>
      `原因: ${reason}\n\n詳細はログに記録されました: ${logPath}`,
    portableKeyFailedDetail: (reason) =>
      `このフォルダは前回、別の PC で使われました。Marubako は起動する前に、その PC のパスワード用の鍵を退避する必要がありますが、できませんでした。そのため起動していません。起動すると、その PC で保存したパスワードが二度と読めなくなるためです。\n\nこのフォルダに書き込めること、ディスクに空きがあることを確認してから、もう一度起動してください。\n\n原因: ${reason}`,
  },
}

/** The sentences for the language in use right now. */
export function mainText(): MainStrings {
  return mainStrings[getUiLang()]
}
