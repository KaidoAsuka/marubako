import { describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../default-data'
import { LANGS, type AnyGroupItem, type AppData } from '../types'

/** Every string the user can read in the sample data: group names, entry names and the note. */
function sampleWords(data: AppData): string[] {
  const groups = [
    ...data.folders,
    ...data.websites,
    ...data.apps,
    ...data.passwords,
    ...data.notes,
  ]
  return [
    ...groups.map((group) => group.name),
    ...groups.flatMap((group) => group.items.map((item) => item.name)),
    ...data.notes.flatMap((group) =>
      group.items.map((item) => (item.kind === 'note' ? item.content : ''))
    ),
  ]
}

const HAN = /\p{Script=Han}/u
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u

describe('sample data of a new installation', () => {
  it('is Chinese unless asked otherwise (the normaliser and many tests rely on it)', () => {
    expect(createDefaultAppData().prefs.lang).toBe('zh')
    expect(createDefaultAppData().folders[0]?.name).toBe('工作文件')
    expect(createDefaultAppData()).toEqual(createDefaultAppData('zh'))
  })

  it.each(LANGS)('stores the language it is made in (%s)', (lang) => {
    expect(createDefaultAppData(lang).prefs.lang).toBe(lang)
  })

  it('has no Chinese or Japanese characters in the English sample data', () => {
    for (const word of sampleWords(createDefaultAppData('en'))) {
      expect(word, word).not.toMatch(HAN)
      expect(word, word).not.toMatch(KANA)
    }
  })

  it('has Japanese sample names, not the Chinese ones', () => {
    const data = createDefaultAppData('ja')

    expect(data.folders.map((group) => group.name)).toEqual([
      '仕事のファイル',
      '個人',
    ])
    expect(data.folders[0]?.items.map((item) => item.name)).toEqual([
      'デスクトップ',
      'ドキュメント',
    ])
    expect(data.notes[0]?.items[0]?.name).toBe('使い方')
    expect(sampleWords(data)).not.toContain('使用说明')
  })

  it('has no Japanese kana in the Chinese sample data', () => {
    for (const word of sampleWords(createDefaultAppData('zh'))) {
      expect(word, word).not.toMatch(KANA)
    }
  })

  it('opens sample sites that load where the language is spoken', () => {
    const urls = (lang: 'zh' | 'en' | 'ja') =>
      createDefaultAppData(lang)
        .websites.flatMap((group) => group.items)
        .map((item) => (item.kind === 'website' ? item.url : ''))

    // Google and YouTube do not open in much of the Chinese-speaking world.
    expect(urls('zh')).toEqual([
      'https://cn.bing.com',
      'https://github.com',
      'https://www.bilibili.com',
    ])
    expect(urls('en')).toEqual([
      'https://google.com',
      'https://github.com',
      'https://youtube.com',
    ])
    expect(urls('ja')).toEqual(urls('en'))
  })

  it('keeps what the data store resolves real folders by, in every language', () => {
    for (const lang of LANGS) {
      const folders = createDefaultAppData(lang).folders.flatMap(
        (group) => group.items
      )

      expect(
        folders.map((item) => [item.id, item.kind === 'folder' && item.path])
      ).toEqual([
        ['folder-desktop', 'C:\\Users\\用户名\\Desktop'],
        ['folder-documents', 'C:\\Users\\用户名\\Documents'],
        ['folder-downloads', 'C:\\Users\\用户名\\Downloads'],
      ])
    }
  })

  it('has the same groups, order and icons in every language', () => {
    const shape = (data: AppData) => ({
      groups: [
        ...data.folders,
        ...data.websites,
        ...data.passwords,
        ...data.notes,
      ].map((group) => [group.id, group.icon, group.open]),
      topOrder: data.topOrder,
    })

    for (const lang of LANGS)
      expect(shape(createDefaultAppData(lang))).toEqual(
        shape(createDefaultAppData('zh'))
      )
  })

  it('gives every entry a unique id and a tile icon', () => {
    for (const lang of LANGS) {
      const data = createDefaultAppData(lang)
      const items = [
        ...data.folders,
        ...data.websites,
        ...data.passwords,
        ...data.notes,
      ].flatMap((group): AnyGroupItem[] => group.items)
      const ids = items.map((item) => item.id)

      expect(new Set(ids).size).toBe(ids.length)
      for (const item of items) expect(item.icon, item.id).toMatch(/^tile:/)
    }
  })

  it('describes the real behaviour of Esc: the ball, not the tray', () => {
    const note = (lang: 'zh' | 'en' | 'ja') =>
      (createDefaultAppData(lang).notes[0]?.items[0] as { content: string })
        .content

    expect(note('zh')).toContain('悬浮球')
    expect(note('zh')).not.toContain('托盘')
    expect(note('en')).toContain('bubble')
    expect(note('en')).not.toContain('tray')
    expect(note('ja')).toContain('ボタン')
    expect(note('ja')).not.toContain('トレイ')
  })
})
