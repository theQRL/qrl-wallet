/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import { BlazeLayout } from 'meteor/pwix:blaze-layout'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import { Tracker } from 'meteor/tracker'
import { isChecked, isVisible } from '../../lib/dom'
import { isElectrified } from '../../../startup/client/functions'

BlazeLayout.setRoot('body')

const connectToNode = (endpoint, callback) => {
  wrapMeteorCall('connectToNode', endpoint, (err, res) => {
    if (err) {
      callback(err, null)
    } else {
      callback(null, res)
    }
  })
}

const checkNetworkHealth = (network, callback) => {
  wrapMeteorCall('checkNetworkHealth', network, (err, res) => {
    if (err) {
      callback(err, null)
    } else {
      callback(null, res)
    }
  })
}

const normalizeEndpoint = (endpoint) => {
  if (typeof endpoint !== 'string') {
    return ''
  }
  return endpoint.trim()
}

const setNetworkSelect = (value) => {
  const fallback = DEFAULT_NETWORKS[0].id
  const nextValue = value || fallback
  const selectIds = ['network', 'networkMobile']

  selectIds.forEach((selectId) => {
    const networkSelect = document.getElementById(selectId)
    if (!networkSelect) return
    const hasOption = Array.from(networkSelect.options).some((option) => option.value === nextValue)
    networkSelect.value = hasOption ? nextValue : fallback
  })
}

const handleNetworkChange = (value) => {
  console.log('Network changed to:', value)
  updateNetwork(value)
  if (value !== 'add' && Session.get('cancellingNetwork') !== true) {
    // reload to update balances/Txs if on different network
    window.Reload._reload()
  }
  Session.set('cancellingNetwork', false)
}

const buildOtsTrackerData = () => {
  const otsBitfield = Session.get('otsBitfield')
  if (!otsBitfield || typeof otsBitfield !== 'object') {
    return { error: 'No OTS data available yet. Please wait for wallet state to refresh.' }
  }

  const sortedKeys = Object.keys(otsBitfield).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10)
  )
  if (sortedKeys.length === 0) {
    return { error: 'No OTS data available yet. Please wait for wallet state to refresh.' }
  }

  let usedCount = 0
  const cells = sortedKeys.map((key) => {
    const isUsed = Number(otsBitfield[key]) === 1
    if (isUsed) {
      usedCount += 1
    }
    return {
      key,
      isUsed,
    }
  })

  return {
    cells,
    totalCount: sortedKeys.length,
    usedCount,
    remainingCount: sortedKeys.length - usedCount,
    nextKey: Session.get('otsKeyEstimate'),
  }
}

