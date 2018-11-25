/* eslint no-console:0 */
/* global findNetworkData */
/* global DEFAULT_NETWORKS */
/* global selectedNetwork */
/* global isElectrified */
/* global WALLET_VERSION */

import './body.html'
import './customNode.html'
import '../../stylesheets/overrides.css'

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

// Set session state based on selected network node.
const updateNetwork = (selectedNetwork) => {
  // If no network is selected, default to mainnet
  if(selectedNetwork === '') {
    $('#networkDropdown').dropdown('set selected', DEFAULT_NETWORKS[0].id)
    selectedNetwork = DEFAULT_NETWORKS[0].id
  }

  // Set node status to connecting
  Session.set('nodeStatus', 'connecting')
  // Update local node connection details
  switch (selectedNetwork) {
    case 'add': {
      $('#addNode').modal({
        onDeny: () => {
          Session.set('modalEventTriggered', true)
          $('#networkDropdown').dropdown('set selected', 'mainnet')
        },
        onApprove: () => {
          Session.set('nodeId', 'custom')
          Session.set('nodeName', document.getElementById('customNodeName').value)
          Session.set('nodeGrpc', document.getElementById('customNodeGrpc').value)
          Session.set('nodeExplorerUrl', document.getElementById('customNodeExplorer').value)

          Session.set('customNodeName', document.getElementById('customNodeName').value)
          Session.set('customNodeGrpc', document.getElementById('customNodeGrpc').value)
          Session.set('customNodeExplorerUrl', document.getElementById('customNodeExplorer').value)

          Session.set('customNodeCreated', true)
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
    };
    case 'custom': {
      const nodeData = {
        id: 'custom',
        name: Session.get('customNodeName'),
        disabled: '',
        explorerUrl: Session.get('customNodeExplorerUrl'),
        type: 'both',
        grpc: Session.get('customNodeGrpc'),
      }

      Session.set('nodeId', 'custom')
      Session.set('nodeName', Session.get('customNodeName'))
      Session.set('nodeGrpc', Session.get('customNodeGrpc'))
      Session.set('nodeExplorerUrl', Session.get('customNodeExplorerUrl'))

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
    };
    default: {
      const nodeData = findNetworkData(DEFAULT_NETWORKS, selectedNetwork)
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
    $('#walletWarning').sticky({context: '#walletWarning'})
    $('#walletWarning').sticky({context: '#walletWarning'})
  }

  /*
   * Replace all SVG images with inline SVG
   */
  jQuery('img.svg').each(function(){
    var $img = jQuery(this)
    var imgID = $img.attr('id')
    var imgClass = $img.attr('class')
    var imgURL = $img.attr('src')

    jQuery.get(imgURL, function(data) {
        // Get the SVG tag, ignore the rest
        var $svg = jQuery(data).find('svg')

        // Add replaced image's ID to the new SVG
        if(typeof imgID !== 'undefined') {
            $svg = $svg.attr('id', imgID)
        }
        // Add replaced image's classes to the new SVG
        if(typeof imgClass !== 'undefined') {
            $svg = $svg.attr('class', imgClass+' replaced-svg')
        }

        // Remove any invalid XML tags as per http://validator.w3.org
        $svg = $svg.removeAttr('xmlns:a')

        // Check if the viewport is set, if the viewport is not set the SVG wont't scale.
        if(!$svg.attr('viewBox') && $svg.attr('height') && $svg.attr('width')) {
            $svg.attr('viewBox', '0 0 ' + $svg.attr('height') + ' ' + $svg.attr('width'))
        }

        // Replace image with new SVG
        $img.replaceWith($svg)

    }, 'xml')
  })

  // Debug log for web assembly support
  console.log('Web Assembly Supported: ', supportedBrowser())

  // Show warning if web assembly is not supported.
  if(!supportedBrowser()) {
    $('#webassemblyWarning').modal('show')
  }
})

Template.appBody.events({
  'click #hamburger': (event) => {
    event.preventDefault()
    $('.sidebar').sidebar('show')
  },
  'change #network': () => {
    updateNetwork(selectedNetwork())
  },
  'change #addressFormatCheckbox': () => {
    var checked = $('#addressFormatCheckbox').prop("checked")
    if(checked){
      Session.set('addressFormat', 'bech32')
    }
    else {
      Session.set('addressFormat', 'hex')
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

    if(FlowRouter.getRouteName() == "App.transfer") {
      if(
        (transactionGenerateFieldVisible == false) &&
        (tokenBalancesTabVisible == false) && 
        (receiveTabVisible == false)) {
        // If the user has completed the transaction, go back to send form.
        if(
          (tokenTransactionResultAreaVisible == true) ||
          (transactionResultAreaVisible == true)
          ) {
          // Check if the trasaction is confirmed on the network.
          const transactionConfirmed = Session.get('transactionConfirmed')
          if(transactionConfirmed == "true") {
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
          // Confirm with user they will loose progress of this transaction if they proceeed.
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
  }
})


Template.appBody.helpers({
  addressFormat() {
    if(Session.get('addressFormat') == 'bech32'){
      return 'BECH32'
    }
    else {
      return 'Hex'
    }
  },
  addressFormatChecked() {
    if(Session.get('addressFormat') == 'bech32'){
      return 'checked'
    }
    else {
      return ''
    }
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
    return Session.get('customNodeCreated')
  },
  customNodeName() {
    return Session.get('customNodeName')
  },

  /* Active Menu Item Helpers */
  menuNewWalletActive() {
    if(
      (FlowRouter.getRouteName() == "App.home") ||
      (FlowRouter.getRouteName() == "App.create") || 
      (FlowRouter.getRouteName() == "App.createAddress")
      ) {
      return 'active'
    }
  },
  menuOpenWalletActive() {
    if(
      (FlowRouter.getRouteName() == "App.open") ||
      (FlowRouter.getRouteName() == "App.opened")
      ) {
      return 'active'
    }
  },
  menuTransferActive() {
    if(
      (FlowRouter.getRouteName() == "App.transfer")
      ) {
      return 'active'
    }
  },
  menuTokensActive() {
    if(
      (FlowRouter.getRouteName() == "App.tokens") ||
      (FlowRouter.getRouteName() == "App.tokensView") ||
      (FlowRouter.getRouteName() == "App.tokensCreate") ||
      (FlowRouter.getRouteName() == "App.tokenCreationConfirm") ||
      (FlowRouter.getRouteName() == "App.tokenCreationResult") ||
      (FlowRouter.getRouteName() == "App.tokensTransfer") ||
      (FlowRouter.getRouteName() == "App.tokensTransferLoad") ||
      (FlowRouter.getRouteName() == "App.tokensTransferConfirm") ||
      (FlowRouter.getRouteName() == "App.tokensTransferResult")
      ) {
      return 'active'
    }
  },
  menuVerifyActive() {
    if(
      (FlowRouter.getRouteName() == "App.verify") ||
      (FlowRouter.getRouteName() == "App.verifytxid")
      
      ) {
      return 'active'
    }
  },
  qrlWalletVersion() {
    return WALLET_VERSION
  }
})

Template.customNode.helpers({
  customNodeName() {
    return Session.get('customNodeName')
  },
  customNodeGrpc() {
    return Session.get('customNodeGrpc')
  },
  customNodeExplorer() {
    return Session.get('customNodeExplorerUrl')
  }
})
