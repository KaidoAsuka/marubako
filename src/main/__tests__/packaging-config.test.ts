import fs from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

interface BuilderConfig {
  files: string[]
  electronLanguages: string[]
  win: { signAndEditExecutable: boolean; signtoolOptions: { sign: string } }
  nsis: {
    oneClick: boolean
    perMachine?: boolean
    allowToChangeInstallationDirectory?: boolean
    deleteAppDataOnUninstall?: boolean
    include: string
  }
}
interface PackageJson {
  name: string
  productName?: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
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
const pkg = nodeRequire(path.join(projectDir, 'package.json')) as PackageJson

describe('npm run dist (release-repo-1)', () => {
  it('never lets electron-builder publish: it has no token and uploading belongs to the release workflow', () => {
    expect(pkg.scripts.dist).toContain('electron-builder')
    expect(pkg.scripts.dist).toMatch(/--publish never\b/)
  })

  it('builds first, so the installer holds the current sources', () => {
    expect(pkg.scripts.dist).toMatch(/^npm run build && electron-builder /)
  })

  it('has no other script that runs electron-builder without --publish never', () => {
    const risky = Object.entries(pkg.scripts)
      .filter(([, command]) => /electron-builder/.test(command))
      .filter(([, command]) => !/--publish never\b|--dir\b/.test(command))

    expect(risky).toEqual([])
  })
})

describe('what is packed into app.asar (performance-4)', () => {
  /** The package a module specifier names: `@scope/name/deep` is `@scope/name`. */
  function packageOf(specifier: string): string | null {
    if (specifier.startsWith('.') || specifier.startsWith('node:')) return null
    // The path aliases of tsconfig and electron.vite.config.ts.
    if (/^@(main|preload|renderer|shared)\b/.test(specifier)) return null
    const parts = specifier.split('/')
    const name = specifier.startsWith('@')
      ? parts.slice(0, 2).join('/')
      : (parts[0] ?? specifier)
    return builtinModules.includes(name) || name === 'electron' ? null : name
  }

  function sourceFiles(directory: string): string[] {
    const found: string[] = []
    for (const entry of fs.readdirSync(path.join(projectDir, directory), {
      withFileTypes: true,
    })) {
      const relative = `${directory}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'test')
          found.push(...sourceFiles(relative))
      } else if (
        /\.(ts|tsx)$/.test(entry.name) &&
        !/\.d\.ts$/.test(entry.name)
      ) {
        found.push(relative)
      }
    }
    return found
  }

  function importedPackages(directories: string[]): Set<string> {
    const names = new Set<string>()
    for (const file of directories.flatMap(sourceFiles)) {
      const text = fs.readFileSync(path.join(projectDir, file), 'utf8')
      for (const match of text.matchAll(
        /(?:\bfrom\s+|\bimport\s+|\brequire\()\s*['"]([^'"]+)['"]/g
      )) {
        const name = packageOf(match[1] ?? '')
        if (name) names.add(name)
      }
    }
    return names
  }

  it('lists as dependencies exactly what the main process and the preload load at run time', () => {
    const runtime = importedPackages(['src/main', 'src/preload'])

    expect([...runtime].sort()).toEqual(['electron-log', 'electron-updater'])
    expect(Object.keys(pkg.dependencies).sort()).toEqual([...runtime].sort())
  })

  it('keeps what Vite bundles into the page out of the dependencies', () => {
    const bundled = importedPackages(['src/renderer', 'src/shared'])

    expect(bundled.size).toBeGreaterThan(0)
    for (const name of bundled) {
      expect(pkg.dependencies, `${name} is bundled by Vite`).not.toHaveProperty(
        name
      )
      expect(
        pkg.devDependencies,
        `${name} must still be installed`
      ).toHaveProperty(name)
    }
  })

  it('keeps only the Chromium locale packs of the three interface languages', () => {
    expect(config.electronLanguages).toEqual(['zh-CN', 'en-US', 'ja'])
  })

  it('lists the files that belong in the asar, and no source folders', () => {
    expect(config.files).toEqual(
      expect.arrayContaining([
        'out/**/*',
        'package.json',
        'THIRD-PARTY-NOTICES.md',
        'icon.ico',
        'icon-256.ico',
        'resources/icons/*.png',
      ])
    )
    // No catch-all, and none of the folders that only exist for development.
    for (const pattern of config.files)
      expect(pattern, pattern).not.toMatch(
        /^(\*\*(\/\*)?|(src|e2e|docs|scripts|node_modules)\b.*)$/
      )
  })
})

describe('the development scripts after the Electron upgrade', () => {
  const script = (name: string): string =>
    fs.readFileSync(path.join(projectDir, name), 'utf8')

  // Electron 44's package no longer downloads the runtime while npm installs it.
  it('fetch the Electron runtime themselves, where npm install no longer does', () => {
    expect(script('install.bat')).toContain(
      'node_modules\\electron\\install.js'
    )
    expect(script('scripts/launch.ps1')).toContain(
      'node_modules\\electron\\install.js'
    )
  })

  it('decide whether dependencies are there by the package, not by the downloaded runtime', () => {
    expect(script('build.bat')).toContain(
      'node_modules\\electron\\package.json'
    )
    expect(script('build.bat')).not.toContain('dist\\electron.exe')
  })
})

describe('the installer (release-repo-11)', () => {
  it('installs for the current user in one click: nothing asks for administrator rights', () => {
    expect(config.nsis.oneClick).toBe(true)
    expect(config.nsis.perMachine).toBe(false)
    // A one-click installer has no folder page; the builder refuses the combination.
    expect(config.nsis.allowToChangeInstallationDirectory).toBeUndefined()
  })

  it('leaves the question about the data to the uninstaller script, never deleting it unasked', () => {
    expect(config.nsis.deleteAppDataOnUninstall).not.toBe(true)
    expect(config.nsis.include).toBe('build/installer.nsh')
  })

  it('has Electron store the data under the package name, the folder the uninstaller offers to delete', () => {
    // userData is %APPDATA%\<productName or name of the package.json inside the asar>.
    expect(pkg.name).toBe('marubako')
    expect(pkg).not.toHaveProperty('productName')
  })
})

describe('the signing hook (release-repo-7)', () => {
  const noopSign = nodeRequire(
    path.join(projectDir, 'noop-sign.js')
  ) as (configuration?: { path?: string }) => Promise<boolean>

  it('is the one the builder config points at', () => {
    expect(config.win.signtoolOptions.sign).toBe('./noop-sign.js')
    expect(fs.existsSync(path.join(projectDir, 'noop-sign.js'))).toBe(true)
  })

  it('says plainly that the file is not signed, naming it, and succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await expect(noopSign({ path: 'C:\\out\\Marubako.exe' })).resolves.toBe(
      true
    )

    const said = [...warn.mock.calls, ...log.mock.calls].flat().join('\n')
    warn.mockRestore()
    log.mockRestore()
    expect(said).toMatch(/UNSIGNED/)
    expect(said).toContain('Marubako.exe')
    expect(said).toMatch(/not code-signed/)
    expect(said).not.toMatch(/\bsigned (successfully|ok)\b/i)
  })

  it('does not trip over a call without details', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(noopSign()).resolves.toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('the renderer bundle (performance-10)', () => {
  // The config is read as text: loading it would start esbuild, which does not run in the jsdom
  // environment of these tests.
  const viteConfig = fs.readFileSync(
    path.join(projectDir, 'electron.vite.config.ts'),
    'utf8'
  )

  /** The `{ ... }` after `name:` at the top level of the config, comments left in. */
  function section(name: 'main' | 'preload' | 'renderer'): string {
    const start = viteConfig.indexOf(`\n  ${name}: {`)
    expect(start, `${name} section`).toBeGreaterThan(-1)
    const open = viteConfig.indexOf('{', start)
    let depth = 0
    for (let index = open; index < viteConfig.length; index++) {
      if (viteConfig[index] === '{') depth++
      if (viteConfig[index] === '}' && --depth === 0)
        return viteConfig.slice(open, index + 1)
    }
    throw new Error(`${name} section is not closed`)
  }

  it('is minified, which also minifies its CSS', () => {
    expect(section('renderer')).toMatch(/build:\s*\{[^}]*minify:\s*'esbuild'/)
  })

  it('leaves main and preload readable: their stack traces end up in the log files users send in', () => {
    expect(section('main')).not.toMatch(/minify/)
    expect(section('preload')).not.toMatch(/minify/)
  })
})
