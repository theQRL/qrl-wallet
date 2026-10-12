const assert = require('node:assert/strict')
const test = require('node:test')
const jiti = require('jiti')(`${process.cwd()}/package.json`)

const verifyMultiSigSpendProposal = jiti('./imports/ui/lib/multisig-proposal.js').default
const checkWeightsAndThreshold = jiti('./imports/ui/lib/multisig-validation.js').default
const qrllib = require('qrllib/build/offline-libjsqrl')

function vector(bytes) {
  const result = new qrllib.Uint8Vector()
  for (const byte of bytes) result.push_back(byte)
  return result
}

function fromVector(value) {
  return Buffer.from(Array.from({ length: value.size() }, (_, index) => value.get(index)))
}

function uint64(value) {
  const result = Buffer.alloc(8)
  result.writeBigUInt64BE(BigInt(value))
  return result
}

async function waitForQrllib() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (typeof qrllib.Xmss?.verify === 'function') return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('qrllib did not initialize')
}

test('verified multisig proposal binds its displayed outputs to its signed hash', async () => {
  await waitForQrllib()
  const seed = vector(Buffer.alloc(48))
  const signer = qrllib.Xmss.fromParameters(seed, 4, qrllib.eHashFunction.SHA2_256)
  const publicKey = Buffer.from(signer.getPK(), 'hex')
  const address = Buffer.from(qrllib.getAddress(publicKey.toString('hex')), 'hex')
  const otherAddress = Buffer.from(address)
  otherAddress[20] ^= 1
  const fee = '1000000'
  const expiry = '1000'
  const amount = '9007199254740993'
  const dataHash = fromVector(qrllib.sha2_256(vector(Buffer.concat([
    address, uint64(fee), address, uint64(expiry), address, uint64(amount),
  ]))))
  const signature = fromVector(signer.sign(vector(dataHash)))
  const hash = fromVector(qrllib.sha2_256(vector(Buffer.concat([dataHash, signature, publicKey]))))
  const item = {
    addr_from: otherAddress,
    tx: {
      master_addr: address,
      fee,
      public_key: publicKey,
      signature,
      transaction_hash: hash,
      multi_sig_spend: {
        multi_sig_address: address,
        expiry_block_number: expiry,
        addrs_to: [address],
        amounts: [amount],
      },
    },
  }

  const verified = verifyMultiSigSpendProposal(item, qrllib)
  assert.equal(verified.txhash, hash.toString('hex'))
  assert.equal(verified.proposedBy, `Q${address.toString('hex')}`)
  assert.equal(verified.outputs[0].amountQuanta, '9007199.254740993')
  assert.ok(Object.isFrozen(verified))
  assert.ok(Object.isFrozen(verified.outputs))
  assert.equal(verifyMultiSigSpendProposal(JSON.parse(JSON.stringify(item)), qrllib).txhash, verified.txhash)

  const substituted = {
    ...item,
    tx: {
      ...item.tx,
      multi_sig_spend: { ...item.tx.multi_sig_spend, addrs_to: [otherAddress] },
    },
  }
  assert.throws(() => verifyMultiSigSpendProposal(substituted, qrllib), /verification/)
  const invalidSignature = Buffer.from(signature)
  invalidSignature[invalidSignature.length - 1] ^= 1
  const invalidSignatureHash = fromVector(qrllib.sha2_256(vector(Buffer.concat([
    dataHash, invalidSignature, publicKey,
  ]))))
  assert.throws(() => verifyMultiSigSpendProposal({
    ...item,
    tx: { ...item.tx, signature: invalidSignature, transaction_hash: invalidSignatureHash },
  }, qrllib), /verification/)

  assert.throws(() => verifyMultiSigSpendProposal({
    ...item,
    tx: { ...item.tx, master_addr: Buffer.alloc(1) },
  }, qrllib), /Invalid master address/)
  assert.throws(() => verifyMultiSigSpendProposal({
    ...item,
    tx: { ...item.tx, signature: Buffer.alloc(3) },
  }, qrllib), /Invalid XMSS signature length/)
  assert.throws(() => verifyMultiSigSpendProposal({
    ...item,
    tx: { ...item.tx, multi_sig_spend: { ...item.tx.multi_sig_spend, addrs_to: [] } },
  }, qrllib), /Invalid multisig spend outputs/)
  assert.throws(() => verifyMultiSigSpendProposal({
    ...item,
    tx: { ...item.tx, multi_sig_spend: { ...item.tx.multi_sig_spend, amounts: ['0'] } },
  }, qrllib), /Zero-value multisig output/)
})

test('multisig creation rejects nonpositive and malformed thresholds or weights', () => {
  for (const threshold of [0, -1, NaN, 1.5]) {
    assert.equal(checkWeightsAndThreshold([1], threshold).result, false)
  }
  for (const weight of [0, -1, NaN, 1.5]) {
    assert.equal(checkWeightsAndThreshold([weight], 1).result, false)
  }
  assert.equal(checkWeightsAndThreshold([1, 2], 2).result, true)
  assert.equal(checkWeightsAndThreshold([1, 2], 4).result, false)
})
