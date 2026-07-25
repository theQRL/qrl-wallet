/* global QRLLIB */

self.window = self
self.document = { createElement: () => ({}) }

importScripts('/workers/qrllib.js')

const HASH_FUNCTION_MAP = {
  SHAKE_128: 'SHAKE_128',
  SHAKE_256: 'SHAKE_256',
  SHA2_256: 'SHA2_256',
}

function toUint8Vector(arr) {
  const vec = new QRLLIB.Uint8Vector()
  for (let i = 0; i < arr.length; i += 1) {
    vec.push_back(arr[i])
  }
  return vec
}

function resolveHashFunction(hashFunctionName) {
  switch (hashFunctionName) {
    case HASH_FUNCTION_MAP.SHAKE_128:
      return QRLLIB.eHashFunction.SHAKE_128
    case HASH_FUNCTION_MAP.SHAKE_256:
      return QRLLIB.eHashFunction.SHAKE_256
    case HASH_FUNCTION_MAP.SHA2_256:
      return QRLLIB.eHashFunction.SHA2_256
    default:
      throw new Error(`Unsupported hash function: ${hashFunctionName}`)
  }
}

function waitForQrllib(maxWaitMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const checkReady = () => {
      if (typeof QRLLIB !== 'undefined' && typeof QRLLIB.Xmss !== 'undefined') {
        resolve()
        return
      }
      if (Date.now() - startedAt > maxWaitMs) {
        reject(new Error(`QRLLIB failed to initialize in ${maxWaitMs}ms`))
        return
      }
      setTimeout(checkReady, 100)
    }
    checkReady()
  })
}

self.onmessage = async function onMessage(event) {
  const {
    randomSeed,
    xmssHeight,
    hashFunction,
    timeoutMs = 30000,
  } = event.data || {}

  try {
    await waitForQrllib(timeoutMs)

    const hashFn = resolveHashFunction(hashFunction)
    const seedVector = toUint8Vector(new Uint8Array(randomSeed))
    const xmss = await new QRLLIB.Xmss.fromParameters(seedVector, xmssHeight, hashFn)

    self.postMessage({
      address: xmss.getAddress(),
      pk: xmss.getPK(),
      hexseed: xmss.getHexSeed(),
      mnemonic: xmss.getMnemonic(),
      height: xmssHeight,
      hashFunction,
    })
  } catch (error) {
    self.postMessage({
      error: error && error.message ? error.message : 'Wallet generation failed',
    })
  }
}
