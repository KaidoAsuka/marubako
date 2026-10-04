/**
 * What a person pastes into a path field is not always a path: Explorer's "Copy as path" wraps it in
 * double quotes, the Security tab of a file's Properties puts an invisible direction mark in front,
 * a browser address bar gives `file:///C:/My%20Files`, and a trailing space is easy to miss. Saved as
 * typed, such an entry looks fine and never opens. Pure functions, shared by the form (which shows
 * the cleaned value) and the main process (which cleans again before it opens, so entries saved by
 * an older version work too).
 */

// Bidirectional marks, zero-width characters and the byte order mark: invisible, never meant.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g

// Quote pairs that may wrap a pasted path. A straight double quote can never be part of a Windows
// path, so a lone one is dropped as well; the others are legal in names, so only a pair counts.
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["'", "'"],
  ['\u201c', '\u201d'],
  ['\u2018', '\u2019'],
]

function stripQuotes(value: string): string {
  let result = value
  // A few layers at most: `"'C:\x'"` is silly but harmless.
  for (let round = 0; round < 4; round += 1) {
    const before = result
    result = result.replace(/^"+|"+$/g, '').trim()
    for (const [open, close] of QUOTE_PAIRS) {
      if (
        result.length >= 2 &&
        result.startsWith(open) &&
        result.endsWith(close)
      ) {
        result = result.slice(1, -1).trim()
      }
    }
    if (result === before) break
  }
  return result
}

/** `file:///C:/My%20Files/a.txt` becomes `C:\My Files\a.txt`; `file://host/share/x` a UNC path. */
function fileUrlToPath(value: string): string {
  if (!/^file:/i.test(value)) return value

  let rest = value.slice('file:'.length)
  let host = ''
  if (rest.startsWith('//')) {
    const end = rest.indexOf('/', 2)
    host = end === -1 ? rest.slice(2) : rest.slice(2, end)
    rest = end === -1 ? '' : rest.slice(end)
  }
  // The query and fragment of a URL are not part of a file name.
  rest = rest.replace(/[?#].*$/, '')
  let decoded: string
  try {
    decoded = decodeURIComponent(rest)
  } catch {
    // A stray percent sign that is not an escape: keep the text as it is.
    decoded = rest
  }
  // `/C:/x` is the URL form of `C:\x`.
  decoded = decoded.replace(/^\/+(?=[A-Za-z]:)/, '').replace(/\//g, '\\')
  if (host !== '' && host.toLowerCase() !== 'localhost') {
    return `\\\\${host}${decoded.startsWith('\\') ? '' : '\\'}${decoded}`
  }
  return decoded
}

/**
 * The path as it should be saved: invisible characters, surrounding whitespace and quotes removed,
 * a `file:` URL turned into a path. `%USERPROFILE%`-style variables are kept as typed (they stay
 * valid on another account or computer) and expanded when the entry is opened. UNC paths and
 * forward slashes are left alone.
 */
export function cleanPathInput(raw: string): string {
  const text = raw.replace(INVISIBLE, '').trim()
  return fileUrlToPath(stripQuotes(text)).trim()
}

/**
 * Replaces each `%NAME%` with the value of that environment variable (names are case-insensitive,
 * as on Windows). One pass, so a value is never expanded again, and a name that is not defined is
 * left as it is: the open then fails with "not found" instead of trying a mangled path.
 */
export function expandEnvironmentVariables(
  value: string,
  env: Readonly<Record<string, string | undefined>>
): string {
  const lowered = new Map<string, string>()
  for (const [name, content] of Object.entries(env)) {
    if (content !== undefined && !lowered.has(name.toLowerCase()))
      lowered.set(name.toLowerCase(), content)
  }
  return value.replace(/%([^%\s=\\/:*?"<>|]+)%/g, (match, name: string) => {
    const content = lowered.get(name.toLowerCase())
    return content === undefined ? match : content
  })
}

/** The path to hand to the operating system: cleaned, then with its variables expanded. */
export function resolveEntryPath(
  raw: string,
  env: Readonly<Record<string, string | undefined>>
): string {
  return expandEnvironmentVariables(cleanPathInput(raw), env)
}
