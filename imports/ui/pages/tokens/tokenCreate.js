import './tokenCreate.html'
/* global LocalStore */
/* global QRLLIB */
/* global selectedNode */
/* global XMSS_OBJECT */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global SHOR_PER_QUANTA */

function createTokenTxn() {
  // Get to/amount details
  const sendFrom = addressForAPI(LocalStore.get('transferFromAddress'))

  const owner = addressForAPI(document.getElementById('owner').value)
  const symbol = document.getElementById('symbol').value
  const name = document.getElementById('name').value
  const decimals = document.getElementById('decimals').value
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value

  let tokenHolders = []

  // Convert strings to bytes
  const pubKey = binaryToBytes(XMSS_OBJECT.getPK())
  const symbolBytes = stringToBytes(symbol)
  const nameBytes = stringToBytes(name)

  // Collect Token Holders and create payload
  var initialBalancesAddress = document.getElementsByName("initialBalancesAddress[]")
  var initialBalancesAddressAmount = document.getElementsByName("initialBalancesAddressAmount[]")
  
  for (var i = 0; i < initialBalancesAddress.length; i++) {
    const thisHolder = {
      address: addressForAPI(initialBalancesAddress[i].value),
      amount: initialBalancesAddressAmount[i].value * Math.pow(10, decimals)
    }

    tokenHolders.push(thisHolder)
  }

  // Construct request
  const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
  const request = {
    addressFrom: sendFrom,
    owner: owner,
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
        from: binaryToQrlAddress(res.response.transaction_unsigned.addr_from),
        symbol: bytesToString(res.response.transaction_unsigned.token.symbol),
        name: bytesToString(res.response.transaction_unsigned.token.name),
        owner: binaryToQrlAddress(res.response.transaction_unsigned.token.owner),
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

  getBalance(getXMSSDetails().address, function() {})
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
