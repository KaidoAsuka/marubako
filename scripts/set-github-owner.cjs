#!/usr/bin/env node
'use strict'

// Replaces the owner placeholder with a real GitHub user name in every tracked text file.
//
//   node scripts/set-github-owner.cjs <github-user-name>
//
// The repository is published under the owner's personal account, whose name was not known when
// the project was renamed. Until it is, the files carry a placeholder token wherever the owner is
// needed (the repository and issue URLs, the update feed in electron-builder.config.cjs, the app
// id). Run this once, review `git diff`, commit.
//
// The token is assembled from two pieces so that this file (and its test) never contain it and
// can never rewrite themselves.

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const TOKEN = 'GITHUB_USER_' + 'PLACEHOLDER'

// Paths that are never rewritten, relative to the project root with forward slashes.
// docs/review-2026-10-02 belongs to the review and is kept as written; node_modules and .git are
// skipped at any depth.
const SKIPPED_PREFIXES = ['docs/review-2026-10-02/']
const SKIPPED_FOLDERS = ['node_modules', '.git']
const SKIPPED_FILES = ['scripts/set-github-owner.cjs']
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.bmp',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.zip',
  '.exe',
  '.asar',
  '.pdf',
])

/**
 * GitHub user names: 1 to 39 characters, letters, digits and single hyphens, never starting or
 * ending with a hyphen. The same text is safe inside a URL and inside the reverse-DNS app id.
 */
function isValidGitHubUsername(value) {
  return (
    typeof value === 'string' &&
    value.length <= 39 &&
    /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value)
  )
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/')
}

function isSkipped(relativePath) {
  const posix = toPosix(relativePath)
  if (SKIPPED_FILES.includes(posix)) return true
  if (BINARY_EXTENSIONS.has(path.extname(posix).toLowerCase())) return true
  if (SKIPPED_PREFIXES.some((prefix) => posix.startsWith(prefix))) return true
  return posix.split('/').some((segment) => SKIPPED_FOLDERS.includes(segment))
}

/** Tracked files from git, relative to `root`; null when `root` is not inside a git checkout. */
function listTrackedFiles(root) {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return output.split('\0').filter(Boolean)
  } catch {
    return null
  }
}

/** Every file below `root`, relative, without descending into skipped folders. */
function walkFiles(root, directory = '') {
  const found = []
  for (const entry of fs.readdirSync(path.join(root, directory), {
    withFileTypes: true,
  })) {
    const relative = directory ? path.join(directory, entry.name) : entry.name
    if (entry.isDirectory()) {
      if (!isSkipped(`${toPosix(relative)}/`)) {
        found.push(...walkFiles(root, relative))
      }
    } else if (entry.isFile()) {
      found.push(relative)
    }
  }
  return found
}

/** The files the run looks at: git's tracked list, or the folder contents outside a checkout. */
function listCandidateFiles(root, lister = defaultLister) {
  return lister(root).filter((relative) => !isSkipped(relative))
}

function defaultLister(root) {
  return listTrackedFiles(root) ?? walkFiles(root)
}

function looksBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0)
}

/**
 * Replaces the token in every candidate file that contains it and returns the changed paths
 * (relative, forward slashes). With dryRun nothing is written.
 */
function replaceOwner(root, owner, { dryRun = false, lister } = {}) {
  if (!isValidGitHubUsername(owner)) {
    throw new Error(`"${owner}" is not a valid GitHub user name`)
  }
  const changed = []
  for (const relative of listCandidateFiles(root, lister)) {
    const absolute = path.join(root, relative)
    let buffer
    try {
      buffer = fs.readFileSync(absolute)
    } catch {
      // Listed by git but deleted in the working copy.
      continue
    }
    if (!buffer.includes(TOKEN) || looksBinary(buffer)) continue
    const next = buffer.toString('utf8').split(TOKEN).join(owner)
    if (!dryRun) fs.writeFileSync(absolute, next)
    changed.push(toPosix(relative))
  }
  return changed
}

function usage() {
  return [
    'Usage: node scripts/set-github-owner.cjs <github-user-name> [--dry-run]',
    '',
    'Replaces the owner placeholder in every tracked text file with the given GitHub user name.',
    'Run it once from the project root after the account is known, then review `git diff`.',
  ].join('\n')
}

function main(argv, root, out = console) {
  const args = argv.filter((argument) => argument !== '--dry-run')
  const dryRun = argv.includes('--dry-run')
  if (argv.includes('--help') || argv.includes('-h')) {
    out.log(usage())
    return 0
  }
  if (args.length !== 1) {
    out.error(usage())
    return 2
  }
  if (!isValidGitHubUsername(args[0])) {
    out.error(
      `"${args[0]}" is not a valid GitHub user name (letters, digits and single hyphens, at most 39 characters).`
    )
    return 2
  }
  const changed = replaceOwner(root, args[0], { dryRun })
  if (changed.length === 0) {
    out.log('No file contains the owner placeholder; nothing changed.')
    return 0
  }
  out.log(
    `${dryRun ? 'Would change' : 'Changed'} ${changed.length} file(s):\n` +
      changed.map((file) => `  ${file}`).join('\n')
  )
  return 0
}

module.exports = {
  TOKEN,
  isValidGitHubUsername,
  isSkipped,
  walkFiles,
  listCandidateFiles,
  replaceOwner,
  main,
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), path.resolve(__dirname, '..'))
}
