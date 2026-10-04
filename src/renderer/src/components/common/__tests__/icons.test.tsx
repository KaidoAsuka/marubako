import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { render } from '@testing-library/react'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import * as icons from '../icons'
import {
  ICON_DEFAULTS,
  IconDelete,
  IconProvider,
  SMALL_ICON_MAX_SIZE,
} from '../icons'

const srcRoot = resolve(__dirname, '../../../../..')
const iconsModule = resolve(__dirname, '../icons.ts')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full)
    }
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')
      ? [full]
      : []
  })
}

const files = sourceFiles(srcRoot)

function importedModules(source: string): string[] {
  return [
    ...source.matchAll(
      /(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g
    ),
  ].map((match) => match[1] ?? '')
}

function markup(element: ReactElement): string {
  const { container, unmount } = render(element)
  const html = container.innerHTML
  unmount()
  return html
}

describe('icon layer: sources', () => {
  it('finds the application sources', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('no source file imports lucide-react any more', () => {
    const offenders = files.filter((file) =>
      importedModules(readFileSync(file, 'utf8')).some((name) =>
        name.startsWith('lucide-react')
      )
    )

    expect(offenders.map((file) => relative(srcRoot, file))).toEqual([])
  })

  it('only icons.ts imports the icon library directly', () => {
    const offenders = files.filter(
      (file) =>
        file !== iconsModule &&
        importedModules(readFileSync(file, 'utf8')).some((name) =>
          name.startsWith('@phosphor-icons/')
        )
    )

    expect(offenders.map((file) => relative(srcRoot, file))).toEqual([])
  })

  it('every icon name a component imports from icons.ts is exported by it', () => {
    const exported = new Set(Object.keys(icons))
    const missing: string[] = []

    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      const pattern = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]*\/icons)['"]/g
      for (const match of source.matchAll(pattern)) {
        for (const raw of (match[1] ?? '').split(',')) {
          const name = raw.replace(/^\s*type\s+/, '').trim()
          if (
            name &&
            !exported.has(name) &&
            !/^(Icon|IconProps|IconWeight)$/.test(name)
          ) {
            missing.push(`${relative(srcRoot, file)}: ${name}`)
          }
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('icons.ts does not export an icon that no component uses', () => {
    const usage = files
      .filter((file) => file !== iconsModule)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    const unused = Object.keys(icons).filter(
      (name) => /^Icon[A-Z]/.test(name) && !usage.includes(name)
    )

    expect(unused).toEqual([])
  })
})

describe('icon layer: rendering', () => {
  it('draws small icons with the regular weight and keeps the duotone layer for larger ones', () => {
    expect(SMALL_ICON_MAX_SIZE).toBe(14)

    expect(markup(<IconDelete size={14} />)).toBe(
      markup(<TrashIcon size={14} weight="regular" aria-hidden />)
    )
    expect(markup(<IconDelete size={14} />)).not.toContain('opacity')
    expect(markup(<IconDelete size={16} weight="duotone" />)).toBe(
      markup(<TrashIcon size={16} weight="duotone" aria-hidden />)
    )
    expect(markup(<IconDelete size={16} weight="duotone" />)).toContain(
      'opacity="0.2"'
    )
  })

  it('lets a caller ask for the fill weight at any size (selected states)', () => {
    expect(markup(<IconDelete size={14} weight="fill" />)).toBe(
      markup(<TrashIcon size={14} weight="fill" aria-hidden />)
    )
  })

  it('marks icons decorative unless the caller says otherwise', () => {
    const decorative = render(<IconDelete size={16} />)
    expect(decorative.container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
    decorative.unmount()

    const labelled = render(<IconDelete size={16} aria-hidden={false} />)
    expect(labelled.container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'false'
    )
  })

  it('the provider gives every icon the shared size and the duotone weight', () => {
    expect(ICON_DEFAULTS).toEqual({ size: 16, weight: 'duotone' })

    const { container } = render(
      <IconProvider>
        <IconDelete />
      </IconProvider>
    )
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('width', '16')
    expect(svg).toHaveAttribute('height', '16')
    expect(svg?.innerHTML).toContain('opacity="0.2"')
  })
})
