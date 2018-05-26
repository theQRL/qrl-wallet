// Defines Default QRL Node Details
// Additional user defined node can be stored in session.
// All functions and variables are here are not defined by 'let' or 'const'
// so that they can be utilised in other files within Meteor.

// Define the default nodes available in the UI.
// eslint-disable-next-line no-unused-vars, no-undef
DEFAULT_NODES = [
  {
    id: 'testnet-1',
    name: 'Testnet (Official QRL Node 1)',
    disabled: '',
    explorerUrl: 'https://explorer.theqrl.org',
    grpc: '104.237.3.185:9009',
    type: 'both',
  },
  {
    id: 'testnet-2',
    name: 'Testnet (Official QRL Node 2)',
    disabled: '',
    explorerUrl: 'https://explorer.theqrl.org',
    grpc: '104.251.219.215:9009',
    type: 'both',
  },
  {
    id: 'testnet-3',
    name: 'Testnet (Official QRL Node 3)',
    disabled: '',
    explorerUrl: 'https://explorer.theqrl.org',
    grpc: '104.251.219.145:9009',
    type: 'both',
  },
  {
    id: 'testnet-4',
    name: 'Testnet (Official QRL Node 4)',
    disabled: '',
    explorerUrl: 'https://explorer.theqrl.org',
    grpc: '104.251.219.40:9009',
    type: 'both',
  },
  {
    id: 'mainnet',
    name: 'Mainnet (Official QRL Node)',
    disabled: 'disabled',
    explorerUrl: 'https://explorer.theqrl.org',
    grpc: '127.0.0.1:9009',
    type: 'both',
  },
  {
    id: 'localhost',
    name: 'Localhost (Desktop App Only)',
    disabled: '',
    explorerUrl: 'http://explorer.theqrl.org',
    grpc: 'localhost:9009',
    type: 'desktop',
  }
]

// Override DEFAULT_NODES if provided in settings file
try {
  if (Meteor.settings.public.defaultNodes.length > 0) {
    // Reset DEFAULT_NODES
    DEFAULT_NODES = []
    // Set DEFAULT_NODES from Meteor settings
    DEFAULT_NODES=Meteor.settings.public.defaultNodes
  }
} catch (e) {
  // no configuration file used
}

// Function to search through the DEFAULT_NODES array and identify and return an
// object based on its 'id' value.
// eslint-disable-next-line no-unused-vars, no-undef
findNodeData = (array, key) => {
  if((LocalStore.get('nodeId') == 'custom') && (LocalStore.get('nodeStatus') != 'connecting')) {
    const nodeData = {
      id: 'custom',
      name: LocalStore.get('customNodeName'),
      disabled: '',
      explorerUrl: LocalStore.get('customNodeExplorerUrl'),
      grpc: LocalStore.get('customNodeGrpc'),
      type: 'both',
    }
    return nodeData
  } else {
    const objFound = _.find(array, (obj) => {
      if (obj.id === key) {
        return obj
      }
      return null
    })
    if (objFound) {
      return objFound
    }
    return null
  }
}

