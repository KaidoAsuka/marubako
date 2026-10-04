import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import { resolveLang } from '../../i18n/resolve-lang'
import { useAppStore } from '../../store/use-app-store'
import { useI18n } from '../use-i18n'

function setLang(lang: unknown): void {
  const data = createDefaultAppData()
  ;(data.prefs as { lang: unknown }).lang = lang
  useAppStore.setState({ data })
}

describe('useI18n', () => {
  beforeEach(() => {
    useAppStore.setState({ data: null })
  })

  it('translates in the stored language', () => {
    setLang('en')
    const { result } = renderHook(() => useI18n())

    expect(result.current.lang).toBe('en')
    expect(result.current.t('save_failed')).toBe('Save failed')
  })

  it('uses zh before any data is loaded', () => {
    const { result } = renderHook(() => useI18n())

    expect(result.current.lang).toBe('zh')
    expect(result.current.t('save_failed')).toBe('保存失败')
  })

  it.each(['fr', 'constructor', '__proto__', 'toString', '', 42, null])(
    'falls back to zh instead of throwing for the stored language %j',
    (lang) => {
      setLang(lang)
      const { result } = renderHook(() => useI18n())

      expect(result.current.lang).toBe('zh')
      expect(result.current.t('save_failed')).toBe('保存失败')
      expect(result.current.t('tab_folders')).toBe('文件夹')
      expect(result.current.weekdays).toHaveLength(7)
      expect(result.current.formatDate(new Date(2026, 9, 3))).toBe('10月3日')
    }
  )

  it('recovers once a valid language is stored', () => {
    setLang('fr')
    const { result } = renderHook(() => useI18n())
    expect(result.current.lang).toBe('zh')

    act(() => {
      setLang('ja')
    })

    expect(result.current.lang).toBe('ja')
    expect(result.current.t('save_failed')).toBe('保存に失敗')
  })
})

describe('resolveLang', () => {
  it('only accepts the supported languages', () => {
    expect(resolveLang('zh')).toBe('zh')
    expect(resolveLang('en')).toBe('en')
    expect(resolveLang('ja')).toBe('ja')
    expect(resolveLang('fr')).toBe('zh')
    expect(resolveLang('constructor')).toBe('zh')
    expect(resolveLang(undefined)).toBe('zh')
  })
})
