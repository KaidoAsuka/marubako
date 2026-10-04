import path from 'node:path'

export const DEV_USER_DATA_DIRNAME = 'marubako-dev'
/**
 * A file of this name beside the executable makes the copy a portable one. The zip of a release
 * carries it; it is also the read-me of that zip (scripts/make-portable.cjs).
 */
export const PORTABLE_MARKER_FILENAME = 'portable.txt'
/** Where a portable copy keeps everything: this folder beside its executable. */
export const PORTABLE_DATA_DIRNAME = 'data'
/** What the installer leaves beside the executable: a copy that has it is an installed one. */
export const UNINSTALLER_FILENAME = 'Uninstall Marubako.exe'
/** In the temporary folder: where a copy that must not start spends its last moment. */
export const NOT_STARTED_USER_DATA_DIRNAME = 'marubako-not-started'

interface PortableOptions {
  isPackaged: boolean
  /** The full path of the running executable. */
  exePath: string
  isFile: (target: string) => boolean
  exists: (target: string) => boolean
}

/**
 * The portable copy (the zip of a release, unpacked anywhere): a packaged program that finds the
 * marker file beside its executable keeps everything in the folder `data` there and nothing in the
 * user profile. The marker, not the data folder, decides: a copy whose data folder was moved away
 * is still portable and starts empty, it does not turn to the data of an installed copy. An
 * installed copy is never portable, whatever is beside it: its folder is replaced by every update,
 * and the data would go with it.
 */
export function resolvePortableDataDir({
  isPackaged,
  exePath,
  isFile,
  exists,
}: PortableOptions): string | undefined {
  if (!isPackaged) return undefined
  const folder = path.dirname(exePath)
  if (exists(path.join(folder, UNINSTALLER_FILENAME))) return undefined
  if (!isFile(path.join(folder, PORTABLE_MARKER_FILENAME))) return undefined
  return path.join(folder, PORTABLE_DATA_DIRNAME)
}

interface UserDataOverrideOptions {
  envUserData: string | undefined
  isPackaged: boolean
  appDataDir: string
  /** The folder of a portable copy (resolvePortableDataDir), if this is one. */
  portableDataDir?: string | undefined
}

/**
 * QUICKLAUNCH_USER_DATA always wins: the e2e suite and the packaged smoke test rely on it.
 * Otherwise an unpackaged build (npm run dev, `electron .`) gets its own directory, so it can
 * never read, overwrite or lock the data of an installed copy, and a portable copy uses the folder
 * beside its executable. An installed copy is left with Electron's default.
 */
export function resolveUserDataOverride({
  envUserData,
  isPackaged,
  appDataDir,
  portableDataDir,
}: UserDataOverrideOptions): string | undefined {
  if (envUserData) return envUserData
  if (!isPackaged) return path.join(appDataDir, DEV_USER_DATA_DIRNAME)
  return portableDataDir
}
