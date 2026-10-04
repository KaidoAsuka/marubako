import type { ErrorCode, Lang } from '../../../shared/types'
import { resolveLang } from '../i18n/resolve-lang'
import { safetyStrings } from '../i18n/safety'

/**
 * What to tell the user when an entry would not open: the entry by name, and what is wrong with
 * it, in the language of the window. The raw text of the failure (English, often a file name and an
 * error number) is for the log, not for the screen.
 */
export function describeOpenFailure(
  code: ErrorCode | undefined,
  name: string,
  lang: Lang
): string {
  const strings = safetyStrings[resolveLang(lang)]
  const template =
    strings[`open_err_${code ?? 'unknown'}`] ?? strings.open_err_unknown ?? ''
  // A function, so that `$&` and the like in a name are not read as replacement patterns.
  return template.replace('{name}', () => name)
}

/** The label of the button that opens the entry's form. */
export function openEditLabel(lang: Lang): string {
  return safetyStrings[resolveLang(lang)].open_edit ?? 'Edit'
}
