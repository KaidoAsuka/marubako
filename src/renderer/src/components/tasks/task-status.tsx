import type { TaskStatus } from '../../../../shared/types'
import { IconDoing, IconDone, IconSkip, IconTodo } from '../common/icons'

/** The mark drawn in the status button of a task or a subtask. */
export const iconByStatus: Record<TaskStatus, JSX.Element> = {
  todo: <IconTodo size={14} />,
  doing: <IconDoing size={14} />,
  skip: <IconSkip size={14} />,
  done: <IconDone size={14} />,
}
