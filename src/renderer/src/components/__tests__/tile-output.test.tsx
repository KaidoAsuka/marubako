// layout-2: a tile is one line (icon, name, and for a group a faint count). What used to be a second line
// (the path, the address, "n items") is in the tooltip and the accessible name instead. This reads the
// markup the three tile components produce.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import type { GroupItemMap } from '../../../../shared/types'
import FolderWidget from '../groups/FolderWidget'
import LooseWidget from '../groups/LooseWidget'
import GridItem from '../items/GridItem'
import { useAppStore } from '../../store/use-app-store'

const folder: GroupItemMap['folders'] = {
  id: 'f1',
  kind: 'folder',
  name: '项目工作目录',
  icon: '📁',
  path: 'C:\\Work\\Projects\\Marubako',
}

const site: GroupItemMap['websites'] = {
  id: 's1',
  kind: 'website',
  name: '项目文档',
  icon: '📖',
  url: 'https://docs.example.com/marubako/getting-started',
}

beforeEach(() => {
  useAppStore.setState({
    data: createDefaultAppData(),
    loading: false,
    toast: null,
  })
})

afterEach(() => {
  cleanup()
})

describe('a loose tile', () => {
  it('draws the name only and keeps the path in the tooltip and the accessible name', () => {
    render(<LooseWidget tab="folders" item={folder} />)
    const tile = screen.getByTestId('loose-widget-f1')

    expect(tile.querySelector('.widget-detail')).toBeNull()
    expect(tile.querySelector('.widget-count')).toBeNull()
    expect(tile.querySelector('.widget-name')?.textContent).toBe('项目工作目录')
    expect(tile).toHaveAttribute(
      'title',
      '项目工作目录\nC:\\Work\\Projects\\Marubako'
    )
    expect(tile).toHaveAttribute(
      'aria-label',
      '项目工作目录, C:\\Work\\Projects\\Marubako'
    )
    // The path is not text on the tile, so it can no longer make it taller or wider.
    expect(tile.textContent).not.toContain('C:\\')
  })

  it('gives the tooltip a website’s full address, scheme included', () => {
    render(<LooseWidget tab="websites" item={site} />)

    expect(screen.getByTestId('loose-widget-s1')).toHaveAttribute(
      'title',
      '项目文档\nhttps://docs.example.com/marubako/getting-started'
    )
  })

  it('leaves the name without a tooltip of its own, so the tile’s one covers the whole tile', () => {
    render(<LooseWidget tab="folders" item={folder} />)

    expect(
      screen.getByTestId('loose-widget-f1').querySelector('.widget-name')
    ).not.toHaveAttribute('title')
  })
})

describe('a group tile', () => {
  it('draws the count as a bare number and says it in words in the tooltip and the accessible name', () => {
    render(
      <FolderWidget
        tab="folders"
        groupId="g1"
        name="工作文件"
        icon="📁"
        count={8}
        previewIcons={[]}
      />
    )
    const tile = screen.getByTestId('folder-widget-g1')
    const count = tile.querySelector('.widget-count')

    expect(count?.textContent).toBe('8')
    // Said once, by the tile's own accessible name.
    expect(count).toHaveAttribute('aria-hidden', 'true')
    expect(tile.querySelector('.widget-label')?.textContent).toBe('工作文件')
    expect(tile).toHaveAttribute('title', '工作文件\n8 个条目')
    expect(tile).toHaveAttribute('aria-label', '工作文件, 8 个条目')
    expect(tile.querySelector('.widget-name')).not.toHaveAttribute('title')
  })

  it('keeps the count a sibling of the label, so the count is the tile’s third grid column', () => {
    render(
      <FolderWidget
        tab="folders"
        groupId="g1"
        name="工作文件"
        icon="📁"
        count={0}
        previewIcons={[]}
      />
    )
    const tile = screen.getByTestId('folder-widget-g1')
    const children = Array.from(tile.children).map((child) => child.className)

    expect(children).toEqual([
      'widget-actions',
      'widget-box',
      'widget-label',
      'widget-count',
    ])
  })
})

describe('a popup tile', () => {
  it('draws the name only and keeps the path in the tooltip and on the button’s accessible name', () => {
    render(<GridItem tab="folders" groupId="g1" item={folder} />)
    const tile = screen.getByTestId('grid-item-f1')

    expect(tile.querySelector('.grid-detail')).toBeNull()
    expect(tile.querySelector('.grid-name')?.textContent).toBe('项目工作目录')
    expect(tile.querySelector('.grid-name')).not.toHaveAttribute('title')
    expect(tile).toHaveAttribute(
      'title',
      '项目工作目录\nC:\\Work\\Projects\\Marubako'
    )
    expect(
      screen.getByRole('button', {
        name: '项目工作目录, C:\\Work\\Projects\\Marubako',
      })
    ).toHaveClass('grid-main')
  })
})
