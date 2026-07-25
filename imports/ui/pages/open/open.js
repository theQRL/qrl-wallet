import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import async from 'async'
import './open.html'

import { isElectrified, createTransport } from '../../../startup/client/functions'
import { getPrimaryWalletRecord, getWalletTypeLabel } from '../../lib/wallet-format'
import {
  buildEncryptedEnvelope,
  buildUnencryptedEnvelope,
  downloadWalletFile,
  getPrimaryWalletRecordOrThrow,
  loadWalletDataForUse,
  normalizeWalletRecord,
} from '../../lib/wallet-crypto'

const LEDGER_OPEN_TIMEOUT_MS = 10000
const LEDGER_LOCK_RESPONSE_CODES = [26628, 28160, 28161]
const LEDGER_USB_RESET_ERROR_PATTERNS = [
  'cannot open device with path',
  'cannot open device',
  'failed to open device',
  'resource busy',
  'ledger usb transport appears stale',
  '"needsusbreset":true',
]
let ledgerOpenAttemptId = 0
let ledgerOpenTimeoutHandle = null

Template.appAddressOpen.onCreated(() => {
  Session.set('modalEventTriggered', false)
})

// Helper functions for show/hide with hidden class
function showElement(id) {
  document.getElementById(id)?.classList.remove('hidden')
}
function hideElement(id) {
  document.getElementById(id)?.classList.add('hidden')
}

function clearLedgerDetails() {
  Session.set('ledgerDetailsAddress', '')
  Session.set('ledgerDetailsAppVersion', '')
  Session.set('ledgerDetailsLibraryVersion', '')
  Session.set('ledgerDetailsPkHex', '')
}

function clearLedgerOpenTimeout() {
  if (ledgerOpenTimeoutHandle !== null) {
    Meteor.clearTimeout(ledgerOpenTimeoutHandle)
    ledgerOpenTimeoutHandle = null
  }
}

function startLedgerOpenTimeout(openAttemptId) {
  clearLedgerOpenTimeout()
  ledgerOpenTimeoutHandle = Meteor.setTimeout(() => {
    if (openAttemptId !== ledgerOpenAttemptId) {
      return
    }
    ledgerOpenAttemptId += 1
    clearLedgerOpenTimeout()
    hideElement('readingLedger')
    showElement('ledgerReadTimeout')
  }, LEDGER_OPEN_TIMEOUT_MS)
}

function hideLedgerStatusMessages() {
  hideElement('ledgerReadError')
  hideElement('ledgerReadTimeout')
  hideElement('ledgerUsbResetError')
  hideElement('ledgerLockedError')
  hideElement('ledgerUninitialisedError')
  hideElement('ledgerKeysGeneratingError')
  hideElement('ledgerKeysGeneratingDeviceError')
  hideElement('ledgerKeysGeneratingComplete')
}

function getLedgerResponseCode(ledgerResponse) {
  const responseCode = parseInt((ledgerResponse && ledgerResponse.return_code), 10)
  return Number.isInteger(responseCode) ? responseCode : 0
}

function ledgerResponseIndicatesLocked(ledgerResponse) {
  if (!ledgerResponse) {
    return false
  }
  if (LEDGER_LOCK_RESPONSE_CODES.includes(getLedgerResponseCode(ledgerResponse))) {
    return true
  }
  const errorMessage = String(ledgerResponse.error_message || '').toLowerCase()
  return (
    errorMessage.includes('lock')
    || errorMessage.includes('conditions of use not satisfied')
    || errorMessage.includes('app does not seem to be open')
  )
}

function getLedgerErrorText(error) {
  if (!error) {
    return ''
  }
  if (typeof error === 'string') {
    return error.toLowerCase()
  }

  const fragments = []
  if (typeof error.message === 'string') {
    fragments.push(error.message)
  }
  if (typeof error.reason === 'string') {
    fragments.push(error.reason)
  }
  if (typeof error.details === 'string') {
    fragments.push(error.details)
  } else if (error.details) {
    try {
      fragments.push(JSON.stringify(error.details))
    } catch {
      // Ignore details serialization errors.
    }
  }

  return fragments.join(' ').toLowerCase()
}

