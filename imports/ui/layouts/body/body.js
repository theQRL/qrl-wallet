/* eslint no-console:0 */
/* global LocalStore */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global selectedNode */
/* global isElectrified */
/* global WALLET_VERSION */

import './body.html'
import './customNode.html'
import '../../stylesheets/overrides.css'

BlazeLayout.setRoot('body')

const connectToNode = (nodeData, callback) => {
  Meteor.call('connectToNode', nodeData, (err, res) => {
    if (err) {
      callback(err, null)
    } else {
      callback(null, res)
    }
  })
}

// Set session state based on selected network node.
const updateNode = (selectedNode) => {
  // Set node status to connecting
  LocalStore.set('nodeStatus', 'connecting')
  // Update local node connection details
  switch (selectedNode) {
    case 'add': {
      $('#addNode').modal({
        onDeny: () => {
          LocalStore.set('modalEventTriggered', true)
          $('#networkDropdown').dropdown('set selected', 'testnet-1')
        },
        onApprove: () => {
          LocalStore.set('nodeId', 'custom')
          LocalStore.set('nodeName', document.getElementById('customNodeName').value)
          LocalStore.set('nodeGrpc', document.getElementById('customNodeGrpc').value)
          LocalStore.set('nodeExplorerUrl', document.getElementById('customNodeExplorer').value)

          LocalStore.set('customNodeName', document.getElementById('customNodeName').value)
          LocalStore.set('customNodeGrpc', document.getElementById('customNodeGrpc').value)
          LocalStore.set('customNodeExplorerUrl', document.getElementById('customNodeExplorer').value)

          LocalStore.set('customNodeCreated', true)
          LocalStore.set('modalEventTriggered', true)

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

          // If the modal is hidden without approval, revert to testnet-1 node.
          if (LocalStore.get('modalEventTriggered') === false) {
            $('#networkDropdown').dropdown('set selected', 'testnet-1')
          }

          // Reset modalEventTriggered
          LocalStore.set('modalEventTriggered', false)
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
        grpc: LocalStore.get('customNodeGrpc'),
        type: 'both',
      }

      LocalStore.set('nodeId', 'custom')
      LocalStore.set('nodeName', LocalStore.get('customNodeName'))
      LocalStore.set('nodeGrpc', LocalStore.get('customNodeGrpc'))
      LocalStore.set('nodeExplorerUrl', LocalStore.get('customNodeExplorerUrl'))

      console.log('Connecting to custom remote gRPC node: ', nodeData.grpc)
      connectToNode(nodeData, (err) => {
        if (err) {
          console.log('Error: ', err)
          LocalStore.set('nodeStatus', 'failed')
        } else {
          console.log('Custom gRPC client loaded: ', nodeData.grpc)
          LocalStore.set('nodeStatus', 'ok')
        }
      })
      break
    }
    default: {
      const nodeData = findNodeData(DEFAULT_NODES, selectedNode)
      LocalStore.set('nodeId', nodeData.id)
      LocalStore.set('nodeName', nodeData.name)
      LocalStore.set('nodeExplorerUrl', nodeData.explorerUrl)
      LocalStore.set('nodeGrpc', nodeData.grpc)

      console.log('Connecting to remote gRPC node: ', nodeData.grpc)
      connectToNode(nodeData, (err) => {
        if (err) {
          console.log(err)
          LocalStore.set('nodeStatus', 'failed')
        } else {
          console.log('gRPC client loaded: ', nodeData.grpc)
          LocalStore.set('nodeStatus', 'ok')
        }
      })
      break
    }
  }
}

Template.appBody.onRendered(() => {
  LocalStore.set('modalEventTriggered', false)
  
  // $('.sidebar').first().sidebar('attach events', '#hamburger', 'show')

  $('#networkDropdown').dropdown({ allowReselection: true })
  $('.small.modal').modal()

  updateNode(selectedNode())


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


})



Template.appBody.events({
  'click #hamburger': (event) => {
    event.preventDefault()
    $('.sidebar').sidebar('show')
  },
  'change #network': () => {
    updateNode(selectedNode())
  },
})


Template.appBody.helpers({
  nodeId() {
    if ((LocalStore.get('nodeId') === '') || (LocalStore.get('nodeId') === null)) {
      return DEFAULT_NODES[0].id
    }
    return LocalStore.get('nodeId')
  },
  nodeName() {
    if ((LocalStore.get('nodeName') === '') || (LocalStore.get('nodeName') === null)) {
      return DEFAULT_NODES[0].name
    }
    return LocalStore.get('nodeName')
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
  defaultNodes() {
    const visibleNodes = []

    // Only return nodes specific to this (web/desktop/both).
    _.each(DEFAULT_NODES, (node) => {
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
    if (LocalStore.get('nodeStatus') === 'connecting') {
      status.string = 'Connecting to'
      status.colour = 'yellow'
    } else if (LocalStore.get('nodeStatus') === 'ok') {
      status.string = 'Connected to'
      status.colour = 'green'
    } else {
      status.string = 'Failed to connect to'
      status.colour = 'red'
    }
    return status
  },
  walletStatus() {
    return LocalStore.get('walletStatus')
  },
  customNodeCreated() {
    return LocalStore.get('customNodeCreated')
  },
  customNodeName() {
    return LocalStore.get('customNodeName')
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
      (FlowRouter.getRouteName() == "App.transferUnlock") ||
      (FlowRouter.getRouteName() == "App.transferForm") ||
      (FlowRouter.getRouteName() == "App.transferConfirm") ||
      (FlowRouter.getRouteName() == "App.transferResult")
      
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
    return LocalStore.get('customNodeName')
  },
  customNodeGrpc() {
    return LocalStore.get('customNodeGrpc')
  },
  customNodeExplorer() {
    return LocalStore.get('customNodeExplorerUrl')
  }
})
