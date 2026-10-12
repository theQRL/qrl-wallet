const MAX_UINT64 = (1n << 64n) - 1n
const ADDRESS_BYTES = 39
const TX_HASH_BYTES = 32
const PUBLIC_KEY_BYTES = 67

function bytes(value, label, expectedLength) {
  const source = value && value.type === 'Buffer' ? value.data : value
  if (!(source instanceof Uint8Array) && !Array.isArray(source)) {
    throw new Error(`${label} is not binary data`)
  }
  if (Array.isArray(source) && !source.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    throw new Error(`${label} contains invalid bytes`)
  }
  const result = Buffer.from(source)
  if (expectedLength !== undefined && result.length !== expectedLength) {
    throw new Error(`${label} has an invalid length`)
  }
  return result
}

function uint64(value, label) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} is not an unsigned integer`)
    }
  }
  const number = BigInt(value)
  if (number > MAX_UINT64) {
    throw new Error(`${label} exceeds uint64`)
  }
  const output = Buffer.alloc(8)
  let remaining = number
  for (let index = 7; index >= 0; index -= 1) {
    output[index] = Number(remaining & 255n)
    remaining >>= 8n
  }
  return { bytes: output, decimal: number.toString() }
}

function vector(qrllib, value) {
  const output = new qrllib.Uint8Vector()
  value.forEach((byte) => output.push_back(byte))
  return output
}

function vectorBytes(value) {
  const output = Buffer.alloc(value.size())
  for (let index = 0; index < output.length; index += 1) {
    output[index] = value.get(index)
  }
  return output
}

function hashBytes(qrllib, input) {
  const inputVector = vector(qrllib, input)
  try {
    const digest = qrllib.sha2_256(inputVector)
    try {
      return vectorBytes(digest)
    } finally {
      digest.delete()
    }
  } finally {
    inputVector.delete()
  }
}

function verifySignature(qrllib, hash, signature, publicKey) {
  const hashVector = vector(qrllib, hash)
  const signatureVector = vector(qrllib, signature)
  const keyVector = vector(qrllib, publicKey)
  try {
    return qrllib.Xmss.verify(hashVector, signatureVector, keyVector)
  } finally {
    hashVector.delete()
    signatureVector.delete()
    keyVector.delete()
  }
}

function shorToQuanta(amount) {
  const whole = BigInt(amount) / 1000000000n
  const fraction = (BigInt(amount) % 1000000000n).toString().padStart(9, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function spendTransaction(item) {
  const tx = item && item.tx
  const spend = tx && tx.multi_sig_spend
  if (!spend || !Array.isArray(spend.addrs_to) || !Array.isArray(spend.amounts)
      || spend.addrs_to.length === 0 || spend.addrs_to.length !== spend.amounts.length
      || spend.addrs_to.length > 100) {
    throw new Error('Invalid multisig spend outputs')
  }
  return { tx, spend }
}

function masterAddress(tx) {
  const master = bytes(tx.master_addr, 'master address')
  if (master.length !== 0 && master.length !== ADDRESS_BYTES) {
    throw new Error('Invalid master address')
  }
  return master
}

function validateSignatureLength(signature) {
  if (signature.length < 4 || signature.length > 8467) {
    throw new Error('Invalid XMSS signature length')
  }
}

function spendOutputs(spend) {
  return spend.addrs_to.map((rawAddress, index) => {
    const recipient = bytes(rawAddress, 'recipient address', ADDRESS_BYTES)
    const amount = uint64(spend.amounts[index], 'amount')
    if (amount.decimal === '0') {
      throw new Error('Zero-value multisig output')
    }
    return Object.freeze({ address: `Q${recipient.toString('hex')}`, amount: amount.decimal, rawAmount: amount.bytes })
  })
}

function verifiedHash(qrllib, { master, fee, address, expiry, outputs, signature, publicKey, claimedHash }) {
  const preimage = Buffer.concat([
    master, fee.bytes, address, expiry.bytes,
    ...outputs.flatMap((output) => [Buffer.from(output.address.slice(1), 'hex'), output.rawAmount]),
  ])
  const dataHash = hashBytes(qrllib, preimage)
  const actualHash = hashBytes(qrllib, Buffer.concat([dataHash, signature, publicKey]))
  if (!actualHash.equals(claimedHash) || !verifySignature(qrllib, dataHash, signature, publicKey)) {
    throw new Error('Multisig proposal failed cryptographic verification')
  }
  return actualHash
}

function proposalSigner(qrllib, publicKey) {
  const proposerHex = qrllib.getAddress(publicKey.toString('hex'))
  if (typeof proposerHex !== 'string' || !/^[0-9a-fA-F]{78}$/.test(proposerHex)) {
    throw new Error('Could not derive proposal signer')
  }
  return `Q${proposerHex.toLowerCase()}`
}

export default function verifyMultiSigSpendProposal(item, qrllib) {
  if (!qrllib || !qrllib.Xmss || typeof qrllib.Xmss.verify !== 'function') {
    throw new Error('XMSS verification is unavailable')
  }
  const { tx, spend } = spendTransaction(item)
  const master = masterAddress(tx)
  const fee = uint64(tx.fee, 'fee')
  const address = bytes(spend.multi_sig_address, 'multisig address', ADDRESS_BYTES)
  const expiry = uint64(spend.expiry_block_number, 'expiry block')
  const publicKey = bytes(tx.public_key, 'public key', PUBLIC_KEY_BYTES)
  const signature = bytes(tx.signature, 'signature')
  const claimedHash = bytes(tx.transaction_hash, 'transaction hash', TX_HASH_BYTES)
  validateSignatureLength(signature)
  const outputs = spendOutputs(spend)
  const actualHash = verifiedHash(qrllib, {
    master, fee, address, expiry, outputs, signature, publicKey, claimedHash,
  })

  return Object.freeze({
    txhash: actualHash.toString('hex'),
    address: `Q${address.toString('hex')}`,
    proposedBy: proposalSigner(qrllib, publicKey),
    outputs: Object.freeze(outputs.map((output) => Object.freeze({
      address: output.address,
      amount: output.amount,
      amountQuanta: shorToQuanta(output.amount),
    }))),
  })
}