// TODO: refactor this -- duplicate code used in ../mobile/mobile.js
// Set session state based on selected network node.
const updateNetwork = (selectedNetwork) => {
  let userNetwork = selectedNetwork

  // If no network is selected, default to mainnet
  if (selectedNetwork === '') {
    setNetworkSelect(DEFAULT_NETWORKS[0].id)
    userNetwork = DEFAULT_NETWORKS[0].id
  }

  Session.set('cancellingNetwork', false)

  // Update local node connection details
  switch (userNetwork) {
    case 'add': {
      // Show DaisyUI modal for adding custom node
      const modal = document.getElementById('addNodeModal')
      if (modal) modal.showModal()
      // Keep selector reflecting currently active node.
      setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)
      break
    }
    case 'custom': {
      const customNodeGrpc = normalizeEndpoint(LocalStore.get('customNodeGrpc'))
      if (!customNodeGrpc) {
        Session.set('nodeStatus', 'failed')
        Session.set('cancellingNetwork', true)
        setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)
        const modal = document.getElementById('addNodeModal')
        if (modal) modal.showModal()
        return
      }

      const nodeData = {
        id: 'custom',
        name: LocalStore.get('customNodeName'),
        disabled: '',
        explorerUrl: LocalStore.get('customNodeExplorerUrl'),
        type: 'both',
        grpc: customNodeGrpc,
      }

      Session.set('nodeId', 'custom')
      Session.set('nodeName', LocalStore.get('customNodeName'))
      Session.set('nodeGrpc', customNodeGrpc)
      Session.set('nodeExplorerUrl', LocalStore.get('customNodeExplorerUrl'))
      Session.set('nodeStatus', 'connecting')
      setNetworkSelect('custom')

      console.log('Connecting to custom remote gRPC node: ', nodeData.grpc)
      connectToNode(nodeData.grpc, (err) => {
        if (err) {
          console.log('Error: ', err)
          Session.set('nodeStatus', 'failed')
        } else {
          console.log('Custom gRPC client loaded: ', nodeData.grpc)
          Session.set('nodeStatus', 'ok')
        }
      })
      break
    }
    default: {
      const nodeData = findNetworkData(DEFAULT_NETWORKS, userNetwork)
      Session.set('nodeId', nodeData.id)
      Session.set('nodeName', nodeData.name)
      Session.set('nodeExplorerUrl', nodeData.explorerUrl)
      Session.set('nodeGrpc', nodeData.grpc)
      Session.set('nodeStatus', 'connecting')
      setNetworkSelect(nodeData.id)

      console.log('Connecting to network: ', nodeData.name)
      checkNetworkHealth(nodeData.id, (err, res) => {
        if (err) {
          console.log('the error: ', err)
          Session.set('nodeStatus', 'failed')
        } else {
          console.log('Connection to network is healthy: ', nodeData.id)
          Session.set('nodeStatus', 'ok')
        }
      })
      break
    }
  }
}

Template.appBody.onRendered(function onRendered() {
  Session.set('modalEventTriggered', false)

  setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)

  updateNetwork(selectedNetwork())

  this.autorun(() => {
    const nodeId = Session.get('nodeId') || DEFAULT_NETWORKS[0].id
    Tracker.afterFlush(() => {
      setNetworkSelect(nodeId)
    })
  })

  this._networkChangeHandler = (event) => {
    handleNetworkChange(event.target.value)
  }
  this._networkSelectElements = []
  ;['network', 'networkMobile'].forEach((selectId) => {
    const networkSelect = document.getElementById(selectId)
    if (networkSelect) {
      networkSelect.addEventListener('change', this._networkChangeHandler)
      this._networkSelectElements.push(networkSelect)
    }
  })

  // Debug log for web assembly support
  console.log('Web Assembly Supported: ', supportedBrowser())
})

Template.appBody.onDestroyed(function onDestroyed() {
  if (this._networkSelectElements && this._networkChangeHandler) {
    this._networkSelectElements.forEach((networkSelect) => {
      networkSelect.removeEventListener('change', this._networkChangeHandler)
    })
  }
})

