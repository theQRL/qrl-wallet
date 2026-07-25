import aes256 from 'aes256'

import {
  getWalletFileType,
  pythonNodeToWebWallet,
  getPrimaryWalletRecord,
  isFormatDeprecated,
} from './wallet-format'

const { scrypt } = require('./vendor/scrypt-js')

const DEFAULT_SCRYPT_PARAMS = {
  N: 1 << 17,
  r: 8,
  p: 1,
  dkLen: 32,
  saltLen: 32,
}

const LEGACY_SCRYPT_PARAMS = {
  N: 1024,
  r: 8,
  p: 1,
  dkLen: 32,
}

const DEFAULT_IV_LEN = 12
const TAG_LEN = 16

function encodeUtf8(text) {
  return new TextEncoder().encode(text)
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes)
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hex string')
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return out
}

function bytesToHex(bytes) {
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    const value = bytes[i].toString(16)
    hex += value.length === 1 ? `0${value}` : value
  }
  return hex
}

function buildAad(meta) {
  return encodeUtf8(JSON.stringify({
    version: meta.version,
    kdf: meta.kdf,
    cipher: {
      name: meta.cipher.name,
      iv: meta.cipher.iv,
    },
  }))
}

async function encryptAead(plainBytes, keyBytes, iv, aad) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
  const algorithm = { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 }
  if (aad) {
    algorithm.additionalData = aad
  }
  const cipherBuffer = await crypto.subtle.encrypt(algorithm, key, plainBytes)
  const cipherBytes = new Uint8Array(cipherBuffer)
  return {
    encrypted: cipherBytes.slice(0, cipherBytes.length - TAG_LEN),
    authTag: cipherBytes.slice(cipherBytes.length - TAG_LEN),
  }
}

async function decryptAead(encryptedBytes, keyBytes, iv, authTag, aad) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
  const combined = new Uint8Array(encryptedBytes.length + authTag.length)
  combined.set(encryptedBytes)
  combined.set(authTag, encryptedBytes.length)
  const algorithm = { name: 'AES-GCM', iv, tagLength: TAG_LEN * 8 }
  if (aad) {
    algorithm.additionalData = aad
  }
  const plainBuffer = await crypto.subtle.decrypt(algorithm, key, combined)
  return new Uint8Array(plainBuffer)
}

async function deriveKeyScrypt(password, salt, params, progressCallback) {
  const passwordBytes = typeof password === 'string' ? encodeUtf8(password) : new Uint8Array(password)
  return scrypt(passwordBytes, salt, params.N, params.r, params.p, params.dkLen, progressCallback)
}

function isLegacyScryptField(fieldValue) {
  if (typeof fieldValue !== 'string') return false
  const parts = fieldValue.split(':')
  if (parts.length !== 4) return false
  return parts.every((part) => /^[0-9a-fA-F]+$/.test(part) && part.length % 2 === 0)
}

function isValidQAddress(value) {
  return typeof value === 'string' && /^Q[0-9a-fA-F]{78}$/.test(value)
}

function isValidHexseed(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{102}$/.test(value)
}

function isValidMnemonic(value) {
  return typeof value === 'string' && value.trim().split(/\s+/).length === 34
}

function isValidPk(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{134}$/.test(value)
}

function isValidAddressB32(value) {
  return typeof value === 'string' && /^q[0-9a-z]{10,120}$/.test(value)
}

function decryptLegacyAesField(ciphertext, passphrase) {
  if (typeof ciphertext !== 'string') return ciphertext
  return aes256.decrypt(passphrase, ciphertext)
}

async function decryptLegacyScryptField(ciphertext, passphrase) {
  const parts = ciphertext.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid legacy encrypted field format')
  }
  const iv = hexToBytes(parts[0])
  const authTag = hexToBytes(parts[1])
  const salt = hexToBytes(parts[2])
  const encrypted = hexToBytes(parts[3])
  const key = await deriveKeyScrypt(passphrase, salt, LEGACY_SCRYPT_PARAMS)
  const plainBytes = await decryptAead(encrypted, key, iv, authTag, null)
  return decodeUtf8(plainBytes)
}

async function decryptLegacyField(ciphertext, passphrase) {
  if (typeof ciphertext !== 'string') return ciphertext
  if (isLegacyScryptField(ciphertext)) {
    return decryptLegacyScryptField(ciphertext, passphrase)
  }
  return decryptLegacyAesField(ciphertext, passphrase)
}

async function decryptLegacyOptionalField(ciphertext, passphrase, validator) {
  if (typeof ciphertext !== 'string') return ciphertext
  const candidate = await decryptLegacyField(ciphertext, passphrase)
  if (validator(candidate)) {
    return candidate
  }
  return ciphertext
}

export function normalizeWalletRecord(walletRecord) {
  if (!walletRecord || typeof walletRecord !== 'object') {
    throw new Error('Invalid wallet record')
  }
  const normalized = {
    address: walletRecord.address,
    pk: walletRecord.pk,
    hexseed: walletRecord.hexseed,
    mnemonic: walletRecord.mnemonic,
    height: walletRecord.height,
    hashFunction: walletRecord.hashFunction,
    signatureType: walletRecord.signatureType,
    index: Number.isInteger(walletRecord.index) ? walletRecord.index : 0,
  }

  if (
    !isValidQAddress(normalized.address)
    || !isValidPk(normalized.pk)
    || !isValidHexseed(normalized.hexseed)
    || !isValidMnemonic(normalized.mnemonic)
  ) {
    throw new Error('Wallet content is invalid or passphrase is incorrect')
  }

  return normalized
}

