import { Session } from 'meteor/session'
import './body.html'
import './sidebar.html'
import '../../stylesheets/overrides.css'

BlazeLayout.setRoot('body')

function findValue(array, key) {
  const objFound = _.find(array, function(obj) {
    if (obj.id === key) {
      return obj
    }
  })
  if (objFound) {
    return objFound
  }
  return null
}

// Set session state based on selected network node.
const updateNode = () => {
  const selectedNode = document.getElementById('network').value
  switch (selectedNode) {
    case 'testnet':
    case 'mainnet':
    case 'localhost': {
      const nodeData = findValue(DEFAULT_NODES, selectedNode)
      Session.set('connectionStatus', 'Connected to ' + nodeData.name)
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
  connectionStatus() {
    return Session.get('connectionStatus')
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
