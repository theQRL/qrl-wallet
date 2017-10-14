// Defines Default QRL Node Details
// Additional user defined node can be stored in session.
// All functions and variables are here are not defined by 'let' or 'const'
// so that they can be utilised in other files within Meteor.

// Define the default nodes available in the UI.
DEFAULT_NODES = [
  {
    id: 'testnet',
    name: 'Testnet (Official QRL Node)',
    disabled: '',
    explorerUrl: 'http://qrlexplorer.info/',
    grpc: '104.251.219.215:9009',
  },
  {
    id: 'testnet-backup',
    name: 'Testnet (Community Node)',
    disabled: '',
    explorerUrl: 'http://qrlexplorer.info/',
    grpc: 'qrl-faucet.folio.ninja:9009',
  },
  {
    id: 'mainnet',
    name: 'Mainnet (Official QRL Node)',
    disabled: 'disabled',
    explorerUrl: 'http://qrlexplorer.info/',
    grpc: '104.251.219.215:9009',
  },
  {
    id: 'localhost',
    name: 'Localhost',
    disabled: '',
    explorerUrl: 'http://qrlexplorer.info/',
    grpc: 'localhost:9009',
  },
]

// Function to search through the DEFAULT_NODES array and identify and return an
// object based on its 'id' value.
findNodeData = function (array, key) {
  const objFound = _.find(array, function (obj) {
    if (obj.id === key) {
      return obj
    }
  })
  if (objFound) {
    return objFound
  }
  return null
}

