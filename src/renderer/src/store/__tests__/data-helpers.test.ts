import { describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import { getTaskProgress, reconcileTopOrder } from '../data-helpers'

describe('reconcileTopOrder', () => {
  it('appends missing groups and loose items', () => {
    const data = createDefaultAppData()
    data.topOrder.folders = []
    data.loose.folders.push({
      id: 'loose-1',
      kind: 'folder',
      name: 'Temp',
      icon: '📁',
      path: 'C:\\Temp',
    })

    reconcileTopOrder(data, 'folders')

    expect(data.topOrder.folders).toEqual([
      { type: 'group', id: 'grp-folders-work' },
      { type: 'group', id: 'grp-folders-life' },
      { type: 'loose', id: 'loose-1' },
    ])
  })

  it('reconciles ordered entries for notes too', () => {
    const data = createDefaultAppData()
    data.topOrder.notes = []
    data.loose.notes.push({
      id: 'note-loose',
      kind: 'note',
      name: 'Scratch',
      icon: '📝',
      content: 'Pinned',
    })

    reconcileTopOrder(data, 'notes')

    expect(data.topOrder.notes).toEqual([
      { type: 'group', id: 'grp-notes-default' },
      { type: 'loose', id: 'note-loose' },
    ])
  })
})

describe('getTaskProgress', () => {
  it('calculates completion percentage from subtasks', () => {
    const progress = getTaskProgress({
      id: 'task-1',
      name: 'Ship',
      icon: '🚀',
      status: 'doing',
      open: true,
      subtasks: [
        { id: 'a', name: 'A', status: 'done' },
        { id: 'b', name: 'B', status: 'skip' },
        { id: 'c', name: 'C', status: 'todo' },
      ],
    })

    expect(progress.done).toBe(2)
    expect(progress.total).toBe(3)
    expect(progress.pct).toBe(67)
  })
})