function ledgerErrorIndicatesLocked(error) {
  if (!error) {
    return false
  }
  if (LEDGER_LOCK_RESPONSE_CODES.includes(parseInt(error.statusCode, 10))) {
    return true
  }
  const errorMessage = getLedgerErrorText(error)
  return (
    errorMessage.includes('lock')
    || errorMessage.includes('conditions of use not satisfied')
    || errorMessage.includes('app does not seem to be open')
  )
}

function ledgerErrorNeedsUsbReset(error) {
  const errorText = getLedgerErrorText(error)
  if (!errorText) {
    return false
  }
  return LEDGER_USB_RESET_ERROR_PATTERNS.some((pattern) => errorText.includes(pattern))
}

function ledgerResponseNeedsUsbReset(response) {
  if (!response || typeof response !== 'object') {
    return false
  }
  const errorText = String(response.error_message || '').toLowerCase()
  if (!errorText) {
    return false
  }
  return LEDGER_USB_RESET_ERROR_PATTERNS.some((pattern) => errorText.includes(pattern))
}

function syncWalletTypeTabs(selectedType) {
  const tabs = document.querySelectorAll('.wallet-type-tab')
  tabs.forEach((tabButton) => {
    const tabType = tabButton.getAttribute('data-wallet-type')
    if (tabType === selectedType) {
      tabButton.classList.add('tab-active')
    } else {
      tabButton.classList.remove('tab-active')
    }
  })
}

function closeAllOpenDialogs() {
  const openDialogs = document.querySelectorAll('dialog[open]')
  openDialogs.forEach((dialog) => {
    try {
      dialog.close()
    } catch (error) {
      // Ignore dialog close errors during route transitions.
    }
  })
}

function showError() {
  clearLedgerOpenTimeout()
  hideElement('readingLedger')
  showElement('ledgerReadError')
}

function showLedgerLockedError() {
  clearLedgerOpenTimeout()
  hideElement('readingLedger')
  showElement('ledgerLockedError')
}

function showLedgerReadTimeout() {
  clearLedgerOpenTimeout()
  hideElement('readingLedger')
  showElement('ledgerReadTimeout')
}

function showLedgerUsbResetError() {
  clearLedgerOpenTimeout()
  hideElement('readingLedger')
  showElement('ledgerUsbResetError')
}

async function getLedgerState(callback) {
  console.log('-- Getting QRL Ledger Nano App State --')
  if (isElectrified()) {
    Meteor.call('ledgerGetState', [], (err, data) => {
      console.log('> Got Ledger Nano State from USB')
      console.log(data)
      callback(err, data)
    })
  } else {
    createTransport().then(QrlLedger => {
      QrlLedger.get_state().then(data => {
        console.log('> Got Ledger Nano State from WebUSB')
        console.log(data)
        callback(null, data)
      }, e => {
        callback(e, null)
      }).catch(e => {
        console.log(`-- Ledger error: ${e} --`)
        callback(e, null)
      })
    }, e => {
      callback(e, null)
    })
  }
}
async function getLedgerPubkey(callback) {
  console.log('-- Getting QRL Ledger Nano Public Key --')
  if (isElectrified()) {
    Meteor.call('ledgerPublicKey', [], (err, data) => {
      if (err) {
        callback(err, data)
        return
      }
      if (ledgerResponseIndicatesLocked(data)) {
        callback(new Error('Ledger locked while requesting public key'), data)
        return
      }
      if (!data || !data.public_key) {
        callback(new Error('Invalid Ledger public key response'), data)
        return
      }
      console.log('> Got Ledger Public Key from USB')
      // Convert Uint to hex
      const pkHex = Buffer.from(data.public_key).toString('hex')
      // Get address from pk
      const qAddress = QRLLIB.getAddress(pkHex)
      const ledgerQAddress = `Q${qAddress}`
      Session.set('ledgerDetailsAddress', ledgerQAddress)
      Session.set('ledgerDetailsPkHex', pkHex)
      const walletCodeInput = document.getElementById('walletCode')
      if (walletCodeInput) walletCodeInput.value = ledgerQAddress
      callback(null, data)
    })
  } else {
    createTransport().then(QrlLedger => {
      QrlLedger.publickey().then(data => {
        if (ledgerResponseIndicatesLocked(data)) {
          callback(new Error('Ledger locked while requesting public key'), data)
          return
        }
        if (!data || !data.public_key) {
          callback(new Error('Invalid Ledger public key response'), data)
          return
        }
        console.log('> Got Ledger Public Key from WebUSB')
        // Convert Uint to hex
        const pkHex = Buffer.from(data.public_key).toString('hex')
        // Get address from pk
        const qAddress = QRLLIB.getAddress(pkHex)
        const ledgerQAddress = `Q${qAddress}`
        Session.set('ledgerDetailsAddress', ledgerQAddress)
        Session.set('ledgerDetailsPkHex', pkHex)
        const walletCodeInput = document.getElementById('walletCode')
        if (walletCodeInput) walletCodeInput.value = ledgerQAddress
        callback(null, data)
      }, e => {
        callback(e, null)
      }).catch(e => {
        console.log(`-- Ledger error: ${e} --`)
        callback(e, null)
      })
    }, e => {
      callback(e, null)
    })
  }
}

