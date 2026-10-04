import { DEFAULT_SHORTCUT } from './accelerator'
import { DOCK_BALL_SIZE } from './dock-size'
import { DEFAULT_PEEK_COLLAPSE_DELAY, DEFAULT_STARTUP_TAB } from './types'
import type {
  AppData,
  AppItem,
  CommandItem,
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
    theme: 'light',
    // Graphite: the quiet accent. The other accents are a choice in the settings.
    background: 'minimal',
    browser: 'default',
    zoom: 1,
    opacity: 1,
    motion: 1.35,
    peekCollapseDelay: DEFAULT_PEEK_COLLAPSE_DELAY,
    viewMode: 'list',
    lastTab: DEFAULT_STARTUP_TAB,
    hiddenTabs: [],
    shortcut: DEFAULT_SHORTCUT,
    shortcutEnabled: true,
    hideAfterLaunch: false,
    showBubble: true,
    ballSize: DOCK_BALL_SIZE,
    fontFamily: '',
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
 * The words of the sample data. Ids, icons, URLs and the placeholder path prefix are shared. The
 * prefix 'C:\\Users\\用户名\\' stays as it is in every language: the data store resolves the real
 * folders of the computer by that prefix (data-store.ts, resolveStarterPaths).
 */
interface StarterText {
  folderWork: string
  folderLife: string
  desktop: string
  documents: string
  downloads: string
  siteTools: string
  siteFun: string
  appGroup: string
  appCmd: string
  passwordGroup: string
  passwordName: string
  passwordNote: string
  noteGroup: string
  noteName: string
  noteContent: string
  commandGroup: string
  commandName: string
  commandDescription: string
}

// One set of words for every language, in English. The samples are the same on every computer,
// whatever language the first start picks (and however that guess turns out), and the sample
// folders are named as Windows itself names them in a path.
const STARTER_TEXT: StarterText = {
  folderWork: 'Work files',
  folderLife: 'Personal',
  desktop: 'Desktop',
  documents: 'Documents',
  downloads: 'Downloads',
  siteTools: 'Everyday tools',
  siteFun: 'Fun',
  appGroup: 'Terminals',
  appCmd: 'Command Prompt',
  passwordGroup: 'Accounts',
  passwordName: 'Example account',
  passwordNote:
    'A sample: replace it with an account of your own, or delete it.',
  noteGroup: 'Notes',
  noteName: 'How to use',
  noteContent:
    'The global shortcut is listed in Settings\nCtrl + K searches every item and task\nArrow keys select, Enter opens\nAlt + number switches category, Ctrl + N adds a new item\nPasswords and commands copy in one click\nEsc closes a dialog or collapses the panel to the bubble',
  commandGroup: 'Network',
  commandName: 'Flush the DNS cache',
  commandDescription:
    'For when a site will not load after its address changed.',
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

function websiteGroups(text: StarterText): Group<WebsiteItem>[] {
  return [
    {
      id: 'grp-sites-tools',
      name: text.siteTools,
      icon: 'tile:wrench:6',
      open: true,
      items: websiteItems([GOOGLE, GITHUB]),
    },
    {
      id: 'grp-sites-fun',
      name: text.siteFun,
      icon: 'tile:game-controller:8',
      open: false,
      items: websiteItems([YOUTUBE]),
    },
  ]
}

// Two programs every Windows computer has. %SystemRoot% is expanded when the entry is opened.
function appGroups(text: StarterText): Group<AppItem>[] {
  return [
    {
      id: 'grp-apps-terminals',
      name: text.appGroup,
      icon: 'tile:terminal-window:11',
      open: true,
      items: [
        {
          id: 'app-powershell',
          kind: 'app',
          name: 'PowerShell',
          path: '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          icon: 'tile:terminal-window:1',
        },
        {
          id: 'app-cmd',
          kind: 'app',
          name: text.appCmd,
          path: '%SystemRoot%\\System32\\cmd.exe',
          icon: 'tile:terminal-window:11',
        },
      ],
    },
  ]
}

// The sample account shows what an entry looks like; its password is a made-up word, not a secret.
function passwordGroups(text: StarterText): Group<PasswordItem>[] {
  return [
    {
      id: 'grp-passwords-default',
      name: text.passwordGroup,
      icon: 'tile:lock-key:5',
      open: true,
      items: [
        {
          id: 'password-example',
          kind: 'password',
          name: text.passwordName,
          username: 'you@example.com',
          password: 'example-password',
          note: text.passwordNote,
          icon: 'tile:user-circle:1',
        },
      ],
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

function commandGroups(text: StarterText): Group<CommandItem>[] {
  return [
    {
      id: 'grp-commands-default',
      name: text.commandGroup,
      icon: 'tile:terminal-window:2',
      open: true,
      items: [
        {
          id: 'command-flush-dns',
          kind: 'command',
          name: text.commandName,
          content: 'ipconfig /flushdns',
          language: 'powershell',
          description: text.commandDescription,
          icon: 'tile:arrows-clockwise:2',
        },
      ],
    },
  ]
}

function starterTasks(): Record<string, TaskItem[]> {
  return {}
}

/**
 * The data of a new installation. `lang` is the language of the interface only (Chinese is the
 * default because the normaliser and many tests depend on it; the main process passes the language
 * of the system for a first start, initial-lang.ts). The sample groups and entries are the same in
 * every language.
 */
export function createDefaultAppData(lang: Lang = 'zh'): AppData {
  const text = STARTER_TEXT
  const folders = folderGroups(text)
  const websites = websiteGroups(text)
  const apps = appGroups(text)
  const passwords = passwordGroups(text)
  const notes = noteGroups(text)
  const commands = commandGroups(text)
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
    commands,
    loose,
    topOrder: starterTopOrder({
      folders: folders.map((group) => group.id),
      websites: websites.map((group) => group.id),
      apps: apps.map((group) => group.id),
      passwords: passwords.map((group) => group.id),
      notes: notes.map((group) => group.id),
      commands: commands.map((group) => group.id),
    }),
    tasks: starterTasks(),
  }
}