export async function buildEncryptedEnvelope(walletData, password, progressCallback) {
  const params = { ...DEFAULT_SCRYPT_PARAMS }
  const salt = randomBytes(params.saltLen)
  const iv = randomBytes(DEFAULT_IV_LEN)
  const key = await deriveKeyScrypt(password, salt, params, progressCallback)

  const meta = {
    version: 3,
    kdf: {
      name: 'scrypt',
      params: {
        N: params.N,
        r: params.r,
        p: params.p,
        dkLen: params.dkLen,
        salt: bytesToHex(salt),
      },
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: bytesToHex(iv),
    },
  }

  const plainJson = JSON.stringify(walletData)
  const aad = buildAad(meta)
  const { encrypted, authTag } = await encryptAead(encodeUtf8(plainJson), key, iv, aad)
  meta.cipher.authTag = bytesToHex(authTag)

  return {
    version: 3,
    encrypted: true,
    kdf: meta.kdf,
    cipher: meta.cipher,
    data: bytesToHex(encrypted),
  }
}

export function buildUnencryptedEnvelope(walletData) {
  return {
    version: 3,
    encrypted: false,
    data: walletData,
  }
}

export async function decryptV3Envelope(envelope, password, progressCallback) {
  if (!envelope || envelope.version !== 3 || typeof envelope.encrypted !== 'boolean') {
    throw new Error('Invalid wallet envelope')
  }

  if (!envelope.encrypted) {
    return typeof envelope.data === 'string' ? JSON.parse(envelope.data) : envelope.data
  }

  if (!password) {
    throw new Error('Missing passphrase for encrypted wallet')
  }

  if (!envelope.kdf || !envelope.kdf.params || !envelope.cipher) {
    throw new Error('Invalid encrypted wallet envelope')
  }

  if (envelope.kdf.name !== 'scrypt') {
    throw new Error(`Unsupported KDF: ${envelope.kdf.name}`)
  }

  const params = { ...DEFAULT_SCRYPT_PARAMS, ...envelope.kdf.params }
  const salt = hexToBytes(params.salt)
  delete params.salt
  const key = await deriveKeyScrypt(password, salt, params, progressCallback)
  const iv = hexToBytes(envelope.cipher.iv)
  const authTag = hexToBytes(envelope.cipher.authTag)
  const aad = buildAad({
    version: envelope.version,
    kdf: envelope.kdf,
    cipher: { name: envelope.cipher.name, iv: envelope.cipher.iv },
  })

  const plainBytes = await decryptAead(hexToBytes(envelope.data), key, iv, authTag, aad)
  return JSON.parse(decodeUtf8(plainBytes))
}

export async function decryptLegacyWallet(walletEntries, passphrase, progressCallback) {
  if (!Array.isArray(walletEntries) || walletEntries.length === 0) {
    throw new Error('Invalid wallet file')
  }

  if (!passphrase) {
    throw new Error('Missing passphrase for encrypted wallet')
  }

  const decrypted = []

  for (let i = 0; i < walletEntries.length; i += 1) {
    const wallet = walletEntries[i]
    if (!wallet || typeof wallet !== 'object') {
      throw new Error('Invalid wallet entry')
    }

    if (wallet.encrypted !== true) {
      decrypted.push(wallet)
      continue
    }

    const mnemonic = await decryptLegacyField(wallet.mnemonic, passphrase)
    const hexseed = await decryptLegacyField(wallet.hexseed, passphrase)
    const address = await decryptLegacyField(wallet.address, passphrase)
    const pk = await decryptLegacyOptionalField(wallet.pk, passphrase, isValidPk)

    const addressB32 = wallet.addressB32 === undefined
      ? undefined
      : await decryptLegacyOptionalField(wallet.addressB32, passphrase, isValidAddressB32)

    if (!isValidMnemonic(mnemonic) || !isValidHexseed(hexseed) || !isValidQAddress(address)) {
      throw new Error('Wallet content is invalid or passphrase is incorrect')
    }

    decrypted.push({
      ...wallet,
      mnemonic,
      hexseed,
      address,
      pk,
      addressB32,
      encrypted: false,
    })

    if (progressCallback) {
      progressCallback((i + 1) / walletEntries.length)
    }
  }

  return decrypted
}

function normalizeLegacyWalletShape(walletInput, walletType) {
  if (walletType === 'PYTHON-NODE') {
    return pythonNodeToWebWallet(walletInput)
  }
  if (Array.isArray(walletInput)) {
    return walletInput
  }
  if (walletInput && typeof walletInput === 'object') {
    return [walletInput]
  }
  throw new Error('Unsupported wallet shape')
}

export async function loadWalletDataForUse(walletInput, passphrase, progressCallback) {
  const walletType = getWalletFileType(walletInput)
  if (walletType === 'UNKNOWN') {
    throw new Error('Unsupported wallet file format')
  }

  if (walletType === 'V3-ENVELOPE') {
    const walletData = await decryptV3Envelope(walletInput, passphrase, progressCallback)
    return {
      walletType,
      deprecated: false,
      encrypted: walletInput.encrypted === true,
      walletData,
    }
  }

  const normalizedWallet = normalizeLegacyWalletShape(walletInput, walletType)
  const encrypted = normalizedWallet[0] && normalizedWallet[0].encrypted === true
  const walletData = encrypted
    ? await decryptLegacyWallet(normalizedWallet, passphrase, progressCallback)
    : normalizedWallet

  return {
    walletType,
    deprecated: isFormatDeprecated(walletType),
    encrypted,
    walletData,
  }
}

export function getPrimaryWalletRecordOrThrow(walletData) {
  const primary = getPrimaryWalletRecord(walletData)
  return normalizeWalletRecord(primary)
}

export function downloadWalletFile(walletPayload, filename = 'wallet.json') {
  const walletJson = JSON.stringify(walletPayload, null, 2)
  const blob = new Blob([walletJson], { type: 'application/json' })
  const url = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}
