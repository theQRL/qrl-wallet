// Defines Default QRL Node Details
// Additional user defined node can be stored in session.
// All functions and variables are here are not defined by 'let' or 'const'
// so that they can be utilised in other files within Meteor.

/* global LocalStore */

// Define the default networks available in the UI.
// eslint-disable-next-line no-unused-vars, no-undef
DEFAULT_NETWORKS = [{
  id: 'mainnet',
  name: 'Mainnet',
  disabled: '',
  explorerUrl: 'https://explorer.theqrl.org',
  type: 'both',
  healthy: false,
  nodes: [{
    id: 'mainnet-1',
    grpc: 'mainnet-1.automated.theqrl.org:19009',
    state: false,
    height: 0,
  },
  {
    id: 'mainnet-3',
    grpc: 'mainnet-3.automated.theqrl.org:19009',
    state: false,
    height: 0,
  },
  ],
},
{
  id: 'testnet',
  name: 'Testnet',
  disabled: '',
  explorerUrl: 'https://testnet-explorer.theqrl.org',
  type: 'both',
  healthy: false,
  nodes: [{
    id: 'testnet-1',
    grpc: 'testnet-1.automated.theqrl.org:19009',
    state: false,
    height: 0,
  },
  {
    id: 'testnet-2',
    grpc: 'testnet-2.automated.theqrl.org:19009',
    state: false,
    height: 0,
  },
  {
    id: 'testnet-4',
    grpc: 'testnet-4.automated.theqrl.org:19009',
    state: false,
    height: 0,
  },
  ],
},
{
  id: 'localhost',
  name: 'Localhost (Desktop App Only)',
  disabled: '',
  explorerUrl: 'http://explorer.theqrl.org',
  type: 'desktop',
  healthy: false,
  nodes: [{
    id: 'localhost',
    grpc: 'localhost:19009',
    state: false,
    height: 0,
  }],
},
]

// disable during network upgrade
// Override DEFAULT_NETWORKS if provided in settings file
try {
  if (Meteor.settings.public.defaultNetworks.length > 0) {
    // Reset DEFAULT_NETWORKS
    // eslint-disable-next-line no-unused-vars, no-undef
    DEFAULT_NETWORKS = []
    // Set DEFAULT_NETWORKS from Meteor settings
    // eslint-disable-next-line no-unused-vars, no-undef
    DEFAULT_NETWORKS = Meteor.settings.public.defaultNetworks
  }
} catch (e) {
  // no configuration file used
}

// Function to search through the DEFAULT_NETWORKS array and identify and return an
// object based on its 'id' value.
// eslint-disable-next-line no-unused-vars, no-undef
findNetworkData = (array, key) => {
  if ((LocalStore.get('nodeId') === 'custom') && (LocalStore.get('nodeStatus') !== 'connecting')) {
    const nodeData = {
      id: 'custom',
      name: LocalStore.get('customNodeName'),
      disabled: '',
      explorerUrl: LocalStore.get('customNodeExplorerUrl'),
      type: 'both',
      nodes: [{
        id: 'custom',
        grpc: LocalStore.get('customNodeGrpc'),
        state: false,
        height: 0,
      }],
    }
    return nodeData
  }
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
