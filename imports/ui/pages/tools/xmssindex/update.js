/* eslint no-console:0 */

import {
  isElectrified, createTransport, ledgerReturnedError, checkIfLedgerTreesMatch
} from '../../../../startup/client/functions'
// import async from 'async'
import './update.html'

const getNodeXMSSIndex = () => {
  const request = {
    address: addressForAPI(getXMSSDetails().address),
    network: selectedNetwork(),
  }
  Meteor.call('getOTS', request, (err, res) => {
    if (err) {
      console.log('err: ', err)
      Session.set('transferFromBalance', 0)
      Session.set('transferFromTokenState', [])
      Session.set('address', 'Error')
      Session.set('otsKeyEstimate', 0)
      Session.set('otsKeysRemaining', 0)
      Session.set('otsBitfield', {})
      Session.set('errorLoadingTransactions', true)
    } else {
      console.log('getOTS response: ', res)
      Session.set('suggestedXMSSIndex', res.next_unused_ots_index)
    }
  })
}

async function updateLedgerIdx(otsKey, callback) {
  if (isElectrified()) {
    Meteor.call('ledgerSetIdx', otsKey, (err, data) => {
      if (data.error_message !== 'Timeout') {
        console.log('> Set Ledger OTS Key via USB')
        callback(null, data)
      }
    })
  } else {
    const QrlLedger = await createTransport()
    QrlLedger.setIdx(otsKey).then(idxResponse => {
      console.log('> Set Ledger OTS Key via WebUSB')
      callback(null, idxResponse)
    })
  }
}

function updateLedgerOtsKeyIndex() {
  // Get OTS Index
  const otsKey = parseInt(document.getElementById('otsKey').value, 10)

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#updatingLedger').hide()
    window.walletUi.showModal('#otsKeyReuseDetected')
    return
  }

  // Attempt to set IDX
  console.log('Setting Ledger Nano XMSS Index to: ', otsKey)
  // QrlLedger.setIdx(otsKey).then(idxResponse => {
  updateLedgerIdx(otsKey, function (err, idxResponse) {
    $('#updatingLedger').hide()
    console.log('Ledger Response')
    console.log(idxResponse)

    if (!ledgerReturnedError(idxResponse)) {
      // Success
      $('#otsKeyUpdated').show()
    } else {
      // Error
      console.log()
      $('#otsKeyUpdateFailed').show()
    }


    getBalance(getXMSSDetails().address, function () {
      console.log('Got balance')
    })
  })
}

Template.appXmssIndexUpdate.onRendered(() => {
  // Get wallet balance
  getBalance(getXMSSDetails().address, function () {
    console.log('Got balance')
  })
  getNodeXMSSIndex()
})

Template.appXmssIndexUpdate.events({
  'submit #updateXmssIndexForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#updatingLedger').show()
    $('#otsKeyUpdated').hide()
    $('#otsKeyUpdateFailed').hide()

    setTimeout(() => { updateLedgerOtsKeyIndex() }, 200)
  },
})

Template.appXmssIndexUpdate.helpers({
  currentLedgerXMSSIndex() {
    const currentLedgerXMSSIndex = Session.get('otsKeyEstimate')
    return currentLedgerXMSSIndex
  },
  suggestedXMSSIndex() {
    return Session.get('suggestedXMSSIndex')
  },
  ledgerAppVersion() {
    const appVersion = Session.get('ledgerDetailsAppVersion')
    return appVersion
  },
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
})

Template.appXmssIndexUpdate.onRendered(() => {
  checkIfLedgerTreesMatch()
})
