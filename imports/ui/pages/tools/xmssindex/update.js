import './update.html'

function updateLedgerOtsKeyIndex() {
  // Get OTS Index
  const otsKey = parseInt(document.getElementById('otsKey').value)

  // Fail if OTS Key reuse is detected
  if(otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#updatingLedger').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Attempt to set IDX
  console.log('Setting Ledger Nano XMSS Index to: ', otsKey)
  QrlLedger.setIdx(otsKey).then(idxResponse => {
    $('#updatingLedger').hide()
    console.log('Ledger Response')
    console.log(idxResponse)

    if (idxResponse.return_code == 36864) {
      // Success
      $('#otsKeyUpdated').show()
    } else {
      // Error
      console.log()
      $('#otsKeyUpdateFailed').show()
    }


    getBalance(getXMSSDetails().address, function() {
      console.log('Got balance')
    })
  })
}

Template.appXmssIndexUpdate.onRendered(() => {
  // Get wallet balance
  getBalance(getXMSSDetails().address, function() {
    console.log('Got balance')
  })
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
    const bitfield = Session.get('otsBitfield')
    // Identify the largest OTS Key utilised in the bitfield
    let largestIndex = 0
    for (let i in bitfield) {
      if (bitfield[i] == 1) {
        largestIndex = i
      }
      // Only 255 indexs in Ledger bitfields
      if(i >= 255) {
        break;
      }
    }
    // Suggested XMSS Index is largestedIndex + 1
    return parseInt(largestIndex) + 1
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