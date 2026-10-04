import { describe, expect, it } from 'vitest'

import {
  reorderEntries,
  reorderSubtasks,
  reorderTasks,
} from '../move-operations'

describe('reorderEntries', () => {
  it('moves an entry relative to another entry', () => {
    const next = reorderEntries(
      [
        { type: 'group', id: 'g1' },
        { type: 'group', id: 'g2' },
        { type: 'loose', id: 'l1' },
      ],
      'g1',
      'l1'
    )

    expect(next.map((entry) => entry.id)).toEqual(['g2', 'l1', 'g1'])
  })

  it('can keep an entry after the hovered target', () => {
    const next = reorderEntries(
      [
        { type: 'group', id: 'g1' },
        { type: 'group', id: 'g2' },
      ],
      'g2',
      'g1',
      'after'
    )

    expect(next.map((entry) => entry.id)).toEqual(['g1', 'g2'])
  })
})

describe('reorderTasks', () => {
  it('reorders tasks in a list', () => {
    const next = reorderTasks(
      [
        {
          id: 't1',
          name: 'A',
          icon: 'A',
          status: 'todo',
          open: true,
          subtasks: [],
        },
        {
          id: 't2',
          name: 'B',
          icon: 'B',
          status: 'todo',
          open: true,
          subtasks: [],
        },
      ],
      't2',
      't1'
    )

    expect(next.map((entry) => entry.id)).toEqual(['t2', 't1'])
  })
})

describe('reorderSubtasks', () => {
  it('reorders subtasks in a task', () => {
    const next = reorderSubtasks(
      [
        { id: 's1', name: 'A', status: 'todo' },
        { id: 's2', name: 'B', status: 'done' },
      ],
      's2',
      's1'
    )

    expect(next.map((entry) => entry.id)).toEqual(['s2', 's1'])
  })
})
