import { describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { AppData } from '../../../../shared/types'
import { emptyQueryResults, searchEntries } from '../search'

function site(id: string, name: string, url = `https://${id}.test`) {
  return { id, kind: 'website' as const, name, icon: 'S', url }
}

function note(id: string, name: string, content = '') {
  return { id, kind: 'note' as const, name, icon: 'N', content }
}

/** A clean data set: nothing but what a test puts in. */
function blank(): AppData {
  const data = createDefaultAppData()
  for (const key of [
    'folders',
    'websites',
    'apps',
    'passwords',
    'notes',
    'commands',
  ] as const) {
    data[key] = []
    data.loose[key] = []
  }
  data.tasks = {}

  return data
}

describe('searchEntries ranking', () => {
  it('ranks a name that is the whole query above one that only contains its words, and one that starts with a word next', () => {
    const data = blank()
    data.loose.websites = [
      site('long', 'The best docs for the work'),
      site('exact', 'work docs'),
      site('part', 'docs and work'),
    ]

    expect(searchEntries(data, 'work docs').map((entry) => entry.name)).toEqual(
      ['work docs', 'docs and work', 'The best docs for the work']
    )
  })

  it('adds up the words: a name that fits more of them ranks higher, whatever the data order', () => {
    const data = blank()
    data.loose.websites = [
      site('meta', 'Misc', 'https://alpha.test/beta'),
      site('one', 'Alpha tools'),
      site('two', 'Alpha beta'),
    ]
    data.loose.notes = [note('n', 'unrelated', 'alpha beta gamma')]

    const names = searchEntries(data, 'alpha beta').map((entry) => entry.name)

    // "Alpha beta" has both words in its name, "Alpha tools" cannot match "beta" at all.
    expect(names[0]).toBe('Alpha beta')
    expect(names).not.toContain('Alpha tools')
    // The two that match only through their details come after, in the order of the data.
    expect(names.slice(1)).toEqual(['Misc', 'unrelated'])
  })

  it('still ranks a name that starts with the word above one that contains it', () => {
    const data = blank()
    data.loose.websites = [site('in', 'My code'), site('start', 'Code base')]

    expect(searchEntries(data, 'code').map((entry) => entry.name)).toEqual([
      'Code base',
      'My code',
    ])
  })

  it('keeps the order of the data for equal scores', () => {
    const data = blank()
    data.loose.websites = [site('a', 'Zed one'), site('b', 'Zed two')]

    expect(searchEntries(data, 'zed').map((entry) => entry.name)).toEqual([
      'Zed one',
      'Zed two',
    ])
  })

  it('does not search for the number of entries a group shows', () => {
    const data = blank()
    data.websites = [
      {
        id: 'g2',
        name: 'Tools',
        icon: 'G',
        open: true,
        items: [site('a', 'Alpha'), site('b', 'Beta')],
      },
    ]

    // The row says "2 items", but 2 is not something the group is called.
    expect(searchEntries(data, '2')).toEqual([])
    expect(searchEntries(data, 'tools')[0]).toMatchObject({
      type: 'group',
      detail: '2',
    })
  })

  it('still finds an entry by the name of its group, and a task by its date', () => {
    const data = blank()
    data.websites = [
      {
        id: 'g',
        name: 'Reading list',
        icon: 'G',
        open: true,
        items: [site('a', 'Alpha')],
      },
    ]
    data.tasks['2026-10-04'] = [
      {
        id: 't',
        name: 'Call back',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [],
      },
    ]

    expect(searchEntries(data, 'reading').map((entry) => entry.name)).toContain(
      'Alpha'
    )
    expect(searchEntries(data, '2026-10-04')[0]?.name).toBe('Call back')
  })
})

describe('emptyQueryResults', () => {
  const use = (tab: 'websites' | 'notes' | 'folders', id: string) => ({
    tab,
    id,
  })

  function withEntries(): AppData {
    const data = blank()
    data.loose.websites = [site('w1', 'Site one'), site('w2', 'Site two')]
    data.loose.notes = [note('n1', 'Note one'), note('n2', 'Note two')]
    return data
  }

  it('lists the entries used lately, newest first, when there are any', () => {
    const data = withEntries()

    const { kind, results } = emptyQueryResults(data, {
      recent: [use('notes', 'n2'), use('websites', 'w1')],
      currentTab: 'websites',
    })

    expect(kind).toBe('recent')
    expect(results.map((entry) => entry.name)).toEqual(['Note two', 'Site one'])
  })

  it('lists at most eight, each once', () => {
    const data = blank()
    data.loose.websites = Array.from({ length: 12 }, (_, i) =>
      site(`w${i}`, `Site ${i}`)
    )

    const { results } = emptyQueryResults(data, {
      recent: [
        use('websites', 'w0'),
        use('websites', 'w0'),
        ...Array.from({ length: 11 }, (_, i) => use('websites', `w${i + 1}`)),
      ],
    })

    expect(results).toHaveLength(8)
    expect(new Set(results.map((entry) => entry.key)).size).toBe(8)
  })

  it('skips an entry that was deleted since, and one whose category is hidden', () => {
    const data = withEntries()
    data.prefs.hiddenTabs = ['notes']

    const { results } = emptyQueryResults(data, {
      recent: [
        use('notes', 'n1'),
        use('websites', 'gone'),
        use('websites', 'w2'),
      ],
    })

    expect(results.map((entry) => entry.name)).toEqual(['Site two'])
  })

  it('finds a recent entry inside a group as well, with its group', () => {
    const data = blank()
    data.websites = [
      {
        id: 'g',
        name: 'Tools',
        icon: 'G',
        open: true,
        items: [site('in', 'Inside')],
      },
    ]

    const { results } = emptyQueryResults(data, {
      recent: [use('websites', 'in')],
    })

    expect(results[0]).toMatchObject({
      type: 'item',
      groupId: 'g',
      groupName: 'Tools',
    })
  })

  it('lists the first entries of the category in front when nothing was used lately', () => {
    const data = withEntries()

    const { kind, results } = emptyQueryResults(data, {
      recent: [],
      currentTab: 'notes',
    })

    expect(kind).toBe('current')
    expect(results.map((entry) => entry.name)).toEqual(['Note one', 'Note two'])
  })

  it('falls back to the category in front when every recent entry is gone', () => {
    const data = withEntries()

    const { kind } = emptyQueryResults(data, {
      recent: [use('websites', 'gone')],
      currentTab: 'websites',
    })

    expect(kind).toBe('current')
  })

  it('lists the first entries of everything when the category in front is empty too', () => {
    const data = withEntries()

    const { kind, results } = emptyQueryResults(data, {
      recent: [],
      currentTab: 'folders',
    })

    expect(kind).toBe('all')
    expect(results.map((entry) => entry.name)).toEqual([
      'Site one',
      'Site two',
      'Note one',
      'Note two',
    ])
  })

  it('lists open tasks of the category in front when that is the task page', () => {
    const data = blank()
    data.tasks['2026-10-04'] = [
      {
        id: 'a',
        name: 'Done one',
        icon: 'T',
        status: 'done',
        open: true,
        subtasks: [],
      },
      {
        id: 'b',
        name: 'Open one',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [],
      },
    ]

    const { kind, results } = emptyQueryResults(data, { currentTab: 'tasks' })

    expect(kind).toBe('current')
    expect(results.map((entry) => entry.name)).toEqual(['Open one'])
  })

  it('does not list groups, only entries', () => {
    const data = blank()
    data.websites = [
      {
        id: 'g',
        name: 'Tools',
        icon: 'G',
        open: true,
        items: [site('a', 'Alpha')],
      },
    ]

    const { results } = emptyQueryResults(data, { currentTab: 'websites' })

    expect(results.every((entry) => entry.type === 'item')).toBe(true)
  })

  it('is what searchEntries returns for a blank query', () => {
    const data = withEntries()
    const context = {
      recent: [use('notes', 'n1')],
      currentTab: 'websites' as const,
    }

    expect(searchEntries(data, '   ', 60, context)).toEqual(
      emptyQueryResults(data, context).results
    )
  })

  it('leaves out the tasks of a hidden task page', () => {
    const data = blank()
    data.prefs.hiddenTabs = ['tasks']
    data.tasks['2026-10-04'] = [
      {
        id: 'b',
        name: 'Open one',
        icon: 'T',
        status: 'todo',
        open: true,
        subtasks: [],
      },
    ]
    data.loose.websites = [site('w', 'Site')]

    const { results } = emptyQueryResults(data, { currentTab: 'tasks' })

    expect(results.map((entry) => entry.name)).toEqual(['Site'])
  })
})
