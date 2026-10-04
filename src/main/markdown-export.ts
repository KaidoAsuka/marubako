import {
  GROUP_TABS,
  type AnyGroupItem,
  type AppData,
  type Group,
  type GroupTab,
  type Lang,
  type PasswordItem,
  type Tab,
  type TaskStatus,
} from '../shared/types'

/**
 * The data as a list a person can read: one Markdown file, by category and group, that opens in
 * Notepad. It is the copy for the day the program itself is not there to show the data. It is not
 * a backup the program can read again: that is the JSON export.
 */

export interface MarkdownLabels {
  title: string
  exported: (when: string, version: string) => string
  readOnly: string
  passwordsIncluded: string
  passwordsOmitted: string
  tabs: Record<Tab, string>
  /** The heading over the items of a category that are in no group. */
  loose: string
  nothing: string
  path: string
  url: string
  username: string
  password: string
  note: string
  passwordNotExported: string
  passwordUnreadable: string
  status: Record<TaskStatus, string>
}

export const markdownLabels: Record<Lang, MarkdownLabels> = {
  zh: {
    title: 'Marubako 数据清单',
    exported: (when, version) => `导出时间：${when}（Marubako ${version}）`,
    readOnly:
      '这个文件只用来查看，不能导入回 Marubako。要备份和恢复，请用「导出数据」得到的 JSON 文件。',
    passwordsIncluded: '注意：这个文件里有明文密码，请妥善保管。',
    passwordsOmitted: '这个文件不含密码。',
    tabs: {
      folders: '文件夹',
      websites: '网站',
      apps: '软件',
      passwords: '密码',
      commands: '命令',
      notes: '备忘',
      tasks: '任务',
    },
    loose: '独立条目',
    nothing: '（空）',
    path: '路径',
    url: '网址',
    username: '账号',
    password: '密码',
    note: '备注',
    passwordNotExported: '（未导出）',
    passwordUnreadable: '（这台电脑上读不出来，需要重新填写）',
    status: { todo: '待办', doing: '进行中', skip: '跳过', done: '已完成' },
  },
  en: {
    title: 'Marubako data list',
    exported: (when, version) => `Exported: ${when} (Marubako ${version})`,
    readOnly:
      'This file is for reading only and cannot be imported into Marubako. To back up and restore, use the JSON file that “Export data” makes.',
    passwordsIncluded:
      'Careful: this file holds passwords in plain text. Keep it safe.',
    passwordsOmitted: 'This file holds no passwords.',
    tabs: {
      folders: 'Folders',
      websites: 'Sites',
      apps: 'Apps',
      passwords: 'Passwords',
      commands: 'Commands',
      notes: 'Notes',
      tasks: 'Tasks',
    },
    loose: 'Standalone items',
    nothing: '(empty)',
    path: 'Path',
    url: 'Address',
    username: 'Username',
    password: 'Password',
    note: 'Note',
    passwordNotExported: '(not exported)',
    passwordUnreadable: '(cannot be read on this PC; it has to be typed again)',
    status: {
      todo: 'Todo',
      doing: 'In progress',
      skip: 'Skipped',
      done: 'Done',
    },
  },
  ja: {
    title: 'Marubako データ一覧',
    exported: (when, version) => `書き出し日時: ${when}（Marubako ${version}）`,
    readOnly:
      'このファイルは読むためのもので、Marubako に読み込むことはできません。バックアップと復元には、「データを書き出す」で作る JSON ファイルを使ってください。',
    passwordsIncluded:
      '注意：このファイルにはパスワードがそのまま書かれています。大切に保管してください。',
    passwordsOmitted: 'このファイルにパスワードは含まれていません。',
    tabs: {
      folders: 'フォルダ',
      websites: 'サイト',
      apps: 'アプリ',
      passwords: 'パスワード',
      commands: 'コマンド',
      notes: 'メモ',
      tasks: 'タスク',
    },
    loose: '独立した項目',
    nothing: '（なし）',
    path: 'パス',
    url: 'アドレス',
    username: 'アカウント',
    password: 'パスワード',
    note: '備考',
    passwordNotExported: '（書き出していません）',
    passwordUnreadable:
      '（この PC では読み取れません。入力し直す必要があります）',
    status: {
      todo: '未着手',
      doing: '進行中',
      skip: 'スキップ',
      done: '完了',
    },
  },
}

