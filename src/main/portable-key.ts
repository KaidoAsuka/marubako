import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Chromium's file in the data folder. It holds the key the passwords are encrypted with. */
export const KEY_FILENAME = 'Local State'
/** Beside it: which PC and Windows account ran the program on this folder last. */
export const KEY_OWNER_FILENAME = 'Local State.owner'

/**
 * One Windows account on one PC, named in two ways that do not depend on each other: by the names
 * of the computer and the account, and by the disk the account's own folder is on. One of them
 * matching is enough, so that renaming the computer does not make it a stranger to its own key.
 * Neither holds a name: both are hashes.
 */
export interface KeyOwner {
  host: string
  disk: string
}

/**
 * What the key guard did:
 * - `unchanged`: the folder was last used here.
 * - `claimed`: the folder had no owner on record; it is taken to be of this PC.
 * - `set-aside`: the key of another PC is kept under that PC's name; this PC starts with its own.
 * - `restored`: the key this PC made earlier was put back in place.
 */
export type PortableKeyChange =
  | 'unchanged'
  | 'claimed'
  | 'set-aside'
  | 'restored'

/**
 * `fatal`: the key of another PC could not be kept safe, so the program must not start. Chromium
 * would replace that key and the passwords saved on the other PC would be unreadable for good.
 */
export class PortableKeyError extends Error {
  readonly fatal: boolean

  constructor(cause: unknown, fatal: boolean) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'PortableKeyError'
    this.fatal = fatal
  }
}

const OWNER_ID = /^[0-9a-f]{16}$/
// `Local State.<host>-<disk>` is the key of that PC; with `.2`, `.3`... an older key of it.
const KEPT_FILENAME = /^Local State\.([0-9a-f]{16})-([0-9a-f]{16})(\.\d+)?$/

function hash(...parts: string[]): string {
  return crypto
    .createHash('sha256')
    .update(parts.join('\n').toLowerCase())
    .digest('hex')
    .slice(0, 16)
}

/**
 * `volume` is the serial number of the disk that `homeDir` is on, or undefined when it cannot be
 * read: then the second name is derived from the first and can only match where the first does.
 */
export function keyOwner({
  hostname,
  username,
  homeDir,
  volume,
}: {
  hostname: string
  username: string
  homeDir: string
  volume: number | undefined
}): KeyOwner {
  const host = hash('host', hostname, username)
  return {
    host,
    disk: volume ? hash('disk', String(volume), homeDir) : hash('none', host),
  }
}

export function samePc(one: KeyOwner, other: KeyOwner): boolean {
  return one.host === other.host || one.disk === other.disk
}

/** The encrypted key in a Chromium `Local State` file, or null when there is none to be read. */
function keyIn(file: string): string | null {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      os_crypt?: { encrypted_key?: unknown }
    }
    const key = state.os_crypt?.encrypted_key
    return typeof key === 'string' && key !== '' ? key : null
  } catch {
    return null
  }
}

function readOwner(dataDir: string): KeyOwner | null {
  try {
    const owner = JSON.parse(
      fs.readFileSync(path.join(dataDir, KEY_OWNER_FILENAME), 'utf8')
    ) as Partial<KeyOwner> | null
    return typeof owner?.host === 'string' &&
      typeof owner.disk === 'string' &&
      OWNER_ID.test(owner.host) &&
      OWNER_ID.test(owner.disk)
      ? { host: owner.host, disk: owner.disk }
      : null
  } catch {
    return null
  }
}

/** Writes beside the target first: a file is either the old one or the whole new one. */
function replaceFile(target: string, write: (temporary: string) => void): void {
  const temporary = `${target}.${process.pid}.tmp`
  try {
    write(temporary)
    fs.renameSync(temporary, target)
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true })
    } catch {
      // The first error is the one to report.
    }
    throw error
  }
}

interface KeptKey {
  file: string
  owner: KeyOwner
  /** An older key of that PC: never put back by itself. */
  older: boolean
  key: string
  modified: number
}