async function getLedgerVersion(callback) {
  console.log('-- Getting QRL Ledger Nano App Version --')
  if (isElectrified()) {
    Meteor.call('ledgerAppVersion', [], (err, data) => {
      if (err) {
        callback(err, data)
        return
      }
      console.log('> Got Ledger App Version from USB')
      Session.set(
        'ledgerDetailsAppVersion',
        data.version
      )
      callback(null, data)
    })
  } else {
    createTransport().then(QrlLedger => {
      QrlLedger.get_version().then(data => {
        console.log('> Got Ledger App Version from WebUSB')
        Session.set('ledgerDetailsAppVersion', data.version)
        console.log(data)
        callback(null, data)
      }, e => {
        callback(e, null)
      }).catch(e => {
        callback(e, null)
      })
    }, e => {
      callback(e, null)
    })
  }
}

async function getLedgerLibraryVersion(callback) {
  if (isElectrified()) {
    Meteor.call('ledgerAppVersion', [], (err, data) => {
      if (err) {
        callback(err, data)
        return
      }
      console.log('> Got Ledger Library Version from USB')
      Session.set('ledgerDetailsLibraryVersion', data)
      callback(null, data)
    })
  } else {
    createTransport().then(QrlLedger => {
      QrlLedger.get_version().then(data => {
        console.log('> Got Ledger Library Version from WebUSB')
        Session.set('ledgerDetailsLibraryVersion', data.version)
        callback(null, data)
      }, e => {
        callback(e, null)
      }).catch(e => {
        callback(e, null)
      })
    }, e => {
      callback(e, null)
    })
  }
}

