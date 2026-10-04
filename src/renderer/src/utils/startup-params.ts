import {
  parseStartupParams,
  type StartupParams,
} from '../../../shared/startup-params'

/** What the main process put in this window's URL (language, theme, first-run guidance). */
export function getStartupParams(): StartupParams {
  return parseStartupParams(window.location.search)
}
