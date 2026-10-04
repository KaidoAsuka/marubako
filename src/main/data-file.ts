import type { AppData, PasswordItem } from '../shared/types'
import {
  assertLooksLikeAppData,
  CURRENT_SCHEMA_VERSION,
  hasWindowState,
  normalizeAppData,
  unwrapPersistedData,
  UnsupportedSchemaError,
} from './data-normalize'
import { decryptString, encryptString, isLegacyEnvelope } from './encryption'

/**
 * The data file is plain JSON. Only each password is encrypted on its own, so a file moved to
 * another computer still opens: everything is there except the passwords, which stay locked.
 */
export const FILE_FORMAT = 'quicklaunch-data'
export const FILE_VERSION = 2

/**
 * Top-level key of an export made "without passwords": every password in it is empty, and importing
 * it must say so. It is absent from every other file.
 */
export const PASSWORDS_OMITTED_KEY = 'passwordsOmitted'

export interface PasswordCodec {
  /** Returns base64 ciphertext, or null when encryption is unavailable. */
  encrypt: (plain: string) => string | null
  /** Throws when the ciphertext cannot be decrypted on this computer. */
  decrypt: (ciphertext: string) => string
}

export const systemPasswordCodec: PasswordCodec = {
  encrypt: encryptString,
  decrypt: decryptString,
}

/** `file` is the current format, `legacy-envelope` the one before 2.6, `plain` an exported backup. */
export type SourceFormat = 'file' | 'legacy-envelope' | 'plain'

export interface ParsedDataFile {
  data: AppData
  /** Passwords that could not be decrypted here: item id to the raw ciphertext. */
  lostPasswords: Map<string, string>
  format: SourceFormat
  /** Older files carry the window position inside the data. */
  hadWindowState: boolean
  /** The file is an export made without passwords: after an import every password is empty. */
  passwordsOmitted: boolean
}

export interface ParseOptions {
  codec?: PasswordCodec
  /** Refuse JSON that does not look like Marubako data. On by default. */
  strict?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseDataFile(
  raw: string,
  { codec = systemPasswordCodec, strict = true }: ParseOptions = {}
): ParsedDataFile {
  // Notepad and PowerShell 5.1 can save UTF-8 with a byte order mark, which JSON.parse rejects.
  let source: unknown = JSON.parse(
    raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  )
  let format: SourceFormat = 'plain'

  if (isLegacyEnvelope(source)) {
    source = JSON.parse(
      source.encrypted ? codec.decrypt(source.payload) : source.payload
    )
    format = 'legacy-envelope'
  } else if (isRecord(source) && source.format === FILE_FORMAT) {
    if (typeof source.version === 'number' && source.version > FILE_VERSION) {
      throw new UnsupportedSchemaError(source.version)
    }
    format = 'file'
  }

  const inner = unwrapPersistedData(source)
  // Say "newer version" rather than "not a data file" for a file from a newer app, however small.
  if (
    isRecord(inner) &&
    typeof inner.schemaVersion === 'number' &&
    inner.schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    throw new UnsupportedSchemaError(inner.schemaVersion)
  }
  if (strict) {
    assertLooksLikeAppData(inner)
  }

  const lostPasswords = new Map<string, string>()
  const data = normalizeAppData(inner, {
    decryptPassword: codec.decrypt,
    onPasswordLost: (id, ciphertext) => lostPasswords.set(id, ciphertext),
  })

  return {
    data,
    lostPasswords,
    format,
    hadWindowState: hasWindowState(inner),
    passwordsOmitted: isRecord(inner) && inner[PASSWORDS_OMITTED_KEY] === true,
  }
}

/** Whether any password entry holds a password (an empty or lost one is nothing to protect). */
export function hasStoredPasswords(data: AppData): boolean {
  return passwordEntries(data).some((item) => item.password !== '')
}

function passwordEntries(data: AppData): PasswordItem[] {
  return [
    ...data.passwords.flatMap((group) => group.items),
    ...data.loose.passwords,
  ]
}

/**
 * The export file. With passwords it is the data as it is; without them every password is blanked
 * and the file says so, so that an import can warn that the passwords are not coming back.
 */
export function stringifyExport(
  data: AppData,
  includePasswords: boolean
): string {
  if (includePasswords) return JSON.stringify(data, null, 2)

  const blanked: AppData = {
    ...data,
    passwords: data.passwords.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item, password: '' })),
    })),
    loose: {
      ...data.loose,
      passwords: data.loose.passwords.map((item) => ({
        ...item,
        password: '',
      })),
    },
  }
  return JSON.stringify({ [PASSWORDS_OMITTED_KEY]: true, ...blanked }, null, 2)
}

export function serializeDataFile(
  data: AppData,
  codec: PasswordCodec = systemPasswordCodec,
  preservedCiphertexts: ReadonlyMap<string, string> = new Map()
): string {
  const encodePassword = (item: PasswordItem): Record<string, unknown> => {
    const persisted: Record<string, unknown> = { ...item }
    delete persisted.password
    delete persisted.passwordLost

    if (!item.password) {
      // A password that could not be decrypted here keeps its original ciphertext on disk, so it
      // is not lost for good if the key comes back (restored Windows account, same computer).
      const kept = preservedCiphertexts.get(item.id)
      if (kept) persisted.passwordCiphertext = kept
      return persisted
    }

    const ciphertext = codec.encrypt(item.password)
    if (ciphertext) {
      persisted.passwordCiphertext = ciphertext
    } else {
      persisted.password = item.password
    }
    return persisted
  }

  const persisted: Partial<AppData> & Record<string, unknown> = { ...data }
  // The window position lives in its own file; see window-state-file in data-store.
  delete persisted.window
  persisted.passwords = data.passwords.map((group) => ({
    ...group,
    items: group.items.map(encodePassword),
  })) as unknown as AppData['passwords']
  persisted.loose = {
    ...data.loose,
    passwords: data.loose.passwords.map(
      encodePassword
    ) as unknown as AppData['loose']['passwords'],
  }

  return JSON.stringify(
    { format: FILE_FORMAT, version: FILE_VERSION, data: persisted },
    null,
    2
  )
}

/** A key that changes exactly when the persisted content changes (the window position excluded). */
export function contentKey(data: AppData): string {
  const copy: Partial<AppData> = { ...data }
  delete copy.window
  return JSON.stringify(copy)
}
