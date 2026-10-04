/// <reference types="vite/client" />

import type { QuickLaunchApi } from '../../shared/preload-api'

declare global {
  interface Window {
    quickLaunch: QuickLaunchApi
  }
}

export {}
