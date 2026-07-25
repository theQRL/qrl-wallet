import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './tx.html'

const TX_ID_HEX_REGEX = /^[a-f0-9]{64}$/i
const PUBLIC_EXPLORER_TX_BASE_URL = 'https://explorer.theqrl.org/tx/'

const resolveUsdAmount = () => {
  const txhash = Session.get('txhash')
  const qrlPrice = Number(Session.get('qrlValue'))

  if (!txhash || !txhash.transaction || !txhash.transaction.tx || !Number.isFinite(qrlPrice) || qrlPrice <= 0) {
    return null
  }

  const txAmount = Number(txhash.transaction.tx.amount)
  if (!Number.isFinite(txAmount)) {
    return null
  }

  const usdAmount = qrlPrice * txAmount
  if (!Number.isFinite(usdAmount)) {
    return null
  }

  return usdAmount.toFixed(2)
}

Template.appVerifyTxid.onRendered(() => {
  Session.set('txhash', { loading: true })
  Session.set('qrlValue', null)
  Session.set('status', {})

  const thisTxId = (FlowRouter.getParam('txId') || '').trim()
  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (!TX_ID_HEX_REGEX.test(thisTxId)) {
    Session.set('txhash', {
      found: false,
      loading: false,
      id: thisTxId,
      error: 'Invalid transaction ID. Please enter a 64-character hexadecimal hash.',
    })
    return
  }

  wrapMeteorCall('txhash', request, (err, res) => {
    if (err) {
      console.log(err)
      Session.set('txhash', {
        found: false,
        loading: false,
        id: thisTxId,
        error: err.message || 'Unable to verify this transaction right now.',
      })
      return
    }

    if (!res || typeof res !== 'object') {
      Session.set('txhash', {
        found: false,
        loading: false,
        id: thisTxId,
        error: 'Unable to verify this transaction right now.',
      })
      return
    }

    Session.set('txhash', { ...res, loading: false, id: thisTxId })
  })

  Meteor.call('QRLvalue', (err, res) => {
    if (err) {
      Session.set('qrlValue', null)
      return
    }

    const price = Number(res)
    Session.set('qrlValue', Number.isFinite(price) && price > 0 ? price : null)
  })

  wrapMeteorCall('status', { network: request.network }, (err, res) => {
    if (err) {
      Session.set('status', { error: err })
    } else {
      Session.set('status', res)
    }
  })
})


