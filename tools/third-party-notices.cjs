#!/usr/bin/env node
'use strict'

/**
 * Keeps THIRD-PARTY-NOTICES.md in step with what the packaged app really contains.
 *
 *   node tools/third-party-notices.cjs          check; exit code 1 when a package that ships in
 *                                               the app has no row in the notices (CI runs this)
 *   node tools/third-party-notices.cjs --write  regenerate the notices from node_modules
 *
 * The check reads package.json, package-lock.json and src/ only, so it needs no node_modules.
 * "Ships in the app" means:
 *   - every entry of `dependencies` and everything they need at run time (the lockfile tells),
 *   - every package that src/ imports outside tests (Vite bundles those into the renderer even
 *     when they are listed under devDependencies),
 *   - the packages in EMBEDDED_PACKAGES, which are never imported but whose data is compiled in.
 * Electron itself is covered by its own section of the notices.
 */

const fs = require('node:fs')
const path = require('node:path')
const { builtinModules } = require('node:module')

const ROOT = path.resolve(__dirname, '..')
const NOTICES_FILE = path.join(ROOT, 'THIRD-PARTY-NOTICES.md')

/** Never imported from src/, but their data is embedded at build time (scripts/generate-tiles.cjs). */
const EMBEDDED_PACKAGES = ['@phosphor-icons/core']

/** Covered by a dedicated section, not by a table row. */
const SEPARATELY_LISTED = new Set(['electron'])

const PACKAGE_NOTES = {
  '@phosphor-icons/core':
    'Icon outlines embedded as path data (preset entry icons)',
  '@phosphor-icons/react': 'Interface icons',
}

const LICENSE_FILE_PATTERN = /^(licen[sc]e|copying)([.-].*)?$/i

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** `@scope/name/sub/path` -> `@scope/name`, `name/sub` -> `name`. */
function packageNameOf(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function isTestPath(relativePath) {
  return (
    /(^|[\\/])(__tests__|test)[\\/]/.test(relativePath) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath) ||
    /\.d\.ts$/.test(relativePath)
  )
}

function listSourceFiles(directory, base = directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full, base))
    } else if (
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !isTestPath(path.relative(base, full))
    ) {
      files.push(full)
    }
  }
  return files
}

/** Names of declared packages that the given source texts import. */
function importedPackages(sourceTexts, declaredNames) {
  const declared = new Set(declaredNames)
  const found = new Set()
  const pattern = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g
  for (const text of sourceTexts) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue
      if (builtinModules.includes(specifier)) continue
      const name = packageNameOf(specifier)
      if (declared.has(name)) found.add(name)
    }
  }
  return [...found].sort()
}

/** Finds the lockfile entry a dependency of `fromPath` resolves to, like Node's resolution. */
function resolveInLock(lock, fromPath, dependencyName) {
  let current = fromPath
  for (;;) {
    const candidate = `${current ? `${current}/` : ''}node_modules/${dependencyName}`
    if (lock.packages[candidate]) return candidate
    if (!current) return null
    const index = current.lastIndexOf('/node_modules/')
    current = index === -1 ? '' : current.slice(0, index)
  }
}

/**
 * Every package that ships in the app, as `{ name, path, version, license }` sorted by name.
 * `roots` are the package names the app uses directly; the lockfile supplies what they need.
 */
function shippedPackages(lock, roots) {
  const byPath = new Map()
  const visit = (lockPath) => {
    if (byPath.has(lockPath)) return
    const entry = lock.packages[lockPath]
    byPath.set(lockPath, entry)
    const dependencies = {
      ...entry.dependencies,
      ...entry.optionalDependencies,
    }
    for (const dependency of Object.keys(dependencies)) {
      const resolved = resolveInLock(lock, lockPath, dependency)
      if (resolved) visit(resolved)
      else if (!entry.optionalDependencies?.[dependency]) {
        throw new Error(
          `${lockPath} needs ${dependency}, which the lockfile lacks`
        )
      }
    }
  }
  for (const root of roots) {
    const lockPath = resolveInLock(lock, '', root)
    if (!lockPath) throw new Error(`${root} is not in package-lock.json`)
    visit(lockPath)
  }

  const byName = new Map()
  for (const [lockPath, entry] of [...byPath].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const name = lockPath.slice(lockPath.lastIndexOf('node_modules/') + 13)
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        path: lockPath,
        version: entry.version,
        license: entry.license ?? 'UNKNOWN',
      })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Roots of the "ships in the app" set for this repository. */
function appRoots(pkg, sourceTexts) {
  const declared = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]
  const roots = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...importedPackages(sourceTexts, declared),
    ...EMBEDDED_PACKAGES,
  ])
  for (const name of SEPARATELY_LISTED) roots.delete(name)
  return [...roots].sort()
}

/** Package names that have a table row (a line starting with | `name` |). */
function listedPackages(noticesText) {
  const listed = new Set()
  for (const match of noticesText.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)) {
    listed.add(match[1])
  }
  return listed
}

function findMissingNotices(packages, noticesText) {
  const listed = listedPackages(noticesText)
  return packages.filter((p) => !listed.has(p.name)).map((p) => p.name)
}

