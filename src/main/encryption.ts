import { safeStorage } from 'electron'

/**
 * Data encrypted by Electron's safeStorage can only be read by the same Windows account on the same
 * computer. This error means exactly that: the key is not available here.
 */
export class DataDecryptError extends Error {
  constructor(message = 'Stored data cannot be decrypted on this computer') {
    super(message)
    this.name = 'DataDecryptError'
  }
}

/** The format of 2.5.8 and earlier: the whole data file in one encrypted payload. */
export interface LegacyEnvelope {
  version: 1
  encrypted: boolean
  payload: string
}

export function isLegacyEnvelope(value: unknown): value is LegacyEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'payload' in value &&
    'encrypted' in value &&
    typeof (value as { payload: unknown }).payload === 'string'
  )
}

/** Returns base64 ciphertext, or null when this computer has no encryption available. */
export function encryptString(value: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return null
  }

  return safeStorage.encryptString(value).toString('base64')
}

export function decryptString(ciphertext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new DataDecryptError('Encryption is not available on this computer')
  }

  try {
    return safeStorage.decryptString(Buffer.from(ciphertext, 'base64'))
  } catch {
    throw new DataDecryptError()
  }
}
