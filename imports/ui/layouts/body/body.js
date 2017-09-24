import { Session } from 'meteor/session'
import './body.html'
import './sidebar.html'
import '../../stylesheets/overrides.css'

BlazeLayout.setRoot('body')

// Set session state based on selected network node.
const updateNode = () => {
  const selectedNode = document.getElementById('network').value
  switch (selectedNode) {
    case 'testnet':
    case 'mainnet':
    case 'localhost': {
      const nodeData = findNodeData(DEFAULT_NODES, selectedNode)
      Session.set('nodeId', nodeData.id)
      Session.set('nodeName', nodeData.name)
      Session.set('nodeExplorerUrl', nodeData.explorerUrl)
      Session.set('nodeApiUrl', nodeData.apiUrl)
      break
    }
    default: {
      Session.set('connectionStatus', 'Unknown')
      break
    }
  }
}

Template.appBody.onRendered(() => {
  $('#networkDropdown').dropdown()
  $('.modal').modal()
  $('.sidebar').first().sidebar('attach events', '#hamburger', 'show')
  updateNode()
})

Template.appBody.events({
  'click #hamburger': (event) => {
    event.preventDefault()
    $('.ui.sidebar').sidebar('toggle')
  },
  'change #network': () => {
    updateNode()
  },
})

Template.appBody.helpers({
  nodeId() {
    return Session.get('nodeId')
  },
  nodeName() {
    return Session.get('nodeName')
  },
  nodeExplorerUrl() {
    return Session.get('nodeExplorerUrl')
  },
  nodeApiUrl() {
    return Session.get('nodeApiUrl')
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
