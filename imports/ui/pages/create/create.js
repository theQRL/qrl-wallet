import './create.html'
/* global QRLLIB */
/* global LocalStore */

function generateWallet() {
  let i
  const randomBytes = require('crypto').randomBytes(48)
  const randomSeed = new QRLLIB.VectorUChar()
  for (i = 0; i < 48; i++) {
    randomSeed.push_back(randomBytes[i])
  }

  const thisSeed = QRLLIB.bin2hstr(randomSeed)
  const thisMnemonic = QRLLIB.bin2mnemonic(randomSeed)

  let xmss = new QRLLIB.Xmss(randomSeed, 12)
  const thisAddress = xmss.getAddress()

  const newWalletDetail = {
    address: thisAddress,
    hexSeed: thisSeed,
    mnemonicPhrase: thisMnemonic,
  }

  LocalStore.set('newWalletDetail', newWalletDetail)

  $('#generating').hide()
  $('#warning').hide()
  $('#result').show()
}

Template.appCreate.events({
  'click #generate': () => {
    $('#generate').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(generateWallet, 200)
  },
})

Template.appCreate.helpers({
  newWalletDetail() {
    return LocalStore.get('newWalletDetail')
  },
})
