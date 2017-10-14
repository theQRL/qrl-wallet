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
  Meteor.call('getAddress', address, (err, res) => {
    if (err) {
      console.log('error: ' + err)
      $('#unlocking').hide()
      $('#unlockError').show()
    } else {
      console.log(res)
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / 100000000) // FIXME - Magic Number
        LocalStore.set('transferFromAddress', res.state.address)
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', address)
      }
      $('#transferQrl').hide()
      $('#transferForm').show()
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

function generateTransaction() {
  // Generate binary seed from hexseed
  const seedBin = QRLLIB.hstr2bin(LocalStore.get('walletDetail').hexSeed)
  // Instantiate XMSS
  let xmss = new QRLLIB.Xmss(seedBin, 10)

  // Get to/amount details
  const sendTo = document.getElementById('to').value
  const sendAmount = document.getElementById('amount').value
  const txnFee = 0
  const pk = QRLLIB.bin2hstr(xmss.getPK())
  const otsKey = xmss.getIndex()

  // Construct request
  const request = {
    fromAddress: LocalStore.get('transferFromAddress'),
    toAddress: sendTo,
    amount: sendAmount,
    fee: txnFee,
    xmssPk: pk,
    xmssOtsKey: otsKey,
  }

  Meteor.call('transferCoins', request, (err, res) => {
    if (err) {
      console.log('error: ' + err)
      LocalStore.set('signedMessage', err)
      $('#messageSignature').show()
    } else {
      console.log('success')
      LocalStore.set('signedMessage', res)
      $('#messageSignature').show()
    }
  })







  /*
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
  */
}

Template.appTransfer.events({
  'click #unlockButton': () => {
    $('#unlocking').show()
    const walletType = document.getElementById('walletType').value
    setTimeout(function () { viewWallet(walletType) }, 200)
  },
  'submit #generateTransactionForm': function (event) {
    event.preventDefault()
    event.stopPropagation()
    generateTransaction()
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
