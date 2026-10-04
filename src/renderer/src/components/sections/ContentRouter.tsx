import GroupSection from './GroupSection'
import TaskSection from './TaskSection'
import { useAppStore } from '../../store/use-app-store'

export default function ContentRouter(): JSX.Element {
  const currentTab = useAppStore((state) => state.currentTab)

  if (currentTab === 'tasks') {
    return <TaskSection key="tasks" />
  }

  return <GroupSection key={currentTab} tab={currentTab} />
}
