import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

interface BuilderConfig {
  appId: string
  productName: string
  win: { icon: string }
  nsis: { artifactName: string; shortcutName: string }
}

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const nodeRequire = createRequire(import.meta.url)
const config = nodeRequire(
  path.join(projectDir, 'electron-builder.config.cjs')
) as BuilderConfig
const packageJson = nodeRequire(path.join(projectDir, 'package.json')) as {
  name: string
  description: string
  author: string
}

function read(relative: string): string {
  return fs.readFileSync(path.join(projectDir, relative), 'utf8')
}

describe('product identity', () => {
  it('is called Marubako in the package and the installer', () => {
    expect(packageJson.name).toBe('marubako')
    expect(packageJson.description).toContain('Marubako')
    expect(packageJson.author).toBe('Marubako authors')
    expect(config.productName).toBe('Marubako')
    expect(config.nsis.shortcutName).toBe('Marubako')
    expect(config.nsis.artifactName).toBe('Marubako-Setup-${version}.exe')
  })

  it('uses the same app id in the installer config and in the app', () => {
    const appId = /export const APP_ID = '([^']+)'/.exec(
      read('src/main/config.ts')
    )?.[1]

    expect(appId).toBe(config.appId)
    // The owner is the placeholder until scripts/set-github-owner.cjs has been run.
    expect(config.appId).toMatch(/^io\.github\.[A-Za-z0-9_-]+\.marubako$/)
    expect(read('src/main/config.ts')).toContain(
      "export const APP_NAME = 'Marubako'"
    )
  })

  it('keeps the data folder name a development build uses apart from the installed one', () => {
    expect(read('src/main/user-data-path.ts')).toContain(
      "DEV_USER_DATA_DIRNAME = 'marubako-dev'"
    )
  })

  it('ships the renamed icon files and dev launchers', () => {
    for (const size of [16, 20, 24, 32, 40, 48, 64, 128, 256]) {
      expect(
        fs.existsSync(
          path.join(projectDir, `resources/icons/marubako-${size}.png`)
        )
      ).toBe(true)
    }
    for (const file of [
      'src/renderer/src/assets/marubako.svg',
      'src/renderer/src/assets/marubako-small.svg',
      'Marubako.vbs',
      'start.bat',
    ]) {
      expect(fs.existsSync(path.join(projectDir, file))).toBe(true)
    }
    expect(read('start.bat')).toContain('Marubako.vbs')
    expect(fs.existsSync(path.join(projectDir, 'QuickLaunch.vbs'))).toBe(false)
  })
})

// What may still say "quicklaunch": internal identifiers that users never see and that are kept
// on purpose, so that data files, exports and scripts written by earlier builds keep working.
const ALLOWED_INTERNAL_NAMES: RegExp[] = [
  /\bQUICKLAUNCH_[A-Z0-9_]+\b/g, // environment variables read by the main process and the tests
  /\bquickLaunch\b/g, // the preload API name: window.quickLaunch
  /\bQuickLaunch(?:Api|Result)\b/g, // the types of that API
  /\bquicklaunch-data\b/g, // the data file, its backups and the file format marker
]
const SCANNED_ROOTS = ['src', 'e2e', 'scripts', 'build']
const SKIPPED_FOLDERS = new Set(['node_modules', 'out', 'release', 'artifacts'])
const SKIPPED_EXTENSIONS = new Set(['.png', '.ico', '.bmp', '.svg', '.json'])

function collect(directory: string, found: string[]): void {
  for (const entry of fs.readdirSync(path.join(projectDir, directory), {
    withFileTypes: true,
  })) {
    const relative = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) collect(relative, found)
    } else if (!SKIPPED_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(relative)
    }
  }
}

describe('the old product name', () => {
  it('only survives in the allowed internal identifiers', () => {
    const files: string[] = []
    for (const root of SCANNED_ROOTS) collect(root, files)
    for (const file of fs.readdirSync(projectDir)) {
      if (/\.(bat|vbs|cjs|js|ts|mjs|ps1)$/.test(file)) files.push(file)
    }
    files.push('package.json')

    const offenders: string[] = []
    for (const file of files) {
      if (file.endsWith('__tests__/branding.test.ts')) continue
      let text = read(file)
      for (const allowed of ALLOWED_INTERNAL_NAMES)
        text = text.replace(allowed, '')
      text.split('\n').forEach((line, index) => {
        if (/quick[ _-]?launch/i.test(line)) {
          offenders.push(`${file}:${index + 1}: ${line.trim()}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
