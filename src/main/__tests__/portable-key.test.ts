import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  KEY_FILENAME,
  KEY_OWNER_FILENAME,
  keyOwner,
  PortableKeyError,
  samePc,
  selectPortableKey,
  type KeyOwner,
} from '../portable-key'

/** `volume` null: the serial number of the disk could not be read. */
const pc = (
  hostname: string,
  volume: number | null = 0x1234abcd,
  username = 'mika'
): KeyOwner =>
  keyOwner({
    hostname,
    username,
    homeDir: `C:\\Users\\${username}`,
    volume: volume ?? undefined,
  })

const HERE = pc('DESKTOP-HERE', 0x1111aaaa)
const THERE = pc('DESKTOP-THERE', 0x2222bbbb)

let dataDir: string
const file = (name: string): string => path.join(dataDir, name)
const names = (): string[] => fs.readdirSync(dataDir).sort()
const keptName = (owner: KeyOwner, older = ''): string =>
  `${KEY_FILENAME}.${owner.host}-${owner.disk}${older}`

/** A `Local State` as Chromium writes it, with other things in it besides the key. */
const stateWith = (key: string): string =>
  JSON.stringify({ os_crypt: { encrypted_key: key }, other: `beside ${key}` })
const writeKey = (name: string, key: string): void =>
  fs.writeFileSync(file(name), stateWith(key))
const keyOf = (name: string): string | undefined => {
  try {
    return (
      JSON.parse(fs.readFileSync(file(name), 'utf8')) as {
        os_crypt: { encrypted_key: string }
      }
    ).os_crypt.encrypted_key
  } catch {
    return undefined
  }
}
const writeOwner = (owner: KeyOwner): void =>
  fs.writeFileSync(file(KEY_OWNER_FILENAME), JSON.stringify(owner))
const owner = (): unknown =>
  JSON.parse(fs.readFileSync(file(KEY_OWNER_FILENAME), 'utf8'))

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marubako-key-test-'))
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

describe('keyOwner', () => {
  it('names one account on one PC in two ways, whatever the case of the names', () => {
    expect(HERE.host).toMatch(/^[0-9a-f]{16}$/)
    expect(HERE.disk).toMatch(/^[0-9a-f]{16}$/)
    expect(pc('desktop-here', 0x1111aaaa, 'MIKA')).toEqual(HERE)
    expect(samePc(HERE, THERE)).toBe(false)
    expect(samePc(HERE, pc('DESKTOP-HERE', 0x1111aaaa, 'ren'))).toBe(false)
  })

  it('does not put the names themselves into the folder', () => {
    const written = JSON.stringify(HERE).toLowerCase()

    expect(written).not.toContain('mika')
    expect(written).not.toContain('desktop')
  })

  it('still knows a PC that was renamed, by its disk', () => {
    const renamed = pc('STUDY', 0x1111aaaa)

    expect(renamed.host).not.toBe(HERE.host)
    expect(samePc(HERE, renamed)).toBe(true)
  })

  it('still knows a PC whose disk reads differently, by its names', () => {
    expect(samePc(HERE, pc('DESKTOP-HERE', 0x99999999))).toBe(true)
  })

  // Without the serial number only the path of the home folder would be left, which is the same
  // on every PC where the account has the same name.
  it('does not take two PCs for one because neither disk could be read', () => {
    const one = pc('DESKTOP-ONE', null)
    const two = pc('DESKTOP-TWO', null)

    expect(samePc(one, two)).toBe(false)
    expect(samePc(one, pc('DESKTOP-ONE', null))).toBe(true)
  })
})

