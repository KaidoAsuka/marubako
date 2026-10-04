import type { GroupTab } from './types'

// Icons given to new entries, groups and tasks, and to stored ones that have none at all. They are
// `tile:<glyph>:<colour>` values (see renderer/src/utils/tile-icon.ts); a test checks that every glyph
// and colour index here exists in the tile catalog. Each category has its own colour, shared by its
// items and its groups, so a mixed list stays easy to scan.

export const DEFAULT_ITEM_ICONS: Readonly<Record<GroupTab, string>> = {
  folders: 'tile:folder:0',
  websites: 'tile:globe:1',
  apps: 'tile:rocket-launch:6',
  passwords: 'tile:key:5',
  notes: 'tile:note:3',
  commands: 'tile:terminal-window:2',
}

export const DEFAULT_GROUP_ICONS: Readonly<Record<GroupTab, string>> = {
  folders: 'tile:folders:0',
  websites: 'tile:folders:1',
  apps: 'tile:folders:6',
  passwords: 'tile:folders:5',
  notes: 'tile:folders:3',
  commands: 'tile:folders:2',
}

export const DEFAULT_TASK_ICON = 'tile:target:7'
