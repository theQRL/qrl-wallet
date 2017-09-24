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
      localStorage.setItem('nodeId', nodeData.id)
      localStorage.setItem('nodeName', nodeData.name)
      localStorage.setItem('nodeExplorerUrl', nodeData.explorerUrl)
      localStorage.setItem('nodeApiUrl', nodeData.apiUrl)
      break
    case 'add':
      $('.small.modal').modal('show')
      break
    default:
      localStorage.setItem('nodeId', '')
      localStorage.setItem('nodeName', '')
      localStorage.setItem('nodeExplorerUrl', '')
      localStorage.setItem('nodeApiUrl', '')
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
    if (selectedNode !== 'add') {
      Meteor._reload.reload()
    }
  },
})

Template.appBody.helpers({
  nodeId() {
    if (localStorage.getItem('nodeId') === '') {
      return DEFAULT_NODES[0].id
    } else {
      return localStorage.getItem('nodeId')
    }
  },
  nodeName() {
    if (localStorage.getItem('nodeName') === '') {
      return DEFAULT_NODES[0].name
    } else {
      return localStorage.getItem('nodeName')
    }
  },
  nodeExplorerUrl() {
    if (localStorage.getItem('nodeExplorerUrl') === '') {
      return DEFAULT_NODES[0].explorerUrl
    } else {
      return localStorage.getItem('nodeExplorerUrl')
    }
    return localStorage.getItem('')
  },
  nodeApiUrl() {
    if (localStorage.getItem('nodeApiUrl') === '') {
      return DEFAULT_NODES[0].apiUrl
    } else {
      return localStorage.getItem('nodeApiUrl')
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
