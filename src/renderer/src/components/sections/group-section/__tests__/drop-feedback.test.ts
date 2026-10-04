import type { DragOverEvent } from '@dnd-kit/core'
import { afterEach, describe, expect, it } from 'vitest'

import { getTopEntrySortableId } from '../../../../dnd/move-operations'
import {
  EMPTY_GRID_DROP_FEEDBACK,
  areGridDropFeedbackEqual,
  buildGridDropFeedback,
  buildGridDropFeedbackFromPointerTarget,
  buildListGroupDropFeedbackId,
} from '../drop-feedback'

function addElement(
  parent: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
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

describe('drop feedback helpers', () => {
  it('compares drop feedback objects by value', () => {
    expect(
      areGridDropFeedbackEqual(
        EMPTY_GRID_DROP_FEEDBACK,
        EMPTY_GRID_DROP_FEEDBACK
      )
    ).toBe(true)

    expect(
      areGridDropFeedbackEqual(EMPTY_GRID_DROP_FEEDBACK, {
        ...EMPTY_GRID_DROP_FEEDBACK,
        topEntryId: 'group:test',
      })
    ).toBe(false)
  })

  it('builds feedback for a desktop pointer target', () => {
    const entry = { type: 'group' as const, id: 'group-1' }

    expect(
      buildGridDropFeedbackFromPointerTarget(
        'group:source',
        {
          kind: 'desktop',
          targetEntry: entry,
          placement: 'after',
        },
        null
      )
    ).toEqual({
      ...EMPTY_GRID_DROP_FEEDBACK,
      topEntryId: getTopEntrySortableId(entry),
      topEntryClassName: 'drop-after',
    })
  })

  describe('popup item dragged over a blank popup spot', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    it('does not highlight the grid entry that lies behind the popup', () => {
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
      addElement(
        document.body,
        { left: 60, top: 40, width: 280, height: 220 },
        (element) => {
          element.className = 'widget-popup'
        }
      )
      const behindRect = { left: 120, top: 100, width: 80, height: 80 }
      // dnd-kit still reports the droppable behind the popup as `over`.
      const event = {
        active: {
          id: 'popupItem:self',
          rect: { current: { initial: behindRect, translated: behindRect } },
        },
        over: { id: 'group:behind', rect: behindRect },
        activatorEvent: null,
        delta: { x: 0, y: 0 },
      } as unknown as DragOverEvent

      expect(
        buildGridDropFeedback(
          event,
          { tab: 'folders', groupId: 'source' },
          { x: 160, y: 130 }
        )
      ).toEqual(EMPTY_GRID_DROP_FEEDBACK)
    })
  })
  describe('buildListGroupDropFeedbackId', () => {
    afterEach(() => {
      document.body.innerHTML = ''
    })

    // Two expanded group cards: a header, one item and a blank body each.
    function mountList() {
      const list = addElement(
        document.body,
        { left: 0, top: 0, width: 400, height: 600 },
        (element) => {
          element.className = 'list-section'
        }
      )
      const addGroup = (id: string, top: number) => {
        const card = addElement(
          list,
          { left: 10, top, width: 380, height: 120 },
          (element) => {
            element.dataset.topEntryType = 'group'
            element.dataset.topEntryId = id
          }
        )
        addElement(
          card,
          { left: 10, top, width: 380, height: 44 },
          (element) => {
            element.className = 'group-card-header'
          }
        )
        addElement(
          card,
          { left: 18, top: top + 52, width: 180, height: 50 },
          (element) => {
            element.dataset.listGroupId = id
            element.dataset.listItemId = `${id}-item`
          }
        )
      }
      addGroup('g1', 10)
      addGroup('g2', 230)
      addElement(
        list,
        { left: 10, top: 370, width: 380, height: 50 },
        (element) => {
          element.dataset.topEntryType = 'loose'
          element.dataset.topEntryId = 'loose-1'
        }
      )
    }

    it('highlights the group a loose item would drop into, also over its blank body', () => {
      mountList()

      // header band, blank body right of the only item, and the item row itself
      expect(buildListGroupDropFeedbackId({ x: 200, y: 252 }, 'loose:n1')).toBe(
        'g2'
      )
      expect(buildListGroupDropFeedbackId({ x: 300, y: 320 }, 'loose:n1')).toBe(
        'g2'
      )
      expect(buildListGroupDropFeedbackId({ x: 100, y: 300 }, 'loose:n1')).toBe(
        'g2'
      )
    })

    it('highlights nothing over a loose entry, outside the list or without a pointer', () => {
      mountList()

      expect(
        buildListGroupDropFeedbackId({ x: 200, y: 390 }, 'loose:n1')
      ).toBeNull()
      expect(
        buildListGroupDropFeedbackId({ x: 500, y: 700 }, 'loose:n1')
      ).toBeNull()
      expect(buildListGroupDropFeedbackId(null, 'loose:n1')).toBeNull()
    })

    it('never highlights a group while a whole group is dragged', () => {
      mountList()

      expect(
        buildListGroupDropFeedbackId({ x: 200, y: 252 }, 'group:g1')
      ).toBeNull()
      expect(
        buildListGroupDropFeedbackId({ x: 300, y: 320 }, 'group:g1')
      ).toBeNull()
    })

    it('highlights another group but not the own group for a grouped item', () => {
      mountList()

      expect(
        buildListGroupDropFeedbackId({ x: 300, y: 320 }, 'groupItem:g1:g1-item')
      ).toBe('g2')
      // header band and blank body of the group it came from
      expect(
        buildListGroupDropFeedbackId({ x: 200, y: 32 }, 'groupItem:g1:g1-item')
      ).toBeNull()
      expect(
        buildListGroupDropFeedbackId({ x: 300, y: 100 }, 'groupItem:g1:g1-item')
      ).toBeNull()
    })
  })
})
