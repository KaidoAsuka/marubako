const packageMetadata = require('./package.json')

function normalizeRepositorySource(repository) {
  if (!repository) {
    return null
  }

  if (typeof repository === 'string') {
    return repository
  }

  if (typeof repository.url === 'string') {
    return repository.url
  }

  return null
}

function parseGitHubRepository(source) {
  if (!source) {
    return null
  }

  const normalized = source
    .trim()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')

  const directMatch = normalized.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (directMatch) {
    return {
      owner: directMatch[1],
      repo: directMatch[2],
    }
  }

  const urlMatch = normalized.match(/github\.com[/:]([^/\s]+)\/([^/\s]+)$/i)
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
    }
  }

  return null
}

// The update feed: the GitHub Releases of the project. The owner is filled in by
// scripts/set-github-owner.cjs; the environment (a fork's build, a test feed) and package.json's
// repository field come first, so a fork publishes and updates from its own releases.
const DEFAULT_GITHUB_REPOSITORY = {
  owner: 'KaidoAsuka',
  repo: 'marubako',
}

function resolveGitHubRepository() {
  const candidates = [
    process.env.QUICKLAUNCH_UPDATE_REPOSITORY,
    process.env.GITHUB_REPOSITORY,
    normalizeRepositorySource(packageMetadata.repository),
  ]

  for (const candidate of candidates) {
    const repository = parseGitHubRepository(candidate)
    if (repository) {
      return repository
    }
  }

  return DEFAULT_GITHUB_REPOSITORY
}

const githubRepository = resolveGitHubRepository()

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: 'io.github.KaidoAsuka.marubako',
  productName: 'Marubako',
  // Written to resources/app-update.yml (where electron-updater looks) and used to produce latest.yml
  // next to the installer. npm run dist and the CI package job never upload (--publish never); only
  // the release workflow uploads, through electron-builder --publish always, which also uploads
  // latest.yml.
  publish: [
    {
      provider: 'github',
      owner: githubRepository.owner,
      repo: githubRepository.repo,
      releaseType: 'release',
    },
  ],
  directories: {
    buildResources: 'build',
    output: 'release/${version}',
  },
  // What goes into app.asar next to the production dependencies (electron-log, electron-updater and
  // theirs). The interface libraries are bundled into out/renderer by Vite and are therefore
  // devDependencies; listing them as dependencies would pack a second, unused copy of each.
  files: [
    'out/**/*',
    'package.json',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
    'icon.ico',
    'icon-256.ico',
    'resources/icons/*.png',
  ],
  // Only the three languages of the interface keep their Chromium locale pack (about 45 MB less).
  // app.getLocale(), which the first start reads to pick the interface language (initial-lang.ts),
  // then answers with the closest pack: checked on Electron 44, --lang=zh-TW and zh-HK give zh-CN,
  // en-GB gives en-US, so the Chinese variants still start in Chinese.
  electronLanguages: ['zh-CN', 'en-US', 'ja'],
  win: {
    target: ['nsis'],
    icon: 'icon-256.ico',
    // Editing the executable (icon, version information) stays on; the "signing" step is the hook
    // below, which signs nothing and says so in the log: the releases are not code-signed.
    signAndEditExecutable: true,
    signtoolOptions: {
      sign: './noop-sign.js',
    },
  },
  nsis: {
    artifactName: 'Marubako-Setup-${version}.exe',
    // One click, for the current user only: no administrator prompt to install, and none for the
    // update that installs itself when the program quits (a per-machine install would ask every
    // time). It also fits the data, which Windows encrypts for one user account. The cost is that
    // the installation folder cannot be chosen (it is %LOCALAPPDATA%\Programs\Marubako).
    oneClick: true,
    perMachine: false,
    // The uninstaller asks about the data itself (build/installer.nsh), so the builder's own
    // delete-without-asking switch stays off.
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Marubako',
    include: 'build/installer.nsh',
  },
}

module.exports = config