describe('selectPortableKey', () => {
  it('writes down the owner of a new folder and touches nothing else', () => {
    expect(selectPortableKey(dataDir, HERE)).toBe('claimed')

    expect(owner()).toEqual(HERE)
    expect(names()).toEqual([KEY_OWNER_FILENAME])
  })

  it('keeps a copy of the key this PC has made, once', () => {
    selectPortableKey(dataDir, HERE)
    // What Chromium does on the first start.
    writeKey(KEY_FILENAME, 'key of here')

    expect(selectPortableKey(dataDir, HERE)).toBe('unchanged')
    expect(keyOf(keptName(HERE))).toBe('key of here')
    expect(keyOf(KEY_FILENAME)).toBe('key of here')

    expect(selectPortableKey(dataDir, HERE)).toBe('unchanged')
    expect(names()).toEqual(
      [KEY_FILENAME, KEY_OWNER_FILENAME, keptName(HERE)].sort()
    )
  })

  // The data of an installed copy on this PC, copied into the data folder.
  it('takes a key without an owner on record to be of this PC, and keeps a copy', () => {
    writeKey(KEY_FILENAME, 'key of here')

    expect(selectPortableKey(dataDir, HERE)).toBe('claimed')

    expect(keyOf(KEY_FILENAME)).toBe('key of here')
    expect(keyOf(keptName(HERE))).toBe('key of here')
    expect(owner()).toEqual(HERE)
  })

  // Chromium would replace a key it cannot decrypt: the passwords of the first PC would be lost.
  it('keeps the key of another PC and takes it out of the way of Chromium', () => {
    writeKey(KEY_FILENAME, 'key of there')
    writeOwner(THERE)

    expect(selectPortableKey(dataDir, HERE)).toBe('set-aside')

    expect(fs.existsSync(file(KEY_FILENAME))).toBe(false)
    expect(fs.readFileSync(file(keptName(THERE)), 'utf8')).toBe(
      stateWith('key of there')
    )
    expect(owner()).toEqual(HERE)
  })

  it('goes back and forth between two PCs without losing either key', () => {
    selectPortableKey(dataDir, HERE)
    writeKey(KEY_FILENAME, 'key of here')

    // Carried to the other PC after a single start here: no copy has been made yet.
    expect(selectPortableKey(dataDir, THERE)).toBe('set-aside')
    expect(keyOf(keptName(HERE))).toBe('key of here')
    writeKey(KEY_FILENAME, 'key of there')

    expect(selectPortableKey(dataDir, HERE)).toBe('restored')
    expect(keyOf(KEY_FILENAME)).toBe('key of here')
    expect(keyOf(keptName(THERE))).toBe('key of there')

    expect(selectPortableKey(dataDir, THERE)).toBe('restored')
    expect(keyOf(KEY_FILENAME)).toBe('key of there')

    expect(selectPortableKey(dataDir, HERE)).toBe('restored')
    expect(keyOf(KEY_FILENAME)).toBe('key of here')
    expect(names()).toEqual(
      [KEY_FILENAME, KEY_OWNER_FILENAME, keptName(HERE), keptName(THERE)].sort()
    )
  })

  it('leaves the key alone on a PC that was renamed since', () => {
    writeKey(KEY_FILENAME, 'key of here')
    writeOwner(HERE)
    writeKey(keptName(HERE), 'key of here')
    const renamed = pc('STUDY', 0x1111aaaa)

    expect(selectPortableKey(dataDir, renamed)).toBe('unchanged')

    expect(keyOf(KEY_FILENAME)).toBe('key of here')
    expect(owner()).toEqual(renamed)
  })

  it('finds the key of a renamed PC again when the folder comes back from elsewhere', () => {
    writeKey(KEY_FILENAME, 'key of there')
    writeOwner(THERE)
    writeKey(keptName(HERE), 'key of here')

    expect(selectPortableKey(dataDir, pc('STUDY', 0x1111aaaa))).toBe('restored')

    expect(keyOf(KEY_FILENAME)).toBe('key of here')
    expect(keyOf(keptName(THERE))).toBe('key of there')
  })

  it('never replaces a key that is kept: an older one stays beside the newer', () => {
    writeKey(keptName(THERE), 'key of there, older')
    writeKey(KEY_FILENAME, 'key of there, newer')
    writeOwner(THERE)

    expect(selectPortableKey(dataDir, HERE)).toBe('set-aside')

    expect(keyOf(keptName(THERE))).toBe('key of there, newer')
    expect(keyOf(keptName(THERE, '.2'))).toBe('key of there, older')
  })

  it('does not put an older key of this PC back by itself', () => {
    writeKey(keptName(HERE, '.2'), 'key of here, older')
    writeKey(KEY_FILENAME, 'key of there')
    writeOwner(THERE)

    expect(selectPortableKey(dataDir, HERE)).toBe('set-aside')

    expect(fs.existsSync(file(KEY_FILENAME))).toBe(false)
  })

  it('puts the key of this PC back when the key file is gone', () => {
    writeOwner(HERE)
    writeKey(keptName(HERE), 'key of here')

    expect(selectPortableKey(dataDir, HERE)).toBe('restored')

    expect(keyOf(KEY_FILENAME)).toBe('key of here')
  })

  it('still records this PC when the other one left no key', () => {
    writeOwner(THERE)

    expect(selectPortableKey(dataDir, HERE)).toBe('set-aside')

    expect(names()).toEqual([KEY_OWNER_FILENAME])
    expect(owner()).toEqual(HERE)
  })

  it('reads an owner file that is not one as no owner at all', () => {
    writeKey(KEY_FILENAME, 'key of here')
    fs.writeFileSync(file(KEY_OWNER_FILENAME), '..\\..\\somewhere else')

    expect(selectPortableKey(dataDir, HERE)).toBe('claimed')

    expect(keyOf(KEY_FILENAME)).toBe('key of here')
    expect(owner()).toEqual(HERE)
  })

  describe('after a start that was cut short', () => {
    // The key of this PC was put back, and the record still names the other PC.
    it('goes by what is kept, not by the record: on this PC nothing moves', () => {
      writeKey(KEY_FILENAME, 'key of here')
      writeKey(keptName(HERE), 'key of here')
      writeKey(keptName(THERE), 'key of there')
      writeOwner(THERE)

      expect(selectPortableKey(dataDir, HERE)).toBe('restored')

      expect(keyOf(KEY_FILENAME)).toBe('key of here')
      expect(keyOf(keptName(THERE))).toBe('key of there')
      expect(names()).toHaveLength(4)
      expect(owner()).toEqual(HERE)
    })

    it('goes by what is kept, not by the record: the other PC gets its own key back', () => {
      writeKey(KEY_FILENAME, 'key of here')
      writeKey(keptName(HERE), 'key of here')
      writeKey(keptName(THERE), 'key of there')
      writeOwner(THERE)

      expect(selectPortableKey(dataDir, THERE)).toBe('restored')

      expect(keyOf(KEY_FILENAME)).toBe('key of there')
      expect(keyOf(keptName(HERE))).toBe('key of here')
    })

    // This PC was recorded, and the key of the other one is still in place.
    it('takes the key of the other PC out of the way on the next start', () => {
      writeKey(KEY_FILENAME, 'key of there')
      writeKey(keptName(THERE), 'key of there')
      writeOwner(HERE)

      expect(selectPortableKey(dataDir, HERE)).toBe('set-aside')

      expect(fs.existsSync(file(KEY_FILENAME))).toBe(false)
      expect(keyOf(keptName(THERE))).toBe('key of there')
    })
  })

  describe('when the folder cannot be written to', () => {
    /** Every write that would create or replace a file in the folder fails. */
    function refuseWrites(): void {
      const refuse = (): never => {
        throw Object.assign(new Error('EPERM: operation not permitted'), {
          code: 'EPERM',
        })
      }
      vi.spyOn(fs, 'copyFileSync').mockImplementation(refuse)
      vi.spyOn(fs, 'writeFileSync').mockImplementation(refuse)
    }
    const caught = (): PortableKeyError => {
      try {
        selectPortableKey(dataDir, HERE)
      } catch (error) {
        return error as PortableKeyError
      }
      throw new Error('selectPortableKey did not throw')
    }

    // Starting would let Chromium replace the key.
    it('refuses to start on the key of another PC, and leaves it where it is', () => {
      writeKey(KEY_FILENAME, 'key of there')
      writeOwner(THERE)
      refuseWrites()

      const error = caught()

      expect(error).toBeInstanceOf(PortableKeyError)
      expect(error.fatal).toBe(true)
      expect(error.message).toContain('EPERM')
      expect(keyOf(KEY_FILENAME)).toBe('key of there')
      expect(owner()).toEqual(THERE)
      expect(names()).toEqual([KEY_FILENAME, KEY_OWNER_FILENAME].sort())
    })

    it('refuses to start when the other PC cannot be replaced on the record', () => {
      writeOwner(THERE)
      refuseWrites()

      expect(caught().fatal).toBe(true)
    })

    // Chromium can read its own key and leaves it alone.
    it('lets the program start on the key of this PC, without the copy', () => {
      writeKey(KEY_FILENAME, 'key of here')
      writeOwner(HERE)
      refuseWrites()

      expect(selectPortableKey(dataDir, HERE)).toBe('unchanged')
      expect(keyOf(KEY_FILENAME)).toBe('key of here')
    })

    it('lets the program start in a folder nobody has used', () => {
      refuseWrites()

      expect(caught().fatal).toBe(false)
    })
  })
})
