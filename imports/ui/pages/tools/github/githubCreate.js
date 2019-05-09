/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './githubCreate.html'

async function callGithubAPI(name) {
  $.ajax({
    dataType: 'json',
    url: `https://api.github.com/users/${name}`,
    success: (res) => {
      console.log(res)
      const x = Session.get('githubOperation')
      x.enableTransaction = true
      x.apiID = res.id
      Session.set('githubOperation', x)
      $('#lookupInProgress').removeClass('active')
      $('#lookupID').attr('disabled', false)
    },
    error: (res) => {
      console.log(res)
      const x = Session.get('githubOperation')
      x.apiID = `Github user ${name} not found`
      Session.set('githubOperation', x)
      $('#lookupInProgress').removeClass('active')
      $('#lookupID').attr('disabled', false)
    },
  })
}

function createGithubTxn() {
  // Get transaction values from form
  const sigHash = document.getElementById('message').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // fail if neither checkbox has value
  if (!$('#gh_add').prop('checked') && !$('#gh_remove').prop('checked')) { return }
  let addorremove = ''
  // return message code for github action:
  // AA = add, AF = remove
  if ($('#gh_add').prop('checked')) { addorremove = '00' } else { addorremove = '01' }

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    if (getXMSSDetails().walletType === 'ledger') {
      $('#ledgerOtsKeyReuseDetected').modal('show')
    } else {
      $('#otsKeyReuseDetected').modal('show')
    }
    return
  }

  const userMessage = hexToBytes(`0F0F0003${addorremove}00000000`)
  const kbidBytes = Buffer.allocUnsafe(4)
  kbidBytes.writeUInt32BE(Session.get('githubOperation').apiID, 0)
  const sighashBytes = hexToBytes(sigHash)

  // Convert strings to bytes
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const messageBytes = Buffer.concat([userMessage, sighashBytes, kbidBytes])

  // Construct request
  const request = {
    message: messageBytes,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  // Store Session value of Github operation
  const x = Session.get('githubOperation')
  x.inProgress = true
  x.sigHash = sigHash
  x.QRLaddress = getXMSSDetails().address
  if (addorremove === '00') { x.addorremove = 'AA' } else { x.addorremove = 'AF' }
  Session.set('githubOperation', x)

  wrapMeteorCall('createGithubTxn', request, (err, res) => {
    if (err) {
      Session.set('messageCreationError', err.reason)
      $('#messageCreationFailed').show()
      $('#messageCreateForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        message: bytesToString(res.response.extended_transaction_unsigned.tx.message.message_hash),
        message_hex: bytesToHex(res.response.extended_transaction_unsigned.tx.message.message_hash),
        fee: res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey,
      }

      if (nodeReturnedValidResponse(request, confirmation, 'createGithubTxn')) {
        Session.set('messageCreationConfirmation', confirmation)
        Session.set('messageCreationConfirmationResponse', res.response)

        // Send to confirm page.
        const params = { }
        const path = FlowRouter.path('/tools/github/confirm', params)
        FlowRouter.go(path)
      } else {
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  validationRules.message = {
    id: 'message',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a message',
      },
      {
        type: 'regExp[/^[0-9a-fA-F]{134}$/]',
        prompt: 'The delegated public key should be 134 hex characters long',
      },
    ],
  }

  validationRules.gh_username = {
    id: 'gh_username',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a Github username',
      },
      {
        type: 'regExp[/^[a-z0-9_-]{1,16}$/]',
        prompt: 'The max length of a Github username is 16 characters.',
      },
    ],
  }

  // Now set fee and otskey validation rules
  validationRules.fee = {
    id: 'fee',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a fee',
      },
      {
        type: 'number',
        prompt: 'Fee must be a number',
      },
    ],
  }
  validationRules.otsKey = {
    id: 'otsKey',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter an OTS Key Index',
      },
      {
        type: 'number',
        prompt: 'OTS Key Index must be a number',
      },
    ],
  }
  validationRules.gh_action = {
    id: 'gh_action',
    rules: [
      {
        type: 'checked',
        prompt: 'You need to select a Github action',
      },
    ],
  }

  // Initliase the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.appGithubCreate.onRendered(() => {
  // Initialise dropdowns
  $('.ui.dropdown').dropdown()

  // Initialise Form Validation
  initialiseFormValidation()

  // set initial state
  const githubOperation = {
    addorremove: null,
    githubId: null,
    sigHash: null,
    enableTransaction: false,
    apiID: null,
    inProgress: false,
  }
  Session.set('githubOperation', githubOperation)

  // Get wallet balance
  getBalance(getXMSSDetails().address, () => {
    // Show warning is otsKeysRemaining is low
    if (Session.get('otsKeysRemaining') < 50) {
      // Shown low OTS Key warning modal
      $('#lowOtsKeyWarning').modal('transition', 'disable').modal('show')
    }
  })
})

Template.appGithubCreate.events({
  'submit #generateMessageForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createGithubTxn() }, 200)
  },
  'click #lookupID': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#lookupInProgress').addClass('active')
    $('#lookupID').attr('disabled', true)
    const x = Session.get('githubOperation')
    x.githubId = document.getElementById('gh_username').value
    Session.set('githubOperation', x)
    callGithubAPI(x.githubId)
  },
  'keyup #gh_username': () => {
    const x = Session.get('githubOperation')
    if (document.getElementById('gh_username').value !== x.githubId) {
      x.apiID = ''
      x.enableTransaction = false
      Session.set('githubOperation', x)
    }
  },
})

Template.appGithubCreate.helpers({
  ghID() {
    try {
      return Session.get('githubOperation').apiID
    } catch (e) {
      return ''
    }
  },
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
  transactionConfirmation() {
    const confirmation = Session.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = Session.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionConfirmationFee() {
    const transactionConfirmationFee = Session.get('transactionConfirmationFee')
    return transactionConfirmationFee
  },
  transactionGenerationError() {
    const error = Session.get('transactionGenerationError')
    return error
  },
  otsKeyEstimate() {
    const otsKeyEstimate = Session.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  otsKeysRemaining() {
    const otsKeysRemaining = Session.get('otsKeysRemaining')
    return otsKeysRemaining
  },
  messageCreationError() {
    const messageCreationError = Session.get('messageCreationError')
    return messageCreationError
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  ledgerWalletDisabled() {
    if (getXMSSDetails().walletType === 'ledger') {
      return 'disabled'
    }
    return ''
  },
  isLedgerWallet() {
    if (getXMSSDetails().walletType === 'ledger') {
      return true
    }
    return false
  },
  createButtonDisabled() {
    if (Session.get('githubOperation').enableTransaction === true) {
      return ''
    }
    return 'disabled'
  },
})