Template.appBody.events({
  'click #openOtsTracker': (event) => {
    event.preventDefault()
    Session.set('otsTrackerData', buildOtsTrackerData())
    const otsModal = document.getElementById('otsTrackerModal')
    if (otsModal) {
      otsModal.showModal()
    }
  },
  'click #saveCustomNode': () => {
    // Save custom node settings
    const customNodeName = document.getElementById('customNodeName').value
    const customNodeGrpc = normalizeEndpoint(document.getElementById('customNodeGrpc').value)
    const customNodeExplorer = document.getElementById('customNodeExplorer').value

    if (!customNodeGrpc) {
      Session.set('nodeStatus', 'failed')
      document.getElementById('customNodeGrpc').focus()
      return
    }

    Session.set('nodeId', 'custom')
    Session.set('nodeName', customNodeName)
    Session.set('nodeGrpc', customNodeGrpc)
    Session.set('nodeExplorerUrl', customNodeExplorer)

    LocalStore.set('customNodeName', customNodeName)
    LocalStore.set('customNodeGrpc', customNodeGrpc)
    LocalStore.set('customNodeExplorerUrl', customNodeExplorer)
    LocalStore.set('customNodeCreated', true)

    // Close modal and select custom node
    const modal = document.getElementById('addNodeModal')
    if (modal) modal.close()

    setNetworkSelect('custom')

    updateNetwork('custom')
  },
  'click #cancelCustomNode': () => {
    const modal = document.getElementById('addNodeModal')
    if (modal) modal.close()

    // Revert selector to active node
    Session.set('cancellingNetwork', true)
    setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)
  },
  'close #addNodeModal': () => {
    const networkSelect = document.getElementById('network')
    if (networkSelect && networkSelect.value === 'add') {
      Session.set('cancellingNetwork', true)
      setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)
    }
  },
  'change #addressFormatCheckbox': () => {
    const checked = isChecked('addressFormatCheckbox')
    if (checked) {
      LocalStore.set('addressFormat', 'bech32')
    } else {
      LocalStore.set('addressFormat', 'hex')
    }
  },
  'click #sendAndReceiveButton': () => {
    // Three primary sections
    const transactionGenerateFieldVisible = isVisible('generateTransactionArea')
    const tokenBalancesTabVisible = isVisible('tokenBalancesTab')
    const receiveTabVisible = isVisible('receiveTab')

    // Completed transaction sections
    const tokenTransactionResultAreaVisible = isVisible('tokenTransactionResultArea')
    const transactionResultAreaVisible = isVisible('transactionResultArea')

    if (FlowRouter.getRouteName() === 'App.transfer') {
      if (
        (transactionGenerateFieldVisible === false)
        && (tokenBalancesTabVisible === false)
        && (receiveTabVisible === false)) {
        // If the user has completed the transaction, go back to send form.
        if (
          (tokenTransactionResultAreaVisible === true)
          || (transactionResultAreaVisible === true)) {
          // Check if the trasaction is confirmed on the network.
          const transactionConfirmed = Session.get('transactionConfirmed')
          if (transactionConfirmed === 'true') {
            const reloadPath = FlowRouter.path('/reloadTransfer', {})
            FlowRouter.go(reloadPath)
          } else {
            window.walletUi.showModal('#cancelWaitingForTransactionWarning', {
              onApprove: () => {
                window.walletUi.hideModal('#cancelWaitingForTransactionWarning')
                const reloadPath = FlowRouter.path('/reloadTransfer', {})
                FlowRouter.go(reloadPath)
              },
            })
          }
        } else {
          // Confirm with user they will lose progress of this transaction if they proceeed.
          window.walletUi.showModal('#cancelTransactionGenerationWarning', {
            onApprove: () => {
              window.walletUi.hideModal('#cancelTransactionGenerationWarning')
              const reloadPath = FlowRouter.path('/reloadTransfer', {})
              FlowRouter.go(reloadPath)
            },
          })
        }
      }
    }
  },
})


