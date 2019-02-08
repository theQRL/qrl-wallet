/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import aes256 from 'aes256'
import async from 'async'
import './open.html'

Template.appAddressOpen.onCreated(() => {
  Session.set('modalEventTriggered', false)
})

function clearLedgerDetails() {
  Session.set('ledgerDetailsAddress', '')
  Session.set('ledgerDetailsAppVersion', '')
  Session.set('ledgerDetailsLibraryVersion', '')
  Session.set('ledgerDetailsPkHex', '')
}

function getLedgerState(callback) {
  console.log('-- Getting QRL Ledger Nano App State --')
  if (isElectrified()) {
    Meteor.call('ledgerGetState', [], (err, data) => {
      console.log('> Got Ledger Nano State from USB')
      console.log(data)
      callback(null, data)
    })
  } else {
    QrlLedger.get_state().then(data => {
      console.log('> Got Ledger Nano State from U2F')
      console.log(data)
      callback(null, data)
    })
  }
}
function getLedgerPubkey(callback) {
  console.log('-- Getting QRL Ledger Nano Public Key --')
  if (isElectrified()) {
    Meteor.call('ledgerPublicKey', [], (err, data) => {
      console.log('> Got Ledger Public Key from USB')
      // Convert Uint to hex
      const pkHex = Buffer.from(data.public_key).toString('hex')
      // Get address from pk
      const qAddress = QRLLIB.getAddress(pkHex)
      const ledgerQAddress = `Q${qAddress}`
      Session.set('ledgerDetailsAddress', ledgerQAddress)
      Session.set('ledgerDetailsPkHex', pkHex)
      $('#walletCode').val(ledgerQAddress)
      callback(null, data)
    })
  } else {
    QrlLedger.publickey().then(data => {
      console.log('> Got Ledger Public Key from U2F')
      // Convert Uint to hex
      const pkHex = Buffer.from(data.public_key).toString('hex')
      // Get address from pk
      const qAddress = QRLLIB.getAddress(pkHex)
      const ledgerQAddress = `Q${qAddress}`
      Session.set('ledgerDetailsAddress', ledgerQAddress)
      Session.set('ledgerDetailsPkHex', pkHex)
      $('#walletCode').val(ledgerQAddress)
      callback(null, data)
    })
  }
}

function getLedgerVersion(callback) {
  console.log('-- Getting QRL Ledger Nano App Version --')
  if (isElectrified()) {
    Meteor.call('ledgerAppVersion', [], (err, data) => {
      console.log('> Got Ledger App Version from USB')
      Session.set('ledgerDetailsAppVersion', data.major + '.' + data.minor + '.' + data.patch)
      callback(null, data)
    })
  } else {
    QrlLedger.app_version().then(data => {
      console.log('> Got Ledger App Version from U2F')
      Session.set('ledgerDetailsAppVersion', data.major + '.' + data.minor + '.' + data.patch)
      callback()
    })
  }
}

function getLedgerLibraryVersion(callback) {
  if (isElectrified()) {
    Meteor.call('ledgerAppVersion', [], (err, data) => {
      console.log('> Got Ledger Library Version from USB')
      Session.set('ledgerDetailsLibraryVersion', data)
      callback(null, data)
    })
  } else {
    QrlLedger.library_version().then(data => {
      console.log('> Got Ledger Library Version from U2F')
      Session.set('ledgerDetailsLibraryVersion', data)
      callback(data)
    })
  }
}

// Wrap ledger calls in async.timeout
const getLedgerStateWrapper = async.timeout(getLedgerState, LEDGER_TIMEOUT)
const getLedgerPubkeyWrapper = async.timeout(getLedgerPubkey, LEDGER_TIMEOUT)
const getLedgerVersionWrapper = async.timeout(getLedgerVersion, LEDGER_TIMEOUT)
const getLedgerLibraryVersionWrapper = async.timeout(getLedgerLibraryVersion, LEDGER_TIMEOUT)


