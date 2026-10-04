# Contributing to Marubako

Thank you for helping. Bug reports, ideas and pull requests are all welcome. For anything bigger than a small fix, please open an issue first so that we can agree on the direction before you spend time on code.

If you are an AI coding assistant, read [AGENTS.md](AGENTS.md) as well: it is the same rules, written for you.

## Set up

Marubako is a Windows app (Electron, React and TypeScript), and its tests drive real windows, so you need Windows 10 or 11.

```powershell
git clone https://github.com/KaidoAsuka/marubako.git
cd marubako
npm ci
npm run dev
```

You need [Node.js](https://nodejs.org/) 22.13 or newer. `npm run dev` runs the app from source with its own data folder (`%APPDATA%\marubako-dev`), so it never touches the data of an installed Marubako.

## Project layout

```text
src/main/        Electron main process: windows, tray, storage, backups, IPC, updates
src/preload/     the bridge that exposes the main process to the interface
src/shared/      types, default data and IPC definitions used by both sides
src/renderer/    the React interface: components, store, drag and drop, styles, i18n
e2e/             Playwright tests that drive the real app
tools/           small repository scripts and their tests (Node's built-in test runner)
scripts/         build and release helper scripts
docs/            behavior notes and images
```

Unit tests sit next to the code they test, in `__tests__` folders.

## Checks

Run these before you open a pull request. CI runs the same on Windows.

| What                 | Command                                                               |
| -------------------- | --------------------------------------------------------------------- |
| Lint                 | `npx eslint src e2e scripts tools`                                    |
| Formatting           | `npx prettier --check .` (fix with `npx prettier --write <files>`)    |
| Types                | `npm run typecheck`                                                   |
| Unit tests           | `npm test` (`npm run test:coverage` also checks the coverage minimum) |
| Repository scripts   | `node --test "tools/**/*.test.cjs"`                                   |
| Build                | `npm run build`                                                       |
| UI tests, everything | `npm run test:e2e`                                                    |
| UI tests, one file   | `npm run build`, then `npx playwright test e2e/<name>.spec.ts`        |
| Installer, portable  | `npm run dist` (both are in `release\<version>\`)                     |

The UI tests open real windows and move the real mouse: do not use the computer while they run. They use temporary data folders and never read or write your real data. Two specs are sensitive to display scaling and can fail on some machines even on an unchanged checkout: `window-controls.spec.ts` ("a bubble stays at a free position through clicks, edits and restart") and `peek-mode.spec.ts` ("temporary right-side expansion flips inward and repeatedly returns to the untouched bubble"). If one of them fails and you did not touch windows or the bubble, say so in the pull request.

## Code conventions

- TypeScript is strict. Prettier decides the formatting (no semicolons, single quotes, trailing commas where ES5 allows them); ESLint catches the rest. Code comments are in English.
- A change in behavior comes with a test that fails without the change: a unit test (Vitest) when the logic can be tested without a window, a Playwright test when it cannot.
- Keep a pull request to one topic. Do not mix a refactoring with a fix.
- Do not add a dependency without a reason that you write down in the pull request. Do not change version numbers or `CHANGELOG.md`: releases are cut by a bot (see below).

## Interface text

Every text a person can see exists in three languages: Chinese (`zh`), English (`en`) and Japanese (`ja`). That covers the string tables in `src/renderer/src/i18n/`, the sentences of the main process in `src/main/main-strings.ts`, window titles, the tray, dialogs and errors. A string in only one language is a bug. The glossary at the top of `src/renderer/src/i18n/translations.ts` says which word each language uses for each concept, and `glossary.test.ts` fails when a banned wording comes back. The product name is Marubako in every language (the Japanese text may also write まるばこ).

## Pull requests

1. Branch from `main`. Never push to `main` directly.
2. Make your change, and run the checks above.
3. Open a pull request. The template asks what changed, why, and how you checked it. For a change you can see, add a screenshot.
4. CI must be green: the title check, the lint, types and unit tests, and the UI tests on Windows. A person reviews and merges with **Squash and merge**, so one pull request becomes one commit on `main`.

### Title format

The title of the pull request becomes the commit message on `main`, and the release tool reads it to write the changelog and to choose the next version. So the title has to look like this:

```text
type(scope): summary
```

- `type` is one of `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.
- `scope` is optional: the part of the app, for example `tasks`, `search`, `ball`, `settings`, `data`, `i18n`, `installer`.
- `summary` is a short sentence in the imperative, without a final period.

Examples: `fix(tasks): keep the date when a task is edited`, `feat(search): show recently used items first`, `docs(readme): explain the SmartScreen warning`.

| Title                       | Effect on the next release             |
| --------------------------- | -------------------------------------- |
| `fix: ...`                  | patch version (3.0.0 to 3.0.1)         |
| `feat: ...`                 | minor version (3.0.0 to 3.1.0)         |
| `feat!: ...` or `fix!: ...` | major version (3.0.0 to 4.0.0)         |
| anything else               | no release by itself, listed or hidden |

`!` after the type, or a `BREAKING CHANGE:` paragraph in the description, marks a change that breaks existing data or behavior.

## How a release is made

This part is for the maintainer. Contributors do not need to do anything.

1. Squash-merged pull requests collect on `main`.
2. The release workflow keeps one open pull request named like `chore: release 3.1.0`, with the new version and the changelog.
3. Merging that pull request creates the tag and the GitHub release. The same workflow then builds the Windows installer and attaches `Marubako-Setup-<version>.exe`, its `.blockmap` and `latest.yml` (which the in-app updater reads) to that release.

The release pull request is opened with the default `GITHUB_TOKEN`, and GitHub does not start other workflows for events caused by that token: the checks `checks`, `e2e` and the title check do not run on it. If the ruleset on `main` requires them, close and reopen the release pull request once (a person reopening it does start them), wait for them to pass, then merge. Every later update of that pull request by the release workflow removes the checks again, so reopen it after the last update.

The first release is chosen with a `Release-As: 3.0.0` line in the body of the last commit before the first run of the release workflow; after that the version follows the rules above. The installer is not code-signed, which is why the README explains the SmartScreen warning.

## Reporting problems

- Bugs and ideas: [open an issue](https://github.com/KaidoAsuka/marubako/issues/new/choose) and fill in the form. When you attach log lines from `%APPDATA%\marubako\logs\main.log`, replace your Windows user name in the paths first, and never upload `quicklaunch-data.json` or `.recovery-*` files: they hold your data, including passwords.
- Security problems: see [SECURITY.md](SECURITY.md). Do not open a public issue.
