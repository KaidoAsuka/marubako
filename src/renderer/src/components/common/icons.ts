// The one place that knows which icon library the interface uses. Components import purpose-named
// icons (IconDelete, IconTabFolder, ...) from here and never import the library directly, so
// switching libraries later means editing this file only (a unit test enforces that).
//
// Rules:
// - The app root sets IconContext to size 16 and weight "duotone" (see IconProvider).
// - Selected states (current tab, enabled pin) pass weight="fill".
// - Icons drawn at 14px or smaller are "regular": the pale duotone layer turns muddy at that size.
//   The wrapper below applies that automatically, so call sites only pass `size`.
// - Every icon is imported from its own module (`dist/csr/<Name>`), not from the package barrel. The
//   bundle is the same either way, but the barrel re-exports ~1500 icons: loading it costs seconds in
//   every unit-test process and in the dev server, loading one icon module costs a millisecond.
import { createElement, forwardRef, type ReactNode } from 'react'
import { ArrowElbowDownLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowElbowDownLeft'
import { ArrowUDownLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowUDownLeft'
import { ArrowUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUpRight'
import { CalendarBlankIcon } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft'
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight'
import { CaretUpIcon } from '@phosphor-icons/react/dist/csr/CaretUp'
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleIcon } from '@phosphor-icons/react/dist/csr/Circle'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy'
import { DatabaseIcon } from '@phosphor-icons/react/dist/csr/Database'
import { DotsSixVerticalIcon } from '@phosphor-icons/react/dist/csr/DotsSixVertical'
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye'
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash'
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText'
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/csr/FloppyDisk'
import { FolderIcon } from '@phosphor-icons/react/dist/csr/Folder'
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen'
import { GlobeIcon } from '@phosphor-icons/react/dist/csr/Globe'
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info'
import { KeyIcon } from '@phosphor-icons/react/dist/csr/Key'
import { KeyboardIcon } from '@phosphor-icons/react/dist/csr/Keyboard'
import { LightningIcon } from '@phosphor-icons/react/dist/csr/Lightning'
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets'
import { ListChecksIcon } from '@phosphor-icons/react/dist/csr/ListChecks'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { MonitorIcon } from '@phosphor-icons/react/dist/csr/Monitor'
import { NoteIcon } from '@phosphor-icons/react/dist/csr/Note'
import { PaletteIcon } from '@phosphor-icons/react/dist/csr/Palette'
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin'
import { RocketLaunchIcon } from '@phosphor-icons/react/dist/csr/RocketLaunch'
import { SkipForwardIcon } from '@phosphor-icons/react/dist/csr/SkipForward'
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal'
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour'
import { TerminalWindowIcon } from '@phosphor-icons/react/dist/csr/TerminalWindow'
import { TranslateIcon } from '@phosphor-icons/react/dist/csr/Translate'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle'
import { WarningIcon } from '@phosphor-icons/react/dist/csr/Warning'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { IconContext } from '@phosphor-icons/react/dist/lib/context'
import type {
  Icon,
  IconProps,
  IconWeight,
} from '@phosphor-icons/react/dist/lib/types'

export type { Icon, IconProps, IconWeight }

/** Defaults every icon inherits from the app root. */
export const ICON_DEFAULTS = { size: 16, weight: 'duotone' } as const

/** Icons at this size or smaller are drawn with the plain "regular" weight. */
export const SMALL_ICON_MAX_SIZE = 14

/** Wraps the app (or a test tree) so icons get the shared size and weight. */
export function IconProvider({
  children,
}: {
  children: ReactNode
}): JSX.Element {
  return createElement(IconContext.Provider, { value: ICON_DEFAULTS }, children)
}

// Decorative by default (the control around an icon carries the label), and "regular" at small sizes
// unless the caller asks for a weight (for example "fill" for a selected state).
function adapt(Base: Icon, displayName: string): Icon {
  const Wrapped = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
    const small =
      typeof props.size === 'number' && props.size <= SMALL_ICON_MAX_SIZE
    const weight: IconWeight | undefined =
      props.weight ?? (small ? 'regular' : undefined)

    return createElement(Base, {
      'aria-hidden': true,
      ...props,
      ...(weight ? { weight } : {}),
      ref,
    })
  })
  Wrapped.displayName = displayName

  return Wrapped as Icon
}

// Category tabs, section empty states and the "new group" button.
export const IconTabFolder = /* @__PURE__ */ adapt(FolderIcon, 'IconTabFolder')
export const IconTabWebsite = /* @__PURE__ */ adapt(GlobeIcon, 'IconTabWebsite')
export const IconTabApp = /* @__PURE__ */ adapt(RocketLaunchIcon, 'IconTabApp')
export const IconTabPassword = /* @__PURE__ */ adapt(KeyIcon, 'IconTabPassword')
export const IconTabCommand = /* @__PURE__ */ adapt(
  TerminalWindowIcon,
  'IconTabCommand'
)
export const IconTabNote = /* @__PURE__ */ adapt(FileTextIcon, 'IconTabNote')
export const IconTabTask = /* @__PURE__ */ adapt(ListChecksIcon, 'IconTabTask')
export const IconNewGroup = /* @__PURE__ */ adapt(FolderIcon, 'IconNewGroup')

