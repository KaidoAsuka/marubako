import { useEffect, useRef, useState } from 'react'
import {
  type Icon,
  IconDone,
  IconSettingsAppearance,
  IconSettingsBehavior,
  IconSettingsData,
  IconViewGrid,
  IconViewList,
} from '../common/icons'

import { DEFAULT_SHORTCUT } from '../../../../shared/accelerator'
import {
  DEFAULT_MOTION,
  MOTION_PERCENT_MAX,
  MOTION_PERCENT_MIN,
  MOTION_PERCENT_STEP,
  motionToPercent,
  percentToMotion,
} from '../../../../shared/motion-scale'
import { normalizeHiddenTabs, visibleTabs } from '../../../../shared/tabs'
import {
  ALL_TABS,
  DEFAULT_PEEK_COLLAPSE_DELAY,
  LANGS,
  MAX_PEEK_COLLAPSE_DELAY,
  MIN_OPACITY,
  THEME_SETTINGS,
  VIEW_MODES,
  type LaunchSettings,
  type Tab,
  type ThemeSetting,
  type ViewMode,
} from '../../../../shared/types'
import { useI18n } from '../../hooks/use-i18n'
import { useRadioKeys } from '../../hooks/use-radio-keys'
import { useShortcutCheck } from '../../hooks/use-shortcut-check'
import { useSystemDark } from '../../hooks/use-system-dark'
import { useAppStore } from '../../store/use-app-store'
import { resolveTheme } from '../../styles/background-theme'
import { rangeFill } from '../../utils/range-fill'
import FormField from '../common/FormField'
import { TAB_ICONS } from '../common/tab-icons'
import AboutSettings from './AboutSettings'
import AccentDots from './AccentDots'
import ShortcutSettings from './ShortcutSettings'

const settingsTabIcons: Record<'appearance' | 'behavior' | 'data', Icon> = {
  appearance: IconSettingsAppearance,
  behavior: IconSettingsBehavior,
  data: IconSettingsData,
}

const viewModeIcons: Record<ViewMode, Icon> = {
  grid: IconViewGrid,
  list: IconViewList,
}

