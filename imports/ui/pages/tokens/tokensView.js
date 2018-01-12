import './tokensView.html'


let tokensHeld = []

const getTokenBalances = (getAddress) => {
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
        // Now for each res.state.token we find, go discover token name and symbol
        for (let i in res.state.tokens) {
          const tokenHash = i
          const tokenBalance = res.state.tokens[i]
          let thisToken = {}

          const grpcEndpoint = findNodeData(DEFAULT_NODES, selectedNode()).grpc
          const request = {
            query: tokenHash,
            grpc: grpcEndpoint,
          }

          Meteor.call('getTxnHash', request, (err, res) => {
            if (err) {
              // TODO - Error handling here
            } else {
              // Check if this is a token hash.
              if (res.transaction.tx.type !== "TOKEN") {
                // TODO - Error handling here
              } else {
                let tokenDetails = res.transaction.tx.token

                thisToken.hash = tokenHash
                thisToken.name = new TextDecoder('utf-8').decode(tokenDetails.name)
                thisToken.symbol = new TextDecoder('utf-8').decode(tokenDetails.symbol)
                thisToken.balance = tokenBalance / SHOR_PER_QUANTA

                tokensHeld.push(thisToken)

                console.log(tokensHeld)

                LocalStore.set('tokensHeld', tokensHeld)
              }
            }
          })
        }

        // When done hide loading section
        $('#loading').hide()
      } else {
        // Wallet not found, put together an empty response
      }
    }
  })
}


Template.appTokensView.helpers({
  walletStatus() {
    return LocalStore.get('walletStatus')
  },
  tokensHeld() {
    return LocalStore.get('tokensHeld')
  },
})


Template.appTokensView.onRendered(() => {
  LocalStore.set('tokensHeld', '')

  // If there is no wallet currently opened, send back to home.
  if (LocalStore.get('walletStatus').unlocked == false) {
    const params = {}
    const path = FlowRouter.path('/', params)
    FlowRouter.go(path)
  }

  const thisAddressBin = QRLLIB.str2bin(XMSS_OBJECT.getAddress())
  const thisAddressBytes = new Uint8Array(thisAddressBin.size())
  for (let i = 0; i < thisAddressBin.size(); i += 1) {
    thisAddressBytes[i] = thisAddressBin.get(i)
  }

  getTokenBalances(thisAddressBytes)
})