function refreshLedger() {
  // Clear Ledger State
  clearLedgerDetails()

  getLedgerStateWrapper(function (err, data) {
    if (err) {
      // We timed out requesting data from ledger
      $('#readingLedger').hide()
      $('#ledgerReadError').show()
    } else {
      // We were able to connect to Ledger Device and get state
      const ledgerDeviceState = data.state
      const ledgerDeviceXmssIndex = data.xmss_index
      if (ledgerDeviceState === 0) {
        // Uninitialised Device - prompt user to init device in QRL ledger app
        $('#readingLedger').hide()
        $('#ledgerUninitialisedError').show()
      } else if (ledgerDeviceState === 1) {
        // Device is in key generation state - prompt user to continue generating keys
        // and show progress on screen
        $('#readingLedger').hide()
        $('#ledgerKeysGeneratingError').show()
        // Now continually check status
        async.during(
          // Truth function - check if current generation height < 256
          function (callback) {
            getLedgerStateWrapper(function (stateErr, stateData) { //eslint-disable-line
              if (stateErr) {
                // Device unplugged?
                $('#ledgerKeysGeneratingError').hide()
                $('#ledgerKeysGeneratingDeviceError').show()
              } else {
                // Update progress bar status
                const percentCompleted = (stateData.xmss_index / 256) * 100
                $('#ledgerKeyGenerationProgressBar').progress({
                  percent: percentCompleted,
                })
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
            $('#ledgerKeysGeneratingError').hide()
            $('#ledgerKeysGeneratingComplete').show()
          } // eslint-disable-line
        )
      } else if (ledgerDeviceState === 2) {
        // Initialised Device - ready to proceed opening ledger
        // Ensure QRLLIB is available before proceeding
        waitForQRLLIB(function () {
          async.waterfall([
            // Get the public key from the ledger so we can determine Q address
            function (cb) {
              getLedgerPubkeyWrapper(function (pubErr, pubData) { // eslint-disable-line
                if (pubErr) {
                  // We timed out requesting data from ledger
                  $('#readingLedger').hide()
                  $('#ledgerReadError').show()
                } else {
                  cb()
                }
              })
            },
            // Get the Ledger Device app version
            function (cb) {
              getLedgerVersionWrapper(function (data) {
                cb()
              })
            },
            // Get the local QrlLedger JS library version
            function (cb) {
              getLedgerLibraryVersionWrapper(function(data) {
                cb()
              })
            },
          ], () => {
            console.log('Ledger Device Successfully Opened')
            $('#readingLedger').hide()
            const thisAddress = Session.get('ledgerDetailsAddress')
            const status = {}
            status.colour = 'green'
            status.string = `${thisAddress} is ready to use.`
            status.unlocked = true
            status.walletType = 'ledger'
            status.address = thisAddress
            status.pubkey = Session.get('ledgerDetailsPkHex')
            status.xmss_index = ledgerDeviceXmssIndex
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
      } // device state check
    } // if(err) else
  }) // getLedgerStateWrapper
}

function updateWalletType() {
  clearLedgerDetails()
  const walletType = document.getElementById('walletType').value
  if (walletType === 'file') {
    $('#walletCode').hide()
    $('#ledgerArea').hide()
    $('#ledgerRefreshButton').hide()

    $('#walletFile').show()
    $('#passphraseArea').show()
    $('#unlockButton').show()
    LocalStore.set('openWalletDefault', $('#walletType :selected').val())
  } else if (walletType === 'ledgernano') {
    $('#walletCode').val('')
    $('#walletFile').hide()
    $('#passphraseArea').hide()
    $('#unlockButton').hide()

    $('#walletCode').show()
    $('#ledgerArea').show()
    $('#walletCode').prop('disabled', true)
    $('#ledgerRefreshButton').show()
    LocalStore.set('openWalletDefault', $('#walletType :selected').val())
  } else {
    $('#ledgerArea').hide()
    $('#walletFile').hide()
    $('#passphraseArea').hide()
    $('#ledgerRefreshButton').hide()

    $('#walletCode').show()
    $('#walletCode').prop('disabled', false)
    $('#unlockButton').show()
    LocalStore.set('openWalletDefault', $('#walletType :selected').val())
  }
}
Template.appAddressOpen.onRendered(() => {
  $('.ui.dropdown').dropdown()

  clearLedgerDetails()

  // Restore local storage state
  resetLocalStorageState()

  // Route to transfer if wallet is already opened
  if (Session.get('walletStatus').unlocked === true) {
    const params = {}
    const path = FlowRouter.path('/transfer', params)
    FlowRouter.go(path)
  }

  // determine last used means of opening wallet from LocalStore
  let openWalletPref = LocalStore.get('openWalletDefault')
  if ((!openWalletPref) || (openWalletPref === 'undefined')) {
    openWalletPref = 'file'
  }
  $('#walletType').val(openWalletPref).change()
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
      $('#unlockError').show()
      $('#unlocking').hide()
    }
  } catch (error) {
    console.log(error)
    $('#unlockError').show()
    $('#unlocking').hide()
  }
}

function triggerOpen(walletJson, passphrase) {
  const walletMnemonic = getMnemonicOfFirstAddress(walletJson, passphrase)

  // Validate we have a valid mnemonic before attempting to open file
  if ((walletMnemonic.split(' ').length - 1) !== 33) {
    // Invalid mnemonic in wallet file
    $('#unlocking').hide()
    $('#noWalletFileSelected').show()
  } else {
    // Open wallet file
    setTimeout(() => { openWallet('mnemonic', walletMnemonic) }, 200)
  }
}

function unlockWallet() {
  const walletType = document.getElementById('walletType').value
  const walletCode = document.getElementById('walletCode').value
  const walletFiles = $('#walletFile').prop('files')
  const passphrase = document.getElementById('passphrase').value

  // Read file locally, extract mnemonic and open wallet
  if (walletType === 'file') {
    const walletFile = walletFiles[0]
    const reader = new FileReader()

    // eslint-disable-next-line
    reader.onload = (function (theFile) {
      // eslint-disable-next-line
      return function (e) {
        try {
          const walletDetail = JSON.parse(e.target.result)

          // Check if wallet file is deprecated
          if (isWalletFileDeprecated(walletDetail)) {
            $('#updateWalletFileFormat').modal({
              onApprove: () => {
                Session.set('modalEventTriggered', true)
                // User has requested to update wallet file, resave with updated fields
                walletDetail[0].addressB32 = aes256.encrypt(passphrase, walletDetail[0].addressB32)
                walletDetail[0].pk = aes256.encrypt(passphrase, walletDetail[0].pk)

                const walletJson = ['[', JSON.stringify(walletDetail[0]), ']'].join('')
                const binBlob = new Blob([walletJson])
                const a = window.document.createElement('a')
                a.href = window.URL.createObjectURL(binBlob, { type: 'text/plain' })
                a.download = 'wallet.json'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)

                // Reset the state of the open wallet page.
                $('#unlocking').hide()
                $('#walletFile').val('')
                $('#passphrase').val('')
              },
              onDeny: () => {
                Session.set('modalEventTriggered', true)
                triggerOpen(walletDetail, passphrase)
              },
              onHide: () => {
                if (Session.get('modalEventTriggered') === false) {
                  triggerOpen(walletDetail, passphrase)
                }
                Session.set('modalEventTriggered', false)
              },
            }).modal('show')
          } else {
            // Wallet is not bugged version - go ahead and trigger opening it
            triggerOpen(walletDetail, passphrase)
          }
        } catch (err) {
          // Invalid file format
          $('#unlocking').hide()
          $('#noWalletFileSelected').show()
        }
      }
    })(walletFile)

    // Validate we've got a wallet file
    if (walletFile === undefined) {
      $('#unlocking').hide()
      $('#noWalletFileSelected').show()
    } else {
      reader.readAsText(walletFile)
    }
  } else {
    // Open from hexseed or mnemonic directly
    setTimeout(() => { openWallet(walletType, walletCode) }, 200)
  }
}

Template.appAddressOpen.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    $('#unlockError').hide()
    $('#ledgerReadError').hide()
    $('#ledgerUninitialisedError').hide()
    $('#noWalletFileSelected').hide()
    $('#ledgerKeysGeneratingError').hide()
    $('#ledgerKeysGeneratingDeviceError').hide()
    $('#ledgerKeysGeneratingComplete').hide()
    setTimeout(() => { unlockWallet() }, 50)
  },
  'click #ledgerRefreshButton': () => {
    $('#readingLedger').show()
    $('#unlocking').hide()
    $('#unlockError').hide()
    $('#ledgerReadError').hide()
    $('#ledgerUninitialisedError').hide()
    $('#noWalletFileSelected').hide()
    $('#ledgerKeysGeneratingError').hide()
    $('#ledgerKeysGeneratingDeviceError').hide()
    $('#ledgerKeysGeneratingComplete').hide()
    setTimeout(() => { refreshLedger() }, 50)
  },
  'change #walletType': () => {
    updateWalletType()
  },
  'input #walletCode': () => {
    const walletCode = $('#walletCode').val()
    if (walletCode.length > 10) {
      if (walletCode.indexOf(' ') > -1) {
        $('#walletType').val('mnemonic').change()
      } else {
        $('#walletType').val('hexseed').change()
      }
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
})
