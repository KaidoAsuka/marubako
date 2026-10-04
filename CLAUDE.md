@AGENTS.md

## Notes for Claude Code

- The commands, conventions and the "Do not" list in AGENTS.md are binding. Where this file and AGENTS.md differ, AGENTS.md wins.
- Reply in the language the person writing to you uses. Code, comments, commit messages and pull request text stay in English.
- Run only what AGENTS.md allows for your environment. A cloud session runs lint, the formatting check, typecheck and unit tests, and does not run Playwright.
- Windows shells: the Bash tool is Git Bash and PowerShell is the primary shell. Use forward slashes in Bash, quote paths with spaces, and prefer the Read, Grep and Glob tools to `cat` and `grep`.
- Git worktrees live under `.claude/worktrees/` and are throwaway copies. Never commit them, and lint with `npx eslint src e2e scripts tools` so that ESLint does not walk into them.
- Commit with `type(scope): summary` as the first line, so that the same title works for the pull request.
- For a larger change, write down the plan first (which files, which tests) and keep to it. Report what you could not verify instead of guessing.
