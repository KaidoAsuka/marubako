import type { Lang } from './types'

/**
 * Maps one locale tag ("zh-CN", "ja_JP", "en-US", "zh-Hant-TW") to the language the app has
 * strings for: zh* is Chinese, ja* is Japanese, everything else (and an empty tag) is English.
 */
export function langFromLocale(locale: string | null | undefined): Lang {
  const primary = (locale ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .split('-')[0]
  if (primary === 'zh') return 'zh'
  if (primary === 'ja') return 'ja'
  return 'en'
}

/**
 * The language a computer asks for: the first candidate that says anything decides (candidates
 * come in order of preference). Nothing at all means English, the one language every reader of
 * the other two can fall back on.
 */
export function resolveSystemLang(
  candidates: readonly (string | null | undefined)[]
): Lang {
  const first = candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim() !== ''
  )
  return langFromLocale(first)
}
