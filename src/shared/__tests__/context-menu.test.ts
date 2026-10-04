import { describe, expect, it } from 'vitest'

import {
  MAX_MENU_ID,
  MAX_MENU_ITEMS,
  MAX_MENU_LABEL,
  validateContextMenu,
  validateMenuPoint,
} from '../context-menu'

describe('validateContextMenu', () => {
  it('accepts items, separators and one level of submenu, and keeps only what it knows', () => {
    const menu = validateContextMenu([
      { id: 'open', label: 'Open', extra: 'dropped' },
      { type: 'separator', label: 'ignored' },
      { id: 'rename', label: 'Rename', accelerator: 'F2', enabled: true },
      {
        label: 'Move to',
        submenu: [
          { id: 'move:a', label: 'Group A' },
          { type: 'separator' },
          { id: 'move:b', label: 'Group B', enabled: false },
        ],
      },
      { id: 'delete', label: 'Delete', accelerator: 'Delete' },
    ])

    expect(menu).toEqual([
      { id: 'open', label: 'Open' },
      { type: 'separator' },
      { id: 'rename', label: 'Rename', accelerator: 'F2', enabled: true },
      {
        label: 'Move to',
        submenu: [
          { id: 'move:a', label: 'Group A' },
          { type: 'separator' },
          { id: 'move:b', label: 'Group B', enabled: false },
        ],
      },
      { id: 'delete', label: 'Delete', accelerator: 'Delete' },
    ])
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['an object', {}],
    ['a string', 'menu'],
    ['an empty list', []],
  ])('rejects %s', (_label, input) => {
    expect(() => validateContextMenu(input)).toThrow()
  })

  it('allows 40 items and refuses 41', () => {
    const item = (n: number) => ({ id: `i${n}`, label: `Item ${n}` })
    const forty = Array.from({ length: MAX_MENU_ITEMS }, (_, n) => item(n))

    expect(validateContextMenu(forty)).toHaveLength(40)
    expect(() => validateContextMenu([...forty, item(40)])).toThrow()
  })

  it('refuses a menu that is large in all, through its submenus', () => {
    const submenu = Array.from({ length: MAX_MENU_ITEMS }, (_, n) => ({
      id: `s${n}`,
      label: `S ${n}`,
    }))

    expect(() =>
      validateContextMenu([
        { label: 'A', submenu },
        { label: 'B', submenu },
        { label: 'C', submenu },
      ])
    ).toThrow('too large')
  })

  it('refuses a submenu of more than 40 items', () => {
    const submenu = Array.from({ length: MAX_MENU_ITEMS + 1 }, (_, n) => ({
      id: `s${n}`,
      label: `S ${n}`,
    }))

    expect(() => validateContextMenu([{ label: 'A', submenu }])).toThrow()
  })

  it('refuses a submenu inside a submenu', () => {
    expect(() =>
      validateContextMenu([
        {
          label: 'A',
          submenu: [{ label: 'B', submenu: [{ id: 'c', label: 'C' }] }],
        },
      ])
    ).toThrow('one level')
  })

  it('allows labels up to 80 characters and ids up to 100', () => {
    const label = 'x'.repeat(MAX_MENU_LABEL)
    const id = 'y'.repeat(MAX_MENU_ID)

    expect(validateContextMenu([{ id, label }])).toEqual([{ id, label }])
    expect(() => validateContextMenu([{ id, label: label + 'x' }])).toThrow()
    expect(() => validateContextMenu([{ id: id + 'y', label }])).toThrow()
  })

  it.each([
    ['no label', { id: 'a' }],
    ['an empty label', { id: 'a', label: '' }],
    ['a label that is not text', { id: 'a', label: 5 }],
    ['no id', { label: 'A' }],
    ['an empty id', { id: '', label: 'A' }],
    ['an id that is not text', { id: 5, label: 'A' }],
    ['an unknown type', { type: 'checkbox', id: 'a', label: 'A' }],
    [
      'an enabled that is not a boolean',
      { id: 'a', label: 'A', enabled: 'no' },
    ],
    [
      'an accelerator the menu may not show',
      { id: 'a', label: 'A', accelerator: 'Ctrl+Q' },
    ],
    ['an item that is not an object', 'text'],
    ['a submenu that is not a list', { label: 'A', submenu: {} }],
  ])('refuses %s', (_label, item) => {
    expect(() => validateContextMenu([item])).toThrow()
  })

  it('does not let a submenu item without an id through', () => {
    expect(() =>
      validateContextMenu([{ label: 'A', submenu: [{ label: 'B' }] }])
    ).toThrow()
  })
})

describe('validateMenuPoint', () => {
  it('means "at the pointer" when there is none', () => {
    expect(validateMenuPoint(undefined)).toBeUndefined()
    expect(validateMenuPoint(null)).toBeUndefined()
  })

  it('rounds a point to whole pixels', () => {
    expect(validateMenuPoint({ x: 10.4, y: 20.6 })).toEqual({ x: 10, y: 21 })
  })

  it.each([
    [{ x: 1 }],
    [{ x: '1', y: 2 }],
    [{ x: Number.NaN, y: 2 }],
    [{ x: 1, y: Number.POSITIVE_INFINITY }],
    ['1,2'],
    [[1, 2]],
  ])('refuses %j', (point) => {
    expect(() => validateMenuPoint(point)).toThrow()
  })
})
