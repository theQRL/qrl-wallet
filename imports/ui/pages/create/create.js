import './create.html'
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global LocalStore */
/* global passwordPolicyValid */

function generateWallet(type) {
  // Determine XMSS Tree Height
  let xmssHeight = parseInt(document.getElementById('xmssHeight').value)
  let passphrase = document.getElementById('passphrase').value
  let hashFunctionSelection = document.getElementById('hashFunction').value

  // Set hash function to user selected hash function
  let hashFunction
  switch (hashFunctionSelection) {
    case 'SHAKE_128':
      hashFunction = QRLLIB.eHashFunction.SHAKE_128
      console.log('shake 128')
      break
    case 'SHAKE_256':
      hashFunction = QRLLIB.eHashFunction.SHAKE_256
      console.log('shake 256')
      break
    case 'SHA2_256':
      hashFunction = QRLLIB.eHashFunction.SHA2_256
      console.log('SHA2_256')
      break
    default:
      $('#generating').hide()
      $('#error').show()
      return false
  }

  // Check that passphrase matches the password policy
  if (passwordPolicyValid(passphrase)) {
    // Generate random seed for XMSS tree
    const randomSeed = toUint8Vector(require('crypto').randomBytes(48))

    // Generate XMSS object.
    // eslint-disable-next-line no-global-assign
    XMSS_OBJECT = new QRLLIB.Xmss.fromParameters(randomSeed, xmssHeight, hashFunction)
    const newAddress = XMSS_OBJECT.getAddress()

    // If it worked, send the user to the address page.
    if (newAddress !== '') {
      LocalStore.set('passphrase', passphrase)
      LocalStore.set('xmssHeight', xmssHeight)

      const params = { address: newAddress }
      const path = FlowRouter.path('/create/:address', params)
      FlowRouter.go(path)
    } else {
      $('#generating').hide()
      $('#error').show()
    }
  } else {
    $('#generating').hide()
    $('#passError').show()
    $('#generate').show()
  }
}

Template.appCreate.onRendered(() => {
  $('#xmssHeightDropdown').dropdown({direction: 'upward' })
  $('#hashFunctionDropdown').dropdown({direction: 'upward' })
})

Template.appCreate.events({
  'click #generate': () => {
    $('#passError').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(() => { generateWallet() }, 200)
  },
})
