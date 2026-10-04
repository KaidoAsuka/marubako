import { LANGS, type Lang } from '../../../shared/types'

/** Stored prefs are untrusted: anything that is not a known language falls back to zh. */
export function resolveLang(lang: unknown): Lang {
  return typeof lang === 'string' && (LANGS as readonly string[]).includes(lang)
    ? (lang as Lang)
    : 'zh'
}

/** The value of `<html lang>` for each language: screen readers pick their voice by it. */
export const HTML_LANG: Record<Lang, string> = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja',
}

/** Each language in its own words, so that a reader of the wrong language can still find theirs. */
export const LANG_NAMES: Record<Lang, string> = {
  zh: '中文',
  en: 'English',
  ja: '日本語',
}
