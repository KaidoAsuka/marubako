import { describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import { countTab, describeTab, fillTemplate } from '../tab-summary'

const t = (key: string): string =>
  ({
    tab_folders: 'Folders',
    tab_tasks: 'Tasks',
    tab_summary: '{name} · {groups} groups, {items} items · Alt+{n}',
    tab_summary_tasks: '{name} · {open} open · Alt+{n}',
  })[key] ?? key

describe('fillTemplate', () => {
  it('replaces every placeholder, in any order and more than once', () => {
    expect(fillTemplate('{b} {a} {b}', { a: 1, b: 'x' })).toBe('x 1 x')
  })

  it('leaves a placeholder that has no value as it is', () => {
    expect(fillTemplate('{a} {missing}', { a: 2 })).toBe('2 {missing}')
  })

  it('writes a zero as a zero', () => {
    expect(fillTemplate('{a}', { a: 0 })).toBe('0')
  })
})

describe('countTab', () => {
  it('counts the groups and all entries of a collection, loose ones included', () => {
    const data = createDefaultAppData()

    expect(countTab(data, 'folders')).toEqual({
      kind: 'collection',
      groups: 2,
      items: 3,
    })
    data.loose.folders = [
      { id: 'f', kind: 'folder', name: 'F', path: 'C:\\F', icon: 'F' },
    ]
    expect(countTab(data, 'folders')).toEqual({
      kind: 'collection',
      groups: 2,
      items: 4,
    })
  })

  it('counts open tasks on every day, not the finished or skipped ones', () => {
    const data = createDefaultAppData()
    const task = (id: string, status: 'todo' | 'doing' | 'skip' | 'done') => ({
      id,
      name: id,
      icon: id,
      status,
      open: false,
      subtasks: [],
    })
    data.tasks = {
      '2026-10-03': [task('a', 'todo'), task('b', 'done')],
      '2026-10-04': [task('c', 'doing'), task('d', 'skip')],
    }

    expect(countTab(data, 'tasks')).toEqual({ kind: 'tasks', open: 2 })
  })
})

describe('describeTab', () => {
  it('reads "<name> · <n> groups, <m> items · Alt+<k>"', () => {
    expect(describeTab(t, createDefaultAppData(), 'folders', 0)).toBe(
      'Folders · 2 groups, 3 items · Alt+1'
    )
  })

  it('numbers the shortcut from the position of the tab', () => {
    expect(describeTab(t, createDefaultAppData(), 'tasks', 6)).toBe(
      'Tasks · 0 open · Alt+7'
    )
  })

  it('still names the tab and its shortcut before the data has loaded', () => {
    expect(describeTab(t, null, 'folders', 0)).toBe('Folders · Alt+1')
  })
})
