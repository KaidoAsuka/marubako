import { deleteEntity } from '../store/delete-actions'
import type { UndoTarget } from '../store/undo'
import { useI18n } from './use-i18n'

/**
 * The one way the app deletes a group item, a loose item or a group. It deletes at once and offers
 * an undo; a group that still holds items asks a single, named confirmation first.
 */
export function useDeleteEntity(): (target: UndoTarget) => void {
  const { t } = useI18n()

  return (target) => {
    void deleteEntity(target, t)
  }
}
