import './body.html'
import './sidebar.html'
import './customNode.html'
import '../../stylesheets/overrides.css'

BlazeLayout.setRoot('body')

// Set session state based on selected network node.
const updateNode = (selectedNode) => {
  switch (selectedNode) {
    case 'testnet':
    case 'mainnet':
    case 'localhost':
      const nodeData = findNodeData(DEFAULT_NODES, selectedNode)
      LocalStore.set('nodeId', nodeData.id)
      LocalStore.set('nodeName', nodeData.name)
      LocalStore.set('nodeExplorerUrl', nodeData.explorerUrl)
      LocalStore.set('nodeApiUrl', nodeData.apiUrl)
      break
    case 'add':
      $('.small.modal').modal('show')
      break
  }
}

Template.appBody.onRendered(() => {
  $('#networkDropdown').dropdown()
  $('.small.modal').modal()
  $('.sidebar').first().sidebar('attach events', '#hamburger', 'show')
  updateNode()
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
    } else {
      return LocalStore.get('nodeId')
    }
  },
  nodeName() {
    if (LocalStore.get('nodeName') === '') {
      return DEFAULT_NODES[0].name
    } else {
      return LocalStore.get('nodeName')
    }
  },
  nodeExplorerUrl() {
    if (LocalStore.get('nodeExplorerUrl') === '') {
      return DEFAULT_NODES[0].explorerUrl
    } else {
      return LocalStore.get('nodeExplorerUrl')
    }
  },
  nodeApiUrl() {
    if (LocalStore.get('nodeApiUrl') === '') {
      return DEFAULT_NODES[0].apiUrl
    } else {
      return LocalStore.get('nodeApiUrl')
    }
  },
  defaultNodes() {
    return DEFAULT_NODES
  },
})

Template.sidebar.events({
  click: () => {
    $('.ui.sidebar').sidebar('toggle')
  },
})
