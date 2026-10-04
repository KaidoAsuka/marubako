import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

interface BuilderConfig {
  files: string[]
}

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const config = createRequire(import.meta.url)(
  path.join(projectDir, 'electron-builder.config.cjs')
) as BuilderConfig
const notices = fs.readFileSync(
  path.join(projectDir, 'THIRD-PARTY-NOTICES.md'),
  'utf8'
)

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

describe('third-party notices', () => {
  it('ships inside the installer', () => {
    expect(config.files).toContain('THIRD-PARTY-NOTICES.md')
  })

  it.each(['react', 'core'])(
    'reproduces the licence of @phosphor-icons/%s, copyright line included',
    (name) => {
      const licence = fs.readFileSync(
        path.join(
          projectDir,
          'node_modules',
          '@phosphor-icons',
          name,
          'LICENSE'
        ),
        'utf8'
      )

      expect(collapse(licence)).toContain('Copyright (c)')
      expect(collapse(notices)).toContain(collapse(licence))
    }
  )
})
