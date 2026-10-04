import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'

import type { Lang } from '../shared/types'
import { InvalidBackupError, UnsupportedSchemaError } from './data-normalize'
import { DataDecryptError } from './encryption'
import { getUiLang, mainText } from './main-strings'
import type { RecoveryChoice, RecoveryInfo, RecoveryReason } from './data-store'

interface Messages {
  recoveryTitle: string
  reasons: Record<RecoveryReason, string>
  filePath: (path: string) => string
  restoreAvailable: (date: string) => string
  freshNote: string
  exit: string
  restore: (date: string) => string
  fresh: string
  saveFailedTitle: string
  saveFailedDetail: (message: string) => string
  retry: string
  quitAnyway: string
}

const messages: Record<Lang, Messages> = {
  zh: {
    recoveryTitle: '无法读取数据文件',
    reasons: {
      parse: '数据文件已损坏，或不是有效的数据文件。',
      decrypt:
        '数据文件是在另一台电脑或另一个 Windows 账号下加密的，这台电脑无法读取。请回到原来的电脑，在“设置 → 语言与数据 → 导出数据”导出。回到这里后，先选“用默认数据开始”，再用“设置 → 语言与数据 → 导入数据”导入。',
      schema:
        '数据文件来自更新版本的 Marubako。请先升级应用，不要用旧版本覆盖它。',
      missing: '找不到数据文件，但发现了自动备份。',
    },
    filePath: (path) => `数据文件：${path}`,
    restoreAvailable: (date) => `可以从 ${date} 的自动备份恢复。`,
    freshNote:
      '选择“用默认数据开始”时，原文件会另存为 .recovery 副本，不会被删除。',
    exit: '退出（保留原文件）',
    restore: (date) => `从 ${date} 的备份恢复`,
    fresh: '用默认数据开始',
    saveFailedTitle: '数据没有保存到磁盘',
    saveFailedDetail: (message) =>
      `最近的修改还没有写入文件：${message}\n现在退出会丢失这些修改。`,
    retry: '重试',
    quitAnyway: '仍然退出',
  },
  en: {
    recoveryTitle: 'The data file cannot be read',
    reasons: {
      parse: 'The data file is damaged or is not a valid data file.',
      decrypt:
        'The data file was encrypted on another computer or Windows account and cannot be read here. On the original computer use Settings → Language & data → Export Data. Back here, choose “Start with default data” first, then use Settings → Language & data → Import Data.',
      schema:
        'The data file comes from a newer version of Marubako. Update the app first; do not overwrite it with an older version.',
      missing: 'The data file is missing, but automatic backups were found.',
    },
    filePath: (path) => `Data file: ${path}`,
    restoreAvailable: (date) =>
      `It can be restored from the automatic backup of ${date}.`,
    freshNote:
      'If you start with default data, the original file is kept as a .recovery copy and is not deleted.',
    exit: 'Quit (keep the original file)',
    restore: (date) => `Restore the backup of ${date}`,
    fresh: 'Start with default data',
    saveFailedTitle: 'Your data was not saved to disk',
    saveFailedDetail: (message) =>
      `Recent changes have not been written to the file: ${message}\nQuitting now will lose them.`,
    retry: 'Retry',
    quitAnyway: 'Quit anyway',
  },
  ja: {
    recoveryTitle: 'データファイルを読み込めません',
    reasons: {
      parse:
        'データファイルが壊れているか、有効なデータファイルではありません。',
      decrypt:
        'このデータファイルは別のコンピューターまたは別の Windows アカウントで暗号化されているため、ここでは読み込めません。元のコンピューターで「設定 → 言語とデータ → データを書き出す」を実行してください。ここでは先に「初期データで開始」を選び、「設定 → 言語とデータ → データを読み込む」で読み込みます。',
      schema:
        'このデータファイルは新しいバージョンの Marubako のものです。先にアプリを更新してください。古いバージョンで上書きしないでください。',
      missing: 'データファイルが見つかりませんが、自動バックアップがあります。',
    },
    filePath: (path) => `データファイル: ${path}`,
    restoreAvailable: (date) => `${date} の自動バックアップから復元できます。`,
    freshNote:
      '「初期データで開始」を選んでも、元のファイルは .recovery コピーとして残り、削除されません。',
    exit: '終了（元のファイルを残す）',
    restore: (date) => `${date} のバックアップから復元`,
    fresh: '初期データで開始',
    saveFailedTitle: 'データがディスクに保存されていません',
    saveFailedDetail: (message) =>
      `最近の変更がファイルに書き込まれていません: ${message}\nこのまま終了すると変更が失われます。`,
    retry: '再試行',
    quitAnyway: 'このまま終了',
  },
}

/** Asks what to do when the data file cannot be used. Never replaces anything by itself. */
export async function promptRecovery(
  info: RecoveryInfo
): Promise<RecoveryChoice> {
  const text = messages[getUiLang()]
  const newest = info.backups[0]
  const detail = [
    info.reason === 'missing' ? '' : text.filePath(info.filePath),
    newest ? text.restoreAvailable(newest.date) : '',
    info.reason === 'missing' ? '' : text.freshNote,
  ]
    .filter(Boolean)
    .join('\n\n')

  const choices: RecoveryChoice[] = [{ action: 'exit' }]
  const buttons = [text.exit]
  if (newest) {
    choices.push({ action: 'restore', backupPath: newest.path })
    buttons.push(text.restore(newest.date))
  }
  choices.push({ action: 'fresh' })
  buttons.push(text.fresh)

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Marubako',
    message: `${text.recoveryTitle}\n${text.reasons[info.reason]}`,
    detail,
    buttons,
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  })

  return choices[response] ?? { action: 'exit' }
}