function refreshLedger(openAttemptId) {
  // Clear Ledger State
  clearLedgerDetails()

  getLedgerState(function (err, data) {
    if (openAttemptId !== ledgerOpenAttemptId) {
      return
    }

    if (ledgerErrorNeedsUsbReset(err) || ledgerResponseNeedsUsbReset(data)) {
      showLedgerUsbResetError()
      return
    }

    if (ledgerErrorIndicatesLocked(err) || ledgerResponseIndicatesLocked(data)) {
      showLedgerLockedError()
      return
    }

    if (err) {
      console.log('-- Ledger error while getting state --')
      console.log(err)
      showError()
      return
    }

    if (getLedgerResponseCode(data) === 14) {
      // Ledger timed out with no response.
      showLedgerReadTimeout()
      return
    }

    if (!data) {
      showError()
    } else {
      // We were able to connect to Ledger Device and get state
      const ledgerDeviceState = parseInt(data.state, 10)
      const ledgerDeviceXmssIndex = parseInt(data.xmss_index, 10)
      if (ledgerDeviceState === 0) {
        // Uninitialised Device - prompt user to init device in QRL ledger app
        clearLedgerOpenTimeout()
        hideElement('readingLedger')
        showElement('ledgerUninitialisedError')
      } else if (ledgerDeviceState === 1) {
        // Device is in key generation state - prompt user to continue generating keys
        // and show progress on screen
        clearLedgerOpenTimeout()
        hideElement('readingLedger')
        showElement('ledgerKeysGeneratingError')
        // Now continually check status
        async.during(
          // Truth function - check if current generation height < 256
          function (callback) {
            getLedgerState(function (stateErr, stateData) { //eslint-disable-line
              if (stateErr) {
                // Device unplugged?
                hideElement('ledgerKeysGeneratingError')
                showElement('ledgerKeysGeneratingDeviceError')
              } else {
                // Update progress bar status
                const percentCompleted = (stateData.xmss_index / 256) * 100
                const progressBar = document.getElementById('ledgerKeyGenerationProgressBar')
                if (progressBar) progressBar.value = percentCompleted
                return callback(null, stateData.xmss_index < 256)
              }
            })
          },
          function (callback) {
            // Check device state again in a second
            setTimeout(callback, 1000)
          },
          function (err) {
            // The device has generated all keys
            hideElement('ledgerKeysGeneratingError')
            showElement('ledgerKeysGeneratingComplete')
          } // eslint-disable-line
        )
      } else if (ledgerDeviceState === 2) {
        // Initialised Device - ready to proceed opening ledger
        // Ensure QRLLIB is available before proceeding
        waitForQRLLIB(function () {
          async.waterfall([
            // Get the public key from the ledger so we can determine Q address
            function (cb) {
              getLedgerPubkey(function (pubErr, pubData) { // eslint-disable-line
                if (openAttemptId !== ledgerOpenAttemptId) {
                  return
                }
                if (pubErr) {
                  if (ledgerErrorNeedsUsbReset(pubErr) || ledgerResponseNeedsUsbReset(pubData)) {
                    showLedgerUsbResetError()
                  } else if (ledgerErrorIndicatesLocked(pubErr) || ledgerResponseIndicatesLocked(pubData)) {
                    showLedgerLockedError()
                  } else if (getLedgerResponseCode(pubData) === 14) {
                    showLedgerReadTimeout()
                  } else {
                    showError()
                  }
                } else {
                  cb()
                }
              })
            },
            // Get the Ledger Device app version
            function (cb) {
              getLedgerVersion(function (versionErr, versionData) {
                if (openAttemptId !== ledgerOpenAttemptId) {
                  return
                }
                if (versionErr) {
                  if (ledgerErrorNeedsUsbReset(versionErr) || ledgerResponseNeedsUsbReset(versionData)) {
                    showLedgerUsbResetError()
                  } else if (ledgerErrorIndicatesLocked(versionErr) || ledgerResponseIndicatesLocked(versionData)) {
                    showLedgerLockedError()
                  } else if (getLedgerResponseCode(versionData) === 14) {
                    showLedgerReadTimeout()
                  } else {
                    showError()
                  }
                  return
                }
                cb()
              })
            },
            // Get the local QrlLedger JS library version
            function (cb) {
              getLedgerLibraryVersion(function (libraryErr, libraryData) {
                if (openAttemptId !== ledgerOpenAttemptId) {
                  return
                }
                if (libraryErr) {
                  if (ledgerErrorNeedsUsbReset(libraryErr) || ledgerResponseNeedsUsbReset(libraryData)) {
                    showLedgerUsbResetError()
                  } else if (ledgerErrorIndicatesLocked(libraryErr) || ledgerResponseIndicatesLocked(libraryData)) {
                    showLedgerLockedError()
                  } else if (getLedgerResponseCode(libraryData) === 14) {
                    showLedgerReadTimeout()
                  } else {
                    showError()
                  }
                  return
                }
                cb()
              })
            },
          ], () => {
            console.log('Ledger Device Successfully Opened')
            clearLedgerOpenTimeout()
            hideElement('readingLedger')
            const thisAddress = Session.get('ledgerDetailsAddress')
            const status = {}
            status.colour = 'green'
            status.string = `${thisAddress} is ready to use.`
            status.unlocked = true
            status.walletType = 'ledger'
            status.address = thisAddress
            status.pubkey = Session.get('ledgerDetailsPkHex')
            status.xmss_index = Number.isInteger(ledgerDeviceXmssIndex) ? ledgerDeviceXmssIndex : 0
            status.menuHidden = ''
            status.menuHiddenInverse = 'display: none'
            Session.set('walletStatus', status)
            Session.set('transferFromAddress', thisAddress)
            console.log('Opened ledger address ', thisAddress)
            // Redirect user to transfer page
            const params = {}
            const path = FlowRouter.path('/transfer', params)
            FlowRouter.go(path)
          }) // async.waterfall
        }) // waitForQRLLIB
      } else {
        showError()
      } // device state check
    } // if(err) else
  }) // getLedgerState
}

