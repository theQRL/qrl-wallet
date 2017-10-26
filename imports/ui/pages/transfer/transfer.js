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

  const request = {
    address: address
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      console.log('error: ' + err)
      $('#unlocking').hide()
      $('#unlockError').show()
    } else {
      console.log(res)
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / 100000000) // FIXME - Magic Number
        LocalStore.set('transferFromAddress', new TextDecoder("utf-8").decode(res.state.address))
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', new TextDecoder("utf-8").decode(address))
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

    const thisAddressBin = QRLLIB.str2bin(thisAddress)
    var thisAddressBytes = new Uint8Array(thisAddressBin.size());
    for(var i=0; i<thisAddressBin.size(); i++) {
      thisAddressBytes[i] = thisAddressBin.get(i)
    }

    const walletDetail = {
      address: thisAddressBytes,
      addressString: thisAddress,
      hexSeed: thisHexSeed,
      mnemonicPhrase: thisMnemonic,
    }

    console.log(walletDetail)

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
  const sendFrom = LocalStore.get('transferFromAddress')
  const sendTo = document.getElementById('to').value
  const sendAmount = document.getElementById('amount').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  // const otsKey = xmss.getIndex()

  const binaryPublicKey = xmss.getPK()
  let pubKey = new Uint8Array(binaryPublicKey.size());
  for(var i=0; i<binaryPublicKey.size(); i++) {
    pubKey[i] = binaryPublicKey.get(i)
  }

  const sendFromBin = QRLLIB.str2bin(sendFrom)
  var sendFromAddress = new Uint8Array(sendFromBin.size());
  for(var i=0; i<sendFromBin.size(); i++) {
    sendFromAddress[i] = sendFromBin.get(i)
  }

  const sendToBin = QRLLIB.str2bin(sendTo)
  var sendToAddress = new Uint8Array(sendToBin.size());
  for(var i=0; i<sendToBin.size(); i++) {
    sendToAddress[i] = sendToBin.get(i)
  }
  

  // Construct request
  const request = {
    fromAddress: sendFromAddress,
    toAddress: sendToAddress,
    amount: sendAmount * 100000000, // Fixme - Magic Number
    fee: txnFee,
    xmssPk: pubKey,
    xmssOtsKey: otsKey,
  }

  console.log('txn request')
  console.log(request)

  Meteor.call('transferCoins', request, (err, res) => {
    if (err) {
      console.log('error: ' + err)
      LocalStore.set('transactionGenerationError', err)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      console.log('success')
      console.log(res)

      const confirmation = {
        from: new TextDecoder("utf-8").decode(res.transaction_unsigned.addr_from),
        to: new TextDecoder("utf-8").decode(res.transaction_unsigned.transfer.addr_to),
        amount: res.transaction_unsigned.transfer.amount,
        fee: res.transaction_unsigned.transfer.fee,
        otsKey: res.transaction_unsigned.ots_key,
      }

      LocalStore.set('transactionConfirmation', confirmation)
      LocalStore.set('transactionConfirmationAmount', res.transaction_unsigned.transfer.amount / 100000000) // Fixme - Magic Number
      LocalStore.set('transactionConfirmationResponse', res)

      $('#transactionConfirmation').show()
      $('#transferForm').hide()
    }
  })
}

function confirmTransaction() {
  console.log('confirming txn')

  const seedBin = QRLLIB.hstr2bin(LocalStore.get('walletDetail').hexSeed)
  // Instantiate XMSS
  let xmss = new QRLLIB.Xmss(seedBin, 10)

  let tx = LocalStore.get('transactionConfirmationResponse')

  console.log('tx before sign')
  console.log(tx)

  let hashToSign = tx.transaction_unsigned.transaction_hash
  hashToSign = new QRLLIB.str2bin(hashToSign)

  console.log('hash to sign')
  console.log(hashToSign)


  const signedHash = xmss.sign(hashToSign)

  var signedHashJS = new Uint8Array(signedHash.size());
  for(var i=0; i<signedHash.size(); i++) {
    signedHashJS[i] = signedHash.get(i)
  }

  tx.transaction_unsigned.signature = signedHashJS


  console.log('tx after sign')
  console.log(tx)


  Meteor.call('confirmTransaction', tx, (err, res) => {
    if (res.error) {
      console.log('error: ' + res.error)

      $('#transactionConfirmation').hide()
      $('#transactionFailed').show()

      LocalStore.set('transactionFailed', res.error)
    } else {
      console.log('success')
      console.log(res.response)

      LocalStore.set('transactionHash', res.response.txnHash)

      $('#transactionConfirmation').hide()
      $('#transactionComplete').show()
    }
  })

}



function cancelTransaction() {
  LocalStore.set('transactionConfirmation', '')
  LocalStore.set('transactionConfirmationAmount', '')
  LocalStore.set('transactionConfirmationResponse', '')

  LocalStore.set('transactionFailed', "User requested cancellation")

  $('#transactionConfirmation').hide()
  $('#transactionFailed').show()
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
    $('#generating').show()
    setTimeout(function () { generateTransaction() }, 200)
  },
  'click #confirmTransaction': function (event) {
    $('#relaying').show()
    $('#relayingmsg').show()
    setTimeout(function () { confirmTransaction() }, 200)
  },
  'click #cancelTransaction': function (event) {
    cancelTransaction()
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
  transactionConfirmation() {
    const confirmation = LocalStore.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = LocalStore.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionGenerationError() {
    const error = LocalStore.get('transactionGenerationError')
    return error
  },
  transactionComplete () {
    const complete = LocalStore.get('transactionComplete')
    return complete
  },
  transactionFailed() {
    const failed = LocalStore.get('transactionFailed')
    return failed
  },
  transactionHash() {
    const hash = LocalStore.get('transactionHash')
    return hash
  }
})
