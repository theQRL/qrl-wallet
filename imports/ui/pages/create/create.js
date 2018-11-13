import './create.html'
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global passwordPolicyValid */

function generateWallet(type) {
  // Determine XMSS Tree Height
  let xmssHeight = parseInt(document.getElementById('xmssHeight').value)
  let passphrase = document.getElementById('passphrase').value
  let passphraseConfirm = document.getElementById('passphraseConfirm').value
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

  // Check that each passphrase matches
  if(passphrase === passphraseConfirm) {
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
        Session.set('passphrase', passphrase)
        Session.set('xmssHeight', xmssHeight)

        const params = { address: newAddress }
        const path = FlowRouter.path('/create/:address', params)
        FlowRouter.go(path)
      } else {
        // Error generating walled with QRLLIB.
        $('#generating').hide()
        $('#error').show()
      }
    } else {
      // Invalid passphrase policy
      $('#generating').hide()
      $('#passError').show()
      $('#generate').show()
    }
  } else {
    // Passphrases do not match
    $('#generating').hide()
    $('#passMismatchError').show()
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
    $('#passMismatchError').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(() => { generateWallet() }, 200)
  },
})
