import type { Lang } from '../shared/types'

/**
 * The balloon shown the first time everything, ball included, has gone to the tray. Without it a
 * user who turned the ball off would think the program had quit, and Windows 11 folds new tray
 * icons into the overflow area where they are easy to miss. `shortcut` is null when no launch
 * shortcut could be registered (every candidate is taken by another program): naming a key that
 * does nothing would be worse than naming none, so the text then only points at the tray icon.
 */
export function getTrayHintText(lang: Lang, shortcut: string | null): string {
  if (lang === 'en')
    return shortcut === null
      ? 'Marubako is still running in the tray. Click its icon to open it again.'
      : `Marubako is still running in the tray. Click its icon or press ${shortcut} to open it again.`
  if (lang === 'ja')
    return shortcut === null
      ? 'Marubako はトレイで実行中です。アイコンをクリックすると再び開けます。'
      : `Marubako はトレイで実行中です。アイコンをクリックするか ${shortcut} で再び開けます。`
  return shortcut === null
    ? 'Marubako 仍在系统托盘中运行。点击托盘图标即可重新打开。'
    : `Marubako 仍在系统托盘中运行。点击托盘图标，或按 ${shortcut} 重新打开。`
}
