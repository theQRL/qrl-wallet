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

  let xmss = new QRLLIB.Xmss(randomSeed, 10)
  const thisAddress = xmss.getAddress()

  const newWalletDetail = {
    address: thisAddress,
    hexseed: thisSeed,
    mnemonic: thisMnemonic,
    index: 0,
  }

  LocalStore.set('newWalletDetail', newWalletDetail)

  $('#generating').hide()
  $('#warning').hide()
  $('#createWallet').hide()
  $('#result').show()
}

function downloadWallet() {
  const walletJson = ['[', JSON.stringify(LocalStore.get('newWalletDetail')), ']'].join('')
  const binBlob = new Blob([walletJson])
  const a = window.document.createElement('a')
  a.href = window.URL.createObjectURL(binBlob, { type: 'text/plain' })
  a.download = 'wallet.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

Template.appCreate.events({
  'click #generate': () => {
    $('#generate').hide()
    $('#generating').show()
    // Delay so we get the generating icon up.
    setTimeout(generateWallet, 200)
  },
  'click #download': () => {
    downloadWallet()
  },
})

Template.appCreate.helpers({
  newWalletDetail() {
    return LocalStore.get('newWalletDetail')
  },
})
