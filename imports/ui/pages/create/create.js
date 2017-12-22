import './create.html'
/* global QRLLIB */
/* global XMSS_OBJECT */
/* global LocalStore */

function generateWallet() {
  // Generate random bytes to form XMSS seed.
  let i
  const randomBytes = require('crypto').randomBytes(48)
  const randomSeed = new QRLLIB.VectorUChar()
  for (i = 0; i < 48; i++) {
    randomSeed.push_back(randomBytes[i])
  }

  // Generate XMSS object.
  XMSS_OBJECT = new QRLLIB.Xmss(randomSeed, 10)
  const newAddress = XMSS_OBJECT.getAddress()

  // If it worked, send the user to the address page.
  if (newAddress !== '') {
    const status = {}
    status.colour = 'green'
    status.string = newAddress + ' is ready to use.'
    status.unlocked = true
    status.address = newAddress
    status.menuHidden = ''
    LocalStore.set('walletStatus', status)

    LocalStore.set('passphrase', document.getElementById('passphrase').value)

    const params = { address: newAddress }
    const path = FlowRouter.path('/create/:address', params)
    FlowRouter.go(path)
  } else {
    $('#generating').hide()
    $('#error').show()
  }
}

Template.appCreate.events({
  'click #generate': () => {
    $('#generate').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(generateWallet, 200)
  },
})
