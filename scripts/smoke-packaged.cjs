const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { _electron: electron, expect } = require('@playwright/test')
const { version } = require('../package.json')

async function main() {
  const executablePath = path.resolve(
    __dirname,
    `../release/${version}/win-unpacked/Marubako.exe`
  )
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'marubako-packaged-')
  )
  const safeTempRoot = path.resolve(os.tmpdir()) + path.sep
  if (!path.resolve(userDataDir).startsWith(safeTempRoot))
    throw new Error('Unexpected test data path')
  const env = { ...process.env, QUICKLAUNCH_USER_DATA: userDataDir }
  delete env.QUICKLAUNCH_E2E
  delete env.ELECTRON_RUN_AS_NODE
  let app
  try {
    app = await electron.launch({ executablePath, args: [], env })
    const page = await app.firstWindow()
    await expect(page.getByTestId('app-root')).toBeVisible()
    const identity = await app.evaluate(({ app: runningApp }) => ({
      version: runningApp.getVersion(),
      packaged: runningApp.isPackaged,
    }))
    expect(identity).toEqual({ version, packaged: true })
    const logFile = path.join(userDataDir, 'logs', 'main.log')
    await expect
      .poll(async () =>
        (await fs.readFile(logFile, 'utf8')).includes('Tray icon loaded')
      )
      .toBe(true)
    const trayLog = (await fs.readFile(logFile, 'utf8')).split(
      'Tray icon loaded'
    )[1]
    expect(trayLog).toMatch(/width: 16, height: 16/)
    expect(trayLog).toMatch(/scales: \[ 1, 1\.25, 1\.5, 2, 2\.5, 3 \]/)
    const settings = await page.evaluate(() =>
      globalThis.quickLaunch.getLaunchSettings()
    )
    expect(settings.ok).toBe(true)
    expect(settings.data.canAutoStart).toBe(true)
    await page.screenshot({
      path: 'artifacts/packaged-workspace.png',
      animations: 'disabled',
    })
    await page.getByTestId('open-settings').click()
    await page.getByTestId('settings-tab-behavior').click()
    await page.screenshot({
      path: 'artifacts/packaged-settings.png',
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')

    await page.getByTestId('tab-commands').click()
    await page.getByTestId('add-loose-item-commands').click()
    await page.getByTestId('item-name-input').fill('列出工作目录')
    await page
      .getByTestId('command-description')
      .fill('查看文件与目录，复制到终端使用')
    await page.getByTestId('command-language').selectOption('powershell')
    const script =
      '# 查看工作目录\n$root = "C:\\Work"\nGet-ChildItem $root | ForEach-Object {\n  Write-Output $_.Name\n}\n'
    await page.getByTestId('command-code-input').fill(script)
    await page.getByTestId('item-save').click()
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    await page
      .getByRole('button', { name: '展开全部代码', exact: true })
      .click()
    await expect(page.locator('.snippet-code code')).toHaveText(script)
    const saved = await page.evaluate(() => globalThis.quickLaunch.loadData())
    expect(saved.ok).toBe(true)
    expect(saved.data.loose.commands[0].content).toBe(script)
    await page.screenshot({
      path: 'artifacts/packaged-commands.png',
      animations: 'disabled',
    })

    await page.getByTestId('tab-passwords').click()
    await page.getByTestId('add-loose-item-passwords').click()
    await page.getByTestId('item-name-input').fill('开发账号')
    await page.getByTestId('item-username-input').fill('demo@example.com')
    await page.getByTestId('item-password-input').fill(' Demo+Password/123 ')
    await page.getByTestId('item-password-input').press('Control+s')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
    const credential = page
      .locator('.password-item')
      .filter({ hasText: '开发账号' })
    const credentialId = await credential.getAttribute('data-top-entry-id')
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            globalThis.copiedCredential = value
          },
        },
      })
    })
    await page.getByTestId(`copy-username-${credentialId}`).click()
    expect(await page.evaluate(() => globalThis.copiedCredential)).toBe(
      'demo@example.com'
    )
    await page.getByTestId(`copy-item-${credentialId}`).click()
    expect(await page.evaluate(() => globalThis.copiedCredential)).toBe(
      ' Demo+Password/123 '
    )
    await expect(credential).not.toContainText('Demo+Password/123')
    await page.screenshot({
      path: 'artifacts/packaged-credentials.png',
      animations: 'disabled',
    })

    await page.getByTestId('close-window').click()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())
            .isVisible()
        )
      )
      .toBe(false)
    // The ball is permanent: it is shown (after the panel is hidden, hence the poll) and is the only
    // window left, not hidden along with the panel.
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .filter((window) => window.isVisible())
            .map((window) => window.isResizable())
        )
      )
      .toEqual([false])
    const duplicate = spawn(executablePath, [], {
      env,
      stdio: 'ignore',
      windowsHide: true,
    })
    const duplicateExit = new Promise((resolve, reject) => {
      duplicate.once('error', reject)
      duplicate.once('exit', (code) => resolve(code))
    })
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())
            .isVisible()
        )
      )
      .toBe(true)
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    expect(await duplicateExit).toBe(0)
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
      )
    ).toBe(2)
    const expandedSize = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isResizable())
        .getSize()
    )
    await page.getByTestId('dock-panel').click()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())
            .isVisible()
        )
      )
      .toBe(false)
    const compactSize = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.isResizable())
        .getSize()
    )
    expect(compactSize).toEqual([56, 56])
    const bubble = app.windows().find((window) => window !== page)
    await expect(bubble.getByTestId('dock-bubble')).toBeVisible()
    await bubble.screenshot({ path: 'artifacts/packaged-bubble.png' })
    const drag = await app.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()
        .find((window) => !window.isResizable())
        .getBounds()
      return {
        bounds,
        start: screen.dipToScreenPoint({ x: bounds.x + 28, y: bounds.y + 28 }),
        end: screen.dipToScreenPoint({ x: bounds.x + 88, y: bounds.y + 58 }),
      }
    })
    await promisify(execFile)(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.resolve('e2e/native-mouse.ps1'),
        '-StartX',
        String(drag.start.x),
        '-StartY',
        String(drag.start.y),
        '-EndX',
        String(drag.end.x),
        '-EndY',
        String(drag.end.y),
      ],
      { windowsHide: true }
    )
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((window) => !window.isResizable())
              .getBounds().x
        )
      )
      .toBe(drag.bounds.x + 60)
    await bubble.getByTestId('dock-bubble').dblclick()
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.isResizable())
            .isVisible()
        )
      )
      .toBe(true)
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    await expect(page.getByTestId('tab-folders')).toBeVisible()
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())
          .getSize()
      )
    ).toEqual(expandedSize)
    const pin = page.getByTestId('toggle-pin')
    await pin.click()
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())
          .isAlwaysOnTop()
      )
    ).toBe(true)
    await pin.click()
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.isResizable())
          .isAlwaysOnTop()
      )
    ).toBe(false)
    expect(await fs.readFile(logFile, 'utf8')).not.toContain(
      'Timed out preparing window frame'
    )
    console.log(
      JSON.stringify(
        {
          ...identity,
          shortcutAvailable: settings.data.shortcutAvailable,
          shortcut: settings.data.shortcut,
          closeToTray: true,
          ballStays: true,
          panelPinning: true,
          nativeBubbleDragging: true,
          duplicateLaunch: 'reused existing window',
          recallCollapsedWindow: true,
          compactWindow:
            '56 × 56 freely movable bubble, preserves panel dimensions',
          commandRecording: true,
          credentialCopying: true,
          trayIcon: '16px logical size, 6 scale representations',
        },
        null,
        2
      )
    )
  } finally {
    if (app) {
      await app
        .evaluate(({ app: runningApp }) => runningApp.quit())
        .catch(() => {})
      await app.close()
    }
    await fs.rm(userDataDir, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
