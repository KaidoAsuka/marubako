// What the user types or pastes as the target of an entry: a Windows path or a web address. One
// small set of helpers is shared by the entry form (clean up and check the field), the add flow
// (name an entry from its target) and the clipboard / drop paths (is this text something to add?).

const PAIRED_QUOTES: Record<string, string> = {
  '"': '"',
  "'": "'",
  '\u201c': '\u201d',
  '\u2018': '\u2019',
}

/**
 * Trims the value and removes one pair of quotes around it. Explorer's "Copy as path" puts the
 * path in double quotes, and a path pasted from a chat often arrives in single or curly ones.
 */
export function stripQuotes(raw: string): string {
  const value = raw.trim()
  const close = PAIRED_QUOTES[value[0] ?? '']
  if (close && value.length >= 2 && value.endsWith(close)) {
    return value.slice(1, -1).trim()
  }
  return value
}

// Characters Windows does not allow in a file name (the colon is checked separately: it belongs
// after a drive letter only). The `\\?\` long-path prefix is not supported.
const ILLEGAL_PATH_CHARACTER = /[<>"|?*\u0000-\u001f]/

/**
 * Whether the value looks like a full Windows path: `C:\Work`, `C:/Work`, `\\server\share`, or one
 * that starts with an environment variable (`%USERPROFILE%\Docs`). A bare name such as `Work` or
 * `notepad.exe` is not one: the app never resolves it against anything, so saving it would only
 * move the failure to the first click.
 */
export function isWindowsPath(raw: string): boolean {
  const value = raw.trim()
  if (!value || ILLEGAL_PATH_CHARACTER.test(value)) return false

  const drive = /^[A-Za-z]:(?:[\\/]|$)/.test(value)
  const unc = /^\\\\[^\\/]+[\\/]+[^\\/]/.test(value)
  const variable = /^%[^%\\/:]+%(?:[\\/]|$)/.test(value)
  if (!drive && !unc && !variable) return false

  return !(drive ? value.slice(2) : value).includes(':')
}

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i
// A host that is never on the public internet: it answers on plain http, and https would not.
const LOCAL_HOST =
  /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\])(?::\d+)?(?:[/?#]|$)/i

/**
 * Turns what the user typed into an http(s) address, or null when it is not one. A missing scheme
 * is filled in: https for a site, http for this computer and the local network (`localhost:3000`,
 * `192.168.1.1`), where https would not connect.
 */
export function normalizeWebAddress(raw: string): string | null {
  const value = stripQuotes(raw)
  if (!value || /\s/.test(value)) return null

  const candidate = HAS_SCHEME.test(value)
    ? value
    : `${LOCAL_HOST.test(value) ? 'http' : 'https'}://${value}`
  try {
    const parsed = new URL(candidate)
    // "mailto:me@example.com" would parse as user "mailto" at example.com; no one means that.
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null
    }
    return candidate
  } catch {
    return null
  }
}

/** The part of an address to name an entry after: the host without a leading `www.`. */
export function hostLabel(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

const EXECUTABLE_EXTENSION = /\.(?:exe|lnk|bat|cmd)$/i

/**
 * A name for an entry made from its target, for when the user has not typed one: the host of a
 * website, the last folder of a path, the file name of a program without its extension.
 */
export function inferName(
  tab: 'folders' | 'websites' | 'apps',
  rawTarget: string
): string {
  const target = stripQuotes(rawTarget)
  if (!target) return ''
  if (tab === 'websites') {
    const address = normalizeWebAddress(target)
    return address ? hostLabel(address) : ''
  }

  const last = target.split(/[\\/]/).filter(Boolean).pop() ?? ''
  return tab === 'apps' ? last.replace(EXECUTABLE_EXTENSION, '') : last
}

export type DetectedTarget =
  | { kind: 'website'; target: string }
  | { kind: 'path'; target: string }

/**
 * Every line of the text is a target (Explorer's "Copy as path" gives one quoted path per line for
 * a multiple selection), or the result is empty: a paragraph that merely contains one address
 * is prose, not something to add. The same target is listed once.
 */
export function detectTargets(text: string): DetectedTarget[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0 || lines.length > 100) return []

  const found: DetectedTarget[] = []
  for (const line of lines) {
    const target = detectTarget(line)
    if (!target) return []
    if (!found.some((entry) => entry.target === target.target)) {
      found.push(target)
    }
  }

  return found
}

/**
 * Decides whether a piece of clipboard text is something to add as an entry: a web address
 * (with its `http://` or `https://`: a bare "example.com" in the clipboard is far more often just
 * text) or a full Windows path (a drive or a network share). Anything else, including a line of
 * prose that happens to contain an address, is null.
 */
export function detectTarget(text: string): DetectedTarget | null {
  const value = stripQuotes(text)
  if (!value || /[\r\n]/.test(value)) return null

  if (/^https?:\/\//i.test(value)) {
    const address = normalizeWebAddress(value)
    return address ? { kind: 'website', target: address } : null
  }
  if (
    (/^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]/.test(value)) &&
    isWindowsPath(value)
  ) {
    return { kind: 'path', target: value }
  }

  return null
}
