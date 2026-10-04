<!--
The title of this pull request becomes the commit message and the changelog line, so write it as
`type(scope): summary`, for example `fix(tasks): keep the date when a task is edited`.
Types: feat, fix, perf, refactor, docs, test, build, ci, chore, revert. See CONTRIBUTING.md.
-->

## What changed

<!-- What does the app do differently now? Say it from the point of view of the person using it. -->

## Why

<!-- The problem or the issue this solves. Link the issue: "Closes #123". -->

## How I checked it

<!-- Commands you ran and what you saw. For a visible change, add a screenshot. -->

- [ ] `npx eslint src e2e scripts tools`
- [ ] `npx prettier --check .`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] A UI test or a manual check for what I changed (`npm run build`, then `npx playwright test e2e/<name>.spec.ts`)

## Checklist

- [ ] A change in behavior has a test that fails without the change.
- [ ] Every new or changed text is there in Chinese, English and Japanese.
- [ ] I did not change version numbers, `CHANGELOG.md`, the release workflow or the dependencies (or I explain why above).
- [ ] My tests use temporary data folders, not real user data.
