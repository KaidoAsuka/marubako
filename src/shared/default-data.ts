import { DEFAULT_SHORTCUT } from './accelerator'
import { DEFAULT_PEEK_COLLAPSE_DELAY, DEFAULT_STARTUP_TAB } from './types'
import type {
  AppData,
  AppItem,
  FolderItem,
  Group,
  Lang,
  LooseCollections,
  NoteItem,
  PasswordItem,
  Prefs,
  TaskItem,
  TopOrderCollections,
  WebsiteItem,
  WindowState,
} from './types'

function starterWindowState(): WindowState {
  return {
    bounds: undefined,
    opacity: 1,
    alwaysOnTop: false,
    collapsed: false,
    preCollapseHeight: 700,
  }
}

function starterPrefs(lang: Lang): Prefs {
  return {
    lang,
    theme: 'dark',
    background: 'aurora',
    browser: 'default',
    zoom: 1,
    opacity: 1,
    motion: 1.35,
    peekCollapseDelay: DEFAULT_PEEK_COLLAPSE_DELAY,
    viewMode: 'grid',
    lastTab: DEFAULT_STARTUP_TAB,
    hiddenTabs: [],
    shortcut: DEFAULT_SHORTCUT,
    shortcutEnabled: true,
    hideAfterLaunch: false,
    showBubble: true,
  }
}

function starterLoose(): LooseCollections {
  return {
    folders: [],
    websites: [],
    apps: [],
    passwords: [],
    notes: [],
    commands: [],
  }
}

function starterTopOrder(ids: {
  folders: string[]
  websites: string[]
  apps: string[]
  passwords: string[]
  notes: string[]
  commands: string[]
}): TopOrderCollections {
  return {
    folders: ids.folders.map((id) => ({ type: 'group', id })),
    websites: ids.websites.map((id) => ({ type: 'group', id })),
    apps: ids.apps.map((id) => ({ type: 'group', id })),
    passwords: ids.passwords.map((id) => ({ type: 'group', id })),
    notes: ids.notes.map((id) => ({ type: 'group', id })),
    commands: ids.commands.map((id) => ({ type: 'group', id })),
  }
}

/**
 * The words of the sample data, per language. Ids, icons, URLs and the placeholder path prefix
 * are shared. The prefix 'C:\\Users\\用户名\\' stays as it is in every language: the data store
 * resolves the real folders of the computer by that prefix (data-store.ts, resolveStarterPaths).
 */
interface StarterText {
  folderWork: string
  folderLife: string
  desktop: string
  documents: string
  downloads: string
  siteTools: string
  siteFun: string
  passwordGroup: string
  noteGroup: string
  noteName: string
  noteContent: string
}

const STARTER_TEXT: Record<Lang, StarterText> = {
  zh: {
    folderWork: '工作文件',
    folderLife: '个人',
    desktop: '桌面',
    documents: '文档',
    downloads: '下载',
    siteTools: '常用工具',
    siteFun: '娱乐',
    passwordGroup: '常用账号',
    noteGroup: '备忘',
    noteName: '使用说明',
    noteContent:
      '全局唤起快捷键可在设置中查看\nCtrl + K 搜索所有条目与任务\n方向键选择，回车打开\nAlt + 数字键切换分类，Ctrl + N 新建\n密码和命令可一键复制\nEsc 关闭弹窗或收起到悬浮球',
  },
  en: {
    folderWork: 'Work files',
    folderLife: 'Personal',
    desktop: 'Desktop',
    documents: 'Documents',
    downloads: 'Downloads',
    siteTools: 'Everyday tools',
    siteFun: 'Fun',
    passwordGroup: 'Accounts',
    noteGroup: 'Notes',
    noteName: 'How to use',
    noteContent:
      'The global shortcut is listed in Settings\nCtrl + K searches every item and task\nArrow keys select, Enter opens\nAlt + number switches category, Ctrl + N adds a new item\nPasswords and commands copy in one click\nEsc closes a dialog or collapses the panel to the bubble',
  },
  ja: {
    folderWork: '仕事のファイル',
    folderLife: '個人',
    desktop: 'デスクトップ',
    documents: 'ドキュメント',
    downloads: 'ダウンロード',
    siteTools: 'よく使うツール',
    siteFun: 'エンタメ',
    passwordGroup: 'アカウント',
    noteGroup: 'メモ',
    noteName: '使い方',
    noteContent:
      '呼び出しショートカットは設定で確認できます\nCtrl + K ですべての項目とタスクを検索\n矢印キーで選択、Enter で開く\nAlt + 数字キーでカテゴリを切り替え、Ctrl + N で新規作成\nパスワードとコマンドはワンクリックでコピー\nEsc でダイアログを閉じる、またはフローティングボタンに収納',
  },
}

interface StarterSite {
  id: string
  name: string
  url: string
  icon: string
}

const GITHUB: StarterSite = {
  id: 'site-github',
  name: 'GitHub',
  url: 'https://github.com',
  icon: 'tile:github-logo:11',
}

