import { useState } from 'react'

import { ALL_TABS, type Tab } from '../../../../shared/types'
import GroupSection from './GroupSection'
import type { PageEnter } from './page-enter'
import TaskSection from './TaskSection'
import { useAppStore } from '../../store/use-app-store'

/**
 * Shows the page of the current category. Choosing another category slides its page in from the
 * side the category lies on in the tab row (motion.css); the first page of a session is simply
 * there.
 */
export default function ContentRouter(): JSX.Element {
  const currentTab = useAppStore((state) => state.currentTab)
  const [shown, setShown] = useState<{ tab: Tab; enter: PageEnter | null }>({
    tab: currentTab,
    enter: null,
  })
  let enter = shown.enter
  if (shown.tab !== currentTab) {
    enter =
      ALL_TABS.indexOf(currentTab) > ALL_TABS.indexOf(shown.tab)
        ? 'forward'
        : 'backward'
    setShown({ tab: currentTab, enter })
  }

  if (currentTab === 'tasks') {
    return <TaskSection key="tasks" enter={enter} />
  }

  return <GroupSection key={currentTab} tab={currentTab} enter={enter} />
}