function updateWalletType() {
  clearLedgerOpenTimeout()
  clearLedgerDetails()
  hideLedgerStatusMessages()
  hideElement('readingLedger')
  const walletTypeElement = document.getElementById('walletType')
  if (!walletTypeElement) {
    return
  }
  const walletType = walletTypeElement.value
  syncWalletTypeTabs(walletType)
  const walletCode = document.getElementById('walletCode')
  const walletFile = document.getElementById('walletFile')

  if (walletType === 'file') {
    hideElement('walletCode')
    walletCode?.classList.add('hidden')
    hideElement('ledgerArea')
    hideElement('eye')
    hideElement('ledgerRefreshButton')
    walletFile?.classList.remove('hidden')
    showElement('passphraseArea')
    showElement('unlockButton')
    LocalStore.set('openWalletDefault', walletType)
  } else if (walletType === 'ledgernano') {
    if (walletCode) walletCode.value = ''
    walletFile?.classList.add('hidden')
    hideElement('passphraseArea')
    hideElement('unlockButton')
    hideElement('eye')
    walletCode?.classList.add('hidden')
    showElement('ledgerArea')
    if (walletCode) walletCode.disabled = true
    showElement('ledgerRefreshButton')
    LocalStore.set('openWalletDefault', walletType)
  } else {
    hideElement('ledgerArea')
    walletFile?.classList.add('hidden')
    hideElement('passphraseArea')
    hideElement('ledgerRefreshButton')
    showElement('eye')
    walletCode?.classList.remove('hidden')
    if (walletCode) walletCode.disabled = false
    showElement('unlockButton')
    LocalStore.set('openWalletDefault', walletType)
  }
}
Template.appAddressOpen.onRendered(() => {
  closeAllOpenDialogs()

  // Native selects don't need initialization

  clearLedgerDetails()

  // Restore local storage state
  resetLocalStorageState()

  // Route to transfer if wallet is already opened
  if (Session.get('walletStatus') !== undefined) {
    if (Session.get('walletStatus').unlocked === true) {
      const params = {}
      const path = FlowRouter.path('/transfer', params)
      FlowRouter.go(path)
    }
  }
  // determine last used means of opening wallet from LocalStore
  let openWalletPref = LocalStore.get('openWalletDefault')
  if ((!openWalletPref) || (openWalletPref === 'undefined')) {
    openWalletPref = 'file'
  }
  const walletTypeSelect = document.getElementById('walletType')
  if (walletTypeSelect) {
    if (!walletTypeSelect.querySelector(`option[value="${openWalletPref}"]`)) {
      openWalletPref = 'file'
    }
    walletTypeSelect.value = openWalletPref
    updateWalletType()
  }
})

function openWallet(walletType, walletCode) {
  try {
    // Create XMSS object from seed
    if (walletType === 'hexseed') {
      // eslint-disable-next-line no-global-assign
      XMSS_OBJECT = QRLLIB.Xmss.fromHexSeed(walletCode)
    } else if (walletType === 'mnemonic') {
      // eslint-disable-next-line no-global-assign
      XMSS_OBJECT = QRLLIB.Xmss.fromMnemonic(walletCode)
    }

    const thisAddress = XMSS_OBJECT.getAddress()

    // If it worked, send the user to the address page.
    if (thisAddress !== '') {
      const status = {}
      status.colour = 'green'
      status.string = `${thisAddress} is ready to use.`
      status.unlocked = true
      status.walletType = 'seed'
      status.address = thisAddress
      status.pubkey = null
      status.menuHidden = ''
      status.menuHiddenInverse = 'display: none'
      Session.set('walletStatus', status)
      Session.set('transferFromAddress', thisAddress)
      console.log('Opened address ', thisAddress)

      const params = {}
      const path = FlowRouter.path('/transfer', params)
      FlowRouter.go(path)
    } else {
      showElement('unlockError')
      hideElement('unlocking')
    }
  } catch (error) {
    console.log(error)
    showElement('unlockError')
    hideElement('unlocking')
  }
}

