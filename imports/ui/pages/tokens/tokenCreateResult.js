/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import JSONFormatter from 'json-formatter-js'
import './tokenCreateResult.html'
import qrlNft from '@theqrl/nft-providers'
import _ from 'underscore'

function setRawDetail() {
  const myJSON = Session.get('txhash').transaction
  const formatter = new JSONFormatter(myJSON)
  $('.json').html(formatter.render())
}

// Checks the result of a stored txhash object, and polls again if not completed or failed.
function checkResult(thisTxId, failureCount) {
  try {
    if (Session.get('txhash').transaction.header != null) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${Session.get('txhash').transaction.header.block_number} with 1 confirmation.`

      Session.set('txstatus', userMessage)
      $('.loading').hide()
      $('#loadingHeader').hide()
    } else if (Session.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if (failureCount < 5) {
        // eslint-disable-next-line no-use-before-define
        setTimeout(() => { pollTransaction(thisTxId, false, failureCount + 1) }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${Session.get('txhash').error}`
        Session.set('txstatus', errorMessage)
        $('.loading').hide()
        $('#loadingHeader').hide()
      }
    } else {
      // Poll again
      // eslint-disable-next-line no-use-before-define
      setTimeout(() => { pollTransaction(thisTxId) }, POLL_TXN_RATE)
    }
  } catch (err) {
    // Most likely is that the mempool is not replying the transaction.
    // We attempt to find it ongoing for a while
    console.log(`Caught Error: ${err}`)

    // Continue to check the txn status until POLL_MAX_CHECKS is reached in failureCount
    if (failureCount < POLL_MAX_CHECKS) {
      // eslint-disable-next-line no-use-before-define
      setTimeout(() => { pollTransaction(thisTxId, false, failureCount + 1) }, POLL_TXN_RATE)
    } else {
      // Transaction error - Give up
      Session.set('txstatus', 'Error')
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    Session.set('txhash', {})
  }

  Session.set('txstatus', 'Pending')

  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (thisTxId) {
    wrapMeteorCall('getTxnHash', request, (err, res) => {
      if (err) {
        if (failureCount < 60) {
          Session.set('txhash', { })
          Session.set('txstatus', 'Pending')
        } else {
          Session.set('txhash', { error: err, id: thisTxId })
          Session.set('txstatus', 'Error')
        }
        checkResult(thisTxId, failureCount)
      } else {
        res.error = null
        Session.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId, failureCount)
      }
    })
  }
}


Template.appTokenCreationResult.onRendered(() => {
  $('.ui.dropdown').dropdown()

  // Start polling this transcation
  pollTransaction(Session.get('transactionHash'), true)
})

Template.appTokenCreationResult.helpers({
  transactionHash() {
    const hash = Session.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const signature = Session.get('transactionSignature')
    return signature
  },
  transactionStatus() {
    const status = Session.get('txstatus')
    return status
  },
  transactionRelayedThrough() {
    const status = Session.get('transactionRelayedThrough')
    return status
  },
  verifiedProvider() {
    const details = Session.get('txhash').transaction.tx.token
    const nftBytes = Buffer.concat([
      Buffer.from(details.symbol),
      Buffer.from(details.name),
    ])
    const idBytes = Buffer.from(nftBytes.slice(4, 8))
    const id = Buffer.from(idBytes).toString('hex')
    const from = rawToHexOrB32(Buffer.from(details.owner))
    let known = false
    _.each(qrlNft.providers, (provider) => {
      if (provider.id === `0x${id}`) {
        _.each(provider.addresses, (address) => {
          if (address === from) {
            known = true
          }
        })
      }
    })
    return known
  },
  detailsNFT() {
    const details = Session.get('txhash').transaction.tx.token
    const nftBytes = Buffer.concat([
      Buffer.from(details.symbol),
      Buffer.from(details.name),
    ])
    const idBytes = Buffer.from(nftBytes.slice(4, 8))
    const cryptoHashBytes = Buffer.from(nftBytes.slice(8, 40))
    const id = Buffer.from(idBytes).toString('hex')
    let name = ''
    _.each(qrlNft.providers, (provider) => {
      if (provider.id === `0x${id}`) {
        name = provider.name
      }
    })
    return {
      name,
      id,
      hash: Buffer.from(cryptoHashBytes).toString('hex'),
    }
  },
  isNFT() {
    const details = Session.get('txhash').transaction.tx.token
    console.log(details)
    const symbolTest = Buffer.from(
      details.symbol
    ).toString('hex')
    if (symbolTest.slice(0, 8) === '00ff00ff') {
      return true
    }
    return false
  },
  tokenDetails() {
    const details = Session.get('txhash').transaction.tx.token
    details.owner = rawToHexOrB32(Buffer.from(details.owner))
    details.symbol = bytesToString(details.symbol)
    details.name = bytesToString(details.name)
    return details
  },
  tokenHolders() {
    const tokenHoldersRaw = Session.get('txhash').transaction.tx.token.initial_balances
    const tokenDecimals = Session.get('txhash').transaction.tx.token.decimals
    const tokenHolders = []
    for (let i = 0; i < tokenHoldersRaw.length; i += 1) {
      const thisHolder = {
        address: rawToHexOrB32(Buffer.from(tokenHoldersRaw[i].address)),
        amount: tokenHoldersRaw[i].amount / Math.pow(10, tokenDecimals), // eslint-disable-line
      }
      tokenHolders.push(thisHolder)
    }
    return tokenHolders
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
})

Template.appTokenCreationResult.events({
  'click .jsonclick': () => {
    if (!($('.json').html())) {
      setRawDetail()
    }
    $('.jsonbox').toggle()
  },
})
