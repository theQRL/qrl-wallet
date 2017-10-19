import './body.html'
import './sidebar.html'
import './customNode.html'
import '../../stylesheets/overrides.css'
/* global LocalStore */
/* global checkNodeStatus */
/* global findNodeData */
/* global DEFAULT_NODES */

BlazeLayout.setRoot('body')


const loadGrpcClient = (nodeData, callback) => {
  Meteor.call('loadGrpcClient', nodeData, (err, res) => {
    if (err) {
      callback(err, null)
    } else {
      callback(null, res)
    }
  })
}

const getKnownPeers = (nodeData) => {
  Meteor.call('getPeers', nodeData, (err, res) => {
    if (err) {
      console.log('error: ' + err)
    } else {
      console.log('success')
      console.log(res.known_peers.peers)
    }
  })
}

// Set session state based on selected network node.
const updateNode = (selectedNode) => {
  // Set node status to connecting
  LocalStore.set('nodeStatus', 'connecting')
  // Update local node connection details
  switch (selectedNode) {
    case 'testnet':
    case 'testnet-backup':
    case 'mainnet':
    case 'localhost': {
      const nodeData = findNodeData(DEFAULT_NODES, selectedNode)
      LocalStore.set('nodeId', nodeData.id)
      LocalStore.set('nodeName', nodeData.name)
      LocalStore.set('nodeExplorerUrl', nodeData.explorerUrl)
      LocalStore.set('nodeApiUrl', nodeData.apiUrl)

      console.log('connecting to remote grpc node')
      loadGrpcClient(nodeData, (err, res) => {
        if (err) {
          console.log(err)
          LocalStore.set('nodeStatus', 'failed')
        } else {
          console.log('gRPC client loaded')
          LocalStore.set('nodeStatus', 'ok')
        }
      })
      break
    }
    case 'add':
      $('.small.modal').modal('show')
      break
    default:
      break
  }
}

Template.appBody.onRendered(() => {
  $('#networkDropdown').dropdown()
  $('.small.modal').modal()
  $('.sidebar').first().sidebar('attach events', '#hamburger', 'show')
  const selectedNode = document.getElementById('network').value
  updateNode(selectedNode)
})

Template.appBody.events({
  'click #hamburger': (event) => {
    event.preventDefault()
    $('.ui.sidebar').sidebar('toggle')
  },
  'change #network': () => {
    const selectedNode = document.getElementById('network').value
    updateNode(selectedNode)
  },
})

Template.appBody.helpers({
  nodeId() {
    if (LocalStore.get('nodeId') === '') {
      return DEFAULT_NODES[0].id
    }
    return LocalStore.get('nodeId')
  },
  nodeName() {
    if (LocalStore.get('nodeName') === '') {
      return DEFAULT_NODES[0].name
    }
    return LocalStore.get('nodeName')
  },
  nodeExplorerUrl() {
    if (LocalStore.get('nodeExplorerUrl') === '') {
      return DEFAULT_NODES[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
  },
  nodeApiUrl() {
    if (LocalStore.get('nodeApiUrl') === '') {
      return DEFAULT_NODES[0].apiUrl
    }
    return LocalStore.get('nodeApiUrl')
  },
  defaultNodes() {
    return DEFAULT_NODES
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
})

Template.sidebar.events({
  click: () => {
    $('.ui.sidebar').sidebar('toggle')
  },
})
