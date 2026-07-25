import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import randomBytes from 'randombytes'
import './create.html'

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd',
  'qwerty', 'qwerty123', 'qwertyuiop',
  'letmein', 'welcome', 'welcome123',
  'admin', 'admin123', 'administrator',
  'superman', 'batman', 'dragon', 'monkey',
  '12345678', '123456789', '1234567890',
  '87654321', '11111111', '00000000',
  'abcd1234', 'abc123', 'pass1234',
  'internet', 'computer', 'changeme',
])

const KEYBOARD_PATTERNS = [
  'qwerty', 'qwertz', 'azerty', 'asdfgh', 'zxcvbn',
  'qazwsx', '1qaz2wsx', '123456', '654321', '987654',
]

const ESTIMATED_TIMES = {
  8: 'Estimated time: ~1 second',
  10: 'Estimated time: ~2-3 seconds',
  12: 'Estimated time: ~10-15 seconds',
  14: 'Estimated time: ~1-2 minutes',
  16: 'Estimated time: ~5-10 minutes',
  18: 'Estimated time: ~20-30 minutes',
}

let generationWorker = null
let elapsedTimer = null
let elapsedSeconds = 0

function showElement(id) {
  document.getElementById(id)?.classList.remove('hidden')
}

function hideElement(id) {
  document.getElementById(id)?.classList.add('hidden')
}

function hasKeyboardPattern(password) {
  const lowercase = password.toLowerCase()
  return KEYBOARD_PATTERNS.some((pattern) => lowercase.includes(pattern))
}

function hasRepeatingPattern(password) {
  if (/^(.)\1+$/.test(password)) return true
  const length = password.length
  for (let segmentLength = 2; segmentLength <= Math.floor(length / 2); segmentLength += 1) {
    const segment = password.slice(0, segmentLength)
    const repeated = segment.repeat(Math.ceil(length / segmentLength)).slice(0, length)
    if (repeated === password) {
      return true
    }
  }
  return false
}

