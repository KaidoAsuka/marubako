import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createDefaultAppData } from '../src/shared/default-data'
import { closeApp, launchApp } from './test-utils'

async function makeUserDataDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

test('tells the user when an unreadable data file was set aside', async () => {
  const userDataDir = await makeUserDataDir('marubako-notice-')
  const damaged = '{broken-data-with-user-content'
  await fs.writeFile(path.join(userDataDir, 'quicklaunch-data.json'), damaged)
  const context = await launchApp(userDataDir)

  try {
    const { page } = context
    const notice = page.getByTestId('data-notice-reset')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('quicklaunch-data.json.recovery-')
    await expect(
      page.getByTestId('data-notice-open-folder-reset')
    ).toBeVisible()

    await page.getByTestId('data-notice-dismiss-reset').click()
    await expect(notice).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('keeps passwords that cannot be decrypted here and asks for them again', async () => {
  const userDataDir = await makeUserDataDir('marubako-lost-password-')
  const data = createDefaultAppData()
  data.loose.passwords.push({
    id: 'pw-lost',
    kind: 'password',
    name: 'Old mail',
    icon: '🔑',
    username: 'me@example.com',
    password: '',
    note: '',
  })
  data.topOrder.passwords.push({ type: 'loose', id: 'pw-lost' })
  const stored = JSON.parse(JSON.stringify(data))
  delete stored.loose.passwords[0].password
  // Not valid ciphertext for this computer, exactly like a password saved on another one.
  stored.loose.passwords[0].passwordCiphertext = 'AAAA'
  await fs.writeFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    JSON.stringify(stored)
  )
  const context = await launchApp(userDataDir)

  try {
    const { page } = context
    await expect(page.getByTestId('data-notice-passwords-lost')).toBeVisible()

    await page.getByTestId('tab-passwords').click()
    await expect(page.getByTestId('password-lost-pw-lost')).toBeVisible()

    // An unrelated edit must not wipe the stored ciphertext.
    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('app-root')).toHaveClass(/theme-light/)
    await expect
      .poll(async () => {
        const file = JSON.parse(
          await fs.readFile(
            path.join(userDataDir, 'quicklaunch-data.json'),
            'utf8'
          )
        )
        return {
          theme: file.data?.prefs?.theme,
          ciphertext: file.data?.loose?.passwords?.[0]?.passwordCiphertext,
        }
      })
      // The theme starts as dark, so this only holds once the edit itself has been written.
      .toEqual({ theme: 'light', ciphertext: 'AAAA' })

    await page.getByTestId('data-notice-dismiss-passwordsLost').click()
    await expect(page.getByTestId('data-notice-passwords-lost')).toHaveCount(0)
  } finally {
    await closeApp(context)
  }
})

test('shows a failed write, keeps the old file, and recovers when the problem is gone', async () => {
  const context = await launchApp()
  const dataFile = path.join(context.userDataDir, 'quicklaunch-data.json')

  try {
    const { page } = context
    // A failed write is the error line of the feedback strip at the bottom, with its Retry button.
    const strip = page.getByTestId('feedback-strip')
    const open = page.locator('.feedback-strip[data-open]')
    await expect(open).toHaveCount(0)

    // A directory in the place of the file makes every replacement of it fail.
    await fs.rm(dataFile)
    await fs.mkdir(dataFile)
    await page.getByTestId('open-settings').click()
    await page.getByTestId('theme-light').click()
    await page.getByTestId('settings-save').click()

    await expect(open).toHaveCount(1, { timeout: 10_000 })
    await expect(strip).toHaveAttribute('data-kind', 'error')
    const alert = strip.getByRole('alert')
    await expect(alert).toContainText('磁盘写入失败')
    await expect(alert).toContainText('尚未保存')

    // A later edit is accepted by the main process, but must not be announced as saved.
    await page.getByTestId('open-settings').click()
    await page.getByTestId('settings-tab-behavior').click()
    await page.getByTestId('hide-after-launch').check()
    await page.getByTestId('settings-save').click()
    await page.waitForTimeout(800)
    await expect(strip).toHaveAttribute('data-kind', 'error')
    await expect(strip).not.toContainText('已保存')
    await expect(alert).toBeVisible()

    await fs.rmdir(dataFile)
    // The automatic retry may win the race against the button; either way the error must go.
    await page
      .getByTestId('feedback-retry')
      .click({ timeout: 3_000 })
      .catch(() => undefined)
    await expect(open).toHaveCount(0, { timeout: 10_000 })
    await expect
      .poll(async () => {
        const prefs = JSON.parse(await fs.readFile(dataFile, 'utf8')).data
          ?.prefs
        return { theme: prefs?.theme, hideAfterLaunch: prefs?.hideAfterLaunch }
      })
      .toEqual({ theme: 'light', hideAfterLaunch: true })
  } finally {
    await closeApp(context)
  }
})

test('stores a typed password encrypted with the real system key and reads it back after a restart', async () => {
  const first = await launchApp()
  const { userDataDir } = first
  const secret = 'Demo+Secret/123'
  try {
    const { page } = first
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByTestId('tab-passwords').click()
    await page.getByTestId('add-loose-item-passwords').click()
    await page.getByTestId('item-name-input').fill('Real key')
    await page.getByTestId('item-username-input').fill('someone@example.com')
    await page.getByTestId('item-password-input').fill(secret)
    await page.getByTestId('item-note-input').press('Control+s')
    await expect(page.getByTestId('modal-item')).toHaveCount(0)
  } finally {
    // Quitting flushes the debounced write.
    await closeApp(first, { cleanup: false })
  }

  const text = await fs.readFile(
    path.join(userDataDir, 'quicklaunch-data.json'),
    'utf8'
  )
  expect(text).not.toContain(secret)
  const file = JSON.parse(text)
  const stored = [
    ...file.data.passwords.flatMap(
      (group: { items: unknown[] }) => group.items
    ),
    ...file.data.loose.passwords,
  ].find((item: { name: string }) => item.name === 'Real key')
  expect(stored.passwordCiphertext).toEqual(expect.any(String))
  expect(stored.password).toBeUndefined()

  const second = await launchApp(userDataDir)
  try {
    const { page } = second
    await expect(page.getByTestId('data-notice-passwords-lost')).toHaveCount(0)
    await page.getByTestId('tab-passwords').click()
    const card = page.locator('.password-item').filter({ hasText: 'Real key' })
    const id = (await card.getAttribute('data-top-entry-id'))!
    await page.getByTestId(`toggle-password-${id}`).click()
    await expect(card).toContainText(secret)
  } finally {
    await closeApp(second)
  }
})
