import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../shared/types'
import { workspaceStrings } from '../workspace'

// The strings behind the permanent-ball behaviour (setting, hints). The first-run introduction
// is the first-run card now (onboard-strings.test.ts).
const KEYS = [
  'show_bubble',
  'show_bubble_hint',
  'dock_bubble_hint_open',
  'peek_collapse_delay_hint',
  'hide_after_launch_hint',
  'launch_at_login_hint',
  'dock_guide',
]

describe('floating ball strings', () => {
  it.each(LANGS)('%s has every key and none is empty', (lang) => {
    for (const key of KEYS)
      expect(workspaceStrings[lang][key], `${lang}.${key}`).toBeTruthy()
  })

  // Two engineers add this key in different branches; the texts must be identical to merge.
  it('keeps the agreed collapse hint wording', () => {
    expect(workspaceStrings.zh.dock_bubble_hint_open).toBe(
      '单击收起 · 双击保持打开 · 拖动移动'
    )
    expect(workspaceStrings.en.dock_bubble_hint_open).toBe(
      'Click to collapse · Double-click to keep open · Drag to move'
    )
    expect(workspaceStrings.ja.dock_bubble_hint_open).toBe(
      'クリックで収納 · ダブルクリックで開いたまま · ドラッグで移動'
    )
  })

  it('keeps the double-click wording the e2e tests look for', () => {
    expect(workspaceStrings.zh.dock_bubble_hint).toContain('双击保持打开')
    expect(workspaceStrings.zh.dock_bubble_hint_open).toContain('双击保持打开')
  })

  it('explains that the delay is longer right next to the panel edge', () => {
    expect(workspaceStrings.zh.peek_collapse_delay_hint).toContain(
      '贴近面板边缘'
    )
    expect(workspaceStrings.en.peek_collapse_delay_hint).toContain('panel edge')
    expect(workspaceStrings.ja.peek_collapse_delay_hint).toContain(
      'パネルの端のすぐ近く'
    )
  })

  it('no longer promises the tray after launching while the ball exists', () => {
    expect(workspaceStrings.zh.hide_after_launch_hint).toContain('悬浮球')
    expect(workspaceStrings.en.hide_after_launch_hint).toContain('bubble')
    expect(workspaceStrings.ja.hide_after_launch_hint).toContain(
      'フローティングボタン'
    )
  })
})
