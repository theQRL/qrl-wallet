/* eslint no-console:0 */
/* global LocalStore */
/* global findNodeData */
/* global DEFAULT_NODES */
/* global selectedNode */
/* global isElectrified */
import './body.html'
import './sidebar.html'
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

          $('#networkDropdown').dropdown('set selected', 'custom')
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
  $('#networkDropdown').dropdown({ allowReselection: true })
  $('.small.modal').modal()
  $('.sidebar').first().sidebar('attach events', '#hamburger', 'show')
  updateNode(selectedNode())

  // Hide wallet warning on electrified clients
  if (isElectrified()) {
    $('#walletWarning').hide()
  }
})

Template.appBody.events({
  'click #hamburger': (event) => {
    event.preventDefault()
    $('.ui.sidebar').sidebar('toggle')
  },
  'change #network': () => {
    updateNode(selectedNode())
  },
  'click .close': () => {
    $('#walletWarning').transition('fade')
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

Template.sidebar.helpers({
  walletStatus() {
    return LocalStore.get('walletStatus')
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
})

Template.sidebar.events({
  click: () => {
    $('.ui.sidebar').sidebar('toggle')
  },
})