function collectInputs(root = ROOT) {
  const pkg = readJson(path.join(root, 'package.json'))
  const lock = readJson(path.join(root, 'package-lock.json'))
  const sourceTexts = listSourceFiles(path.join(root, 'src')).map((file) =>
    fs.readFileSync(file, 'utf8')
  )
  const packages = shippedPackages(lock, appRoots(pkg, sourceTexts))
  return { pkg, lock, packages }
}

// ---------------------------------------------------------------------------------------------
// Generation

function findLicenseFile(packageDirectory) {
  const names = fs
    .readdirSync(packageDirectory)
    .filter((name) => LICENSE_FILE_PATTERN.test(name))
    .sort()
  const first = names[0]
  return first ? path.join(packageDirectory, first) : null
}

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n').trim()
}

function renderNotices({ packages, readLicense, electronLicenseText }) {
  const lines = []
  const push = (...parts) => lines.push(...parts)

  push(
    '# Third-party notices',
    '',
    'Marubako itself is released under the MIT licence (see [LICENSE](LICENSE)). It is built on the',
    'third-party software below, and their licences are reproduced here as their authors require.',
    '',
    'This file is generated. After the dependencies change, run `node tools/third-party-notices.cjs --write`.',
    'Running the script without arguments (CI does) fails when a package that ships in the app has no row',
    'in the table below.',
    '',
    '## Electron, Chromium and Node.js',
    '',
    'The app runs on [Electron](https://www.electronjs.org/), which includes Chromium, Node.js, V8 and',
    'many other components under their own licences. The installed app contains both texts next to',
    'the program: `LICENSE.electron.txt` is the Electron licence reproduced below, and',
    '`LICENSES.chromium.html` lists the licences of Chromium and everything built into it.',
    '',
    '```',
    normalizeText(electronLicenseText),
    '```',
    '',
    '## npm packages in the app',
    '',
    'Everything the app needs at run time, including packages that are bundled into the interface at',
    'build time. Test and build tools are not part of the app and are not listed.',
    '',
    '| Package | Licence | Note |',
    '| --- | --- | --- |'
  )
  for (const p of packages) {
    push(`| \`${p.name}\` | ${p.license} | ${PACKAGE_NOTES[p.name] ?? ''} |`)
  }
  push('')

  const entries = packages.map((p) => ({ ...p, ...readLicense(p) }))

  // The licence files are reproduced verbatim (their copyright lines are part of the licence);
  // packages whose files are identical share one block.
  const blocks = new Map()
  const withoutText = []
  for (const entry of entries) {
    if (entry.text === null) {
      withoutText.push(entry)
      continue
    }
    const text = normalizeText(entry.text)
    if (!blocks.has(text)) blocks.set(text, [])
    blocks.get(text).push(entry)
  }

  push('## Licence texts')
  for (const [text, members] of blocks) {
    const licenses = [...new Set(members.map((m) => m.license))].join(', ')
    const names = members.map((m) => `\`${m.name}\``).join(', ')
    push('', `### ${licenses}: ${names}`, '', '```', text, '```')
  }

  if (withoutText.length > 0) {
    push(
      '',
      '### Packages without a licence file',
      '',
      'These packages ship no licence file. The licence listed is the one their package.json declares; the',
      'standard text of that licence is printed above for the packages that ship it.',
      ''
    )
    for (const entry of withoutText) {
      push(`- \`${entry.name}\`: ${entry.license} (author: ${entry.author})`)
    }
  }

  return `${lines.join('\n')}\n`
}

function writeNotices(root = ROOT) {
  const { packages } = collectInputs(root)
  const readLicense = (p) => {
    const directory = path.join(root, p.path)
    const file = findLicenseFile(directory)
    const { author } = readJson(path.join(directory, 'package.json'))
    return {
      text: file ? fs.readFileSync(file, 'utf8') : null,
      author: typeof author === 'string' ? author : (author?.name ?? 'unknown'),
    }
  }
  const electronLicenseText = fs.readFileSync(
    path.join(root, 'node_modules', 'electron', 'dist', 'LICENSE'),
    'utf8'
  )
  const text = renderNotices({ packages, readLicense, electronLicenseText })
  fs.writeFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), text)
  return packages
}

function main(argv) {
  if (argv.includes('--write')) {
    const packages = writeNotices()
    console.log(`Wrote ${NOTICES_FILE} (${packages.length} packages).`)
    return 0
  }

  const { packages } = collectInputs()
  const missing = findMissingNotices(
    packages,
    fs.readFileSync(NOTICES_FILE, 'utf8')
  )
  if (missing.length > 0) {
    console.error(
      `THIRD-PARTY-NOTICES.md has no entry for: ${missing.join(', ')}.\n` +
        'Run `node tools/third-party-notices.cjs --write` (after `npm ci`) and commit the result.'
    )
    return 1
  }
  console.log(
    `THIRD-PARTY-NOTICES.md covers all ${packages.length} packages that ship in the app.`
  )
  return 0
}

module.exports = {
  EMBEDDED_PACKAGES,
  appRoots,
  collectInputs,
  findMissingNotices,
  importedPackages,
  listedPackages,
  packageNameOf,
  renderNotices,
  shippedPackages,
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
