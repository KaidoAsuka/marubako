// Starts the portable copy, the way someone who downloaded the zip would: unpacks
// release/<version>/Marubako-<version>-portable.zip into a temporary folder, runs the program in it
// and checks that it really is a portable copy (its data is in the folder beside it, it does not
// ask for updates, and it looks after the key of another PC).
//
//   npm run dist
//   node scripts/smoke-portable.cjs
//
// The program is started without a data folder of its own to point at. QUICKLAUNCH_REQUIRE_PORTABLE
// makes it stop at once if it does not find itself portable, so that it can never go on to the
// data of an installed copy on this computer.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')
const { _electron: electron, expect } = require('@playwright/test')
const { version } = require('../package.json')
const {
  DATA_DIRNAME,
  FOLDER,
  MARKER_FILENAME,
  systemTar,
} = require('./make-portable.cjs')

const exists = (target) =>
  fs.access(target).then(
    () => true,
    () => false
  )
// The program lets go of its files a moment after it has gone.
const settle = () => new Promise((resolve) => setTimeout(resolve, 1000))

async function main() {
  const zip = path.resolve(
    __dirname,
    `../release/${version}/Marubako-${version}-portable.zip`
  )
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'marubako-portable-'))
  let app
  try {
    execFileSync(systemTar(), ['-x', '-f', zip, '-C', target])
    const folder = path.join(target, FOLDER)
    const executablePath = path.join(folder, 'Marubako.exe')
    const dataDir = path.join(folder, DATA_DIRNAME)

    // What the zip holds: one folder with the program and the file that makes it portable.
    expect(await fs.readdir(target)).toEqual([FOLDER])
    expect(await exists(executablePath)).toBe(true)
    expect(
      await fs.readFile(path.join(folder, MARKER_FILENAME), 'utf8')
    ).toContain('does not update itself')
    // No data folder: a new version is unpacked over the old one and must not bring one along.
    expect(await exists(dataDir)).toBe(false)
    // No uninstaller: with it beside the program, the copy would count as an installed one.
    expect(await exists(path.join(folder, 'Uninstall Marubako.exe'))).toBe(
      false
    )

    const env = {
      ...process.env,
      QUICKLAUNCH_REQUIRE_PORTABLE: '1',
      QUICKLAUNCH_LOCALE: 'en-US',
    }
    delete env.QUICKLAUNCH_USER_DATA
    delete env.QUICKLAUNCH_E2E
    delete env.ELECTRON_RUN_AS_NODE
    const launch = async () => {
      app = await electron.launch({ executablePath, args: [], env })
      const page = await app.firstWindow()
      await expect(page.getByTestId('app-root')).toBeVisible()
      return page
    }
    const quit = async () => {
      await app.close()
      app = undefined
      await settle()
    }

    const page = await launch()
    const identity = await app.evaluate(({ app: running }) => ({
      version: running.getVersion(),
      packaged: running.isPackaged,
      userData: running.getPath('userData'),
    }))
    expect(identity.version).toBe(version)
    expect(identity.packaged).toBe(true)
    expect(path.resolve(identity.userData).toLowerCase()).toBe(
      path.resolve(dataDir).toLowerCase()
    )

    // The data file and the log are written beside the program.
    await expect
      .poll(() => exists(path.join(dataDir, 'quicklaunch-data.json')))
      .toBe(true)
    await expect
      .poll(() => exists(path.join(dataDir, 'logs', 'main.log')))
      .toBe(true)

    // It does not update itself, and says so when asked.
    const update = await page.evaluate(() =>
      globalThis.quickLaunch.checkForUpdates()
    )
    expect(update).toEqual({ ok: true, data: { status: 'disabled' } })

    // The folder can be carried to another PC and back. Chromium replaces a key it cannot decrypt,
    // so the program has to take the key of the other PC out of its way, keep it, and bring the
    // one of this PC back (src/main/portable-key.ts). Here: something is encrypted, the folder is
    // made to look as if it had been on another PC since, and the program is started again.
    const secret = await app.evaluate(({ safeStorage }) =>
      safeStorage.encryptString('kept').toString('base64')
    )
    await quit()

    const keyFile = path.join(dataDir, 'Local State')
    const ownerFile = path.join(dataDir, 'Local State.owner')
    const here = JSON.parse(await fs.readFile(ownerFile, 'utf8'))
    expect(here.host).toMatch(/^[0-9a-f]{16}$/)
    expect(here.disk).toMatch(/^[0-9a-f]{16}$/)
    const there = { host: 'b'.repeat(16), disk: 'c'.repeat(16) }
    const keptOf = (owner) => `${keyFile}.${owner.host}-${owner.disk}`
    const keyIn = async (file) =>
      JSON.parse(await fs.readFile(file, 'utf8')).os_crypt.encrypted_key
    // A key of "another PC": this one with its end changed, which Windows here refuses.
    const blob = Buffer.from(await keyIn(keyFile), 'base64')
    for (let index = blob.length - 24; index < blob.length; index++)
      blob[index] ^= 0x5a
    const foreignKey = blob.toString('base64')
    // What a start on the other PC leaves behind: the key of this PC kept under its name, a key of
    // its own in place, and itself on record as the one that ran last.
    await fs.rename(keyFile, keptOf(here))
    await fs.writeFile(
      keyFile,
      JSON.stringify({ os_crypt: { encrypted_key: foreignKey } })
    )
    await fs.writeFile(ownerFile, JSON.stringify(there))

    await launch()
    const readBack = await app.evaluate(
      ({ safeStorage }, cipher) =>
        safeStorage.decryptString(Buffer.from(cipher, 'base64')),
      secret
    )
    expect(readBack).toBe('kept')
    await quit()
    // The key of the other PC is kept for when the folder goes back there.
    expect(await keyIn(keptOf(there))).toBe(foreignKey)
    expect(JSON.parse(await fs.readFile(ownerFile, 'utf8'))).toEqual(here)

    // When the folder cannot be made ready with the key of another PC in place, the program does
    // not start at all: Chromium would replace that key. (A folder where the record of the owner
    // belongs makes writing it fail.)
    await fs.copyFile(keptOf(there), keyFile)
    await fs.rm(ownerFile)
    await fs.mkdir(ownerFile)
    const refused = spawnSync(executablePath, [], { env, timeout: 60_000 })
    expect(refused.status).toBe(3)
    expect(await keyIn(keyFile)).toBe(foreignKey)
    await fs.rmdir(ownerFile)

    // Without the file that marks it, the copy is not portable, and under this test it stops
    // before it reaches any data.
    await fs.rm(path.join(folder, MARKER_FILENAME))
    const notPortable = spawnSync(executablePath, [], { env, timeout: 60_000 })
    expect(notPortable.status).toBe(2)

    console.log(
      JSON.stringify(
        {
          version: identity.version,
          portable: true,
          userData: path.relative(target, identity.userData),
          updateCheck: update.data.status,
          keyOfThisPc: 'brought back',
          keyOfAnotherPc: 'kept',
          keyThatCannotBeKept: 'no start',
          withoutTheMarker: 'no start under this test',
        },
        null,
        2
      )
    )
  } finally {
    await app?.close().catch(() => {})
    await settle()
    await fs
      .rm(target, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 500,
      })
      .catch((error) =>
        console.warn(`Could not remove ${target}: ${error.message}`)
      )
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
