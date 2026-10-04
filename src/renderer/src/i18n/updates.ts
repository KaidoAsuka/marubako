import type { Lang } from '../../../shared/types'

/**
 * Strings of iteration 6: the version, the update check and the way to report a problem (the
 * "about" block at the bottom of the data page of the settings). Kept apart from the other tables
 * like safety.ts; `use-i18n` reads this one as well. {version} is replaced by the caller.
 */
export const updateStrings: Record<Lang, Record<string, string>> = {
  zh: {
    about_title: '关于',
    about_version: '当前版本 {version}',
    update_check: '检查更新',
    update_checking: '正在检查更新…',
    update_latest: '已是最新版本。',
    update_downloading:
      '发现新版本 {version}，正在下载。下载完成后再点一次「检查更新」，就可以重启并安装。',
    update_ready:
      '新版本 {version} 已下载。点「重启并更新」立即安装；也会在你从托盘菜单退出 Marubako 时自动安装（关闭窗口只会把它隐藏到托盘）。',
    update_install: '重启并更新',
    update_error: '无法检查更新，请检查网络连接后重试。',
    update_disabled: '只有安装版才能检查更新。',
    report_problem: '报告问题',
  },
  en: {
    about_title: 'About',
    about_version: 'Version {version}',
    update_check: 'Check for updates',
    update_checking: 'Checking for updates…',
    update_latest: 'You’re up to date.',
    update_downloading:
      'Version {version} is available and downloading. When it is done, check again to restart and install it.',
    update_ready:
      'Version {version} is downloaded. Choose “Restart and update” to install it now; it is also installed when you quit Marubako from the tray menu (closing the window only hides it to the tray).',
    update_install: 'Restart and update',
    update_error:
      'Couldn’t check for updates. Check your connection and try again.',
    update_disabled: 'Updates can only be checked in an installed version.',
    report_problem: 'Report a problem',
  },
  ja: {
    about_title: 'このアプリについて',
    about_version: 'バージョン {version}',
    update_check: '更新を確認',
    update_checking: '更新を確認しています…',
    update_latest: '最新バージョンです。',
    update_downloading:
      'バージョン {version} をダウンロードしています。完了したらもう一度「更新を確認」を押すと、再起動してインストールできます。',
    update_ready:
      'バージョン {version} をダウンロードしました。「再起動して更新」でいますぐインストールできます。トレイのメニューから Marubako を終了したときにもインストールされます（ウィンドウを閉じるだけではトレイに隠れるだけです）。',
    update_install: '再起動して更新',
    update_error:
      '更新を確認できませんでした。ネットワーク接続を確認して、もう一度お試しください。',
    update_disabled: '更新の確認はインストール版でのみ利用できます。',
    report_problem: '問題を報告',
  },
}
