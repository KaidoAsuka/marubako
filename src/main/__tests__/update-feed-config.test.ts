import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface PublishEntry {
  provider: string
  owner: string
  repo: string
  releaseType?: string
}
interface BuilderConfig {
  publish: PublishEntry[]
}

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const configPath = path.join(projectDir, 'electron-builder.config.cjs')
const nodeRequire = createRequire(import.meta.url)

/** The builder config as electron-builder would read it with this environment. */
function loadConfig(env: Record<string, string | undefined>): BuilderConfig {
  const saved = {
    QUICKLAUNCH_UPDATE_REPOSITORY: process.env.QUICKLAUNCH_UPDATE_REPOSITORY,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
  }
  for (const [name, value] of Object.entries({
    QUICKLAUNCH_UPDATE_REPOSITORY: undefined,
    GITHUB_REPOSITORY: undefined,
    ...env,
  })) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  try {
    delete nodeRequire.cache[configPath]
    return nodeRequire(configPath) as BuilderConfig
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    delete nodeRequire.cache[configPath]
  }
}

const read = (relative: string): string =>
  fs.readFileSync(path.join(projectDir, relative), 'utf8')

let before: Record<string, string | undefined>
beforeEach(() => {
  before = {
    QUICKLAUNCH_UPDATE_REPOSITORY: process.env.QUICKLAUNCH_UPDATE_REPOSITORY,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
  }
})
afterEach(() => {
  for (const [name, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('the update feed (release-repo-2)', () => {
  it('is the GitHub releases of the project, so that latest.yml and app-update.yml exist', () => {
    const [feed, ...others] = loadConfig({}).publish

    expect(others).toEqual([])
    expect(feed).toMatchObject({
      provider: 'github',
      repo: 'marubako',
      releaseType: 'release',
    })
    // The owner is the placeholder until scripts/set-github-owner.cjs has been run.
    expect(feed?.owner).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('names the same owner and repository as the pages the app links to', () => {
    const [feed] = loadConfig({}).publish
    const repositoryUrl = /REPOSITORY_URL =\s*'([^']+)'/.exec(
      read('src/main/config.ts')
    )?.[1]

    expect(repositoryUrl).toBe(
      `https://github.com/${feed?.owner}/${feed?.repo}`
    )
  })

  it('follows a fork: the environment decides when it names a repository', () => {
    expect(
      loadConfig({ QUICKLAUNCH_UPDATE_REPOSITORY: 'someone/fork' }).publish[0]
    ).toMatchObject({ owner: 'someone', repo: 'fork' })
    expect(
      loadConfig({ GITHUB_REPOSITORY: 'org/marubako' }).publish[0]
    ).toMatchObject({ owner: 'org', repo: 'marubako' })
    expect(
      loadConfig({
        QUICKLAUNCH_UPDATE_REPOSITORY: 'first/one',
        GITHUB_REPOSITORY: 'second/two',
      }).publish[0]
    ).toMatchObject({ owner: 'first', repo: 'one' })
  })

  it('ignores an environment value that is not a repository', () => {
    expect(
      loadConfig({ QUICKLAUNCH_UPDATE_REPOSITORY: 'nonsense' }).publish[0]
    ).toMatchObject({ repo: 'marubako' })
  })
})

describe('the links in the program', () => {
  it('has an issue page under the repository', () => {
    const config = read('src/main/config.ts')

    expect(/ISSUES_URL = `\$\{REPOSITORY_URL\}\/issues`/.test(config)).toBe(
      true
    )
    expect(config).toMatch(
      /REPOSITORY_URL =\s*'https:\/\/github\.com\/[A-Za-z0-9_-]+\/marubako'/
    )
  })
})
