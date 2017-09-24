// Defines Default QRL Node Details
// Additional user defined node can be stored in session.
DEFAULT_NODES = [
  {
    id: 'testnet',
    name: 'Testnet (Official QRL Node)',
    disabled: '',
    explorerUrl: 'http://qrlexplorer.info/',
    apiUrl: 'http://104.251.219.215:8080/',
  },
  {
    id: 'mainnet',
    name: 'Mainnet (Official QRL Node)',
    disabled: 'disabled',
    explorerUrl: 'http://qrlexplorer.info/',
    apiUrl: 'http://104.251.219.215:8080/',
  },
  {
    id: 'localhost',
    name: 'Localhost',
    disabled: '',
    explorerUrl: 'http://qrlexplorer.info/',
    apiUrl: 'http://localhost:8080/',
  },
]

// Some function
findNodeData = function(array, key){
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
