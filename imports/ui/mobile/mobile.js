/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import { BlazeLayout } from 'meteor/pwix:blaze-layout'
import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
import './mobile.html'
import { closeDialog, openDialog, resolve, setValue } from '../lib/dom'
import {
  isElectrified,
} from '../../startup/client/functions'

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

function setNetworkSelect(value) {
  setValue('network', value)
}

function currentPath() {
  FlowRouter.watchPathChange()
  const route = FlowRouter.current()
  return (route && route.path) || '/'
}

const updateNetwork = (selectedValue) => {
  let userNetwork = selectedValue

  if (selectedValue === '') {
    userNetwork = DEFAULT_NETWORKS[0].id
    setNetworkSelect(userNetwork)
  }

  Session.set('nodeStatus', 'connecting')

  switch (userNetwork) {
    case 'add': {
      openDialog('addNodeModal')
      break
    }
    case 'custom': {
      const customNodeGrpc = normalizeEndpoint(LocalStore.get('customNodeGrpc'))
      if (!customNodeGrpc) {
        Session.set('nodeStatus', 'failed')
        Session.set('cancellingNetwork', true)
        setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)
        openDialog('addNodeModal')
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

      console.log('Connecting to network: ', nodeData.name)
      checkNetworkHealth(nodeData.id, (err) => {
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

const tabHandler = (page) => {
  const output = {
    create: false,
    verify: true,
    open: false,
    close: true,
    tools: true,
    transfer: true,
  }

  if (page === '/create' || page === '/open' || page === '/' || page === '/close') {
    output.create = true
    output.verify = true
    output.open = true
    output.close = false
    output.transfer = false
    output.tools = false
  }

  if (Session.get('walletStatus').unlocked === false && page === '/verify') {
    output.create = true
    output.verify = true
    output.open = true
    output.close = false
    output.transfer = false
    output.tools = false
  }

  return output
}

function visibleTabs() {
  return tabHandler(currentPath())
}

Template.mobile.onRendered(() => {
  Session.set('cancellingNetwork', false)
  setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id)
  updateNetwork(selectedNetwork())
})

Template.mobile.events({
  'change #network': (event) => {
    const value = event.target.value
    updateNetwork(value)

    if (value !== 'add' && Session.get('cancellingNetwork') !== true) {
      window.Reload._reload()
    }
    Session.set('cancellingNetwork', false)
  },
  'click #saveCustomNode': () => {
    const customNodeNameField = resolve('customNodeName')
    const customNodeGrpcField = resolve('customNodeGrpc')
    const customNodeExplorerField = resolve('customNodeExplorer')

    const customNodeName = customNodeNameField ? customNodeNameField.value : ''
    const customNodeGrpc = customNodeGrpcField ? normalizeEndpoint(customNodeGrpcField.value) : ''
    const customNodeExplorer = customNodeExplorerField ? customNodeExplorerField.value : ''

    if (!customNodeGrpc) {
      Session.set('nodeStatus', 'failed')
      if (customNodeGrpcField) customNodeGrpcField.focus()
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

    setNetworkSelect('custom')
    closeDialog('addNodeModal')
    updateNetwork('custom')
  },
  'click #cancelCustomNode': () => {
    Session.set('cancellingNetwork', true)
    closeDialog('addNodeModal')
    setNetworkSelect(Session.get('nodeId') || DEFAULT_NETWORKS[0].id || 'mainnet')
  },
  'close #addNodeModal': () => {
    const network = resolve('network')
    if (network && network.value === 'add') {
      Session.set('cancellingNetwork', true)
      network.value = Session.get('nodeId') || DEFAULT_NETWORKS[0].id || 'mainnet'
    }
  },
})

Template.mobile.helpers({
  qrlWalletVersion() {
    return WALLET_VERSION
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

    _.each(DEFAULT_NETWORKS, (node) => {
      if ((node.type === 'desktop') && (isElectrified())) {
        visibleNodes.push(node)
      } else if ((node.type === 'web') && !isElectrified()) {
        visibleNodes.push(node)
      } else if (node.type === 'both') {
        visibleNodes.push(node)
      }
    })

    return visibleNodes
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
  connectionStatus() {
    if (Session.get('nodeStatus') === 'ok') {
      return { connected: true, label: 'Connected' }
    }
    if (Session.get('nodeStatus') === 'connecting') {
      return { connected: false, label: 'Connecting' }
    }
    return { connected: false, label: 'Disconnected' }
  },
  showNewWalletTab() {
    return visibleTabs().create
  },
  showOpenWalletTab() {
    return visibleTabs().open
  },
  showCloseWalletTab() {
    return visibleTabs().close
  },
  showTransferTab() {
    return visibleTabs().transfer
  },
  showToolsTab() {
    return visibleTabs().tools
  },
  showVerifyTab() {
    return visibleTabs().verify
  },
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
  menuCloseWalletActive() {
    if (
      (FlowRouter.getRouteName() === 'App.close')
      || (FlowRouter.getRouteName() === 'App.closed')) {
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
    const routeName = FlowRouter.getRouteName() || ''
    if (
      routeName.startsWith('App.tools')
      || routeName.startsWith('App.message')
      || routeName.startsWith('App.multisig')
      || routeName.startsWith('App.keybase')
      || routeName.startsWith('App.github')
      || routeName.startsWith('App.notarise')
      || routeName === 'App.addTokens'
      || routeName === 'App.NFT'
      || routeName === 'App.xmssIndexUpdate') {
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
})
