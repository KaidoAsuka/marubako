import { resolve } from 'node:path'

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@main': resolve(__dirname, 'src/main'),
  '@preload': resolve(__dirname, 'src/preload'),
  '@renderer': resolve(__dirname, 'src/renderer/src'),
  '@shared': resolve(__dirname, 'src/shared'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias,
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias,
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias,
    },
    // electron-vite builds without minification unless told otherwise. The page is parsed by both
    // windows at every start; CSS is minified along with it. main and preload stay readable: their
    // stack traces end up in the log files users send in.
    build: {
      minify: 'esbuild',
      // The page is read from disk, not downloaded: one chunk is the fastest to start and there is
      // nothing to gain from the size warning.
      chunkSizeWarningLimit: 1000,
    },
  },
})