// Title bar and toolbars.
export const IconSearch = /* @__PURE__ */ adapt(
  MagnifyingGlassIcon,
  'IconSearch'
)
export const IconPin = /* @__PURE__ */ adapt(PushPinIcon, 'IconPin')
export const IconSettings = /* @__PURE__ */ adapt(
  SlidersHorizontalIcon,
  'IconSettings'
)
export const IconClose = /* @__PURE__ */ adapt(XIcon, 'IconClose')
export const IconViewGrid = /* @__PURE__ */ adapt(
  SquaresFourIcon,
  'IconViewGrid'
)
export const IconViewList = /* @__PURE__ */ adapt(
  ListBulletsIcon,
  'IconViewList'
)

// Actions on entries, groups and tasks.
export const IconAdd = /* @__PURE__ */ adapt(PlusIcon, 'IconAdd')
export const IconEdit = /* @__PURE__ */ adapt(PencilSimpleIcon, 'IconEdit')
export const IconDelete = /* @__PURE__ */ adapt(TrashIcon, 'IconDelete')
export const IconCopy = /* @__PURE__ */ adapt(CopyIcon, 'IconCopy')
export const IconOpen = /* @__PURE__ */ adapt(ArrowUpRightIcon, 'IconOpen')
export const IconShow = /* @__PURE__ */ adapt(EyeIcon, 'IconShow')
export const IconHide = /* @__PURE__ */ adapt(EyeSlashIcon, 'IconHide')
export const IconBrowse = /* @__PURE__ */ adapt(FolderOpenIcon, 'IconBrowse')
export const IconSave = /* @__PURE__ */ adapt(FloppyDiskIcon, 'IconSave')
export const IconDragHandle = /* @__PURE__ */ adapt(
  DotsSixVerticalIcon,
  'IconDragHandle'
)

// Disclosure arrows and the date navigator.
export const IconExpandGroup = /* @__PURE__ */ adapt(
  CaretRightIcon,
  'IconExpandGroup'
)
export const IconCaretDown = /* @__PURE__ */ adapt(
  CaretDownIcon,
  'IconCaretDown'
)
export const IconCaretUp = /* @__PURE__ */ adapt(CaretUpIcon, 'IconCaretUp')
export const IconPreviousDay = /* @__PURE__ */ adapt(
  CaretLeftIcon,
  'IconPreviousDay'
)
export const IconNextDay = /* @__PURE__ */ adapt(CaretRightIcon, 'IconNextDay')
export const IconCalendar = /* @__PURE__ */ adapt(
  CalendarBlankIcon,
  'IconCalendar'
)

// Task and save states.
export const IconDone = /* @__PURE__ */ adapt(CheckIcon, 'IconDone')
export const IconTodo = /* @__PURE__ */ adapt(CircleIcon, 'IconTodo')
export const IconDoing = /* @__PURE__ */ adapt(CircleNotchIcon, 'IconDoing')
export const IconSkip = /* @__PURE__ */ adapt(SkipForwardIcon, 'IconSkip')

// Feedback: toasts, banners and error pages.
export const IconSuccess = /* @__PURE__ */ adapt(CheckCircleIcon, 'IconSuccess')
export const IconError = /* @__PURE__ */ adapt(WarningCircleIcon, 'IconError')
export const IconWarning = /* @__PURE__ */ adapt(WarningIcon, 'IconWarning')
export const IconInfo = /* @__PURE__ */ adapt(InfoIcon, 'IconInfo')
export const IconErrorMark = /* @__PURE__ */ adapt(
  LightningIcon,
  'IconErrorMark'
)

// Search palette, editors and forms.
export const IconEnter = /* @__PURE__ */ adapt(
  ArrowElbowDownLeftIcon,
  'IconEnter'
)
export const IconShortcuts = /* @__PURE__ */ adapt(
  KeyboardIcon,
  'IconShortcuts'
)
export const IconWrapText = /* @__PURE__ */ adapt(
  ArrowUDownLeftIcon,
  'IconWrapText'
)
export const IconNewNote = /* @__PURE__ */ adapt(NoteIcon, 'IconNewNote')

// The first-run card.
export const IconLanguage = /* @__PURE__ */ adapt(TranslateIcon, 'IconLanguage')

// Settings sections.
export const IconSettingsAppearance = /* @__PURE__ */ adapt(
  PaletteIcon,
  'IconSettingsAppearance'
)
export const IconSettingsBehavior = /* @__PURE__ */ adapt(
  MonitorIcon,
  'IconSettingsBehavior'
)
export const IconSettingsData = /* @__PURE__ */ adapt(
  DatabaseIcon,
  'IconSettingsData'
)
