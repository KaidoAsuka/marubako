// layout-2: the grid's drop targets on 44px single-line tiles. The tile itself is the target (a 24px icon
// was a far smaller one than the 32px box of the 72px card), a group takes a drop anywhere on it except
// its two edge strips, and the strips and the gap between tiles are where a drop goes next to it.
import { afterEach, describe, expect, it } from 'vitest'

import {
  GRID_GROUP_EDGE,
  getGroupDropRectFromElement,
  getTopEntryInteractionRectFromElement,
} from '../geometry'
import { buildGridDropFeedbackFromPointerTarget } from '../drop-feedback'
import {
  getPointerGridTarget,
  type PointerTopEntryTarget,
} from '../drop-targets'

type TestRect = { left: number; top: number; width: number; height: number }

function rectOf(rect: TestRect): DOMRect {
  return {
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  } as DOMRect
}

function addElement(
  parent: HTMLElement,
  rect: TestRect,
  init: (element: HTMLElement) => void = () => undefined
): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () => rectOf(rect)
  init(element)
  parent.appendChild(element)

  return element
}

// A two-column grid of 177px tiles, 6px apart (a 400px window): a group and a loose entry in the first
// row, another group below. The icon box is 24px at the left of each tile.
const WORK = { left: 12, top: 10, width: 177, height: 44 }
const LOOSE = { left: 195, top: 10, width: 177, height: 44 }
const LIFE = { left: 12, top: 60, width: 177, height: 44 }

function mountTiles() {
  const grid = addElement(
    document.body,
    { left: 0, top: 0, width: 400, height: 300 },
    (element) => {
      element.className = 'widget-grid'
    }
  )
  const tile = (
    rect: TestRect,
    type: 'group' | 'loose',
    id: string,
    boxClass: string
  ) =>
    addElement(grid, rect, (element) => {
      element.dataset.topEntryType = type
      element.dataset.topEntryId = id
      addElement(
        element,
        { left: rect.left + 8, top: rect.top + 10, width: 24, height: 24 },
        (box) => {
          box.className = boxClass
        }
      )
    })

  return {
    grid,
    work: tile(WORK, 'group', 'work', 'widget-box'),
    loose: tile(LOOSE, 'loose', 'loose', 'widget-loose-box'),
    life: tile(LIFE, 'group', 'life', 'widget-box'),
  }
}

const target = (x: number, y: number, activeId = 'loose:other') =>
  getPointerGridTarget({ x, y }, activeId) as PointerTopEntryTarget

describe('the tile is the drop surface', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is the whole tile for the interaction rect, not the icon box inside it', () => {
    const { work, loose } = mountTiles()

    expect(getTopEntryInteractionRectFromElement(work)).toEqual(WORK)
    expect(getTopEntryInteractionRectFromElement(loose)).toEqual(LOOSE)
  })

  it('is the tile without its two edge strips for "into the group"', () => {
    const { work } = mountTiles()

    expect(GRID_GROUP_EDGE).toBe(14)
    expect(getGroupDropRectFromElement(work, true)).toEqual({
      left: WORK.left + 14,
      top: WORK.top,
      width: WORK.width - 28,
      height: WORK.height,
    })
  })

  it('never makes the strips more than a quarter of a narrow tile each', () => {
    const grid = addElement(document.body, {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    })
    const narrow = addElement(grid, { left: 0, top: 0, width: 40, height: 44 })

    expect(getGroupDropRectFromElement(narrow, true)).toEqual({
      left: 10,
      top: 0,
      width: 20,
      height: 44,
    })
  })

  it('still takes the list card’s header for a group in the list', () => {
    const card = addElement(document.body, {
      left: 0,
      top: 0,
      width: 300,
      height: 200,
    })
    addElement(card, { left: 0, top: 0, width: 300, height: 44 }, (header) => {
      header.className = 'group-card-header'
    })

    // The header, padded, and at least 84px tall around its centre: unchanged by the tile.
    expect(getGroupDropRectFromElement(card, false)).toEqual({
      left: -14,
      top: -18,
      width: 328,
      height: 84,
    })
  })
})