function keptKeys(dataDir: string): KeptKey[] {
  let names: string[]
  try {
    names = fs.readdirSync(dataDir)
  } catch {
    return []
  }
  const kept: KeptKey[] = []
  for (const name of names) {
    const match = KEPT_FILENAME.exec(name)
    if (!match) continue
    const file = path.join(dataDir, name)
    const key = keyIn(file)
    if (key === null) continue
    let modified = 0
    try {
      modified = fs.statSync(file).mtimeMs
    } catch {
      // Gone meanwhile, or unreadable: it still counts as kept, as the oldest.
    }
    kept.push({
      file,
      owner: { host: match[1] ?? '', disk: match[2] ?? '' },
      older: match[3] !== undefined,
      key,
      modified,
    })
  }
  return kept
}

/**
 * Keeps a copy of the key file under the name of its PC. A key that is kept there already is never
 * replaced: it becomes an older key of that PC, and stays.
 */
function keep(dataDir: string, keyFile: string, owner: KeyOwner): void {
  const target = path.join(
    dataDir,
    `${KEY_FILENAME}.${owner.host}-${owner.disk}`
  )
  replaceFile(target, (temporary) => {
    fs.copyFileSync(keyFile, temporary)
    if (fs.existsSync(target)) {
      let index = 2
      while (fs.existsSync(`${target}.${index}`)) index++
      fs.renameSync(target, `${target}.${index}`)
    }
  })
}

/**
 * A portable folder can be carried to another PC, and Chromium replaces a key it cannot decrypt
 * with a new one as soon as it starts: the passwords saved on the first PC would be unreadable for
 * good, also back there. So before Chromium reads its file:
 *
 * 1. the key in it is kept under the name of its PC, unless it is kept already. Whose it is, the
 *    kept files say; a key that is new to them was made by the PC that ran last;
 * 2. this PC is written down as the one that ran last;
 * 3. if the key is of another PC, the key this PC made earlier is put in its place, or none, and
 *    Chromium makes one.
 *
 * On another PC the passwords then ask to be typed again; nothing is lost, and every step can be
 * repeated after a failure. Must run before the app is ready, on the data folder of a portable
 * copy only. Throws a PortableKeyError.
 */
export function selectPortableKey(
  dataDir: string,
  me: KeyOwner
): PortableKeyChange {
  const active = path.join(dataDir, KEY_FILENAME)
  const activeKey = keyIn(active)
  const recorded = readOwner(dataDir)
  const kept = keptKeys(dataDir)

  const known = kept.find((entry) => entry.key === activeKey)
  const activeOwner =
    activeKey === null ? null : (known?.owner ?? recorded ?? me)
  const foreign = activeOwner !== null && !samePc(activeOwner, me)
  const usedElsewhere = recorded !== null && !samePc(recorded, me)

  try {
    if (activeOwner !== null && !known) {
      try {
        keep(dataDir, active, activeOwner)
      } catch (error) {
        // Its own key Chromium can read, and leaves alone: going without the copy loses nothing.
        if (foreign) throw error
      }
    }

    // Before the key file changes: a key Chromium makes from here on is this PC's.
    if (recorded?.host !== me.host || recorded.disk !== me.disk) {
      replaceFile(path.join(dataDir, KEY_OWNER_FILENAME), (temporary) =>
        fs.writeFileSync(temporary, JSON.stringify(me))
      )
    }

    if (activeOwner !== null && !foreign)
      return recorded === null
        ? 'claimed'
        : usedElsewhere
          ? 'restored'
          : 'unchanged'

    const own = kept
      .filter((entry) => !entry.older && samePc(entry.owner, me))
      .sort((one, other) => other.modified - one.modified)[0]
    if (own) {
      replaceFile(active, (temporary) => fs.copyFileSync(own.file, temporary))
      return 'restored'
    }
    if (foreign) {
      fs.rmSync(active)
      return 'set-aside'
    }
    // No key at all: Chromium makes one.
    return recorded === null
      ? 'claimed'
      : usedElsewhere
        ? 'set-aside'
        : 'unchanged'
  } catch (error) {
    throw new PortableKeyError(error, foreign || usedElsewhere)
  }
}
