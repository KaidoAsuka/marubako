import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEV_USER_DATA_DIRNAME,
  resolveUserDataOverride,
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
