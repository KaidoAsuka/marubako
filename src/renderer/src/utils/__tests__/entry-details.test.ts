import { describe, expect, it } from 'vitest'

import type { GroupItemMap } from '../../../../shared/types'
import { getEntryTarget, getTileLabels } from '../entry-details'

describe('getEntryTarget', () => {
  it('is the address of a website and the path of anything else', () => {
    const site: GroupItemMap['websites'] = {
      id: 'w',
      kind: 'website',
      name: 'Docs',
      icon: '📖',
      url: 'https://docs.example.com/a/b?c=1',
    }
    const folder: GroupItemMap['folders'] = {
      id: 'f',
      kind: 'folder',
      name: 'Work',
      icon: '📁',
      path: 'C:\\Work\\Projects',
    }
    const app: GroupItemMap['apps'] = {
      id: 'a',
      kind: 'app',
      name: 'Editor',
      icon: '⚙️',
      path: 'C:\\Tools\\Editor.exe',
    }

    // The full address, with its scheme: the tooltip is where it can be read in full.
    expect(getEntryTarget(site)).toBe('https://docs.example.com/a/b?c=1')
    expect(getEntryTarget(folder)).toBe('C:\\Work\\Projects')
    expect(getEntryTarget(app)).toBe('C:\\Tools\\Editor.exe')
  })
})

describe('getTileLabels', () => {
  it('puts the name and the detail on two lines in the tooltip and on one line in the accessible name', () => {
    expect(getTileLabels('Projects', 'C:\\Work\\Projects')).toEqual({
      title: 'Projects\nC:\\Work\\Projects',
      ariaLabel: 'Projects, C:\\Work\\Projects',
    })
  })

  it('is just the name for a tile with no detail', () => {
    expect(getTileLabels('Projects', '')).toEqual({
      title: 'Projects',
      ariaLabel: 'Projects',
    })
  })
})
