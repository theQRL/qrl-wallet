function hasKeys(value, keys) {
  if (!value || typeof value !== 'object') return false
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function looksLikeWalletEntry(entry) {
  return (
    entry
    && typeof entry === 'object'
    && typeof entry.address === 'string'
    && typeof entry.mnemonic === 'string'
    && typeof entry.hexseed === 'string'
    && typeof entry.encrypted === 'boolean'
  )
}

function looksLikePythonNodeWallet(wallet) {
  return (
    wallet
    && typeof wallet === 'object'
    && !Array.isArray(wallet)
    && Array.isArray(wallet.addresses)
    && typeof wallet.encrypted === 'boolean'
  )
}

export function isV3Envelope(wallet) {
  if (!wallet || typeof wallet !== 'object' || Array.isArray(wallet)) return false
  if (wallet.version !== 3) return false
  if (typeof wallet.encrypted !== 'boolean') return false
  return Object.prototype.hasOwnProperty.call(wallet, 'data')
}

export function isLegacyV3Array(wallet) {
  return (
    Array.isArray(wallet)
    && wallet.length > 0
    && wallet[0]
    && wallet[0].version === 3
    && typeof wallet[0].mnemonic === 'string'
    && typeof wallet[0].hexseed === 'string'
    && typeof wallet[0].address === 'string'
    && typeof wallet[0].pk === 'string'
    && wallet[0].data === undefined
  )
}

export function getWalletFileType(wallet) {
  if (!wallet) return 'UNKNOWN'

  if (isV3Envelope(wallet)) return 'V3-ENVELOPE'

  if (looksLikePythonNodeWallet(wallet)) {
    return 'PYTHON-NODE'
  }

  if (typeof wallet === 'object' && !Array.isArray(wallet) && looksLikeWalletEntry(wallet)) {
    return hasKeys(wallet, ['addressB32']) ? 'WEB-WALLET' : 'CONVERTED-WEB-WALLET'
  }

  if (Array.isArray(wallet) && wallet.length > 0) {
    const entry = wallet[0] || {}
    if (isLegacyV3Array(wallet)) return 'LEGACY-V3-ARRAY'
    if (looksLikeWalletEntry(entry)) {
      return hasKeys(entry, ['addressB32']) ? 'WEB-WALLET' : 'CONVERTED-WEB-WALLET'
    }
  }

  return 'UNKNOWN'
}

export function getWalletTypeLabel(type) {
  const labels = {
    'PYTHON-NODE': 'Python/Node (v1)',
    'WEB-WALLET': 'Web Wallet (v2)',
    'CONVERTED-WEB-WALLET': 'Converted Web Wallet',
    'LEGACY-V3-ARRAY': 'Legacy v3 (Array)',
    'V3-ENVELOPE': 'v3 Envelope',
    UNKNOWN: 'Unknown',
  }
  return labels[type] || type
}

export function pythonNodeToWebWallet(wallet) {
  return (wallet.addresses || []).map((entry) => ({
    ...entry,
    encrypted: wallet.encrypted,
  }))
}

export function isWalletEncrypted(wallet) {
  const type = getWalletFileType(wallet)
  switch (type) {
    case 'V3-ENVELOPE':
      return wallet.encrypted === true
    case 'PYTHON-NODE':
      return wallet.encrypted === true
    case 'WEB-WALLET':
    case 'CONVERTED-WEB-WALLET':
    case 'LEGACY-V3-ARRAY':
      return wallet[0] && wallet[0].encrypted === true
    default:
      return false
  }
}

export function isFormatDeprecated(type) {
  return type !== 'V3-ENVELOPE' && type !== 'UNKNOWN'
}

export function getWalletAddresses(walletData) {
  if (Array.isArray(walletData)) {
    return walletData.map((w) => ({
      address: w.address,
      height: w.height,
      hashFunction: w.hashFunction,
    }))
  }

  if (walletData && walletData.address) {
    return [{
      address: walletData.address,
      height: walletData.height,
      hashFunction: walletData.hashFunction,
    }]
  }

  return []
}

export function getPrimaryWalletRecord(walletData) {
  if (Array.isArray(walletData)) return walletData[0] || null
  if (walletData && typeof walletData === 'object') return walletData
  return null
}
