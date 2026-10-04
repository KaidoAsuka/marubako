// What a search result says on its right edge is shown at every window width, the default slender one
// included: the action Enter will do, and (while Alt is held) the digit that Alt+number jumps to.
import { describe, expect, it } from 'vitest'

import { declarations, loadRules, splitSelectors } from './css-utils'

const rules = [...loadRules('workspace.css'), ...loadRules('feedback.css')]

function hidingRules(match: RegExp) {
  return rules.filter(
    (rule) =>
      splitSelectors(rule.selector).some((selector) => match.test(selector)) &&
      declarations(rule.body).some(
        ([name, value]) => name === 'display' && value === 'none'
      )
  )
}

describe('the search results at a narrow width', () => {
  it('never hide what Enter does, nor the digits that Alt+number jumps to', () => {
    expect(hidingRules(/command-result-action/)).toEqual([])
  })

  it('keep the pencil on a result out of the way until the row is selected or hovered', () => {
    const edit = rules.find(
      (rule) => rule.selector.trim() === '.command-result-edit'
    )

    expect(edit && declarations(edit.body)).toContainEqual(['opacity', '0'])
    const shown = rules.find((rule) =>
      splitSelectors(rule.selector).includes(
        '.command-row.selected .command-result-edit'
      )
    )
    expect(shown && declarations(shown.body)).toContainEqual(['opacity', '1'])
  })

  it('wrap the footer instead of overflowing it, since it now names five keys', () => {
    const footer = rules.find(
      (rule) => rule.selector.trim() === '.command-footer'
    )

    expect(footer && declarations(footer.body)).toContainEqual([
      'flex-wrap',
      'wrap',
    ])
  })
})
