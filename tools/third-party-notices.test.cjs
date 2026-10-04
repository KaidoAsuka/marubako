'use strict'

// Run with: node --test "tools/**/*.test.cjs"
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { describe, it } = require('node:test')

const {
  collectInputs,
  findMissingNotices,
  importedPackages,
  listedPackages,
  packageNameOf,
  shippedPackages,
} = require('./third-party-notices.cjs')

describe('packageNameOf', () => {
  it('keeps the scope and drops sub-paths', () => {
    assert.equal(packageNameOf('react'), 'react')
    assert.equal(packageNameOf('electron-log/main'), 'electron-log')
    assert.equal(packageNameOf('@dnd-kit/core'), '@dnd-kit/core')
    assert.equal(
      packageNameOf('@phosphor-icons/react/dist/csr/Plus'),
      '@phosphor-icons/react'
    )
  })
})

describe('importedPackages', () => {
  const declared = ['react', 'zustand', '@dnd-kit/core', 'electron-log']

  it('finds static, dynamic and re-exported imports of declared packages', () => {
    const found = importedPackages(
      [
        "import { useState } from 'react'",
        "import 'zustand'",
        "export { x } from '@dnd-kit/core'",
        "const log = await import('electron-log/main')",
      ],
      declared
    )
    assert.deepEqual(found, [
      '@dnd-kit/core',
      'electron-log',
      'react',
      'zustand',
    ])
  })

  it('ignores relative paths, aliases, built-in modules and undeclared names', () => {
    const found = importedPackages(
      [
        "import a from './a'",
        "import b from '@renderer/b'",
        "import path from 'node:path'",
        "import fs from 'fs'",
        "import c from 'not-declared'",
      ],
      declared
    )
    assert.deepEqual(found, [])
  })
})

describe('shippedPackages', () => {
  const lock = {
    packages: {
      '': {},
      'node_modules/app-dep': {
        version: '1.0.0',
        license: 'MIT',
        dependencies: { shared: '^1', helper: '^2' },
        optionalDependencies: { 'optional-native': '^1' },
      },
      'node_modules/app-dep/node_modules/shared': {
        version: '1.5.0',
        license: 'ISC',
      },
      'node_modules/shared': { version: '2.0.0', license: 'MIT' },
      'node_modules/helper': { version: '2.1.0', license: 'MIT' },
      'node_modules/build-tool': {
        version: '9.0.0',
        license: 'MIT',
        dev: true,
        dependencies: { 'only-for-build': '^1' },
      },
      'node_modules/only-for-build': {
        version: '1.0.0',
        license: 'MIT',
        dev: true,
      },
    },
  }

  it('follows run-time dependencies, preferring the nested copy', () => {
    const names = shippedPackages(lock, ['app-dep']).map((p) => p.name)
    assert.deepEqual(names, ['app-dep', 'helper', 'shared'])
    const shared = shippedPackages(lock, ['app-dep']).find(
      (p) => p.name === 'shared'
    )
    assert.equal(shared.version, '1.5.0')
  })

  it('skips optional packages that were not installed and build-only packages', () => {
    const names = shippedPackages(lock, ['app-dep']).map((p) => p.name)
    assert.ok(!names.includes('optional-native'))
    assert.ok(!names.includes('build-tool'))
    assert.ok(!names.includes('only-for-build'))
  })

  it('fails loudly when a needed package is missing from the lockfile', () => {
    assert.throws(() => shippedPackages(lock, ['not-in-lock']), /not-in-lock/)
  })
})

describe('findMissingNotices', () => {
  const notices = [
    '| Package | Licence |',
    '| --- | --- |',
    '| `react-dom` | MIT |',
    '| `@dnd-kit/core` | MIT |',
  ].join('\n')

  it('does not mistake a package whose name is a prefix of a listed one', () => {
    assert.deepEqual(
      findMissingNotices([{ name: 'react' }, { name: 'react-dom' }], notices),
      ['react']
    )
  })

  it('reports nothing when every package has a row', () => {
    assert.deepEqual(
      findMissingNotices([{ name: '@dnd-kit/core' }], notices),
      []
    )
  })

  it('only counts table rows, not mentions in prose', () => {
    assert.deepEqual(
      [...listedPackages('Thanks to `zustand` for state.\n')],
      []
    )
  })
})

describe('THIRD-PARTY-NOTICES.md of this repository', () => {
  const root = path.resolve(__dirname, '..')
  const notices = fs.readFileSync(
    path.join(root, 'THIRD-PARTY-NOTICES.md'),
    'utf8'
  )
  const { pkg, packages } = collectInputs(root)

  it('has a row for every package that ships in the app', () => {
    assert.deepEqual(findMissingNotices(packages, notices), [])
  })

  it('covers every entry of dependencies', () => {
    const names = new Set(packages.map((p) => p.name))
    for (const name of Object.keys(pkg.dependencies)) {
      assert.ok(names.has(name), `${name} is in dependencies but not covered`)
    }
  })

  it('fails when a production dependency loses its row', () => {
    const [first] = Object.keys(pkg.dependencies)
    const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const row = new RegExp(`^\\| \`${escaped}\` \\|.*$`, 'm')
    const without = notices.replace(row, '')
    assert.notEqual(without, notices)
    assert.deepEqual(findMissingNotices(packages, without), [first])
  })

  it('mentions Electron and where its licences are shipped', () => {
    assert.match(notices, /LICENSE\.electron\.txt/)
    assert.match(notices, /LICENSES\.chromium\.html/)
  })
})