function getWalletMnemonic(walletData) {
  const walletRecord = getPrimaryWalletRecord(walletData)
  return walletRecord && typeof walletRecord.mnemonic === 'string'
    ? walletRecord.mnemonic.trim()
    : ''
}

function walletMnemonicLooksValid(walletMnemonic) {
  return walletMnemonic.split(/\s+/).length === 34
}

async function showUpgradeWalletModal(walletType, encryptedWallet) {
  const modal = document.getElementById('updateWalletFileFormat')
  const approveButton = document.getElementById('approveUpdateWallet')
  const description = document.getElementById('updateWalletFileFormatDescription')

  if (!modal || !approveButton) {
    return false
  }

  const typeLabel = getWalletTypeLabel(walletType)
  if (description) {
    description.textContent = encryptedWallet
      ? `${typeLabel} is a deprecated format. Save an upgraded encrypted v3 wallet now for stronger protection.`
      : `${typeLabel} is a deprecated format. Save an upgraded v3 wallet file now to use the current format.`
  }

  return new Promise((resolve) => {
    let settled = false

    const finish = (approved) => {
      if (settled) return
      settled = true
      resolve(approved)
    }

    const onApprove = () => {
      finish(true)
      modal.close()
    }

    const onClose = () => {
      approveButton.removeEventListener('click', onApprove)
      modal.removeEventListener('close', onClose)
      if (!settled) {
        finish(false)
      }
    }

    approveButton.addEventListener('click', onApprove)
    modal.addEventListener('close', onClose)
    modal.showModal()
  })
}

async function saveUpgradedWallet(walletData, encryptedWallet, passphrase) {
  const normalizedWalletData = Array.isArray(walletData)
    ? walletData.map((entry) => normalizeWalletRecord(entry))
    : getPrimaryWalletRecordOrThrow(walletData)

  const walletEnvelope = encryptedWallet
    ? await buildEncryptedEnvelope(normalizedWalletData, passphrase)
    : buildUnencryptedEnvelope(normalizedWalletData)
  downloadWalletFile(walletEnvelope, 'wallet.json')
}

function triggerOpen(walletData) {
  const walletMnemonic = getWalletMnemonic(walletData)

  // Validate we have a valid mnemonic before attempting to open file
  if (!walletMnemonicLooksValid(walletMnemonic)) {
    // Invalid mnemonic in wallet file
    hideElement('unlocking')
    showElement('noWalletFileSelected')
  } else {
    // Open wallet file
    setTimeout(() => { openWallet('mnemonic', walletMnemonic) }, 200)
  }
}

async function unlockWallet() {
  const walletTypeElement = document.getElementById('walletType')
  const walletCodeElement = document.getElementById('walletCode')
  if (!walletTypeElement || !walletCodeElement) {
    hideElement('unlocking')
    showElement('unlockError')
    return
  }

  const walletType = walletTypeElement.value
  const walletCode = walletCodeElement.value
  const walletFileInput = document.getElementById('walletFile')
  const walletFiles = walletFileInput?.files
  const passphrase = document.getElementById('passphrase').value

  // Read file locally, extract mnemonic and open wallet.
  if (walletType === 'file') {
    const walletFile = walletFiles?.[0]

    if (walletFile === undefined) {
      hideElement('unlocking')
      showElement('noWalletFileSelected')
      return
    }

    try {
      const walletFileText = await walletFile.text()
      const walletInput = JSON.parse(walletFileText)
      const loadedWallet = await loadWalletDataForUse(walletInput, passphrase)
      const walletMnemonic = getWalletMnemonic(loadedWallet.walletData)

      if (!walletMnemonicLooksValid(walletMnemonic)) {
        hideElement('unlocking')
        showElement('noWalletFileSelected')
        return
      }

      if (loadedWallet.deprecated) {
        const approvedUpgrade = await showUpgradeWalletModal(loadedWallet.walletType, loadedWallet.encrypted)
        if (approvedUpgrade) {
          try {
            await saveUpgradedWallet(loadedWallet.walletData, loadedWallet.encrypted, passphrase)
            if (walletFileInput) walletFileInput.value = ''
            const passphraseInput = document.getElementById('passphrase')
            if (passphraseInput) passphraseInput.value = ''
          } catch (saveError) {
            console.error('Failed to save upgraded wallet file:', saveError)
          }
        }
      }

      triggerOpen(loadedWallet.walletData)
    } catch (error) {
      console.error('Failed to open wallet file:', error)
      hideElement('unlocking')
      showElement('noWalletFileSelected')
    }
  } else {
    // Open from hexseed or mnemonic directly
    setTimeout(() => { openWallet(walletType, walletCode) }, 200)
  }
}

