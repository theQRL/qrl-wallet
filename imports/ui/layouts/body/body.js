/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import './body.html'
import './customNode.html'
import '../../stylesheets/overrides.css'
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

// TODO: refactor this -- duplicate code used in ../mobile/mobile.js
// Set session state based on selected network node.
const updateNetwork = (selectedNetwork) => {
  let userNetwork = selectedNetwork

  // If no network is selected, default to mainnet
  if (selectedNetwork === '') {
    $('#networkDropdown').dropdown('set selected', DEFAULT_NETWORKS[0].id)
    userNetwork = DEFAULT_NETWORKS[0].id
  }

  // Set node status to connecting
  Session.set('nodeStatus', 'connecting')

  Session.set('cancellingNetwork', false)

  // Update local node connection details
  switch (userNetwork) {
    case 'add': {
      $('#addNode').modal({
        onDeny: () => {
          Session.set('modalEventTriggered', true)
          Session.set('cancellingNetwork', true)
          $('#networkDropdown').dropdown('set selected', 'mainnet')
        },
        onApprove: () => {
          Session.set('nodeId', 'custom')
          Session.set('nodeName', document.getElementById('customNodeName').value)
          Session.set('nodeGrpc', document.getElementById('customNodeGrpc').value)
          Session.set('nodeExplorerUrl', document.getElementById('customNodeExplorer').value)

          LocalStore.set('customNodeName', document.getElementById('customNodeName').value)
          LocalStore.set('customNodeGrpc', document.getElementById('customNodeGrpc').value)
          LocalStore.set('customNodeExplorerUrl', document.getElementById('customNodeExplorer').value)

          LocalStore.set('customNodeCreated', true)
          Session.set('modalEventTriggered', true)

          $('#networkDropdown').dropdown('refresh')

          // Hacky workaround to https://github.com/Semantic-Org/Semantic-UI/issues/2247
          setTimeout(() => {
            $('#networkDropdown').dropdown('set selected', 'custom')
          }, 100)
        },
        onHide: () => {
          // onHide is triggered even after onApprove and onDeny.
          // In those events, we set a LocalStorage value which we use inside here
          // so that we only trigger when the modal is hidden without an approval or denial
          // eg: pressing esc

          // If the modal is hidden without approval, revert to mainnet
          if (Session.get('modalEventTriggered') === false) {
            $('#networkDropdown').dropdown('set selected', 'mainnet')
          }

          // Reset modalEventTriggered
          Session.set('modalEventTriggered', false)
        },
      }).modal('show')
      break
    }
    case 'custom': {
      const nodeData = {
        id: 'custom',
        name: LocalStore.get('customNodeName'),
        disabled: '',
        explorerUrl: LocalStore.get('customNodeExplorerUrl'),
        type: 'both',
        grpc: LocalStore.get('customNodeGrpc'),
      }

      Session.set('nodeId', 'custom')
      Session.set('nodeName', LocalStore.get('customNodeName'))
      Session.set('nodeGrpc', LocalStore.get('customNodeGrpc'))
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

Template.appBody.onRendered(() => {
  Session.set('modalEventTriggered', false)

  $('#networkDropdown').dropdown({ allowReselection: true })
  $('.small.modal').modal()

  updateNetwork(selectedNetwork())

  // Hide wallet warning on electrified clients
  if (isElectrified()) {
    $('#walletWarning').hide()
  } else {
    // Show walletWarning at top. This needs to be here twice or it doesn't work onload
    $('#walletWarning').sticky({ context: '#walletWarning' })
    $('#walletWarning').sticky({ context: '#walletWarning' })
  }

  /*
   * Replace all SVG images with inline SVG
   */
  jQuery('img.svg').each(function () {
    const $img = jQuery(this)
    const imgID = $img.attr('id')
    const imgClass = $img.attr('class')
    const imgURL = $img.attr('src')

    jQuery.get(imgURL, function (data) {
      // Get the SVG tag, ignore the rest
      let $svg = jQuery(data).find('svg')

      // Add replaced image's ID to the new SVG
      if (typeof imgID !== 'undefined') {
        $svg = $svg.attr('id', imgID)
      }
      // Add replaced image's classes to the new SVG
      if (typeof imgClass !== 'undefined') {
        $svg = $svg.attr('class', imgClass+' replaced-svg')
      }

      // Remove any invalid XML tags as per http://validator.w3.org
      $svg = $svg.removeAttr('xmlns:a')

      // Check if the viewport is set, if the viewport is not set the SVG wont't scale.
      if (!$svg.attr('viewBox') && $svg.attr('height') && $svg.attr('width')) {
        $svg.attr('viewBox', '0 0 ' + $svg.attr('height') + ' ' + $svg.attr('width'))
      }

      // Replace image with new SVG
      $img.replaceWith($svg)
    }, 'xml')
  })

  // Debug log for web assembly support
  console.log('Web Assembly Supported: ', supportedBrowser())

  // Show warning if web assembly is not supported.
  if (!supportedBrowser()) {
    $('#webassemblyWarning').modal('show')
  }
})

Template.appBody.events({
  'click .main-content-warning .right .item': () => {
    $('.main-content-wrapper').css('padding-top', '0')
    $('.main-content-warning').hide('slow')
  },
  'click #hamburger': (event) => {
    event.preventDefault()
    $('.sidebar').sidebar('show')
  },
  'change #network': (event) => {
    console.log(event)
    updateNetwork(selectedNetwork())
    if (event.target.value !== 'add' && Session.get('cancellingNetwork') !== true) {
      // reload to update balances/Txs if on different network
      window.Reload._reload()
    }
    Session.set('cancellingNetwork', false)
  },
  'change #addressFormatCheckbox': () => {
    const checked = $('#addressFormatCheckbox').prop('checked')
    if (checked) {
      LocalStore.set('addressFormat', 'bech32')
    } else {
      LocalStore.set('addressFormat', 'hex')
    }
  },
  'click #sendAndReceiveButton': () => {
    // Three primary sections
    const transactionGenerateFieldVisible = $('#generateTransactionArea').is(':visible')
    const tokenBalancesTabVisible = $('#tokenBalancesTab').is(':visible')
    const receiveTabVisible = $('#receiveTab').is(':visible')

    // Completed transaction sections
    const tokenTransactionResultAreaVisible = $('#tokenTransactionResultArea').is(':visible')
    const transactionResultAreaVisible = $('#transactionResultArea').is(':visible')

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
            $('#cancelWaitingForTransactionWarning').modal('transition', 'disable')
              .modal({
                onApprove: () => {
                  $('#cancelWaitingForTransactionWarning').modal('transition', 'disable').modal('hide')
                  const reloadPath = FlowRouter.path('/reloadTransfer', {})
                  FlowRouter.go(reloadPath)
                },
              }).modal('show')
          }
        } else {
          // Confirm with user they will lose progress of this transaction if they proceeed.
          $('#cancelTransactionGenerationWarning').modal('transition', 'disable')
            .modal({
              onApprove: () => {
                $('#cancelTransactionGenerationWarning').modal('transition', 'disable').modal('hide')
                const reloadPath = FlowRouter.path('/reloadTransfer', {})
                FlowRouter.go(reloadPath)
              },
            }).modal('show')
        }
      }
    }
  },
})


Template.appBody.helpers({
  addressFormat() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return 'BECH32'
    }
    return 'Hex'
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
    } else if (Session.get('nodeStatus') === 'ok') {
      status.string = 'Connected to'
      status.colour = 'green'
    } else {
      status.string = 'Failed to connect to'
      status.colour = 'red'
    }
    return status
  },
  walletStatus() {
    return Session.get('walletStatus')
  },
  customNodeCreated() {
    return LocalStore.get('customNodeCreated')
  },
  customNodeName() {
    return LocalStore.get('customNodeName')
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
})
