import './create.html'
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global LocalStore */
/* global passwordPolicyValid */

function generateWallet(type) {
  // Determine XMSS Tree Height
  let xmssHeight = parseInt(document.getElementById('xmssHeight').value)
  let passphrase = document.getElementById('passphrase').value
  // TODO - Allow advanced wallet creation using SHA2_256, SHAKE_128 and SHAKE_256
  let hashFunction = QRLLIB.eHashFunction.SHAKE_128

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
})

Template.appCreate.events({
  'click #generate': () => {
    $('#passError').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(() => { generateWallet() }, 200)
  },
})
