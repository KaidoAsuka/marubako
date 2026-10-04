import type { ToastAction } from './store-types'
import {
  canRestore,
  captureDeletion,
  clearUndoRecord,
  getUndoRecord,
  removeDeletedEntity,
  restoreDeletedEntity,
  setUndoRecord,
  type UndoRecord,
  type UndoTarget,
} from './undo'
import { useAppStore } from './use-app-store'

export type Translate = (key: string) => string

const quoted = (t: Translate, key: string, name: string) =>
  `${t(`${key}_before`)}${name}${t(`${key}_after`)}`

/**
 * A password the main process could not decrypt on this computer keeps its ciphertext on disk only
 * while the entry exists. Deleting it drops that ciphertext for good, so such a deletion cannot be
 * undone faithfully: it is confirmed instead and not offered back.
 */
function holdsUnreadablePassword(entity: UndoRecord['entity']): boolean {
  if ('items' in entity) {
    return entity.items.some(
      (item) => item.kind === 'password' && item.passwordLost === true
    )
  }
  return entity.kind === 'password' && entity.passwordLost === true
}

async function performDeletion(
  target: UndoTarget,
  t: Translate,
  undoable = true
): Promise<void> {
  const store = useAppStore.getState()
  const record = store.data ? captureDeletion(store.data, target) : null
  if (!record) {
    return
  }

  const saved = store.updateData((draft) => removeDeletedEntity(draft, record))

  if (!undoable) {
    store.showToast(quoted(t, 'deleted', record.entity.name), 'info')
    await saved
    return
  }

  // updateData has just dropped the previous undo (and the toast offering it): this one replaces it.
  const action: ToastAction = {
    label: t('undo'),
    run: () => void undoLastDeletion(t, record),
  }
  record.toastAction = action
  setUndoRecord(record)
  store.showToast(quoted(t, 'deleted', record.entity.name), 'info', { action })

  try {
    await saved
  } catch (error) {
    clearUndoIfCurrent(record)
    throw error
  }

  // A failed save has already put the data back and said so in a toast: nothing is left to undo.
  if (useAppStore.getState().error) {
    clearUndoIfCurrent(record)
  }
}

function clearUndoIfCurrent(record: UndoRecord) {
  if (getUndoRecord() === record) {
    clearUndoRecord()
  }
}

/**
 * Delete a group item, a loose item or a group straight away and offer an undo. Only a group that
 * still holds items asks for one confirmation first, naming the group and how many items go with it.
 */
export async function deleteEntity(
  target: UndoTarget,
  t: Translate
): Promise<void> {
  const { data, setModal } = useAppStore.getState()
  const record = data ? captureDeletion(data, target) : null
  if (!record) {
    return
  }

  if (holdsUnreadablePassword(record.entity)) {
    setModal({
      kind: 'confirm',
      title: quoted(t, 'del_lost_password', record.entity.name),
      onConfirm: () => {
        setModal(null)
        void performDeletion(target, t, false)
      },
    })
    return
  }

  if (record.kind === 'group') {
    const count = 'items' in record.entity ? record.entity.items.length : 0
    if (count > 0) {
      setModal({
        kind: 'confirm',
        title: [
          t('del_group_confirm_before'),
          record.entity.name,
          t('del_group_confirm_middle'),
          count,
          count === 1
            ? t('del_group_confirm_after_one')
            : t('del_group_confirm_after'),
        ].join(''),
        onConfirm: () => {
          setModal(null)
          void performDeletion(target, t)
        },
      })
      return
    }
  }

  await performDeletion(target, t)
}

/**
 * Put the most recently deleted entity back. `expected` ties a toast button to its own deletion:
 * a button that outlived its record does nothing. Returns whether something was restored.
 */
export async function undoLastDeletion(
  t: Translate,
  expected?: UndoRecord
): Promise<boolean> {
  const record = getUndoRecord()
  if (!record || (expected && expected !== record)) {
    return false
  }

  const store = useAppStore.getState()
  if (!store.data || !canRestore(store.data, record)) {
    clearUndoRecord()
    return false
  }

  // Consume the record up front so a second click or key press cannot restore twice.
  clearUndoRecord()
  if (record.toastAction && store.toast?.action === record.toastAction) {
    store.clearToast()
  }
  // Show the result: the entity may belong to a tab other than the one in front.
  if (store.currentTab !== record.tab) {
    store.setCurrentTab(record.tab)
  }

  await store.updateData((draft) => {
    restoreDeletedEntity(draft, record)
  })

  if (useAppStore.getState().error) {
    // The restore could not be saved (and was rolled back): keep the record for another try.
    delete record.toastAction
    setUndoRecord(record)
    return false
  }

  store.showToast(quoted(t, 'restored', record.entity.name), 'success')
  return true
}
