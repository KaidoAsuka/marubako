import { useAppStore } from '../store/use-app-store'
import { resolveLang } from '../i18n/resolve-lang'
import { safetyStrings } from '../i18n/safety'
import { translations } from '../i18n/translations'
import { updateStrings } from '../i18n/updates'
import { workspaceStrings } from '../i18n/workspace'
import { getStartupParams } from '../utils/startup-params'

export function useI18n() {
  // Until the data has arrived the window speaks the language the main process put in its URL.
  const lang = useAppStore((state) =>
    state.data
      ? resolveLang(state.data.prefs.lang)
      : (getStartupParams().lang ?? 'zh')
  )
  const active = translations[lang]

  return {
    lang,
    t: (key: string) =>
      safetyStrings[lang][key] ??
      updateStrings[lang][key] ??
      workspaceStrings[lang][key] ??
      active.strings[key] ??
      translations.zh.strings[key] ??
      key,
    weekdays: active.weekdays,
    formatDate: active.formatDate,
    formatWeekday: active.formatWeekday,
  }
}
