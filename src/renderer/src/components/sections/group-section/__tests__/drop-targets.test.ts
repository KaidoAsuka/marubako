import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getGroupTailItemId,
  getListGroupDropTargetId,
  getPointerGridTarget,
  getPointerListTarget,
  getTopEntryFromElement,
  shouldDropGroupedItemLooseFromSourceGroup,
  shouldDropIntoGroupByRects,
  type PointerListItemTarget,
  type PointerTopEntryTarget,
} from '../drop-targets'

type TestRect = { left: number; top: number; width: number; height: number }

function addElement(
  parent: HTMLElement,
  rect: TestRect,
  init: (element: HTMLElement) => void = () => undefined
): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON: () => ({}),
    }) as DOMRect
  init(element)
  parent.appendChild(element)
  return element
}

describe('drop target helpers', () => {
  it('detects grid group drops by pointer inclusion', () => {
    expect(
      shouldDropIntoGroupByRects(
        { x: 30, y: 30 },
        { left: 0, top: 0, width: 60, height: 60 },
        true
      )
    ).toBe(true)
    expect(
      shouldDropIntoGroupByRects(
        { x: 80, y: 80 },
        { left: 0, top: 0, width: 60, height: 60 },
        true
      )
    ).toBe(false)
  })

  it('accepts list group drops across a wider center band', () => {
    expect(
      shouldDropIntoGroupByRects(
        { x: 50, y: 18 },
        { left: 0, top: 0, width: 100, height: 84 },
        false
      )
    ).toBe(true)
    expect(
      shouldDropIntoGroupByRects(
        { x: 50, y: 8 },
        { left: 0, top: 0, width: 100, height: 84 },
        false
      )
    ).toBe(false)
  })

  it('reads a top entry from DOM data attributes', () => {
    const element = document.createElement('div')
    element.dataset.topEntryType = 'group'
    element.dataset.topEntryId = 'group-1'

    expect(getTopEntryFromElement(element)).toEqual({
      type: 'group',
      id: 'group-1',
    })
  })

  describe('getPointerGridTarget inside the folder popup', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    // A folder popup floating over a grid of top-level entries (dnd-3).
    function mountPopupOverGrid() {
      const grid = addElement(
        document.body,
        { left: 0, top: 0, width: 400, height: 300 },
        (element) => {
          element.className = 'widget-grid'
        }
      )
      addElement(
        grid,
        { left: 120, top: 100, width: 80, height: 80 },
        (element) => {
          element.dataset.topEntryType = 'group'
          element.dataset.topEntryId = 'behind'
        }
      )
      const popup = addElement(
        document.body,
        { left: 60, top: 40, width: 280, height: 220 },
        (element) => {
          element.className = 'widget-popup'
        }
      )
      addElement(
        popup,
        { left: 80, top: 100, width: 60, height: 60 },
        (element) => {
          element.dataset.popupItemId = 'self'
        }
      )
      addElement(
        popup,
        { left: 200, top: 100, width: 60, height: 60 },
        (element) => {
          element.dataset.popupItemId = 'neighbour'
        }
      )

      return { grid, popup }
    }

    it('returns no target for a blank popup spot that lies over a top-level entry', () => {
      mountPopupOverGrid()

      // Inside the popup, outside every popup item, and also inside the
      // grid entry behind the popup: the drop must not reach that entry.
      expect(
        getPointerGridTarget({ x: 160, y: 130 }, 'popupItem:self')
      ).toBeNull()
    })

    it('returns no target for blank popup spots over the grid but away from any entry', () => {
      mountPopupOverGrid()

      expect(
        getPointerGridTarget({ x: 70, y: 50 }, 'popupItem:self')
      ).toBeNull()
    })

    it('still resolves a neighbouring popup item', () => {
      mountPopupOverGrid()

      expect(
        getPointerGridTarget({ x: 230, y: 130 }, 'popupItem:self')
      ).toMatchObject({ kind: 'popup-item', id: 'neighbour' })
    })

    it('still resolves the grid once the pointer leaves the popup', () => {
      mountPopupOverGrid()

      expect(
        getPointerGridTarget({ x: 150, y: 20 }, 'popupItem:self')
      ).toMatchObject({ kind: 'desktop' })
    })

    it('does not affect top-level entry drags', () => {
      mountPopupOverGrid()

      expect(
        getPointerGridTarget({ x: 160, y: 130 }, 'loose:dragged')
      ).toMatchObject({ kind: 'top-entry' })
    })
  })

  describe('getPointerListTarget with grouped items (dnd-1)', () => {
    afterEach(() => {
      document.body.innerHTML = ''
      vi.unstubAllGlobals()
    })

    // jsdom has no DOMMatrixReadOnly: read the translation out of the
    // `translate3d(x, y, 0)` string the dragged row carries.
    function stubDomMatrix() {
      vi.stubGlobal(
        'DOMMatrixReadOnly',
        class {
          m41 = 0
          m42 = 0
          constructor(value: string) {
            const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(value)
            this.m41 = match ? Number(match[1]) : 0
            this.m42 = match ? Number(match[2]) : 0
          }
        }
      )
    }

    function addListItem(
      parent: HTMLElement,
      groupId: string,
      itemId: string,
      rect: TestRect
    ) {
      return addElement(parent, rect, (element) => {
        element.dataset.listGroupId = groupId
        element.dataset.listItemId = itemId
      })
    }

    // Two group cards in a two column list:
    //   g1: header, items a b / c _ (blank cell right of c), add button
    //   g2: header, one item, add button
    function mountList() {
      const list = addElement(
        document.body,
        { left: 0, top: 0, width: 400, height: 600 },
        (element) => {
          element.className = 'list-section'
        }
      )
      const addGroup = (id: string, rect: TestRect) => {
        const card = addElement(list, rect, (element) => {
          element.dataset.topEntryType = 'group'
          element.dataset.topEntryId = id
        })
        addElement(
          card,
          { left: rect.left, top: rect.top, width: rect.width, height: 44 },
          (element) => {
            element.className = 'group-card-header'
          }
        )
        return card
      }
      const g1 = addGroup('g1', { left: 10, top: 10, width: 380, height: 200 })
      const g2 = addGroup('g2', { left: 10, top: 230, width: 380, height: 120 })
      const items = {
        a: addListItem(g1, 'g1', 'a', {
          left: 18,
          top: 62,
          width: 180,
          height: 50,
        }),
        b: addListItem(g1, 'g1', 'b', {
          left: 208,
          top: 62,
          width: 180,
          height: 50,
        }),
        c: addListItem(g1, 'g1', 'c', {
          left: 18,
          top: 118,
          width: 180,
          height: 50,
        }),
        d: addListItem(g2, 'g2', 'd', {
          left: 18,
          top: 282,
          width: 180,
          height: 50,
        }),
      }

      return { list, g1, g2, items }
    }

    it('returns a self target over the dragged row slot even while the row is translated', () => {
      stubDomMatrix()
      const { items } = mountList()
      // The row follows the pointer: its rect is the slot shifted by +30 / +80.
      items.a.style.transform = 'translate3d(30px, 80px, 0)'
      items.a.getBoundingClientRect = () =>
        ({
          left: 48,
          top: 142,
          width: 180,
          height: 50,
          right: 228,
          bottom: 192,
          x: 48,
          y: 142,
          toJSON: () => ({}),
        }) as DOMRect
      items.a.classList.add('dnd-dragging')

      // Pointer back over the untransformed slot (18..198 x 62..112).
      expect(getPointerListTarget({ x: 100, y: 90 }, 'groupItem:g1:a')).toEqual(
        { kind: 'self' }
      )
    })

    it('keeps resolving a neighbouring row next to the self slot', () => {
      stubDomMatrix()
      mountList()

      expect(
        getPointerListTarget({ x: 300, y: 90 }, 'groupItem:g1:a')
      ).toMatchObject({ kind: 'item', groupId: 'g1', itemId: 'b' })
    })

    it('flags a pointer in the blank of its own group as inside the entry', () => {
      stubDomMatrix()
      mountList()

      // Blank cell right of `c`: no item hit area reaches it.
      expect(
        getPointerListTarget({ x: 300, y: 140 }, 'groupItem:g1:a')
      ).toMatchObject({
        kind: 'top-entry',
        entry: { type: 'group', id: 'g1' },
        isInsideEntry: true,
      })
    })

    it('flags a pointer on the body of another group as inside that entry', () => {
      stubDomMatrix()
      mountList()

      expect(
        getPointerListTarget({ x: 300, y: 320 }, 'groupItem:g1:a')
      ).toMatchObject({
        kind: 'top-entry',
        entry: { type: 'group', id: 'g2' },
        isGroupCenter: false,
        isInsideEntry: true,
      })
    })

    it('does not flag the padding around a card as inside the entry', () => {
      stubDomMatrix()
      mountList()

      // 215 lies between g1 (bottom 210) and g2 (top 230, padded to 224).
      expect(
        getPointerListTarget({ x: 200, y: 215 }, 'groupItem:g1:a')
      ).toMatchObject({
        kind: 'top-entry',
        entry: { type: 'group', id: 'g1' },
        isInsideEntry: false,
      })
    })

    it('finds the last row of a group when the pointer is past it', () => {
      mountList()

      // right of `c` on its row
      expect(getGroupTailItemId({ x: 300, y: 140 }, 'g1')).toBe('c')
      // below the last row, still inside the card
      expect(getGroupTailItemId({ x: 100, y: 190 }, 'g1')).toBe('c')
      // header, and between rows, are not past the last item
      expect(getGroupTailItemId({ x: 100, y: 20 }, 'g1')).toBeNull()
      expect(getGroupTailItemId({ x: 300, y: 80 }, 'g1')).toBeNull()
      expect(getGroupTailItemId({ x: 100, y: 140 }, 'missing')).toBeNull()
    })

    it('only leaves the source group when the pointer is below its card', () => {
      mountList()

      // inside the card, within its lower 30 percent (210 is the card bottom)
      expect(
        shouldDropGroupedItemLooseFromSourceGroup({ x: 100, y: 195 }, 'g1')
      ).toBe(false)
      expect(
        shouldDropGroupedItemLooseFromSourceGroup({ x: 100, y: 211 }, 'g1')
      ).toBe(true)
    })

    it('names the group a loose item is dropped into on the blank body of a card', () => {
      stubDomMatrix()
      mountList()

      // Blank body of g2 (right of its only item): inside the card, off the header band.
      const target = getPointerListTarget({ x: 300, y: 320 }, 'loose:n1')
      expect(target).toMatchObject({
        kind: 'top-entry',
        isGroupCenter: false,
        isInsideEntry: true,
      })
      expect(getListGroupDropTargetId(target, 'loose:n1')).toBe('g2')
    })

    it('names the group of an item row under a loose item and of the header band', () => {
      stubDomMatrix()
      mountList()

      expect(
        getListGroupDropTargetId(
          getPointerListTarget({ x: 100, y: 300 }, 'loose:n1'),
          'loose:n1'
        )
      ).toBe('g2')
      expect(
        getListGroupDropTargetId(
          getPointerListTarget({ x: 200, y: 252 }, 'loose:n1'),
          'loose:n1'
        )
      ).toBe('g2')
    })

    it('does not name a group for a whole group dragged over another group', () => {
      stubDomMatrix()
      mountList()

      const overHeader = getPointerListTarget({ x: 200, y: 252 }, 'group:g1')
      expect(overHeader).toMatchObject({
        kind: 'top-entry',
        entry: { type: 'group', id: 'g2' },
        isGroupCenter: true,
      })
      expect(getListGroupDropTargetId(overHeader, 'group:g1')).toBeNull()
      expect(
        getListGroupDropTargetId(
          getPointerListTarget({ x: 300, y: 320 }, 'group:g1'),
          'group:g1'
        )
      ).toBeNull()
    })

    it('does not name the own group of a dragged grouped item', () => {
      stubDomMatrix()
      mountList()

      // Header band of its own group: highlighted before, but the drop is a no-op.
      const ownHeader = getPointerListTarget(
        { x: 200, y: 32 },
        'groupItem:g1:a'
      )
      expect(ownHeader).toMatchObject({
        kind: 'top-entry',
        entry: { type: 'group', id: 'g1' },
        isGroupCenter: true,
      })
      expect(getListGroupDropTargetId(ownHeader, 'groupItem:g1:a')).toBeNull()
      // Blank cell after its last item: the drop only reorders inside the group.
      expect(
        getListGroupDropTargetId(
          getPointerListTarget({ x: 300, y: 140 }, 'groupItem:g1:a'),
          'groupItem:g1:a'
        )
      ).toBeNull()
      // Another group's blank body does take it.
      expect(
        getListGroupDropTargetId(
          getPointerListTarget({ x: 300, y: 320 }, 'groupItem:g1:a'),
          'groupItem:g1:a'
        )
      ).toBe('g2')
    })
  })
  describe('getListGroupDropTargetId', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 }

    function topEntryTarget(
      entry: PointerTopEntryTarget['entry'],
      flags: Partial<PointerTopEntryTarget> = {}
    ): PointerTopEntryTarget {
      return {
        kind: 'top-entry',
        entry,
        sortableId: `${entry.type}:${entry.id}`,
        entryRect: rect,
        placement: 'before',
        isGroupCenter: false,
        isInsideEntry: false,
        ...flags,
      }
    }

    function itemTarget(
      groupId: string,
      itemId: string
    ): PointerListItemTarget {
      return {
        kind: 'item',
        groupId,
        itemId,
        sortableId: `groupItem:${groupId}:${itemId}`,
        rect,
        placement: 'before',
      }
    }

    const group = (id: string) => ({ type: 'group' as const, id })

    it('returns null without a pointer target, over the own slot or over the desktop', () => {
      expect(getListGroupDropTargetId(null, 'loose:n1')).toBeNull()
      expect(getListGroupDropTargetId({ kind: 'self' }, 'groupItem:g1:a')).toBe(
        null
      )
      expect(
        getListGroupDropTargetId(
          { kind: 'desktop', targetEntry: group('g2'), placement: 'after' },
          'loose:n1'
        )
      ).toBeNull()
    })

    it('never returns a group while a whole group is dragged', () => {
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), { isGroupCenter: true }),
          'group:g1'
        )
      ).toBeNull()
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), { isInsideEntry: true }),
          'group:g1'
        )
      ).toBeNull()
    })

    it('returns the group under a loose item on the header band or anywhere inside the card', () => {
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), { isGroupCenter: true }),
          'loose:n1'
        )
      ).toBe('g2')
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), { isInsideEntry: true }),
          'loose:n1'
        )
      ).toBe('g2')
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), {
            isGroupCenter: true,
            isInsideEntry: true,
          }),
          'loose:n1'
        )
      ).toBe('g2')
    })

    it('returns null in the padding around a group card and over loose entries', () => {
      // A release there reorders next to the entry instead of entering it.
      expect(
        getListGroupDropTargetId(topEntryTarget(group('g2')), 'loose:n1')
      ).toBeNull()
      expect(
        getListGroupDropTargetId(
          topEntryTarget(
            { type: 'loose', id: 'n2' },
            { isGroupCenter: true, isInsideEntry: true }
          ),
          'loose:n1'
        )
      ).toBeNull()
    })

    it('returns another group for a grouped item but not its own group', () => {
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), { isInsideEntry: true }),
          'groupItem:g1:a'
        )
      ).toBe('g2')
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g2'), { isGroupCenter: true }),
          'groupItem:g1:a'
        )
      ).toBe('g2')
      // Own group: the drop is a no-op or a move to the end of that group.
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g1'), {
            isGroupCenter: true,
            isInsideEntry: true,
          }),
          'groupItem:g1:a'
        )
      ).toBeNull()
      expect(
        getListGroupDropTargetId(
          topEntryTarget(group('g1'), { isInsideEntry: true }),
          'groupItem:g1:a'
        )
      ).toBeNull()
    })

    it('returns the group of an item row the release would land in', () => {
      expect(getListGroupDropTargetId(itemTarget('g2', 'd'), 'loose:n1')).toBe(
        'g2'
      )
      expect(
        getListGroupDropTargetId(itemTarget('g2', 'd'), 'groupItem:g1:a')
      ).toBe('g2')
      // Reordering inside the source group is not a move into a group.
      expect(
        getListGroupDropTargetId(itemTarget('g1', 'b'), 'groupItem:g1:a')
      ).toBeNull()
    })
  })
})