export interface MarkdownOptions {
  lang: Lang
  includePasswords: boolean
  exportedAt: Date
  version: string
}

const two = (value: number): string => String(value).padStart(2, '0')

function localStamp(date: Date): string {
  return (
    `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ` +
    `${two(date.getHours())}:${two(date.getMinutes())}`
  )
}

/** The longest run of backticks in a text. */
function longestBackticks(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
}

/**
 * A name on one line, as plain text: only what would start Markdown of its own inside a heading or
 * bold text is escaped, so that the file still reads well in Notepad.
 */
function plain(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .replace(/[\\*`<[\]]/g, '\\$&')
}

/** A value shown exactly as it is (a path, a user name, a password), on one line. */
function exact(text: string): string {
  const value = text.replace(/[\r\n]+/g, ' ')
  const fence = '`'.repeat(longestBackticks(value) + 1)
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${value}${pad}${fence}`
}

/** A block shown exactly as it is (a note, a command), whatever it holds. */
function block(text: string, language = ''): string[] {
  const fence = '`'.repeat(Math.max(3, longestBackticks(text) + 1))
  return [`${fence}${language}`, ...text.split(/\r?\n/), fence]
}

/** Free text under a list entry: its lines stay lines, indented so that they belong to the entry. */
function indented(text: string, indent: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `${indent}${line}` : ''))
}

function passwordText(
  item: PasswordItem,
  labels: MarkdownLabels,
  includePasswords: boolean
): string {
  if (item.passwordLost) return labels.passwordUnreadable
  if (item.password === '') return labels.nothing
  return includePasswords ? exact(item.password) : labels.passwordNotExported
}

/** Lines that stand together; two blocks are an empty line apart. */
type Block = string[]

/** The entry of a folder, an app, a site or a password in the list of its group. */
function listLines(
  item: AnyGroupItem,
  labels: MarkdownLabels,
  includePasswords: boolean
): string[] {
  const name = plain(item.name) || labels.nothing
  switch (item.kind) {
    case 'folder':
    case 'app':
      return [`- **${name}**: ${item.path ? exact(item.path) : labels.nothing}`]
    case 'website':
      return [`- **${name}**: ${item.url ? exact(item.url) : labels.nothing}`]
    case 'password':
      return [
        `- **${name}**`,
        `  - ${labels.username}: ${item.username ? exact(item.username) : labels.nothing}`,
        `  - ${labels.password}: ${passwordText(item, labels, includePasswords)}`,
        ...(item.note.trim()
          ? [`  - ${labels.note}:`, ...indented(item.note.trim(), '    ')]
          : []),
      ]
    default:
      return []
  }
}

/** The items of one group: a list, or for commands and notes a heading and a block each. */
function itemBlocks(
  items: AnyGroupItem[],
  labels: MarkdownLabels,
  includePasswords: boolean
): Block[] {
  if (items.length === 0) return [[labels.nothing]]
  const blocks: Block[] = []
  const list: string[] = []
  for (const item of items) {
    if (item.kind === 'command' || item.kind === 'note') {
      blocks.push([`#### ${plain(item.name) || labels.nothing}`])
      if (item.kind === 'command' && item.description.trim())
        blocks.push(item.description.trim().split(/\r?\n/))
      blocks.push(
        block(
          item.content,
          item.kind === 'command' && item.language !== 'plaintext'
            ? item.language
            : ''
        )
      )
    } else {
      list.push(...listLines(item, labels, includePasswords))
    }
  }
  if (list.length > 0) blocks.push(list)
  return blocks
}