function estimatePasswordStrength(password) {
  if (!password) return { score: 0, feedback: 'Password is required' }
  if (password.length < 8) return { score: 0, feedback: 'Password must be at least 8 characters' }

  const lowercase = password.toLowerCase()
  const baseWord = lowercase.replace(/[0-9!@#$%^&*()]+$/g, '')
  if (COMMON_PASSWORDS.has(lowercase) || COMMON_PASSWORDS.has(baseWord)) {
    return { score: 1, feedback: 'This is a commonly used password' }
  }
  if (hasKeyboardPattern(password)) {
    return { score: 1, feedback: 'Avoid keyboard patterns' }
  }
  if (hasRepeatingPattern(password)) {
    return { score: 1, feedback: 'Avoid repeating patterns' }
  }

  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const hasNumberOrSymbol = hasNumber || hasSymbol

  const missing = []
  if (!hasLower) missing.push('lowercase')
  if (!hasUpper) missing.push('uppercase')
  if (!hasNumberOrSymbol) missing.push('numbers or symbols')

  if (missing.length >= 2) {
    return { score: 1, feedback: `Add ${missing.join(', ')}` }
  }
  if (missing.length === 1) {
    return { score: 2, feedback: `Add ${missing.join(', ')}` }
  }
  if (password.length < 12) {
    return { score: 2, feedback: 'Consider a longer password' }
  }
  return { score: 3, feedback: 'Strong password' }
}

function getStrengthClass(position, score) {
  if (score === 0) return 'bg-base-300'
  if (score === 1) return position <= 1 ? 'bg-error' : 'bg-base-300'
  if (score === 2) return position <= 2 ? 'bg-warning' : 'bg-base-300'
  return 'bg-success'
}

function getStrengthTextClass(score) {
  if (score === 0) return 'text-base-content/70'
  if (score === 1) return 'text-error'
  if (score === 2) return 'text-warning'
  return 'text-success'
}

function updatePasswordStrengthUi(password) {
  const strength = estimatePasswordStrength(password)
  const container = document.getElementById('passwordStrength')
  const text = document.getElementById('passwordStrengthText')
  const bar1 = document.getElementById('passwordStrengthBar1')
  const bar2 = document.getElementById('passwordStrengthBar2')
  const bar3 = document.getElementById('passwordStrengthBar3')

  if (!container || !text || !bar1 || !bar2 || !bar3) {
    return strength
  }

  if (!password.length) {
    container.classList.add('hidden')
    return strength
  }

  container.classList.remove('hidden')
  bar1.className = `h-1 flex-1 rounded ${getStrengthClass(1, strength.score)}`
  bar2.className = `h-1 flex-1 rounded ${getStrengthClass(2, strength.score)}`
  bar3.className = `h-1 flex-1 rounded ${getStrengthClass(3, strength.score)}`
  text.className = `text-xs mt-1 font-medium ${getStrengthTextClass(strength.score)}`
  text.textContent = strength.feedback
  return strength
}

function setGenerationEstimate(xmssHeight) {
  const estimateElement = document.getElementById('estimateTime')
  if (!estimateElement) return
  estimateElement.textContent = ESTIMATED_TIMES[xmssHeight] || 'Estimated time: calculating...'
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  if (minutes > 0) {
    return `${minutes}m ${remainderSeconds.toString().padStart(2, '0')}s`
  }
  return `${remainderSeconds}s`
}

function startElapsedTimer() {
  elapsedSeconds = 0
  const elapsedElement = document.getElementById('elapsedTime')
  if (elapsedElement) {
    elapsedElement.textContent = 'Elapsed: 0s'
  }
  elapsedTimer = setInterval(() => {
    elapsedSeconds += 1
    if (elapsedElement) {
      elapsedElement.textContent = `Elapsed: ${formatElapsed(elapsedSeconds)}`
    }
  }, 1000)
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
}

function resolveHashFunction(hashFunctionSelection) {
  switch (hashFunctionSelection) {
    case 'SHAKE_128':
      return QRLLIB.eHashFunction.SHAKE_128
    case 'SHAKE_256':
      return QRLLIB.eHashFunction.SHAKE_256
    case 'SHA2_256':
      return QRLLIB.eHashFunction.SHA2_256
    default:
      throw new Error(`Unsupported hash function ${hashFunctionSelection}`)
  }
}

async function generateWithWorker(randomSeed, xmssHeight, hashFunctionSelection) {
  if (!window.Worker) {
    throw new Error('Web Workers are not supported in this browser')
  }

  return new Promise((resolve, reject) => {
    generationWorker = new Worker('/workers/wallet-worker.js')

    generationWorker.onmessage = (event) => {
      const data = event.data || {}
      generationWorker?.terminate()
      generationWorker = null
      if (data.error) {
        reject(new Error(data.error))
        return
      }
      resolve(data)
    }

    generationWorker.onerror = (error) => {
      generationWorker?.terminate()
      generationWorker = null
      reject(new Error(error.message || 'Wallet generation failed in worker'))
    }

    generationWorker.postMessage({
      randomSeed: Array.from(randomSeed),
      xmssHeight,
      hashFunction: hashFunctionSelection,
      timeoutMs: 30000,
    })
  })
}

function generateOnMainThread(randomSeed, xmssHeight, hashFunctionSelection) {
  const hashFunction = resolveHashFunction(hashFunctionSelection)
  const seedVector = toUint8Vector(randomSeed)
  // eslint-disable-next-line new-cap
  const xmss = new QRLLIB.Xmss.fromParameters(seedVector, xmssHeight, hashFunction)
  return {
    address: xmss.getAddress(),
    pk: xmss.getPK(),
    hexseed: xmss.getHexSeed(),
    mnemonic: xmss.getMnemonic(),
  }
}

function getWalletGenerationInput() {
  const xmssHeight = parseInt(document.getElementById('xmssHeight')?.value || '10', 10)
  const passphrase = document.getElementById('passphrase')?.value || ''
  const passphraseConfirm = document.getElementById('passphraseConfirm')?.value || ''
  const hashFunctionSelection = document.getElementById('hashFunction')?.value || 'SHAKE_128'
  return {
    xmssHeight,
    passphrase,
    passphraseConfirm,
    hashFunctionSelection,
  }
}

function setGeneratingUi(isGenerating, xmssHeight = 10) {
  const generateButton = document.getElementById('generate')
  if (isGenerating) {
    hideElement('passError')
    hideElement('passMismatchError')
    hideElement('error')
    showElement('generating')
    hideElement('generate')
    if (generateButton) {
      generateButton.disabled = true
    }
    setGenerationEstimate(xmssHeight)
    startElapsedTimer()
    return
  }
  stopElapsedTimer()
  hideElement('generating')
  showElement('generate')
  if (generateButton) {
    generateButton.disabled = false
  }
}

function showPassphraseError(passphrase, passphraseConfirm) {
  if (passphrase !== passphraseConfirm) {
    showElement('passMismatchError')
    return
  }

  const strength = updatePasswordStrengthUi(passphrase)
  if (strength.score < 1 || !passwordPolicyValid(passphrase)) {
    showElement('passError')
  }
}

function cacheGeneratedWallet(result, xmssHeight) {
  const pkRaw = QRLLIB.hstr2bin(result.pk)
  const addressB32 = pkRawToB32Address(pkRaw)
  const hashFunction = QRLLIB.getHashFunction(result.address)
  const signatureType = QRLLIB.getSignatureType(result.address)
  const generatedWalletDetails = {
    address: result.address,
    addressB32,
    pk: result.pk,
    hexseed: result.hexseed,
    mnemonic: result.mnemonic,
    height: xmssHeight,
    hashFunction,
    signatureType,
    index: 0,
    walletType: 'seed',
  }
  Session.set('generatedWalletDetails', generatedWalletDetails)
}

async function generateWallet() {
  const {
    xmssHeight,
    passphrase,
    passphraseConfirm,
    hashFunctionSelection,
  } = getWalletGenerationInput()

  hideElement('passError')
  hideElement('passMismatchError')
  hideElement('error')

  const strength = updatePasswordStrengthUi(passphrase)
  if (passphrase !== passphraseConfirm || strength.score < 1 || !passwordPolicyValid(passphrase)) {
    showPassphraseError(passphrase, passphraseConfirm)
    return
  }

  setGeneratingUi(true, xmssHeight)

  try {
    const randomSeed = randomBytes(48)
    let generatedWallet
    try {
      generatedWallet = await generateWithWorker(randomSeed, xmssHeight, hashFunctionSelection)
    } catch (workerError) {
      console.warn('Worker generation failed, falling back to main thread:', workerError)
      generatedWallet = generateOnMainThread(randomSeed, xmssHeight, hashFunctionSelection)
    }

    if (!generatedWallet || !generatedWallet.address) {
      throw new Error('Failed to generate wallet')
    }

    resetWalletStatus()
    Session.set('passphrase', passphrase)
    Session.set('xmssHeight', xmssHeight)
    // eslint-disable-next-line no-global-assign
    XMSS_OBJECT = null
    cacheGeneratedWallet(generatedWallet, xmssHeight)

    const params = { address: generatedWallet.address }
    const path = FlowRouter.path('/create/:address', params)
    FlowRouter.go(path)
  } catch (error) {
    console.error('Wallet generation failed:', error)
    showElement('error')
    setGeneratingUi(false)
  }
}

Template.appCreate.onRendered(() => {
  updatePasswordStrengthUi(document.getElementById('passphrase')?.value || '')
})

Template.appCreate.onDestroyed(() => {
  stopElapsedTimer()
  if (generationWorker) {
    generationWorker.terminate()
    generationWorker = null
  }
})

Template.appCreate.events({
  'click #generate': () => {
    setTimeout(() => { generateWallet() }, 100)
  },
  'input #passphrase': (event) => {
    updatePasswordStrengthUi(event.currentTarget.value)
  },
})
