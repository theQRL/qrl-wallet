import './transfer.html'
/* global LocalStore */
/* global QRLLIB */

Template.appTransfer.onRendered(() => {
  $('.ui.dropdown').dropdown()
  // Transfer validation
  $('.ui.form').form({
    fields: {
      to: {
        identifier: 'to',
        rules: [
          {
            type: 'empty',
            prompt: 'Please enter the QRL address you wish to send to',
          },
          {
            type: 'exactLength[73]',
            prompt: 'QRL address must be exactly 73 characters',
          },
        ],
      },
      amount: {
        identifier: 'amount',
        rules: [
          {
            type: 'empty',
            prompt: 'You must enter an amount of QRL to send',
          },
          {
            type: 'number',
            prompt: 'QRL Amount must be a number',
          },
        ],
      },
    },
  })
})

const getBalance = function (address) {
  const apiUrl = LocalStore.get('nodeApiUrl')
  HTTP.call('GET', `${apiUrl}api/address/${address}`, {}, (error, result) => {
    if (!error) {
      if (result.data.status !== 'error') {
        LocalStore.set('transferFromBalance', result.data.state.balance)
        LocalStore.set('transferFromAddress', result.data.state.address)
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', result.data.parameter)
      }

      $('#unlocking').hide()
      $('#addressFields').hide()
      $('#transferQrl').hide()
      $('#transferForm').show()
      $('#unlockError').hide()
    } else {
      $('#unlocking').hide()
      $('#unlockError').show()
    }
  })
}

function viewWallet(walletType) {
  try {
    const userBinSeed = document.getElementById('walletCode').value
    let thisSeedBin

    // Generate binary seed
    if (walletType === 'hexseed') {
      thisSeedBin = QRLLIB.hstr2bin(userBinSeed)
    } else if (walletType === 'mnemonic') {
      thisSeedBin = QRLLIB.mnemonic2bin(userBinSeed)
    }

    const thisHexSeed = QRLLIB.bin2hstr(thisSeedBin)
    const thisMnemonic = QRLLIB.bin2mnemonic(thisSeedBin)

    let xmss = new QRLLIB.Xmss(thisSeedBin, 10)
    const thisAddress = xmss.getAddress()

    const walletDetail = {
      address: thisAddress,
      hexSeed: thisHexSeed,
      mnemonicPhrase: thisMnemonic,
    }

    LocalStore.set('walletDetail', walletDetail)

    getBalance(walletDetail.address)
  } catch (error) {
    $('#unlockError').show()
    $('#unlocking').hide()
  }
}

function signTrasnaction() {
  // Generate binary seed from hexseed
  const seedBin = QRLLIB.hstr2bin(LocalStore.get('walletDetail').hexSeed)
  // Instantiate XMSS
  let xmss = new QRLLIB.Xmss(seedBin, 10)

  // Get to/amount details
  const sendTo = document.getElementById('to').value
  const sendAmount = document.getElementById('amount').value

  // Construct binary form of message to sign
  const rawMessage = [
    LocalStore.get('transferFromAddress'),
    sendTo,
    sendAmount,
  ].join('')

  const transactionToSign = new QRLLIB.str2bin(rawMessage)

  LocalStore.set('signatureIndex', xmss.getIndex())
  const signedMessage = xmss.sign(transactionToSign)
  LocalStore.set('signedMessage', QRLLIB.bin2hstr(signedMessage))

  $('#messageSignature').show()
}

Template.appTransfer.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    const walletType = document.getElementById('walletType').value
    setTimeout(function () { viewWallet(walletType) }, 200)
  },
  'submit #transfer': function (event) {
    event.preventDefault()
    event.stopPropagation()
    signTrasnaction()
    return false
  },
})

Template.appTransfer.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
  signatureIndex() {
    const signatureIndex = LocalStore.get('signatureIndex')
    return signatureIndex
  },
  signedMessage() {
    const signedMessage = LocalStore.get('signedMessage')
    return signedMessage
  },
})
