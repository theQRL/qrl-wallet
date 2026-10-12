const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

const qrllib = require('qrllib/build/offline-libjsqrl')

function vector(bytes) {
  const result = new qrllib.Uint8Vector()
  for (const byte of bytes) result.push_back(byte)
  return result
}

function buffer(value) {
  return Buffer.from(Array.from({ length: value.size() }, (_, index) => value.get(index)))
}

async function waitForQrllib() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (typeof qrllib.Xmss?.fromParameters === 'function') return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('qrllib did not initialize')
}

test('qrllib preserves wallet seed, address, and signature bytes', async () => {
  await waitForQrllib()
  const xmss = qrllib.Xmss.fromParameters(
    vector(Buffer.alloc(48)), 4, qrllib.eHashFunction.SHA2_256,
  )
  const address = 'Q00020096e5c065cf961565169e795803c1e60f521af7a3ea0326b42aa40c0e75390e5d8f4336de'
  const publicKey = '000200eb0372d56b886645e7c036b480be95ed97bc431b4e828befd4162bf432858df83191da3442686282b3d5160f25cf162a517fd2131f83fbf2698a58f9c46afc5d'

  assert.equal(xmss.getAddress(), address)
  assert.equal(xmss.getPK(), publicKey)
  assert.equal(qrllib.Xmss.fromHexSeed(xmss.getHexSeed()).getAddress(), address)
  assert.equal(qrllib.Xmss.fromMnemonic(xmss.getMnemonic()).getPK(), publicKey)

  const message = Buffer.alloc(32, 0x42)
  xmss.setIndex(0)
  const signature = buffer(xmss.sign(vector(message)))
  assert.equal(signature.length, 2308)
  assert.equal(
    crypto.createHash('sha256').update(signature).digest('hex'),
    '24fcefeb3d0a18559e403ea96c6c0a1f7abffb4f551264cf2307ad59ecfc5327',
  )
  assert.equal(qrllib.Xmss.verify(vector(message), vector(signature), vector(Buffer.from(publicKey, 'hex'))), true)
})

test('browser wallet worker derives the same keys for every supported hash', async () => {
  await waitForQrllib()
  const workerSource = fs.readFileSync('public/workers/wallet-worker.js', 'utf8')
  const webJs = fs.readFileSync('public/workers/web-libjsqrl.js', 'utf8')
  const webWasm = fs.readFileSync('public/workers/web-libjsqrl.wasm')
  const fetched = []
  const worker = {
    console,
    URL,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    WebAssembly,
    setTimeout,
    clearTimeout,
    Response,
    crypto: crypto.webcrypto,
    WorkerGlobalScope: function WorkerGlobalScope() {},
    location: { href: 'https://wallet.example/workers/wallet-worker.js' },
  }
  worker.self = worker
  worker.window = worker
  worker.fetch = async (url) => {
    fetched.push(String(url))
    if (url !== '/workers/web-libjsqrl.wasm') return new Response('missing', { status: 404 })
    return new Response(webWasm, { headers: { 'content-type': 'application/wasm' } })
  }
  const context = vm.createContext(worker)
  worker.importScripts = (url) => {
    assert.equal(url, '/workers/web-libjsqrl.js')
    vm.runInContext(webJs, context, { filename: 'web-libjsqrl.js' })
  }
  vm.runInContext(workerSource, context, { filename: 'wallet-worker.js' })

  const seed = Array.from({ length: 48 }, (_, index) => index)
  for (const hashFunction of ['SHAKE_128', 'SHAKE_256', 'SHA2_256']) {
    const actual = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('wallet worker did not respond')), 5000)
      worker.postMessage = (message) => {
        clearTimeout(timer)
        resolve(message)
      }
      worker.onmessage({ data: { randomSeed: seed, xmssHeight: 4, hashFunction, timeoutMs: 5000 } })
    })
    assert.equal(actual.error, undefined)
    const expected = qrllib.Xmss.fromParameters(vector(seed), 4, qrllib.eHashFunction[hashFunction])
    assert.equal(actual.address, expected.getAddress())
    assert.equal(actual.pk, expected.getPK())
    assert.equal(actual.hexseed, expected.getHexSeed())
    assert.equal(actual.mnemonic, expected.getMnemonic())
  }
  assert.deepEqual(fetched, ['/workers/web-libjsqrl.wasm'])
})