export default function SettingsForm(): JSX.Element | null {
  const { t } = useI18n()
  const data = useAppStore((state) => state.data)
  const saving = useAppStore((state) => state.saving)
  const updateData = useAppStore((state) => state.updateData)
  const exportData = useAppStore((state) => state.exportData)
  const importData = useAppStore((state) => state.importData)
  const setModal = useAppStore((state) => state.setModal)
  const windowState = useAppStore((state) => state.windowState)
  const setOpacity = useAppStore((state) => state.setOpacity)
  const previewOpacity = useAppStore((state) => state.previewOpacity)
  const setPreviewPrefs = useAppStore((state) => state.setPreviewPrefs)
  // False as soon as the dialog starts closing, while it is still on screen for its exit animation.
  const isOpen = useAppStore((state) => state.modal?.kind === 'settings')
  const togglePin = useAppStore((state) => state.togglePin)
  const showToast = useAppStore((state) => state.showToast)
  const [section, setSection] = useState<'appearance' | 'behavior' | 'data'>(
    'appearance'
  )
  const [launchSettings, setLaunchSettings] = useState<LaunchSettings | null>(
    null
  )
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [hideAfterLaunch, setHideAfterLaunch] = useState(
    data?.prefs.hideAfterLaunch ?? false
  )
  const [showBubble, setShowBubble] = useState(data?.prefs.showBubble ?? true)
  const [theme, setTheme] = useState<ThemeSetting>(data?.prefs.theme ?? 'light')
  const themeKeys = useRadioKeys(THEME_SETTINGS, setTheme)
  // The accent dots are drawn in the theme the setting comes to right now.
  const systemDark = useSystemDark()
  const [background, setBackground] = useState(
    data?.prefs.background ?? 'minimal'
  )
  const [viewMode, setViewMode] = useState<ViewMode>(
    data?.prefs.viewMode ?? 'list'
  )
  const viewModeKeys = useRadioKeys(VIEW_MODES, setViewMode)
  const [language, setLanguage] = useState(data?.prefs.lang ?? 'zh')
  const [browser, setBrowser] = useState(data?.prefs.browser ?? 'default')
  const [zoom, setZoom] = useState(Math.round((data?.prefs.zoom ?? 1) * 100))
  const [opacity, setOpacityLocal] = useState(
    Math.round(
      Math.max(MIN_OPACITY, data?.prefs.opacity ?? windowState.opacity) * 100
    )
  )
  // The animation duration as a percentage of the standard one (100 = standard).
  const [motion, setMotion] = useState(
    motionToPercent(data?.prefs.motion ?? DEFAULT_MOTION)
  )
  const [peekCollapseDelay, setPeekCollapseDelay] = useState(
    data?.prefs.peekCollapseDelay ?? DEFAULT_PEEK_COLLAPSE_DELAY
  )
  const [hiddenTabs, setHiddenTabs] = useState<Tab[]>(() =>
    normalizeHiddenTabs(data?.prefs.hiddenTabs)
  )
  const [shortcut, setShortcut] = useState(
    data?.prefs.shortcut ?? DEFAULT_SHORTCUT
  )
  const [shortcutOn, setShortcutOn] = useState(
    data?.prefs.shortcutEnabled ?? true
  )
  // A new combination is tried on the system as soon as it is chosen; a taken one cannot be saved.
  const { check: shortcutCheck, blocked: shortcutBlocked } = useShortcutCheck(
    shortcut,
    shortcutOn,
    data?.prefs.shortcut ?? DEFAULT_SHORTCUT
  )
  const [transferAction, setTransferAction] = useState<
    'import' | 'export' | null
  >(null)

  useEffect(() => {
    let active = true
    void window.quickLaunch
      .getLaunchSettings()
      .then((result) => {
        if (!active) return
        if (result.ok) {
          setLaunchSettings(result.data)
          setOpenAtLogin(result.data.openAtLogin)
        } else showToast(result.error, 'danger')
      })
      .catch((error) => {
        if (active) showToast(String(error), 'danger')
      })
    return () => {
      active = false
    }
  }, [showToast])

  // The dialog follows the saved settings when the data is replaced underneath it (an import, the
  // data arriving late), but not when it is only edited: saving changes the data, and a save that
  // fails puts the old data back, which must not throw away what was edited in the dialog.
  const dataEpoch = useAppStore((state) => state.dataEpoch)
  const followedEpoch = useRef(dataEpoch)
  useEffect(() => {
    if (!data) {
      return
    }
    if (dataEpoch === followedEpoch.current) return
    followedEpoch.current = dataEpoch

    setTheme(data.prefs.theme)
    setBackground(data.prefs.background)
    setViewMode(data.prefs.viewMode)
    setLanguage(data.prefs.lang)
    setBrowser(data.prefs.browser)
    setZoom(Math.round(data.prefs.zoom * 100))
    setOpacityLocal(
      Math.round(
        Math.max(MIN_OPACITY, data.prefs.opacity ?? windowState.opacity) * 100
      )
    )
    setMotion(motionToPercent(data.prefs.motion))
    setPeekCollapseDelay(data.prefs.peekCollapseDelay)
    setHideAfterLaunch(data.prefs.hideAfterLaunch)
    setShowBubble(data.prefs.showBubble)
    setHiddenTabs(normalizeHiddenTabs(data.prefs.hiddenTabs))
    setShortcut(data.prefs.shortcut)
    setShortcutOn(data.prefs.shortcutEnabled)
  }, [data, dataEpoch, windowState.opacity])

  // What the slider shows for the saved value. A saved value the slider cannot reach exactly (an old
  // one outside its range, or between two steps) is only replaced when the user moves the slider.
  const savedMotion = data?.prefs.motion ?? DEFAULT_MOTION
  const motionValue =
    motion === motionToPercent(savedMotion)
      ? savedMotion
      : percentToMotion(motion)

  // Appearance is previewed while the dialog is open: the interface follows the controls at once, and
  // everything goes back when the dialog is cancelled or closed without saving. Saving makes the
  // saved values the same as the preview, so nothing changes at that moment.
  useEffect(() => {
    if (!isOpen) return
    setPreviewPrefs({
      theme,
      background,
      zoom: zoom / 100,
      motion: motionValue,
    })
  }, [isOpen, theme, background, zoom, motionValue, setPreviewPrefs])
  useEffect(() => {
    if (!isOpen) return undefined
    return () => setPreviewPrefs(null)
  }, [isOpen, setPreviewPrefs])
  // The panel's opacity belongs to the window, so the main process shows it.
  useEffect(() => {
    if (isOpen) void previewOpacity(opacity / 100)
  }, [isOpen, opacity, previewOpacity])
  useEffect(() => {
    if (!isOpen) return undefined
    return () => void previewOpacity(null)
  }, [isOpen, previewOpacity])

  if (!data) {
    return null
  }

  const controlsDisabled = saving || transferAction !== null
  // The categories that are on in the dialog now (not yet saved); Alt+number follows the saved ones.
  const shownTabs = visibleTabs(hiddenTabs)
  const shortcutRange = visibleTabs(data.prefs.hiddenTabs).length

  const setTabShown = (tab: Tab, shown: boolean) => {
    // Hiding only hides; the last category that is on cannot be switched off.
    if (!shown && shownTabs.length <= 1) return
    setHiddenTabs(
      normalizeHiddenTabs(
        shown
          ? hiddenTabs.filter((entry) => entry !== tab)
          : [...hiddenTabs, tab]
      )
    )
  }

  const handleSubmit = async () => {
    if (controlsDisabled) {
      return
    }

    let loginItemRefused = false

    if (
      launchSettings?.canAutoStart &&
      openAtLogin !== launchSettings.openAtLogin
    ) {
      const result = await window.quickLaunch.setOpenAtLogin(openAtLogin)
      if (!result.ok) {
        showToast(result.error, 'danger')
        return
      }
      setLaunchSettings(result.data)
      if (result.data.openAtLogin !== openAtLogin) {
        // The main process re-reads what Windows really has. When it cannot write the Run key
        // (group policy, security software) the answer differs from the request: show the truth,
        // keep saving the other settings, and say so once they are saved.
        loginItemRefused = true
        setOpenAtLogin(result.data.openAtLogin)
      }
    }

    await updateData((draft) => {
      draft.prefs.theme = theme
      draft.prefs.background = background
      draft.prefs.viewMode = viewMode
      draft.prefs.lang = language
      draft.prefs.browser = browser
      draft.prefs.zoom = zoom / 100
      draft.prefs.opacity = opacity / 100
      draft.prefs.motion = motionValue
      draft.prefs.peekCollapseDelay = peekCollapseDelay
      draft.prefs.hideAfterLaunch = hideAfterLaunch
      draft.prefs.showBubble = showBubble
      draft.prefs.hiddenTabs = hiddenTabs
      draft.prefs.shortcut = shortcut
      draft.prefs.shortcutEnabled = shortcutOn
    })

    if (useAppStore.getState().error) return
    await setOpacity(opacity / 100)
    if (useAppStore.getState().error) return
    // The main process registered the new shortcut while saving. It was checked when it was chosen,
    // so a refusal now (another program took it in between) is rare, but it must not go unsaid.
    const shortcutChanged =
      shortcutOn !== data.prefs.shortcutEnabled ||
      (shortcutOn && shortcut !== data.prefs.shortcut)
    let shortcutRefused = false
    if (shortcutChanged && shortcutOn) {
      const launch = await window.quickLaunch
        .getLaunchSettings()
        .catch(() => null)
      shortcutRefused = Boolean(launch?.ok && !launch.data.shortcutAvailable)
    }
    setModal(null)
    // The strip has a single slot for messages: raised last, this one is the one left showing.
    if (loginItemRefused) showToast(t('launch_login_failed'), 'danger')
    if (shortcutRefused) showToast(t('shortcut_unavailable'), 'danger')
  }

  const handleExport = async () => {
    if (controlsDisabled) {
      return
    }

    setTransferAction('export')

    try {
      await exportData({
        successMessage: t('export_success'),
        withoutPasswordsMessage: t('export_success_no_passwords'),
      })
    } finally {
      setTransferAction(null)
    }
  }

  const handleImport = async () => {
    if (controlsDisabled) {
      return
    }

    // The main process asks once the file is chosen: it knows what the file holds.
    setTransferAction('import')

    try {
      await importData({ successMessage: t('import_success') })
    } finally {
      setTransferAction(null)
    }
  }

  return (
    <>
      <div className="settings-nav" role="tablist" aria-label={t('settings')}>
        {(['appearance', 'behavior', 'data'] as const).map((entry) => {
          const TabIcon = settingsTabIcons[entry]

          return (
            <button
              key={entry}
              className={`settings-tab ${section === entry ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={section === entry}
              data-testid={`settings-tab-${entry}`}
              onClick={() => setSection(entry)}
            >
              <TabIcon
                size={16}
                weight={section === entry ? 'fill' : 'duotone'}
              />
              {t(`settings_${entry}`)}
            </button>
          )
        })}
      </div>
      {section === 'behavior' && (
        <div className="settings-panel">
          <p className="form-field-note">{t('dock_guide')}</p>
          <FormField
            label={t('peek_collapse_delay')}
            hint={t('peek_collapse_delay_hint')}
            htmlFor="settings-peek-collapse-delay"
          >
            <div className="range-row peek-delay-range">
              <input
                id="settings-peek-collapse-delay"
                type="range"
                min="0"
                max={MAX_PEEK_COLLAPSE_DELAY}
                step="50"
                value={peekCollapseDelay}
                style={rangeFill(peekCollapseDelay, 0, MAX_PEEK_COLLAPSE_DELAY)}
                aria-label={t('peek_collapse_delay')}
                aria-valuetext={
                  peekCollapseDelay === 0
                    ? t('immediately')
                    : `${peekCollapseDelay} ${t('milliseconds')}`
                }
                data-testid="peek-collapse-delay"
                disabled={controlsDisabled}
                onChange={(event) =>
                  setPeekCollapseDelay(Number(event.target.value))
                }
              />
              <span aria-live="polite">
                {peekCollapseDelay === 0
                  ? t('immediately')
                  : `${peekCollapseDelay} ${t('milliseconds')}`}
              </span>
            </div>
          </FormField>
          <label className="setting-switch-row">
            <span>
              <strong>{t('pin_panel')}</strong>
              <small>{t('pin_panel_hint')}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-testid="pin-panel"
              checked={windowState.alwaysOnTop}
              disabled={controlsDisabled}
              onChange={() => void togglePin()}
            />
          </label>
          <label className="setting-switch-row">
            <span>
              <strong>{t('show_bubble')}</strong>
              <small>{t('show_bubble_hint')}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-testid="show-bubble"
              checked={showBubble}
              disabled={controlsDisabled}
              onChange={(event) => setShowBubble(event.target.checked)}
            />
          </label>
          <ShortcutSettings
            accelerator={shortcut}
            enabled={shortcutOn}
            changed={shortcutOn && shortcut !== data.prefs.shortcut}
            check={shortcutCheck}
            launch={launchSettings}
            disabled={controlsDisabled}
            onAccelerator={setShortcut}
            onEnabled={setShortcutOn}
          />
          <label className="setting-switch-row">
            <span>
              <strong>{t('launch_at_login')}</strong>
              <small>
                {launchSettings?.canAutoStart
                  ? t('launch_at_login_hint')
                  : t('install_for_autostart')}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={openAtLogin}
              disabled={!launchSettings?.canAutoStart || controlsDisabled}
              onChange={(event) => setOpenAtLogin(event.target.checked)}
            />
          </label>
          <label className="setting-switch-row">
            <span>
              <strong>{t('hide_after_launch')}</strong>
              <small>{t('hide_after_launch_hint')}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              data-testid="hide-after-launch"
              checked={hideAfterLaunch}
              disabled={controlsDisabled}
              onChange={(event) => setHideAfterLaunch(event.target.checked)}
            />
          </label>
          <FormField label={t('browser')} htmlFor="settings-browser">
            <select
              id="settings-browser"
              value={browser}
              onChange={(event) =>
                setBrowser(event.target.value as typeof browser)
              }
            >
              <option value="default">{t('browser_default')}</option>
              <option value="edge">{t('browser_edge')}</option>
              <option value="chrome">{t('browser_chrome')}</option>
            </select>
          </FormField>
          <div className="keyboard-guide">
            <strong>{t('keyboard_shortcuts')}</strong>
            <div>
              <span>{t('global_search')}</span>
              <kbd>Ctrl K</kbd>
            </div>
            <div>
              <span>{t('shortcut_tabs')}</span>
              <kbd>{`Alt 1–${shortcutRange}`}</kbd>
            </div>
            <div>
              <span>{t('shortcut_new')}</span>
              <kbd>Ctrl N</kbd>
            </div>
            <div>
              <span>{t('shortcut_escape')}</span>
              <kbd>Esc</kbd>
            </div>
          </div>
        </div>
      )}
      {section === 'appearance' && (
        <div className="settings-panel">
          <p className="form-field-note" data-testid="settings-preview-note">
            {t('settings_preview_note')}
          </p>
          <FormField label={t('theme')} group>
            <div
              className="toggle-row"
              role="radiogroup"
              aria-label={t('theme')}
            >
              {THEME_SETTINGS.map((entry, index) => (
                <button
                  key={entry}
                  ref={themeKeys.setRef(index)}
                  className={`chip-button ${theme === entry ? 'active' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={theme === entry}
                  tabIndex={theme === entry ? 0 : -1}
                  data-testid={`theme-${entry}`}
                  onClick={() => setTheme(entry)}
                  onKeyDown={(event) => themeKeys.onKeyDown(event, index)}
                >
                  {t(`theme_${entry}`)}
                </button>
              ))}
            </div>
          </FormField>
          <FormField label={t('accent_color')} group>
            <AccentDots
              value={background}
              theme={resolveTheme(theme, systemDark)}
              label={t('accent_color')}
              onChange={setBackground}
            />
          </FormField>
          <FormField
            label={t('font_size')}
            hint={t('font_size_hint')}
            htmlFor="settings-font-size"
          >
            <div className="range-row">
              <input
                id="settings-font-size"
                type="range"
                min="80"
                max="140"
                step="5"
                value={zoom}
                style={rangeFill(zoom, 80, 140)}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <span>{zoom}%</span>
            </div>
          </FormField>
          <FormField
            label={t('opacity')}
            hint={t('opacity_hint')}
            htmlFor="settings-opacity"
          >
            <div className="range-row">
              <input
                id="settings-opacity"
                type="range"
                min={MIN_OPACITY * 100}
                max="100"
                step="5"
                value={opacity}
                style={rangeFill(opacity, MIN_OPACITY * 100, 100)}
                onChange={(event) =>
                  setOpacityLocal(Number(event.target.value))
                }
              />
              <span>{opacity}%</span>
            </div>
          </FormField>
          <FormField
            label={t('motion')}
            hint={t('motion_hint')}
            htmlFor="settings-motion"
          >
            <div className="range-row">
              <input
                id="settings-motion"
                type="range"
                min={MOTION_PERCENT_MIN}
                max={MOTION_PERCENT_MAX}
                step={MOTION_PERCENT_STEP}
                value={motion}
                style={rangeFill(
                  motion,
                  MOTION_PERCENT_MIN,
                  MOTION_PERCENT_MAX
                )}
                onChange={(event) => setMotion(Number(event.target.value))}
              />
              <span>{motion}%</span>
            </div>
          </FormField>
          <FormField label={t('view_mode')} hint={t('view_mode_hint')}>
            <div
              className="segmented"
              role="radiogroup"
              aria-label={t('view_mode')}
            >
              {VIEW_MODES.map((mode, index) => {
                const ModeIcon = viewModeIcons[mode]

                return (
                  <button
                    key={mode}
                    className={`segmented-option ${viewMode === mode ? 'active' : ''}`}
                    type="button"
                    role="radio"
                    aria-checked={viewMode === mode}
                    tabIndex={viewMode === mode ? 0 : -1}
                    data-testid={`view-mode-${mode}`}
                    disabled={controlsDisabled}
                    ref={viewModeKeys.setRef(index)}
                    onClick={() => setViewMode(mode)}
                    onKeyDown={(event) => viewModeKeys.onKeyDown(event, index)}
                  >
                    <ModeIcon
                      size={16}
                      weight={viewMode === mode ? 'fill' : 'duotone'}
                    />
                    {t(`view_mode_${mode}`)}
                  </button>
                )
              })}
            </div>
          </FormField>
          <FormField
            label={t('settings_categories')}
            hint={t('settings_categories_hint')}
            group
          >
            <div className="category-switches">
              {ALL_TABS.map((tab) => {
                const TabIcon = TAB_ICONS[tab]
                const isOn = shownTabs.includes(tab)
                const isLast = isOn && shownTabs.length <= 1

                return (
                  <label
                    key={tab}
                    className="category-switch"
                    data-on={isOn || undefined}
                  >
                    <TabIcon size={16} weight={isOn ? 'fill' : 'duotone'} />
                    <span>{t(`tab_${tab}`)}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      data-testid={`show-tab-${tab}`}
                      checked={isOn}
                      disabled={controlsDisabled || isLast}
                      onChange={(event) =>
                        setTabShown(tab, event.target.checked)
                      }
                    />
                  </label>
                )
              })}
            </div>
            {shownTabs.length <= 1 && (
              <span className="form-field-note" role="status">
                {t('settings_categories_last')}
              </span>
            )}
          </FormField>
        </div>
      )}
      {section === 'data' && (
        <div className="settings-panel">
          {/* Used to be the status bar's permanent "stored on this device". */}
          <p className="settings-data-note" data-testid="settings-local-data">
            <IconDone size={14} aria-hidden />
            {t('local_data')}
          </p>
          <FormField label={t('language')} htmlFor="settings-language">
            <select
              id="settings-language"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as typeof language)
              }
            >
              {LANGS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === 'zh'
                    ? '中文'
                    : entry === 'en'
                      ? 'English'
                      : '日本語'}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t('data_management')} group>
            <div className="settings-transfer-actions">
              <button
                className="secondary-button"
                type="button"
                data-testid="settings-export"
                disabled={controlsDisabled}
                onClick={() => void handleExport()}
              >
                {t('export_data')}
              </button>
              <button
                className="secondary-button"
                type="button"
                data-testid="settings-import"
                disabled={controlsDisabled}
                onClick={() => void handleImport()}
              >
                {t('import_data')}
              </button>
            </div>
            <span className="form-field-note">{t('import_notice')}</span>
          </FormField>
          <FormField label={t('about_title')} group>
            <AboutSettings disabled={controlsDisabled} />
          </FormField>
        </div>
      )}
      <div className="modal-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={controlsDisabled}
          onClick={() => setModal(null)}
        >
          {t('btn_cancel')}
        </button>
        <button
          className="primary-button"
          type="button"
          data-testid="settings-save"
          disabled={controlsDisabled || shortcutBlocked}
          onClick={() => void handleSubmit()}
        >
          {t('btn_save')}
        </button>
      </div>
    </>
  )
}