Template.appVerifyTxid.helpers({
  isLoading() {
    const txhash = Session.get('txhash') || {}
    return txhash.loading === true
  },
  hasError() {
    const txhash = Session.get('txhash') || {}
    return Boolean(txhash.error)
  },
  error() {
    const txhash = Session.get('txhash') || {}
    return txhash.error
  },
  id() {
    const txhash = Session.get('txhash') || {}
    return txhash.id || (FlowRouter.getParam('txId') || '')
  },
  explorerTransactionUrl() {
    const txId = (FlowRouter.getParam('txId') || '').trim()
    if (!TX_ID_HEX_REGEX.test(txId)) {
      return null
    }
    return `${PUBLIC_EXPLORER_TX_BASE_URL}${txId}`
  },
  hasMessage() {
    try {
      if (this.tx.transfer.message_data.length > 0) {
        return true
      }
      return false
    } catch (e) {
      return false
    }
  },
  tfMessage() {
    return this.tx.transfer.message_data
  },
  tx() {
    try {
      const txhash = Session.get('txhash').transaction
      return txhash
    } catch (e) {
      return false
    }
  },
  bech32() {
    if (Session.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  notFound() {
    const txhash = Session.get('txhash') || {}
    if (txhash.found === false && !txhash.error) {
      return true
    }
    return false
  },
  header() {
    return Session.get('txhash').transaction.header
  },
  hasUsdAmount() {
    return Boolean(resolveUsdAmount())
  },
  usdAmount() {
    return resolveUsdAmount()
  },
  amount() {
    try {
      if (this.tx.coinbase) {
        return numberToString(this.tx.coinbase.amount / SHOR_PER_QUANTA)
      }
      if (this.tx.transactionType === 'transfer') {
        return `${numberToString(this.tx.transfer.totalTransferred)} Quanta`
      }
      if (this.tx.transactionType === 'transfer_token') {
        return `${numberToString(this.tx.transfer_token.totalTransferred)} ${this.tx.transfer_token.symbol}`
      }
      return ''
    } catch (e) {
      return false
    }
  },
  isConfirmed() {
    try {
      if (this.header.block_number !== null) {
        return true
      }
      return false
    } catch (e) {
      return false
    }
  },
  confirmations() {
    const x = Session.get('status')
    try {
      return x.node_info.block_height - this.header.block_number
    } catch (e) {
      return 0
    }
  },
  ts() {
    const x = moment.unix(this.header.timestamp_seconds)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  color() {
    try {
      if (this.tx.transactionType === 'coinbase') {
        return 'badge-info'
      }
      if (this.tx.transactionType === 'stake') {
        return 'badge-error'
      }
      if (this.tx.transactionType === 'transfer') {
        return 'badge-warning'
      }
      return 'badge-primary'
    } catch (e) {
      return false
    }
  },
  badgeClass() {
    try {
      if (this.explorer.type === 'TRANSFER') return 'badge-pill-transfer'
      if (this.explorer.type === 'TRANSFER TOKEN') return 'badge-pill-token'
      if (this.explorer.type === 'CREATE TOKEN') return 'badge-pill-token'
      if (this.explorer.type === 'COINBASE') return 'badge-pill-coinbase'
      if (this.explorer.type === 'MESSAGE' || this.explorer.type === 'DOCUMENT_NOTARISATION') return 'badge-pill-message'
      if (this.explorer.type === 'SLAVE') return 'badge-pill-slave'
      if (this.explorer.type === 'LATTICE PK') return 'badge-pill-lattice'
      return 'badge-pill-multisig'
    } catch (e) {
      return 'badge-pill-transfer'
    }
  },
  borderClass() {
    try {
      if (this.explorer.type === 'TRANSFER') return 'border-type-transfer'
      if (this.explorer.type === 'TRANSFER TOKEN') return 'border-type-token'
      if (this.explorer.type === 'CREATE TOKEN') return 'border-type-token'
      if (this.explorer.type === 'COINBASE') return 'border-type-coinbase'
      if (this.explorer.type === 'MESSAGE' || this.explorer.type === 'DOCUMENT_NOTARISATION') return 'border-type-message'
      if (this.explorer.type === 'SLAVE') return 'border-type-slave'
      if (this.explorer.type === 'LATTICE PK') return 'border-type-lattice'
      return 'border-type-multisig'
    } catch (e) {
      return 'border-type-transfer'
    }
  },
  isToken() {
    try {
      if (this.explorer.type === 'CREATE TOKEN') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isTransfer() {
    try {
      if (this.explorer.type === 'TRANSFER') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isTokenTransfer() {
    try {
      if (this.explorer.type === 'TRANSFER TOKEN') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isNotCoinbase() {
    try {
      if (this.explorer.type !== 'COINBASE') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isMessage() {
    try {
      if (this.explorer.type === 'MESSAGE') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isDocumentNotarisation() {
    try {
      if (this.explorer.type === 'DOCUMENT_NOTARISATION') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isMultiSigCreateTxn() {
    try {
      if (this.explorer.type === 'MULTISIG_CREATE') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isMultiSigVoteTxn() {
    try {
      if (this.explorer.type === 'MULTISIG_VOTE') {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  isNotMessage() {
    try {
      if ((this.explorer.type !== 'MESSAGE') && (this.explorer.type !== 'DOCUMENT_NOTARISATION')) {
        return true
      }
    } catch (e) {
      return false
    }
    return false
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  multiSigSignatories(ms) {
    const output = []
    if (ms) {
      _.each(ms.signatories, (item, index) => {
        output.push({ address_hex: `Q${item}`, weight: ms.weights[index] })
      })
      return output
    }
    return false
  },
})
