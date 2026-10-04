import { describe, expect, it } from 'vitest'

import { AppError, classifyOpenError } from '../app-error'

function errno(code: string, message = `${code}: something failed`): Error {
  return Object.assign(new Error(message), { code })
}

describe('AppError', () => {
  it('carries a code next to the technical message', () => {
    const error = new AppError('invalid_url', 'Invalid URL: nope')

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('invalid_url')
    expect(error.message).toBe('Invalid URL: nope')
    expect(error.name).toBe('AppError')
  })
})

describe('classifyOpenError', () => {
  it.each([
    ['ENOENT', 'folder', 'path_missing'],
    ['ENOENT', 'app', 'app_missing'],
    // A drive that is unplugged or a share that does not answer is "not there" for the user.
    ['ENXIO', 'folder', 'path_missing'],
    ['ENODEV', 'folder', 'path_missing'],
    ['ENETDOWN', 'folder', 'path_missing'],
    ['ENETUNREACH', 'folder', 'path_missing'],
    ['EHOSTUNREACH', 'folder', 'path_missing'],
    ['ETIMEDOUT', 'folder', 'path_missing'],
    ['ETIMEDOUT', 'app', 'app_missing'],
    ['ENOTDIR', 'folder', 'not_a_folder'],
    ['EACCES', 'folder', 'no_permission'],
    ['EPERM', 'app', 'no_permission'],
    ['EINVAL', 'folder', 'invalid_path'],
    ['ENAMETOOLONG', 'app', 'invalid_path'],
    ['ERR_INVALID_ARG_VALUE', 'folder', 'invalid_path'],
    ['EIO', 'folder', 'open_failed'],
    ['EBUSY', 'app', 'open_failed'],
  ] as const)('maps %s on a %s to %s', (code, kind, expected) => {
    expect(classifyOpenError(errno(code), kind).code).toBe(expected)
  })

  it('keeps the original message and cause for the log', () => {
    const original = errno(
      'ENOENT',
      "ENOENT: no such file or directory, access 'D:\\Old'"
    )

    const classified = classifyOpenError(original, 'folder')

    expect(classified.message).toBe(original.message)
    expect(classified.cause).toBe(original)
  })

  it('calls anything it does not know "could not open"', () => {
    expect(classifyOpenError(new Error('boom'), 'folder').code).toBe(
      'open_failed'
    )
    expect(classifyOpenError('plain text', 'app')).toMatchObject({
      code: 'open_failed',
      message: 'plain text',
    })
    expect(classifyOpenError(null, 'app').code).toBe('open_failed')
  })
})