/** Shown when quitting while the last write to disk failed. */
export async function promptSaveFailure(
  message: string
): Promise<'retry' | 'quit'> {
  const text = messages[getUiLang()]
  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: 'Marubako',
    message: text.saveFailedTitle,
    detail: text.saveFailedDetail(message),
    buttons: [text.retry, text.quitAnyway],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  })

  return response === 0 ? 'retry' : 'quit'
}

interface ImportMessages {
  invalid: string
  notJson: string
  decrypt: string
  schema: string
}

const importMessages: Record<Lang, ImportMessages> = {
  zh: {
    invalid: '这不是 Marubako 的数据文件，当前数据没有被改动。',
    notJson: '文件不是有效的 JSON，当前数据没有被改动。',
    decrypt:
      '这个文件是在另一台电脑或另一个 Windows 账号下加密的，无法在这里读取。请使用原电脑上“设置 → 语言与数据 → 导出数据”生成的文件。',
    schema: '这个文件来自更新版本的 Marubako，请先升级应用。',
  },
  en: {
    invalid:
      'This is not a Marubako data file. Your current data was not changed.',
    notJson: 'The file is not valid JSON. Your current data was not changed.',
    decrypt:
      'This file was encrypted on another computer or Windows account and cannot be read here. Use a file made with Settings → Language & data → Export Data on the original computer.',
    schema:
      'This file comes from a newer version of Marubako. Update the app first.',
  },
  ja: {
    invalid:
      'Marubako のデータファイルではありません。現在のデータは変更されていません。',
    notJson:
      'ファイルが有効な JSON ではありません。現在のデータは変更されていません。',
    decrypt:
      'このファイルは別のコンピューターまたは別の Windows アカウントで暗号化されているため、ここでは読み込めません。元のコンピューターの「設定 → 言語とデータ → データを書き出す」で作成したファイルを使ってください。',
    schema:
      'このファイルは新しいバージョンの Marubako のものです。先にアプリを更新してください。',
  },
}

/** A message the user can act on, in the display language, for a failed import. */
export function describeImportError(error: unknown): string {
  const text = importMessages[getUiLang()]
  if (error instanceof InvalidBackupError) return text.invalid
  if (error instanceof SyntaxError) return text.notJson
  if (error instanceof DataDecryptError) return text.decrypt
  if (error instanceof UnsupportedSchemaError) return text.schema
  return error instanceof Error ? error.message : String(error)
}

function showMessageBox(
  parent: BrowserWindow | null,
  options: MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  return parent
    ? dialog.showMessageBox(parent, options)
    : dialog.showMessageBox(options)
}

export type ExportChoice = 'without-passwords' | 'with-passwords' | 'cancel'

/**
 * Asked before an export that would hold passwords: the file is plain text. "Without passwords"
 * is the default button, Escape and the window's close button cancel. Nothing is exported by
 * this call; the caller acts on the answer.
 */
export async function promptExportPasswords(
  parent: BrowserWindow | null
): Promise<ExportChoice> {
  const text = mainText()
  const { response } = await showMessageBox(parent, {
    type: 'warning',
    title: text.dialogTitle,
    message: text.exportPromptMessage,
    detail: text.exportPromptDetail,
    buttons: [
      text.exportWithoutPasswords,
      text.exportWithPasswords,
      text.cancel,
    ],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })

  return response === 0
    ? 'without-passwords'
    : response === 1
      ? 'with-passwords'
      : 'cancel'
}

/**
 * Asked once the file is chosen and checked, before it replaces the data. The default button is
 * "Cancel": this is the one irreversible-looking step. A file exported without passwords says so
 * here, because the passwords it cannot bring back are the ones the user would miss.
 */
export async function promptImportConfirm(
  parent: BrowserWindow | null,
  file: { name: string; passwordsOmitted: boolean }
): Promise<boolean> {
  const text = mainText()
  const { response } = await showMessageBox(parent, {
    type: 'warning',
    title: text.dialogTitle,
    message: text.importConfirmMessage,
    detail: [
      text.importConfirmDetail(file.name),
      file.passwordsOmitted ? text.importNoPasswords : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    buttons: [text.importConfirmButton, text.cancel],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })

  return response === 0
}

/**
 * The last thing the user sees when the application cannot start: in their language (the saved
 * one, or the system's when the data never loaded), with the reason and where the details are.
 */
export function showStartupFailure(error: unknown, logPath: string): void {
  const text = mainText()
  dialog.showErrorBox(
    text.startupFailedTitle,
    text.startupFailedDetail(
      error instanceof Error ? error.message : String(error),
      logPath
    )
  )
}

/**
 * A portable folder that comes from another PC and whose key could not be kept safe: the program
 * says why it does not start. Safe to call before the app is ready.
 */
export function showPortableKeyFailure(error: Error): void {
  const text = mainText()
  dialog.showErrorBox(
    text.startupFailedTitle,
    text.portableKeyFailedDetail(error.message)
  )
}