Template.appBody.helpers({
  walletStatus() {
    return Session.get('walletStatus')
  },
  addressFormat() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return 'BECH32'
    }
    return 'Hex'
  },
  inProgress() {
    if (Session.get('txstatus') === 'Pending') {
      return true
    }
    return false
  },
  balanceAmount() {
    if (Session.get('balanceAmount')) {
      return Session.get('balanceAmount')
    }
    return Session.get('transferFromBalance')
  },
  otsKeysRemaining() {
    if (Session.get('errorLoadingTransactions')) {
      return 'unknown'
    }
    return Session.get('otsKeysRemaining')

  },
  otsTrackerData() {
    return Session.get('otsTrackerData') || buildOtsTrackerData()
  },
  balanceSymbol() {
    return Session.get('balanceSymbol')
  },
  addressFormatChecked() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return 'checked'
    }
    return ''
  },
  nodeId() {
    if ((Session.get('nodeId') === '') || (Session.get('nodeId') === null)) {
      return DEFAULT_NETWORKS[0].id
    }
    return Session.get('nodeId')
  },
  nodeName() {
    if ((Session.get('nodeName') === '') || (Session.get('nodeName') === null)) {
      return DEFAULT_NETWORKS[0].name
    }
    return Session.get('nodeName')
  },
  nodeExplorerUrl() {
    if ((Session.get('nodeExplorerUrl') === '') || (Session.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  defaultNetworks() {
    const visibleNodes = []

    // Only return nodes specific to this (web/desktop/both).
    _.each(DEFAULT_NETWORKS, (node) => {
      // Desktop Electrified Clients
      if ((node.type === 'desktop') && (isElectrified())) {
        visibleNodes.push(node)
      // Web Non-Electrified Clients
      } else if ((node.type === 'web') && !isElectrified()) {
        visibleNodes.push(node)
      // Everything else
      } else if (node.type === 'both') {
        visibleNodes.push(node)
      }
    })

    return visibleNodes
  },
  connectionStatus() {
    const status = {}
    if (Session.get('nodeStatus') === 'connecting') {
      status.string = 'Connecting to'
      status.colour = 'yellow'
      status.connected = false
    } else if (Session.get('nodeStatus') === 'ok') {
      status.string = 'Connected to'
      status.colour = 'green'
      status.connected = true
    } else {
      status.string = 'Failed to connect to'
      status.colour = 'red'
      status.connected = false
    }
    return status
  },
  customNodeCreated() {
    if (Meteor.settings && Meteor.settings.public && Meteor.settings.public.lockCustomEndpoints) return false
    return LocalStore.get('customNodeCreated')
  },
  customNodeName() {
    return LocalStore.get('customNodeName')
  },
  lockCustomEndpoints() {
    return Meteor.settings && Meteor.settings.public && Meteor.settings.public.lockCustomEndpoints === true
  },

  /* Active Menu Item Helpers */
  menuNewWalletActive() {
    if (
      (FlowRouter.getRouteName() === 'App.home')
      || (FlowRouter.getRouteName() === 'App.create')
      || (FlowRouter.getRouteName() === 'App.createAddress')) {
      return 'active'
    }
    return ''
  },
  menuOpenWalletActive() {
    if (
      (FlowRouter.getRouteName() === 'App.open')
      || (FlowRouter.getRouteName() === 'App.opened')) {
      return 'active'
    }
    return ''
  },
  menuTransferActive() {
    if (
      (FlowRouter.getRouteName() === 'App.transfer')) {
      return 'active'
    }
    return ''
  },
  menuToolsActive() {
    if (FlowRouter.getRouteName()?.startsWith('App.tools') || 
        FlowRouter.getRouteName()?.startsWith('App.message') ||
        FlowRouter.getRouteName()?.startsWith('App.multisig')) {
      return 'active'
    }
    return ''
  },
  menuTokensActive() {
    if (
      (FlowRouter.getRouteName() === 'App.tokens')
      || (FlowRouter.getRouteName() === 'App.tokensView')
      || (FlowRouter.getRouteName() === 'App.tokensCreate')
      || (FlowRouter.getRouteName() === 'App.tokenCreationConfirm')
      || (FlowRouter.getRouteName() === 'App.tokenCreationResult')
      || (FlowRouter.getRouteName() === 'App.tokensTransfer')
      || (FlowRouter.getRouteName() === 'App.tokensTransferLoad')
      || (FlowRouter.getRouteName() === 'App.tokensTransferConfirm')
      || (FlowRouter.getRouteName() === 'App.tokensTransferResult')) {
      return 'active'
    }
    return ''
  },
  menuVerifyActive() {
    if (
      (FlowRouter.getRouteName() === 'App.verify')
      || (FlowRouter.getRouteName() === 'App.verifytxid')) {
      return 'active'
    }
    return ''
  },
  qrlWalletVersion() {
    return WALLET_VERSION
  },
  currentYear() {
    return new Date().getFullYear()
  },
})

Template.customNode.helpers({
  customNodeName() {
    return LocalStore.get('customNodeName')
  },
  customNodeGrpc() {
    return LocalStore.get('customNodeGrpc')
  },
  customNodeExplorer() {
    return LocalStore.get('customNodeExplorerUrl')
  },
  lockCustomEndpoints() {
    return Meteor.settings && Meteor.settings.public && Meteor.settings.public.lockCustomEndpoints === true
  },
})
