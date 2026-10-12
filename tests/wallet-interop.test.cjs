const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')

const jiti = require('jiti')(`${process.cwd()}/package.json`)

const { getPrimaryWalletRecord } = jiti('./imports/ui/lib/wallet-format.js')
const {
  buildEncryptedEnvelope,
  buildUnencryptedEnvelope,
  loadWalletDataForUse,
  WALLET_FILE_INVALID,
  WALLET_PASSPHRASE_INCORRECT,
} = jiti('./imports/ui/lib/wallet-crypto.js')

const passphrase = 'cross-wallet-test'
const address = `Q${'a'.repeat(78)}`
const slaveAddress = `Q${'b'.repeat(78)}`
const mnemonic = Array(34).fill('word').join(' ')

function record(qaddress, index = 0) {
  return {
    address: qaddress,
    pk: null,
    hexseed: '1'.repeat(102),
    mnemonic,
    height: 4,
    hashFunction: 0,
    signatureType: 0,
    index,
  }
}

function nodeWallet() {
  return {
    version: 1,
    encrypted: false,
    addresses: [{ ...record(address, 3), slaves: [[{ ...record(slaveAddress, 5), encrypted: false }]] }],
  }
}

function sealField(plain, qaddress, field, salt) {
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 1 << 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(`qrl-node-v2:${qaddress}:${field}`))
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `qrl-node-v2:${salt.toString('hex')}:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`
}

function legacyField(plain) {
  const iv = crypto.randomBytes(16)
  const key = crypto.createHash('sha256').update(passphrase).digest()
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv)
  return Buffer.concat([iv, cipher.update(plain, 'utf8'), cipher.final()]).toString('base64')
}

test('web wallet opens an unencrypted node wallet with slave metadata intact', async () => {
  const loaded = await loadWalletDataForUse(nodeWallet())
  assert.equal(getPrimaryWalletRecord(loaded.walletData).address, address)
  assert.equal(loaded.walletData.addresses[0].index, 3)
  assert.equal(loaded.walletData.addresses[0].slaves[0][0].index, 5)
})

test('web wallet opens a node v2 wallet and retains slave keys through v3 upgrade', async () => {
  const source = nodeWallet()
  const salt = crypto.randomBytes(32)
  const master = source.addresses[0]
  const slave = master.slaves[0][0]
  for (const entry of [master, slave]) {
    entry.hexseed = sealField(entry.hexseed, entry.address, 'hexseed', salt)
    entry.mnemonic = sealField(entry.mnemonic, entry.address, 'mnemonic', salt)
  }
  source.encrypted = true
  source.encryption_version = 2
  slave.encrypted = true

  const loaded = await loadWalletDataForUse(source, passphrase)
  assert.equal(loaded.walletData.addresses[0].slaves[0][0].mnemonic, mnemonic)
  const upgraded = await buildEncryptedEnvelope(loaded.walletData, passphrase)
  const reopened = await loadWalletDataForUse(upgraded, passphrase)
  assert.deepEqual(reopened.walletData, loaded.walletData)
  await assert.rejects(loadWalletDataForUse(source, 'wrong'),
    (error) => error.code === WALLET_PASSPHRASE_INCORRECT)
  const malformedSlave = JSON.parse(JSON.stringify(source))
  malformedSlave.addresses[0].slaves[0][0].mnemonic = 'qrl-node-v2:invalid'
  await assert.rejects(loadWalletDataForUse(malformedSlave, 'wrong'),
    (error) => error.code === WALLET_FILE_INVALID)
  source.addresses[0].hexseed = legacyField('1'.repeat(102))
  await assert.rejects(loadWalletDataForUse(source, passphrase),
    (error) => error.code === WALLET_FILE_INVALID)
})

test('web wallet reads legacy node AES-CTR fields', async () => {
  const source = nodeWallet()
  const master = source.addresses[0]
  master.hexseed = legacyField(master.hexseed)
  master.mnemonic = legacyField(master.mnemonic)
  source.encrypted = true
  const loaded = await loadWalletDataForUse(source, passphrase)
  assert.equal(loaded.walletData.addresses[0].hexseed, '1'.repeat(102))
})

test('encrypted node wallet reports malformed records as an invalid file', async () => {
  const malformedWallets = [
    () => {
      const wallet = nodeWallet()
      wallet.addresses[0].slaves[0][0] = null
      return wallet
    },
    () => {
      const wallet = nodeWallet()
      wallet.addresses[0].slaves[0][0].index = -1
      return wallet
    },
    () => {
      const wallet = nodeWallet()
      wallet.addresses[0].slaves = [null]
      return wallet
    },
    () => {
      const wallet = nodeWallet()
      wallet.addresses[0].hexseed = 'qrl-node-v2:invalid'
      return wallet
    },
  ]

  for (const makeWallet of malformedWallets) {
    const wallet = makeWallet()
    wallet.encrypted = true
    await assert.rejects(loadWalletDataForUse(wallet, passphrase),
      (error) => error.code === WALLET_FILE_INVALID)
  }
})

test('web wallet opens an unencrypted v3 envelope containing node records', async () => {
  const source = nodeWallet()
  const loaded = await loadWalletDataForUse(buildUnencryptedEnvelope(source))
  assert.deepEqual(loaded.walletData, source)
})
