import './address.html'
/* global getXMSSDetails */

function saveWallet() {
  const walletJson = ['[', JSON.stringify(getXMSSDetails()), ']'].join('')
  const binBlob = new Blob([walletJson])
  const a = window.document.createElement('a')
  a.href = window.URL.createObjectURL(binBlob, { type: 'text/plain' })
  a.download = 'wallet.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

Template.appCreateAddress.events({
  'click #save': () => {
    saveWallet()
  },
})

Template.appCreateAddress.helpers({
  newAddress() {
    return getXMSSDetails()
  },
})
