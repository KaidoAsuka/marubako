// product-ux-11 / flow-4: an empty category says what it is for, in one sentence, over the button
// that adds the first entry.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { createDefaultAppData } from '../../../../shared/default-data'
import {
  GROUP_TABS,
  LANGS,
  type AppData,
  type GroupTab,
  type Lang,
} from '../../../../shared/types'
import { workspaceStrings } from '../../i18n/workspace'
import { useAppStore } from '../../store/use-app-store'
import { todayKey } from '../../utils/date'
import GroupSection from '../sections/GroupSection'
import TaskSection from '../sections/TaskSection'

function emptyData(lang: Lang): AppData {
  const data = createDefaultAppData(lang)
  for (const tab of GROUP_TABS) {
    data[tab] = []
    data.loose[tab] = []
    data.topOrder[tab] = []
  }
  data.tasks = {}
  return data
}

function show(lang: Lang, tab: GroupTab | 'tasks'): void {
  useAppStore.setState({
    data: emptyData(lang),
    loading: false,
    currentTab: tab,
    selectedDate: todayKey(),
    modal: null,
    widgetPopup: null,
  })
}

afterEach(() => {
  cleanup()
})

describe('an empty category', () => {
  const cases = LANGS.flatMap((lang) =>
    GROUP_TABS.map((tab) => [lang, tab] as const)
  )

  it.each(cases)('says what it is for (%s, %s)', (lang, tab) => {
    show(lang, tab)
    render(<GroupSection tab={tab} />)

    const sentence = screen.getByTestId('empty-description')
    expect(sentence).toHaveTextContent(workspaceStrings[lang][`empty_${tab}`]!)
    // The sentence sits between the title and the button that does what it says.
    const parts = Array.from(
      sentence.parentElement!.children,
      (child) => child.className
    )
    expect(parts).toEqual([
      'empty-state-illustration',
      'empty-state-title',
      'empty-state-description',
      'empty-state-action',
    ])
  })

  it.each(GROUP_TABS)('keeps the add button of %s', (tab) => {
    show('en', tab)
    render(<GroupSection tab={tab} />)

    expect(screen.getByRole('button', { name: /^(Add|New)/ })).toBeVisible()
  })
})

describe('an empty task page', () => {
  it.each(LANGS)('says what it is for, today or another day (%s)', (lang) => {
    show(lang, 'tasks')
    const view = render(<TaskSection />)
    expect(screen.getByTestId('empty-description')).toHaveTextContent(
      workspaceStrings[lang].empty_tasks!
    )
    view.unmount()

    useAppStore.setState({ selectedDate: '2020-01-01' })
    render(<TaskSection />)
    expect(screen.getByTestId('empty-description')).toHaveTextContent(
      workspaceStrings[lang].empty_tasks!
    )
  })
})
