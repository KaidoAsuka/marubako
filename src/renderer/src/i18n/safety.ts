import type { Lang } from '../../../shared/types'

/**
 * Strings of iteration 5, package "safety": the password security boundary, how a failed open
 * is described, the export result. Kept apart from workspace.ts so that the packages of one
 * iteration do not all append to the same block. `use-i18n` reads this table as well.
 */
export const safetyStrings: Record<Lang, Record<string, string>> = {
  zh: {
    // The note at the top of the passwords page, there until its cross is clicked.
    pwd_safety_title: '密码仅作便捷存放，不是密码管理器',
    pwd_safety_dismiss: '知道了，不再显示',
    pwd_safety_body:
      '密码只保存在这台电脑上，用当前 Windows 账户加密。能登录这个 Windows 账户的人都可以查看它们。重要账号的密码请使用专门的密码管理器。',
    // Said after an export that was written without the passwords.
    export_success_no_passwords: '已导出备份（不含密码）',
    // An entry that would not open: what is wrong, by the code the main process gives. {name} is
    // the entry's name. The button beside it opens the entry's form at the field to fix.
    open_err_path_missing:
      '找不到「{name}」：路径已被移动、删除，或所在的磁盘还没有连接。',
    open_err_not_a_folder: '「{name}」的路径无效：其中某一段不是文件夹。',
    open_err_invalid_path: '「{name}」的路径格式不正确。',
    open_err_no_permission:
      '没有权限打开「{name}」，请检查文件或文件夹的权限。',
    open_err_app_missing: '找不到程序「{name}」：它可能已被卸载或移动。',
    open_err_invalid_url: '「{name}」的网址无效。',
    open_err_open_failed: '无法打开「{name}」：可能没有与之关联的程序。',
    open_err_unknown: '无法打开「{name}」，请重试。',
    open_edit: '编辑',
  },
  en: {
    pwd_safety_title: 'Convenient storage, not a password manager',
    pwd_safety_dismiss: 'Got it, don’t show again',
    pwd_safety_body:
      'Passwords stay on this computer, encrypted with your current Windows account. Anyone who can sign in to this Windows account can view them. For important accounts, use a dedicated password manager.',
    export_success_no_passwords: 'Backup exported (without passwords)',
    open_err_path_missing:
      'Can’t find “{name}”: its path was moved or deleted, or its drive isn’t connected.',
    open_err_not_a_folder:
      '“{name}” has an invalid path: part of it is not a folder.',
    open_err_invalid_path: 'The path of “{name}” isn’t valid.',
    open_err_no_permission:
      'Access to “{name}” was denied. Check its permissions.',
    open_err_app_missing:
      'Can’t find the program “{name}”: it may have been uninstalled or moved.',
    open_err_invalid_url: 'The address of “{name}” isn’t valid.',
    open_err_open_failed:
      'Couldn’t open “{name}”: there may be no app associated with it.',
    open_err_unknown: 'Couldn’t open “{name}”. Please try again.',
    open_edit: 'Edit',
  },
  ja: {
    pwd_safety_title: 'パスワードマネージャーではなく、簡易保管用です',
    pwd_safety_dismiss: '了解しました。今後は表示しない',
    pwd_safety_body:
      'パスワードはこのコンピューターにのみ保存され、現在の Windows アカウントで暗号化されます。この Windows アカウントにサインインできる人は誰でも閲覧できます。重要なアカウントには、専用のパスワードマネージャーをお使いください。',
    export_success_no_passwords:
      'バックアップを書き出しました（パスワードなし）',
    open_err_path_missing:
      '「{name}」が見つかりません。パスが移動・削除されたか、ドライブが接続されていません。',
    open_err_not_a_folder:
      '「{name}」のパスが正しくありません。途中の項目がフォルダーではありません。',
    open_err_invalid_path: '「{name}」のパスの形式が正しくありません。',
    open_err_no_permission:
      '「{name}」を開く権限がありません。アクセス許可を確認してください。',
    open_err_app_missing:
      'プログラム「{name}」が見つかりません。アンインストールまたは移動された可能性があります。',
    open_err_invalid_url: '「{name}」の URL が正しくありません。',
    open_err_open_failed:
      '「{name}」を開けませんでした。関連付けられたアプリがない可能性があります。',
    open_err_unknown: '「{name}」を開けませんでした。もう一度お試しください。',
    open_edit: '編集',
  },
}
