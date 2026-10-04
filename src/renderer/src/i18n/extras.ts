import type { Lang } from '../../../shared/types'

/**
 * Strings of 3.1.1: the size of the floating ball, the font, the list for reading (Markdown), the
 * words about backups on the data page of the settings, and the notice of a newer version in a
 * portable copy. Kept apart from the other tables like updates.ts; `use-i18n` reads this one as
 * well. {version} and {font} are replaced by the caller.
 */
export const extraStrings: Record<Lang, Record<string, string>> = {
  zh: {
    ball_size: '悬浮球大小',
    ball_size_hint:
      '保存后生效。悬浮球留在原来的位置，贴在屏幕边上的仍然贴边。',
    font_family: '字体',
    font_family_default: '默认',
    font_family_hint: '从这台电脑已安装的字体里选。代码和命令仍用等宽字体。',
    font_family_unavailable: '读不到这台电脑的字体列表，只能用默认字体。',
    font_family_missing: '{font}（这台电脑上没有）',
    export_markdown: '导出为 Markdown',
    export_markdown_success: '已导出 Markdown 清单',
    export_markdown_success_no_passwords: '已导出 Markdown 清单（不含密码）',
    open_data_folder: '打开数据文件夹',
    data_help_keep:
      '数据只保存在这台电脑上，没有云端副本。请隔一段时间导出一份，放到别的地方（另一块硬盘、U 盘）。',
    data_help_export:
      '导出数据：完整的备份（JSON 文件），以后可以再导入回来。换电脑、重装系统之前请先导出；要把密码一起带走，导出时选“含密码导出”。',
    data_help_markdown:
      '导出为 Markdown：给人看的清单，用记事本就能打开。它不能再导入回来。',
    data_help_import:
      '导入数据：用导出的 JSON 文件替换当前的全部数据。替换之前会自动备份当前数据。',
    data_help_backups:
      '自动备份：每天一份，保留最近 7 天，放在数据文件夹的 backups 里。它们和数据在同一块硬盘上，硬盘坏了会一起丢，所以不能代替导出。',
    update_available:
      '有新版本 {version}。绿色版不会自己更新：下载新的压缩包，解压到原来的位置覆盖旧文件，数据会保留。',
    update_open_download: '打开下载页',
  },
  en: {
    ball_size: 'Bubble size',
    ball_size_hint:
      'Applied when you save. The bubble stays where it is, and one docked to an edge of the screen stays docked.',
    font_family: 'Font',
    font_family_default: 'Default',
    font_family_hint:
      'Choose one of the fonts installed on this PC. Code and commands keep their monospace font.',
    font_family_unavailable:
      'The fonts of this PC could not be listed, so only the default is offered.',
    font_family_missing: '{font} (not on this PC)',
    export_markdown: 'Export as Markdown',
    export_markdown_success: 'Markdown list exported',
    export_markdown_success_no_passwords:
      'Markdown list exported (without passwords)',
    open_data_folder: 'Open data folder',
    data_help_keep:
      'Your data is on this PC only; there is no copy in a cloud. Export it from time to time and keep the file somewhere else (another disk, a USB stick).',
    data_help_export:
      'Export data: a full backup (a JSON file) that can be imported again. Export before you move to another PC or reinstall Windows; to take the passwords along, choose “Export with passwords”.',
    data_help_markdown:
      'Export as Markdown: a list for reading that opens in Notepad. It cannot be imported again.',
    data_help_import:
      'Import data: replaces all current data with an exported JSON file. The current data is backed up first.',
    data_help_backups:
      'Automatic backups: one a day, kept for 7 days, in the “backups” folder of the data folder. They are on the same disk as the data and would be lost with it, so they do not replace an export.',
    update_available:
      'Version {version} is available. The portable copy does not update itself: download the new zip and unpack it over this folder. Your data stays.',
    update_open_download: 'Open the download page',
  },
  ja: {
    ball_size: 'フローティングボタンの大きさ',
    ball_size_hint:
      '保存すると反映されます。フローティングボタンは同じ位置に残り、画面の端に付けてある場合は付いたままです。',
    font_family: 'フォント',
    font_family_default: '既定',
    font_family_hint:
      'この PC にインストールされているフォントから選びます。コードとコマンドは等幅フォントのままです。',
    font_family_unavailable:
      'この PC のフォント一覧を取得できないため、既定のフォントだけを選べます。',
    font_family_missing: '{font}（この PC にはありません）',
    export_markdown: 'Markdown で書き出す',
    export_markdown_success: 'Markdown の一覧を書き出しました',
    export_markdown_success_no_passwords:
      'Markdown の一覧を書き出しました（パスワードなし）',
    open_data_folder: 'データフォルダを開く',
    data_help_keep:
      'データはこの PC にだけあり、クラウドにコピーはありません。ときどき書き出して、別の場所（別のディスクや USB メモリ）に保管してください。',
    data_help_export:
      'データを書き出す：完全なバックアップ（JSON ファイル）で、あとで読み込めます。PC を替える前や Windows を再インストールする前に書き出してください。パスワードも一緒に移すには、「パスワードを含めて書き出す」を選びます。',
    data_help_markdown:
      'Markdown で書き出す：読むための一覧で、メモ帳で開けます。読み込むことはできません。',
    data_help_import:
      'データを読み込む：書き出した JSON ファイルで、現在のデータをすべて置き換えます。置き換える前に、現在のデータを自動でバックアップします。',
    data_help_backups:
      '自動バックアップ：1 日に 1 つ、直近 7 日分を、データフォルダの backups に保存します。データと同じディスクにあるため、ディスクが壊れると一緒に失われます。書き出しの代わりにはなりません。',
    update_available:
      'バージョン {version} があります。ポータブル版は自動更新されません。新しい zip をダウンロードし、このフォルダに上書きで展開してください。データはそのまま残ります。',
    update_open_download: 'ダウンロードページを開く',
  },
}
