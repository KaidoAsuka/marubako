import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { safetyStrings } from '../safety'
import { workspaceStrings } from '../workspace'

describe('safety strings', () => {
  it('have the same keys in every language, all filled in', () => {
    const zhKeys = Object.keys(safetyStrings.zh).sort()
    for (const lang of LANGS) {
      expect(Object.keys(safetyStrings[lang]).sort(), lang).toEqual(zhKeys)
      for (const [key, value] of Object.entries(safetyStrings[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('')
      }
    }
  })

  it.each(LANGS)(
    'say the three things of the password boundary in %s',
    (lang) => {
      const body = safetyStrings[lang].pwd_safety_body!
      // 1) it stays on this computer, 2) anyone who can sign in to the Windows account sees it,
      // 3) use a dedicated manager for important accounts.
      expect(body, lang).toContain('Windows')
      expect(body.length, lang).toBeGreaterThan(40)
    }
  )

  it('keeps the boundary in the hint under the password field, in every language', () => {
    expect(workspaceStrings.zh.item_password_hint).toMatch(
      /这台电脑.*Windows 账户.*密码管理器/
    )
    expect(workspaceStrings.en.item_password_hint).toMatch(
      /this computer.*Windows account.*password manager/
    )
    expect(workspaceStrings.ja.item_password_hint).toMatch(
      /このコンピューター.*Windows アカウント.*パスワードマネージャー/
    )
  })

  it('does not promise what the product does not do', () => {
    // The owner decided against a master password and against clearing the clipboard.
    for (const lang of LANGS) {
      const text = [
        safetyStrings[lang].pwd_safety_title,
        safetyStrings[lang].pwd_safety_body,
        workspaceStrings[lang].item_password_hint,
      ].join(' ')
      expect(text, lang).not.toMatch(
        /主密码|master password|マスターパスワード/i
      )
      expect(text, lang).not.toMatch(
        /清除剪贴板|clear the clipboard|クリップボードを消去/i
      )
    }
  })
})
