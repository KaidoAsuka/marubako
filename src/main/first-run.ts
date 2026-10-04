/**
 * Whether this run shows the first-run experience: the guidance card on the first screen and, for
 * a window that has never been placed, the ball beside the panel from the first second.
 *
 * The end-to-end runs (`QUICKLAUNCH_E2E`) keep the plain first start every spec was written
 * against, unless a spec opts in with `QUICKLAUNCH_FIRST_RUN=1`. That keeps one feature from
 * moving the starting point of every other test.
 */
export function firstRunExperienceEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.QUICKLAUNCH_E2E !== '1' || env.QUICKLAUNCH_FIRST_RUN === '1'
}