const GOOGLE: StarterSite = {
  id: 'site-google',
  name: 'Google',
  url: 'https://google.com',
  icon: 'tile:google-logo:7',
}

const YOUTUBE: StarterSite = {
  id: 'site-youtube',
  name: 'YouTube',
  url: 'https://youtube.com',
  icon: 'tile:youtube-logo:7',
}

// Google and YouTube do not load for much of the Chinese-speaking world, so the Chinese sample
// sites are a search engine and a video site that do (Bing, Bilibili). GitHub is the same
// everywhere, and English and Japanese keep Google and YouTube.
const STARTER_TOOL_SITES: Record<Lang, StarterSite[]> = {
  zh: [
    {
      id: 'site-bing',
      name: '必应',
      url: 'https://cn.bing.com',
      icon: 'tile:magnifying-glass:2',
    },
    GITHUB,
  ],
  en: [GOOGLE, GITHUB],
  ja: [GOOGLE, GITHUB],
}

const STARTER_FUN_SITES: Record<Lang, StarterSite[]> = {
  zh: [
    {
      id: 'site-bilibili',
      name: '哔哩哔哩',
      url: 'https://www.bilibili.com',
      icon: 'tile:monitor-play:9',
    },
  ],
  en: [YOUTUBE],
  ja: [YOUTUBE],
}

function folderGroups(text: StarterText): Group<FolderItem>[] {
  return [
    {
      id: 'grp-folders-work',
      name: text.folderWork,
      icon: 'tile:briefcase:1',
      open: true,
      items: [
        {
          id: 'folder-desktop',
          kind: 'folder',
          name: text.desktop,
          path: 'C:\\Users\\用户名\\Desktop',
          icon: 'tile:desktop:1',
        },
        {
          id: 'folder-documents',
          kind: 'folder',
          name: text.documents,
          path: 'C:\\Users\\用户名\\Documents',
          icon: 'tile:file-text:2',
        },
      ],
    },
    {
      id: 'grp-folders-life',
      name: text.folderLife,
      icon: 'tile:house:3',
      open: false,
      items: [
        {
          id: 'folder-downloads',
          kind: 'folder',
          name: text.downloads,
          path: 'C:\\Users\\用户名\\Downloads',
          icon: 'tile:download-simple:4',
        },
      ],
    },
  ]
}

function websiteItems(sites: StarterSite[]): WebsiteItem[] {
  return sites.map((site) => ({ ...site, kind: 'website' as const }))
}

function websiteGroups(lang: Lang, text: StarterText): Group<WebsiteItem>[] {
  return [
    {
      id: 'grp-sites-tools',
      name: text.siteTools,
      icon: 'tile:wrench:6',
      open: true,
      items: websiteItems(STARTER_TOOL_SITES[lang]),
    },
    {
      id: 'grp-sites-fun',
      name: text.siteFun,
      icon: 'tile:game-controller:8',
      open: false,
      items: websiteItems(STARTER_FUN_SITES[lang]),
    },
  ]
}

function appGroups(): Group<AppItem>[] {
  return []
}

function passwordGroups(text: StarterText): Group<PasswordItem>[] {
  return [
    {
      id: 'grp-passwords-default',
      name: text.passwordGroup,
      icon: 'tile:lock-key:5',
      open: true,
      items: [],
    },
  ]
}

function noteGroups(text: StarterText): Group<NoteItem>[] {
  return [
    {
      id: 'grp-notes-default',
      name: text.noteGroup,
      icon: 'tile:clipboard-text:3',
      open: true,
      items: [
        {
          id: 'note-usage',
          kind: 'note',
          name: text.noteName,
          content: text.noteContent,
          icon: 'tile:lightbulb:5',
        },
      ],
    },
  ]
}

function starterTasks(): Record<string, TaskItem[]> {
  return {}
}

/**
 * The data of a new installation, with the sample groups and entries in `lang`. Chinese is the
 * default because the normaliser and many tests depend on it; the main process passes the language
 * of the system for a first start (initial-lang.ts).
 */
export function createDefaultAppData(lang: Lang = 'zh'): AppData {
  const text = STARTER_TEXT[lang]
  const folders = folderGroups(text)
  const websites = websiteGroups(lang, text)
  const apps = appGroups()
  const passwords = passwordGroups(text)
  const notes = noteGroups(text)
  const loose = starterLoose()

  return {
    schemaVersion: 2,
    prefs: starterPrefs(lang),
    window: starterWindowState(),
    folders,
    websites,
    apps,
    passwords,
    notes,
    commands: [],
    loose,
    topOrder: starterTopOrder({
      folders: folders.map((group) => group.id),
      websites: websites.map((group) => group.id),
      apps: apps.map((group) => group.id),
      passwords: passwords.map((group) => group.id),
      notes: notes.map((group) => group.id),
      commands: [],
    }),
    tasks: starterTasks(),
  }
}