function clickUnlockButton() {
  showElement('unlocking')
  hideElement('unlockError')
  hideLedgerStatusMessages()
  hideElement('noWalletFileSelected')
  setTimeout(() => { unlockWallet() }, 50)
}

Template.appAddressOpen.events({
  'click #unlockButton': () => {
    clickUnlockButton()
  },
  'click #ledgerRefreshButton': () => {
    ledgerOpenAttemptId += 1
    const thisAttemptId = ledgerOpenAttemptId
    startLedgerOpenTimeout(thisAttemptId)
    showElement('readingLedger')
    hideElement('unlocking')
    hideElement('unlockError')
    hideLedgerStatusMessages()
    hideElement('noWalletFileSelected')
    setTimeout(() => { refreshLedger(thisAttemptId) }, 1000)
  },
  'change #walletType': () => {
    updateWalletType()
  },
  'click .wallet-type-tab': (event) => {
    event.preventDefault()
    const walletType = event.currentTarget.getAttribute('data-wallet-type')
    const walletTypeSelect = document.getElementById('walletType')
    if (!walletTypeSelect || !walletType) return
    walletTypeSelect.value = walletType
    updateWalletType()
  },
  'input #walletCode': () => {
    const walletCode = document.getElementById('walletCode')?.value || ''
    if (walletCode.length > 10) {
      const walletTypeSelect = document.getElementById('walletType')
      if (walletCode.indexOf(' ') > -1) {
        if (walletTypeSelect) walletTypeSelect.value = 'mnemonic'
      } else {
        if (walletTypeSelect) walletTypeSelect.value = 'hexseed'
      }
      updateWalletType()
    }
  },
  'click #eye': () => {
    const walletCodeInput = document.getElementById('walletCode')
    if (!walletCodeInput) return
    const state = walletCodeInput.type
    const eyeIcon = document.getElementById('eyeicon')
    if (state === 'text') {
      walletCodeInput.type = 'password'
      // Update icon to show "eye" (hidden state)
      if (eyeIcon) {
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />'
      }
    } else {
      walletCodeInput.type = 'text'
      // Update icon to show "eye-off" (visible state)
      if (eyeIcon) {
        eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />'
      }
    }
  },
  'keyup input': (event) => {
    if (event.which === 13) {
      // enter pressed, triger unlock button
      clickUnlockButton()
    }
  },
})

Template.appAddressOpen.helpers({
  ledgerDetails() {
    const ledgerDetails = {}
    ledgerDetails.address = Session.get('ledgerDetailsAddress')
    ledgerDetails.appVersion = Session.get('ledgerDetailsAppVersion')
    ledgerDetails.libraryVersion = Session.get('ledgerDetailsLibraryVersion')
    ledgerDetails.pubkey = Session.get('ledgerDetailsPkHex')
    return ledgerDetails
  },
  isWindowsNotElectron() {
    return (!(window.navigator.platform.indexOf('Win')) && !isElectrified())
  },
  isNotWindowsNotElectron() {
    return !(!(window.navigator.platform.indexOf('Win')) && !isElectrified())
  }
})
