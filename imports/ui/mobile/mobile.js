/* eslint no-console:0 */
/* global LocalStore */
/* global findNetworkData */
/* global DEFAULT_NETWORKS */
/* global selectedNetwork */
/* global isElectrified */
/* global WALLET_VERSION */
import './mobile.html'

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
  // Set node status to connecting
  LocalStore.set('nodeStatus', 'connecting')
  // Update local node connection details
  switch (selectedNetwork) {
    case 'add': {
      $('#addNode').modal({
        onDeny: () => {
          LocalStore.set('modalEventTriggered', true)
          $('#networkDropdown').dropdown('set selected', 'testnet')
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
    };
    case 'custom': {
      const nodeData = {
        id: 'custom',
        name: LocalStore.get('customNodeName'),
        disabled: '',
        explorerUrl: LocalStore.get('customNodeExplorerUrl'),
        type: 'both',
        grpc: LocalStore.get('customNodeGrpc'),
      }

      LocalStore.set('nodeId', 'custom')
      LocalStore.set('nodeName', LocalStore.get('customNodeName'))
      LocalStore.set('nodeGrpc', LocalStore.get('customNodeGrpc'))
      LocalStore.set('nodeExplorerUrl', LocalStore.get('customNodeExplorerUrl'))

      console.log('Connecting to custom remote gRPC node: ', nodeData.grpc)
      connectToNode(nodeData.grpc, (err) => {
        if (err) {
          console.log('Error: ', err)
          LocalStore.set('nodeStatus', 'failed')
        } else {
          console.log('Custom gRPC client loaded: ', nodeData.grpc)
          LocalStore.set('nodeStatus', 'ok')
        }
      })
      break
    };
    default: {
      const nodeData = findNetworkData(DEFAULT_NETWORKS, selectedNetwork)
      LocalStore.set('nodeId', nodeData.id)
      LocalStore.set('nodeName', nodeData.name)
      LocalStore.set('nodeExplorerUrl', nodeData.explorerUrl)
      LocalStore.set('nodeGrpc', nodeData.grpc)

      console.log('Connecting to network: ', nodeData.name)
      checkNetworkHealth(nodeData.id, (err, res) => {
        if (err) {
          console.log('the error: ', err)
          LocalStore.set('nodeStatus', 'failed')
        } else {
          console.log('Connection to network is healthy: ', nodeData.id)
          LocalStore.set('nodeStatus', 'ok')
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
  if (LocalStore.get('walletStatus').unlocked === false && page === '/verify') {
    output.create = true
    output.verify = true
    output.open = true
    output.close = false
    output.transfer = false
    output.tools = false
  }
  return output
}

const numPages = (tabs) => {
  const result = Object.keys(tabs).filter(x => tabs[x] !== false)
  return result.length
}

const returnClass = (path) => {
  const x = parseInt(path, 10)
  switch (x) {
    default:
      return 'four'
    case 3:
      return 'three'
    case 4:
      return 'four'
    case 5:
      return 'five'
    case 6:
      return 'six'
  }
}

const adjustClasses = () => {
  const tabs = tabHandler(FlowRouter.current().path)
  $('.menu').removeClass('three four five six')
  $('.menu').addClass(returnClass(numPages(tabs)))
  if (tabs.create) { $('#newWalletButton').show() } else { $('#newWalletButton').hide() }
  if (tabs.verify) { $('#verifyButton').show() } else { $('#verifyButton').hide() }
  if (tabs.open) { $('#openWalletButton').show() } else { $('#openWalletButton').hide() }
  if (tabs.close) { $('#closeWalletButton').show() } else { $('#closeWalletButton').hide() }
  if (tabs.transfer) { $('#sendAndReceiveButton').show() } else { $('#sendAndReceiveButton').hide() }
  if (tabs.tools) { $('#toolsButton').show() } else { $('#toolsButton').hide() }
}

Template.mobile.onRendered(() => {
  LocalStore.set('modalEventTriggered', false)
  $('#networkDropdown').dropdown({ allowReselection: true })
  $('.small.modal').modal()

  updateNetwork(selectedNetwork())

  Tracker.autorun(() => {
    FlowRouter.watchPathChange()
    adjustClasses()
  })
})
Template.mobile.events({
  click: (event) => {
    console.log($(event.currentTarget).attr('href'))
    adjustClasses()
  },
  'change #network': () => {
    updateNetwork(selectedNetwork())
  },
})

Template.mobile.helpers({
  qrlWalletVersion() {
    console.log(WALLET_VERSION)
    return WALLET_VERSION
  },
  menuItemsCount() {
    return returnClass(numPages(tabHandler(FlowRouter.current().path)))
  },
  nodeId() {
    if ((LocalStore.get('nodeId') === '') || (LocalStore.get('nodeId') === null)) {
      return DEFAULT_NETWORKS[0].id
    }
    return LocalStore.get('nodeId')
  },
  nodeName() {
    if ((LocalStore.get('nodeName') === '') || (LocalStore.get('nodeName') === null)) {
      return DEFAULT_NETWORKS[0].name
    }
    return LocalStore.get('nodeName')
  },
  nodeExplorerUrl() {
    if ((LocalStore.get('nodeExplorerUrl') === '') || (LocalStore.get('nodeExplorerUrl') === null)) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return LocalStore.get('nodeExplorerUrl')
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
