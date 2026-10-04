import type { Tab } from '../../../../shared/types'
import {
  type Icon,
  IconTabApp,
  IconTabCommand,
  IconTabFolder,
  IconTabNote,
  IconTabPassword,
  IconTabTask,
  IconTabWebsite,
} from './icons'

/** The icon of every category: the tab row and the "show categories" switches in the settings use these. */
export const TAB_ICONS: Record<Tab, Icon> = {
  folders: IconTabFolder,
  websites: IconTabWebsite,
  apps: IconTabApp,
  passwords: IconTabPassword,
  commands: IconTabCommand,
  notes: IconTabNote,
  tasks: IconTabTask,
}
