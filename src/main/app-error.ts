import type { ErrorCode } from '../shared/types'

/**
 * A failure the user can be told about in their own language. `message` stays the technical text
 * (it goes to the log and to the tooltip); `code` is what the window turns into a sentence and a
 * next step. Raised where the failure is understood, never guessed at in the generic IPC layer:
 * a missing file means "edit the entry" when an entry was opened and something else for an export.
 */
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
  }
}

/** Where, when something is missing, the user has to look: a folder or file, or a program. */
export type OpenKind = 'folder' | 'app'

/** Turns the error of looking at the target of an entry into one the user can act on. */
export function classifyOpenError(error: unknown, kind: OpenKind): AppError {
  const errno =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  const message = error instanceof Error ? error.message : String(error)
  const options = { cause: error }
  const missing: ErrorCode = kind === 'app' ? 'app_missing' : 'path_missing'

  switch (errno) {
    case 'ENOENT':
    // An unplugged drive, a network share that does not answer: for the user it is "not there".
    case 'ENXIO':
    case 'ENODEV':
    case 'ENETDOWN':
    case 'ENETUNREACH':
    case 'EHOSTUNREACH':
    case 'ETIMEDOUT':
      return new AppError(missing, message, options)
    case 'ENOTDIR':
      return new AppError('not_a_folder', message, options)
    case 'EACCES':
    case 'EPERM':
      return new AppError('no_permission', message, options)
    case 'EINVAL':
    case 'ENAMETOOLONG':
    case 'ERR_INVALID_ARG_VALUE':
    case 'ERR_INVALID_ARG_TYPE':
      return new AppError('invalid_path', message, options)
    default:
      return new AppError('open_failed', message, options)
  }
}
