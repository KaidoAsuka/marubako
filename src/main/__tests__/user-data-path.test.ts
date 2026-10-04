import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEV_USER_DATA_DIRNAME,
  PORTABLE_DATA_DIRNAME,
  PORTABLE_MARKER_FILENAME,
  resolvePortableDataDir,
  resolveUserDataOverride,
  UNINSTALLER_FILENAME,
} from '../user-data-path'

const appDataDir = path.join('C:', 'Users', 'someone', 'AppData', 'Roaming')

describe('resolveUserDataOverride', () => {
  it('leaves the default directory alone for a packaged build', () => {
    expect(
      resolveUserDataOverride({
        envUserData: undefined,
        isPackaged: true,
        appDataDir,
      })
    ).toBeUndefined()
  })

  it('moves an unpackaged build to its own directory', () => {
    expect(
      resolveUserDataOverride({
        envUserData: undefined,
        isPackaged: false,
        appDataDir,
      })
    ).toBe(path.join(appDataDir, DEV_USER_DATA_DIRNAME))
  })

  it('never points an unpackaged build at the installed app directory', () => {
    const devDir = resolveUserDataOverride({
      envUserData: undefined,
      isPackaged: false,
      appDataDir,
    })

    // Windows paths are case-insensitive, so compare lower-cased.
    expect(devDir?.toLowerCase()).not.toBe(
      path.join(appDataDir, 'marubako').toLowerCase()
    )
  })

  it('lets QUICKLAUNCH_USER_DATA win in both modes', () => {
    const envUserData = path.join('D:', 'tmp', 'marubako-e2e-1')

    expect(
      resolveUserDataOverride({ envUserData, isPackaged: true, appDataDir })
    ).toBe(envUserData)
    expect(
      resolveUserDataOverride({ envUserData, isPackaged: false, appDataDir })
    ).toBe(envUserData)
  })

  it('treats an empty QUICKLAUNCH_USER_DATA as unset', () => {
    expect(
      resolveUserDataOverride({
        envUserData: '',
        isPackaged: true,
        appDataDir,
      })
    ).toBeUndefined()
    expect(
      resolveUserDataOverride({
        envUserData: '',
        isPackaged: false,
        appDataDir,
      })
    ).toBe(path.join(appDataDir, DEV_USER_DATA_DIRNAME))
  })
})

describe('resolvePortableDataDir', () => {
  const folder = path.join('D:', 'Tools', 'Marubako')
  const exePath = path.join(folder, 'Marubako.exe')
  const marker = path.join(folder, PORTABLE_MARKER_FILENAME)
  const dataDir = path.join(folder, PORTABLE_DATA_DIRNAME)
  const having = (...present: string[]) => ({
    isFile: (target: string) => present.includes(target),
    exists: (target: string) => present.includes(target),
  })

  it('is the folder named data beside a packaged program that has the marker file', () => {
    expect(
      resolvePortableDataDir({
        isPackaged: true,
        exePath,
        ...having(marker),
      })
    ).toBe(dataDir)
  })

  it('is nothing without the marker: an unpacked copy is not portable by itself', () => {
    expect(
      resolvePortableDataDir({ isPackaged: true, exePath, ...having() })
    ).toBeUndefined()
  })

  // The folder is not what decides. A copy whose data folder was moved to a newer one must start
  // empty, and never turn to the data of an installed copy.
  it('does not depend on the data folder being there', () => {
    expect(
      resolvePortableDataDir({
        isPackaged: true,
        exePath,
        ...having(dataDir),
      })
    ).toBeUndefined()
    expect(
      resolvePortableDataDir({
        isPackaged: true,
        exePath,
        ...having(marker, dataDir),
      })
    ).toBe(dataDir)
  })

  it('needs a file: a folder with the name of the marker does not count', () => {
    expect(
      resolvePortableDataDir({
        isPackaged: true,
        exePath,
        isFile: () => false,
        exists: (target) => target === marker,
      })
    ).toBeUndefined()
  })

  // An update replaces the folder of an installed program: data kept there would be deleted.
  it('is never the folder of an installed copy, even if someone put the marker there', () => {
    expect(
      resolvePortableDataDir({
        isPackaged: true,
        exePath,
        ...having(marker, path.join(folder, UNINSTALLER_FILENAME)),
      })
    ).toBeUndefined()
  })

  it('is nothing for a development build', () => {
    expect(
      resolvePortableDataDir({
        isPackaged: false,
        exePath,
        ...having(marker),
      })
    ).toBeUndefined()
  })

  it('names the uninstaller as the installer does: after the product', () => {
    expect(UNINSTALLER_FILENAME).toBe('Uninstall Marubako.exe')
  })
})

describe('the data folder of a portable copy', () => {
  const portableDataDir = path.join('D:', 'Tools', 'Marubako', 'data')

  it('is used by the packaged program instead of the user profile', () => {
    expect(
      resolveUserDataOverride({
        envUserData: undefined,
        isPackaged: true,
        appDataDir,
        portableDataDir,
      })
    ).toBe(portableDataDir)
  })

  it('still gives way to QUICKLAUNCH_USER_DATA', () => {
    const envUserData = path.join('D:', 'tmp', 'marubako-e2e-2')

    expect(
      resolveUserDataOverride({
        envUserData,
        isPackaged: true,
        appDataDir,
        portableDataDir,
      })
    ).toBe(envUserData)
  })
})
