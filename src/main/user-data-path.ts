import path from 'node:path'

export const DEV_USER_DATA_DIRNAME = 'marubako-dev'

interface UserDataOverrideOptions {
  envUserData: string | undefined
  isPackaged: boolean
  appDataDir: string
}

/**
 * QUICKLAUNCH_USER_DATA always wins: the e2e suite and the packaged smoke test rely on it.
 * Otherwise an unpackaged build (npm run dev, `electron .`) gets its own directory, so it can
 * never read, overwrite or lock the data of an installed copy.
 */
export function resolveUserDataOverride({
  envUserData,
  isPackaged,
  appDataDir,
}: UserDataOverrideOptions): string | undefined {
  if (envUserData) return envUserData
  if (!isPackaged) return path.join(appDataDir, DEV_USER_DATA_DIRNAME)
  return undefined
}
