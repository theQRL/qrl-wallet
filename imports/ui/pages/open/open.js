import aes256 from 'aes256'
import async from 'async'
import './open.html'
/* global LocalStore */
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global resetLocalStorageState */

const LEDGER_TIMEOUT = 10000

function openWallet(walletType, walletCode) {
  try {
    // Create XMSS object from seed
    if (walletType === 'hexseed') {
      XMSS_OBJECT = QRLLIB.Xmss.fromHexSeed(walletCode)
    } else if (walletType === 'mnemonic') {
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
      LocalStore.set('walletStatus', status)
      LocalStore.set('transferFromAddress', thisAddress)
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

function unlockWallet() {
  let walletType = document.getElementById('walletType').value
  let walletCode = document.getElementById('walletCode').value
  let walletFiles = $('#walletFile').prop('files')
  let passphrase = document.getElementById('passphrase').value

  // Read file locally, extract mnemonic and open wallet
  if (walletType === 'file') {
    const walletFile = walletFiles[0]
    const reader = new FileReader()
    reader.onload = (function(theFile) {
      return function(e) {
        try {
          const walletJson = JSON.parse(e.target.result)
          const walletEncrypted = walletJson[0].encrypted

          // Decrypt an encrypted wallet file
          if (walletEncrypted === true) {
            // Decrypt wallet items before proceeding
            walletJson[0].address = aes256.decrypt(passphrase, walletJson[0].address)
            walletJson[0].mnemonic = aes256.decrypt(passphrase, walletJson[0].mnemonic)
            walletJson[0].hexseed = aes256.decrypt(passphrase, walletJson[0].hexseed)
          }

          const walletMnemonic = walletJson[0].mnemonic

          // Validate we have a valid mnemonic before attemptint to open file
          if ((walletMnemonic.split(' ').length - 1) !== 33) {
            // Invalid mnemonic in wallet file
            $('#unlocking').hide()
            $('#noWalletFileSelected').show()
          } else {
            // Open wallet file
            setTimeout(() => { openWallet('mnemonic', walletMnemonic) }, 200)
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


function clearLedgerDetails() {
  LocalStore.set('ledgerDetailsAddress', '')
  LocalStore.set('ledgerDetailsAppVersion', '')
  LocalStore.set('ledgerDetailsLibraryVersion', '')
  LocalStore.set('ledgerDetailsPkHex', '')
}

function getLedgerState(callback) {
  console.log('-- Getting QRL Ledger Nano App State --')
  QrlLedger.get_state().then(data => {
    console.log('> Got Ledger Nano State')
    console.log(data)
    callback(null, data)
  })
}

function getLedgerPubkey(callback) {
  console.log('-- Getting QRL Ledger Nano Public Key --')
  QrlLedger.publickey().then(data => {
    // Convert Uint to hex
    let pkHex = Buffer.from(data.public_key).toString('hex')
    // Get address from pk
    let ledgerQAddress = 'Q'+QRLLIB.getAddress(pkHex)
    LocalStore.set('ledgerDetailsAddress', ledgerQAddress)
    LocalStore.set('ledgerDetailsPkHex', pkHex)

    $('#walletCode').val(ledgerQAddress)
    callback(null, data)
  })
}

// Wrap ledger calls in async.timeout
var getLedgerStateWrapper = async.timeout(getLedgerState, LEDGER_TIMEOUT)
var getLedgerPubkeyWrapper = async.timeout(getLedgerPubkey, LEDGER_TIMEOUT)


function refreshLedger() {
  // Clear Ledger State
  clearLedgerDetails()

  // call `wrapped` as you would `myFunction`
  getLedgerStateWrapper(function(err, data) {
    if(err) {
      // We timed out requesting data from ledger
      $('#readingLedger').hide()
      $('#ledgerReadError').show()
    } else {
      // We were able to connect to Ledger Device and get state
      const ledgerDeviceState = data.state
      const ledgerDeviceXmssIndex = data.xmss_index

      if(ledgerDeviceState == 0) {
        // Uninitialised Device - prompt user to init device in QRL ledger app
        $('#readingLedger').hide()
        $('#ledgerUninitialisedError').show()
      } else if(ledgerDeviceState == 1) {
        // Device is in key generation state - prompt user to continue generating keys
        // and show progress on screen
        $('#readingLedger').hide()
        $('#ledgerKeysGeneratingError').show()

        // Now continually check status
        async.during(
          // Truth function - check if current generation height < 256
          function (callback) {
            getLedgerStateWrapper(function(err, data) {
              if(err) {
                // Device unplugged?
                $('#ledgerKeysGeneratingError').hide()
                $('#ledgerKeysGeneratingDeviceError').show()
              } else {
                // Update progress bar status
                const percentCompleted = (data.xmss_index / 256) * 100
                $('#ledgerKeyGenerationProgressBar').progress({
                  percent: percentCompleted
                })

                return callback(null, data.xmss_index < 256)
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
          }
        )
      } else if(ledgerDeviceState == 2) {
        // Initialised Device - ready to proceed opening ledger

        // Ensure QRLLIB is available before proceeding
        waitForQRLLIB(function () {
          async.waterfall([
            // Get the public key from the ledger so we can determine Q address
            function(cb) {
              getLedgerPubkeyWrapper(function(err, data) {
                if(err) {
                  // We timed out requesting data from ledger
                  $('#readingLedger').hide()
                  $('#ledgerReadError').show()
                } else {
                  // We read the data all good!
                  cb()
                }
              })
            },
            // Get the Ledger Device app version
            function(cb) {
              QrlLedger.app_version().then(data => {
                LocalStore.set('ledgerDetailsAppVersion', data.major+'.'+data.minor+'.'+data.patch)
                cb()
              })
            },
            // Get the local QrlLedger JS library version
            function(cb) {
              QrlLedger.library_version().then(data => {
                LocalStore.set('ledgerDetailsLibraryVersion', data)
                cb()
              })
            },
          ], () => {
            console.log('Ledger Device Successfully Opened')
            $('#readingLedger').hide()

            const thisAddress = LocalStore.get('ledgerDetailsAddress')
            const status = {}
            status.colour = 'green'
            status.string = `${thisAddress} is ready to use.`
            status.unlocked = true
            status.walletType = 'ledger'
            status.address = thisAddress
            status.pubkey = LocalStore.get('ledgerDetailsPkHex')
            status.xmss_index = ledgerDeviceXmssIndex
            status.menuHidden = ''
            status.menuHiddenInverse = 'display: none'
            LocalStore.set('walletStatus', status)
            LocalStore.set('transferFromAddress', thisAddress)
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

Template.appAddressOpen.onRendered(() => {
  $('.ui.dropdown').dropdown()

  clearLedgerDetails()

  $('#openWalletTabs .item').tab()
  $('#xmssHeightDropdown').dropdown({direction: 'upward' })

  // Restore local storage state
  resetLocalStorageState()

  // Route to transfer if wallet is already opened
  if (LocalStore.get('walletStatus').unlocked === true) {
    const params = {}
    const path = FlowRouter.path('/transfer', params)
    FlowRouter.go(path)
  }
})

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
    clearLedgerDetails()
    const walletType = document.getElementById('walletType').value
    if (walletType === 'file') {
      $('#walletCode').hide()
      $('#ledgerArea').hide()
      $('#walletFile').show()
      $('#passphraseArea').show()
      $('#ledgerRefreshButton').hide()
      $('#unlockButton').show()
    } else if (walletType === 'ledgernano') {
      $('#walletCode').val('')
      $('#walletFile').hide()
      $('#passphraseArea').hide()
      $('#walletCode').show()
      $('#ledgerArea').show()
      $("#walletCode").prop('disabled', true);
      $('#ledgerRefreshButton').show()
      $('#unlockButton').hide()
    } else {
      $('#ledgerArea').hide()
      $('#walletFile').hide()
      $('#passphraseArea').hide()
      $('#walletCode').show()
      $("#walletCode").prop('disabled', false);
      $('#ledgerRefreshButton').hide()
      $('#unlockButton').show()
    }
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
    ledgerDetails.address = LocalStore.get('ledgerDetailsAddress')
    ledgerDetails.appVersion = LocalStore.get('ledgerDetailsAppVersion')
    ledgerDetails.libraryVersion = LocalStore.get('ledgerDetailsLibraryVersion')
    ledgerDetails.pubkey = LocalStore.get('ledgerDetailsPkHex')
    return ledgerDetails
  },
})