describe('dropping on a group tile', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('goes into the group on the name, not just on the icon', () => {
    mountTiles()

    // The old rule needed the 32px box (here 24px) of the icon; the name is 100px away from it.
    expect(target(WORK.left + 120, WORK.top + 22)).toMatchObject({
      entry: { type: 'group', id: 'work' },
      isGroupCenter: true,
      isInsideEntry: true,
    })
    expect(target(WORK.left + 20, WORK.top + 22)).toMatchObject({
      isGroupCenter: true,
    })
    // Also near the top and bottom edge of the 44px height.
    expect(target(WORK.left + 90, WORK.top + 2).isGroupCenter).toBe(true)
    expect(target(WORK.left + 90, WORK.top + 42).isGroupCenter).toBe(true)
  })

  it('goes next to the group on its edge strips, before on the left and after on the right', () => {
    mountTiles()

    expect(target(WORK.left + 5, WORK.top + 22)).toMatchObject({
      entry: { type: 'group', id: 'work' },
      isGroupCenter: false,
      placement: 'before',
    })
    expect(target(WORK.left + WORK.width - 5, WORK.top + 22)).toMatchObject({
      entry: { type: 'group', id: 'work' },
      isGroupCenter: false,
      placement: 'after',
    })
  })

  it('goes between two tiles when released in the gap that separates them', () => {
    mountTiles()
    const gapX = WORK.left + WORK.width + 3

    const hit = target(gapX, WORK.top + 22)

    expect(hit.isGroupCenter).toBe(false)
    // Next to whichever tile is picked, on the side that faces the other one.
    expect(
      (hit.entry.id === 'work' && hit.placement === 'after') ||
        (hit.entry.id === 'loose' && hit.placement === 'before')
    ).toBe(true)
  })

  it('does not nest a loose entry, a group or the dragged tile itself', () => {
    mountTiles()

    // A loose tile in the middle is only ever a before/after target.
    expect(target(LOOSE.left + 80, LOOSE.top + 22)).toMatchObject({
      entry: { type: 'loose', id: 'loose' },
      isGroupCenter: false,
      placement: 'before',
    })
    expect(target(LOOSE.left + 100, LOOSE.top + 22).placement).toBe('after')
    // The tile that is being dragged is not a target for itself.
    expect(
      getPointerGridTarget(
        { x: WORK.left + 90, y: WORK.top + 22 },
        'group:work'
      )
    ).not.toMatchObject({ entry: { id: 'work' } })
  })

  it('reaches the group on the row below as well', () => {
    mountTiles()

    expect(target(LIFE.left + 100, LIFE.top + 22)).toMatchObject({
      entry: { type: 'group', id: 'life' },
      isGroupCenter: true,
    })
  })
})

describe('what the grid lights while a loose entry is dragged over a group tile', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const feedback = (x: number, y: number) =>
    buildGridDropFeedbackFromPointerTarget(
      'loose:other',
      getPointerGridTarget({ x, y }, 'loose:other')!,
      null
    )

  it('is the group (folder-drop) over its name, and a before/after marker over its edge strip', () => {
    mountTiles()

    expect(feedback(WORK.left + 120, WORK.top + 22)).toMatchObject({
      topEntryId: 'group:work',
      topEntryClassName: 'folder-drop',
    })
    expect(feedback(WORK.left + 4, WORK.top + 22)).toMatchObject({
      topEntryId: 'group:work',
      topEntryClassName: 'drop-before',
    })
    expect(feedback(WORK.left + WORK.width - 4, WORK.top + 22)).toMatchObject({
      topEntryId: 'group:work',
      topEntryClassName: 'drop-after',
    })
  })
})
