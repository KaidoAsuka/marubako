import { create } from 'zustand'

import { createDataSlice } from './slices/data-slice'
import { createDndSlice } from './slices/dnd-slice'
import { createUiSlice } from './slices/ui-slice'
import { createWindowSlice } from './slices/window-slice'
import type { AppStore } from './store-types'

export type {
  AppStore,
  AppStoreCreator,
  ModalState,
  UpdateDataOptions,
} from './store-types'

export const useAppStore = create<AppStore>()((...args) => ({
  ...createDataSlice(...args),
  ...createUiSlice(...args),
  ...createDndSlice(...args),
  ...createWindowSlice(...args),
}))
