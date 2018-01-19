import './tokenCreate.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

const getBalance = (getAddress) => {
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    address: getAddress,
    grpc: grpcEndpoint,
  }

  Meteor.call('getAddress', request, (err, res) => {
    if (err) {
      // TODO - Error handling
    } else {
      if (res.state.address !== '') {
        LocalStore.set('transferFromBalance', res.state.balance / SHOR_PER_QUANTA)
        LocalStore.set('transferFromAddress', new TextDecoder('utf-8').decode(res.state.address))
      } else {
        // Wallet not found, put together an empty response
        LocalStore.set('transferFromBalance', 0)
        LocalStore.set('transferFromAddress', new TextDecoder('utf-8').decode(getAddress))
      }

      // Rudimentary way to set otsKey
      LocalStore.set('otsKeyEstimate', res.state.txcount)
    }
  })
}

function createTokenTxn() {
  // Get to/amount details
  const sendFrom = LocalStore.get('transferFromAddress')

  const owner = document.getElementById('owner').value
  const symbol = document.getElementById('symbol').value
  const name = document.getElementById('name').value
  const decimals = document.getElementById('decimals').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  let tokenHolders = []

  // Convert strings to bytes
  const binaryPublicKey = XMSS_OBJECT.getPK()
  const pubKey = new Uint8Array(binaryPublicKey.size())
  for (let i = 0; i < binaryPublicKey.size(); i += 1) {
    pubKey[i] = binaryPublicKey.get(i)
  }

  const sendFromBin = QRLLIB.str2bin(sendFrom)
  const sendFromAddress = new Uint8Array(sendFromBin.size())
  for (let i = 0; i < sendFromBin.size(); i += 1) {
    sendFromAddress[i] = sendFromBin.get(i)
  }

  const symbolBin = QRLLIB.str2bin(symbol)
  const symbolBytes = new Uint8Array(symbolBin.size())
  for (let i = 0; i < symbolBin.size(); i += 1) {
    symbolBytes[i] = symbolBin.get(i)
  }
  const nameBin = QRLLIB.str2bin(name)
  const nameBytes = new Uint8Array(nameBin.size())
  for (let i = 0; i < nameBin.size(); i += 1) {
    nameBytes[i] = nameBin.get(i)
  }
  const ownerBin = QRLLIB.str2bin(owner)
  const ownerAddress = new Uint8Array(ownerBin.size())
  for (let i = 0; i < ownerBin.size(); i += 1) {
    ownerAddress[i] = ownerBin.get(i)
  }



  // Collect Token Holders and create payload
  var initialBalancesAddress = document.getElementsByName("initialBalancesAddress[]")
  var initialBalancesAddressAmount = document.getElementsByName("initialBalancesAddressAmount[]")
  
  for (var i = 0; i < initialBalancesAddress.length; i++) {
    const holderAddressBin = QRLLIB.str2bin(initialBalancesAddress[i].value)
    const holderAddressBytes = new Uint8Array(holderAddressBin.size())
    for (let i = 0; i < holderAddressBin.size(); i += 1) {
      holderAddressBytes[i] = holderAddressBin.get(i)
    }

    const thisHolder = {
      address: holderAddressBytes,
      amount: initialBalancesAddressAmount[i].value * SHOR_PER_QUANTA
    }
     
    console.log(thisHolder)
    tokenHolders.push(thisHolder)
  }

  // Store which ots key index is being used for this transaction
  LocalStore.set('otsKeyIndex', otsKey)

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    addressFrom: sendFromAddress,
    owner: ownerAddress,
    symbol: symbolBytes,
    name: nameBytes,
    decimals: decimals,
    initialBalances: tokenHolders,
    fee: txnFee * SHOR_PER_QUANTA,
    xmssPk: pubKey,
    grpc: grpcEndpoint,
  }

  Meteor.call('createTokenTxn', request, (err, res) => {
    if (err) {
      LocalStore.set('tokenCreationError', err)
      $('#tokenCreationFailed').show()
      $('#tokenCreateForm').hide()
    } else {
      const confirmation = {
        hash: res.txnHash,
        from: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.addr_from),
        symbol: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.token.symbol),
        name: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.token.name),
        owner: new TextDecoder('utf-8').decode(res.response.transaction_unsigned.token.owner),
        decimals: res.response.transaction_unsigned.token.decimals,
        fee: res.response.transaction_unsigned.fee / SHOR_PER_QUANTA,
        initialBalances: res.response.transaction_unsigned.token.initial_balances,
        otsKey: otsKey,
      }

      LocalStore.set('tokenCreationConfirmation', confirmation)
      LocalStore.set('tokenCreationConfirmationResponse', res.response)

      // Send to confirm page.
      const params = { }
      const path = FlowRouter.path('/tokens/create/confirm', params)
      FlowRouter.go(path)
    }
  })
}

Template.appTokenCreate.onRendered(() => {
  $('.ui.dropdown').dropdown()
  const thisAddressBin = QRLLIB.str2bin(XMSS_OBJECT.getAddress())
  const thisAddressBytes = new Uint8Array(thisAddressBin.size())
  for (let i = 0; i < thisAddressBin.size(); i += 1) {
    thisAddressBytes[i] = thisAddressBin.get(i)
  }

  getBalance(thisAddressBytes)
})

Template.appTokenCreate.events({
  'click #addTokenHolder': (event) => {
    event.preventDefault()
    event.stopPropagation()

    const newTokenHolderHtml = `
      <div class="field">
        <label>Holder Balance</label>
        <div class="three fields">
          <div class="ten wide field">
            <input type="text" name="initialBalancesAddress[]" placeholder="Token Holder QRL Address">
          </div>
          <div class="five wide field">
            <input type="text" name="initialBalancesAddressAmount[]" placeholder="Token Balance">
          </div>
          <div class="one wide field">
            <button class="ui red button removeTokenHolder"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `;

    // Append newTokenHolderHtml to tokenHolders div
    $('#tokenHolders').append(newTokenHolderHtml)

  },
  'click .removeTokenHolder': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Remove the token holder
    $(event.currentTarget).parent().parent().parent().remove();
  },
  'submit #generateTokenForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()

    setTimeout(() => { createTokenTxn() }, 200)
  },
})

Template.appTokenCreate.helpers({
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = LocalStore.get('transferFromBalance')
    transferFrom.address = LocalStore.get('transferFromAddress')
    return transferFrom
  },
  transactionConfirmation() {
    const confirmation = LocalStore.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = LocalStore.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionConfirmationFee() {
    const transactionConfirmationFee = LocalStore.get('transactionConfirmationFee')
    return transactionConfirmationFee
  },
  transactionGenerationError() {
    const error = LocalStore.get('transactionGenerationError')
    return error
  },
  otsKeyEstimate() {
    const otsKeyEstimate = LocalStore.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})