/** The groups and the loose items of a category in the order the panel shows them. */
function sections(
  data: AppData,
  tab: GroupTab
): Array<{ group: Group<AnyGroupItem> | null; items: AnyGroupItem[] }> {
  const groups = data[tab] as Group<AnyGroupItem>[]
  const loose = data.loose[tab] as AnyGroupItem[]
  const shownGroups = new Set<string>()
  const shownLoose = new Set<string>()
  const result: Array<{
    group: Group<AnyGroupItem> | null
    items: AnyGroupItem[]
  }> = []
  const addLoose = (item: AnyGroupItem): void => {
    shownLoose.add(item.id)
    const last = result[result.length - 1]
    // Loose items that follow each other stand under one heading.
    if (last && last.group === null) last.items.push(item)
    else result.push({ group: null, items: [item] })
  }

  for (const entry of data.topOrder[tab]) {
    if (entry.type === 'group') {
      const group = groups.find((candidate) => candidate.id === entry.id)
      if (!group || shownGroups.has(group.id)) continue
      shownGroups.add(group.id)
      result.push({ group, items: group.items })
    } else {
      const item = loose.find((candidate) => candidate.id === entry.id)
      if (item && !shownLoose.has(item.id)) addLoose(item)
    }
  }
  // Whatever the order does not name is still data, and is listed.
  for (const group of groups)
    if (!shownGroups.has(group.id)) result.push({ group, items: group.items })
  for (const item of loose) if (!shownLoose.has(item.id)) addLoose(item)
  return result
}

function categoryBlocks(
  data: AppData,
  tab: GroupTab,
  labels: MarkdownLabels,
  includePasswords: boolean
): Block[] {
  const parts = sections(data, tab)
  const count = parts.reduce((sum, part) => sum + part.items.length, 0)
  const blocks: Block[] = [[`## ${labels.tabs[tab]} (${count})`]]
  if (parts.length === 0) return [...blocks, [labels.nothing]]

  for (const { group, items } of parts) {
    blocks.push(
      [`### ${group ? plain(group.name) || labels.nothing : labels.loose}`],
      ...itemBlocks(items, labels, includePasswords)
    )
  }
  return blocks
}

/** "In progress" and "skipped" have no box of their own in Markdown: the word says it. */
function taskLine(
  indent: string,
  task: { name: string; status: TaskStatus },
  labels: MarkdownLabels
): string {
  const box = task.status === 'done' ? '[x]' : '[ ]'
  const word =
    task.status === 'doing' || task.status === 'skip'
      ? ` (${labels.status[task.status]})`
      : ''
  return `${indent}- ${box} ${plain(task.name) || labels.nothing}${word}`
}

function taskBlocks(data: AppData, labels: MarkdownLabels): Block[] {
  const days = Object.keys(data.tasks)
    .filter((day) => (data.tasks[day] ?? []).length > 0)
    .sort()
  const count = days.reduce(
    (sum, day) => sum + (data.tasks[day] ?? []).length,
    0
  )
  const blocks: Block[] = [[`## ${labels.tabs.tasks} (${count})`]]
  if (days.length === 0) return [...blocks, [labels.nothing]]

  for (const day of days) {
    blocks.push(
      [`### ${plain(day)}`],
      (data.tasks[day] ?? []).flatMap((task) => [
        taskLine('', task, labels),
        ...task.subtasks.map((subtask) => taskLine('  ', subtask, labels)),
      ])
    )
  }
  return blocks
}

/**
 * The whole file. Windows line ends and a byte order mark, so that Notepad on any Windows shows the
 * lines as lines and Chinese or Japanese text as what it is.
 */
export function buildMarkdown(data: AppData, options: MarkdownOptions): string {
  const labels = markdownLabels[options.lang]
  const blocks: Block[] = [
    [`# ${labels.title}`],
    [labels.exported(localStamp(options.exportedAt), options.version)],
    [
      `> ${labels.readOnly}`,
      '>',
      `> ${options.includePasswords ? labels.passwordsIncluded : labels.passwordsOmitted}`,
    ],
    ...GROUP_TABS.flatMap((tab) =>
      categoryBlocks(data, tab, labels, options.includePasswords)
    ),
    ...taskBlocks(data, labels),
  ]
  return `\ufeff${blocks.map((lines) => lines.join('\r\n')).join('\r\n\r\n')}\r\n`
}
