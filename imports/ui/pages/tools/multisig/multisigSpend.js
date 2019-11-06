/* global hexOrB32, wrapMeteorCall, selectedNetwork, getXMSSDetails,
SHOR_PER_QUANTA, anyAddressToRawAddress */

import helpers from '@theqrl/explorer-helpers'
import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import { checkWeightsAndThreshold } from '@theqrl/wallet-helpers'
import JSONFormatter from 'json-formatter-js'
import { BigNumber } from 'bignumber.js'
import sha256 from 'sha256'

Template.multisigSpend.helpers({
  isActiveTab(p) {
    if (Session.get('activeMultisigTab') === p) {
      return 'active'
    }
    return ''
  },
  transferFrom() {
    const transferFrom = {}
    if (Session.get('multisigTransferFromAddressSet') === true) {
      transferFrom.balance = Session.get('multisigTransferFromBalance')
      transferFrom.address = hexOrB32(Session.get('multisigTransferFromAddress'))
      return transferFrom
    }
    return { address: 'No multisig address selected', balance: 'N/A' }
  },
  hasAddressSet() {
    return Session.get('multisigTransferFromAddressSet')
  },
  otsKeyEstimate() {
    const otsKeyEstimate = Session.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  estimateExpiry() {
    return Session.get('estimateExpiry')
  },
  getInterval() {
    return Session.get('expiryInterval')
  },
})

const loadMultisigs = (a, p) => {
  const addresstx = Buffer.from(a.substring(1), 'hex')
  const request = {
    address: addresstx,
    network: selectedNetwork(),
    item_per_page: 10,
    page_number: p,
  }
  Session.set('multiSigAddresses', [])
  Session.set('loadingmultiSigAddresses', true)
  wrapMeteorCall('getMultiSigAddressesByAddress', request, (err, res) => {
    // console.log('err:', err)
    // console.log('res:', res)
    if (err) {
      Session.set('multiSigAddresses', { error: err })
      Session.set('errorLoadingMultiSig', true)
    } else {
      Session.set('active', p)
      const add = []
      _.each(res.multi_sig_detail, (item => {
        add.push({ address: `Q${Buffer.from(item.address).toString('hex')}`, balance: item.balance / SHOR_PER_QUANTA })
      }))
      Session.set('multiSigAddresses', add)
      Session.set('loadingmultiSigAddresses', false)
      Session.set('errorLoadingMultiSig', false)
    }
  })
}

function getRecipientIds() {
  const ids = []
  const elements = document.getElementsByName('to[]')
  _.each(elements, (element) => {
    const thisId = element.id
    const parts = thisId.split('_')
    ids.push(parseInt(parts[1], 10))
  })
  return ids
}

function estimateExpiry(refreshHeight) {
  const intervalSetting = Session.get('expiryInterval')
  let interval = 86400
  if (intervalSetting === 'approx 30 days') { interval = 86400 }
  if (intervalSetting === 'approx 6 months') { interval = 525600 }
  if (intervalSetting === 'approx 1 year') { interval = 1051200 }
  if (refreshHeight) {
    Meteor.call('getHeight', { network: selectedNetwork() }, (err, resp) => {
      if (!err) {
        Session.set('lastBlockHeight', parseInt(resp.height, 10))
        Session.set('estimateExpiry', (parseInt(resp.height, 10) + interval))
      }
    })
  } else {
    const height = Session.get('lastBlockHeight')
    Session.set('estimateExpiry', (height + interval))
  }
}

// Function to initialise form validation
function initialiseFormValidation() {
  const validationRules = {}

  // Calculate validation fields based on to/amount fields
  _.each(getRecipientIds(), (id) => {
    validationRules['to' + id] = {
      identifier: 'to_' + id,
      rules: [
        {
          type: 'empty',
          prompt: 'Please enter the QRL address you wish to send to',
        },
        {
          type: 'qrlAddressValid',
          prompt: 'Please enter a valid QRL address',
        },
      ],
    }

    validationRules['amounts' + id] = {
      identifier: 'amounts_' + id,
      rules: [
        {
          type: 'empty',
          prompt: 'You must enter an amount',
        },
        {
          type: 'number',
          prompt: 'Amount must be a number',
        },
        {
          type: 'maxDecimals',
          prompt: 'You can only enter up to 9 decimal places in the amount field',
        },
      ],
    }
  })

  // Now set fee and otskey validation rules
  validationRules['fee'] = {
    id: 'fee',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter a fee',
      },
      {
        type: 'number',
        prompt: 'Fee must be a number',
      },
      {
        type: 'maxDecimals',
        prompt: 'You can only enter up to 9 decimal places in the fee field',
      },
    ],
  }
  validationRules['otsKey'] = {
    id: 'otsKey',
    rules: [
      {
        type: 'empty',
        prompt: 'You must enter an OTS Key Index',
      },
      {
        type: 'number',
        prompt: 'OTS Key Index must be a number',
      },
    ],
  }

  // Address Validation
  $.fn.form.settings.rules.qrlAddressValid = function (value) {
    try {
      const rawAddress = anyAddressToRawAddress(value)
      const thisAddress = helpers.rawAddressToHexAddress(rawAddress)
      const isValid = qrlAddressValdidator.hexString(thisAddress)
      return isValid.result
    } catch (e) {
      return false
    }
  }

  // Initialise the form validation
  $('.ui.form').form({
    fields: validationRules,
  })
}

Template.multisigSpend.events({
  'click #changeAddress': () => {
    Session.set('multisigTransferFromAddressSet', false)
    // call api to get addresses
    loadMultisigs(getXMSSDetails().address, 1)
    $('#chooseSpendAddress').modal('show')
  },
  'click #addTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    const nextRecipientId = Math.max(...getRecipientIds()) + 1

    const newTransferRecipient = `
      <div>
        <div class="field">
          <label>Additional Recipient</label>
          <div class="ui action center aligned input"  id="amountFields" style="width: 100%; margin-bottom: 10px;">
            <input type="text" id="to_${nextRecipientId}" name="to[]" placeholder="Address" style="width: 55%;">
            <input type="text" id="amounts_${nextRecipientId}" name="amounts[]" placeholder="Amount" style="width: 30%;">
            <button class="ui red small button removeTransferRecipient" style="width: 10%"><i class="remove user icon"></i></button>
          </div>
        </div>
      </div>
    `

    // Append newTransferRecipient to transferRecipients div
    $('#transferRecipients').append(newTransferRecipient)

    // Initialise form validation
    // initialiseFormValidation()
  },
  'click .removeTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Remove the recipient
    $(event.currentTarget).parent().parent().parent()
      .remove()

    // Initialise form validation
    initialiseFormValidation()
  },
  'click #intervalButton': () => {
    const interval = Session.get('expiryInterval')
    if (interval === 'approx 30 days') { Session.set('expiryInterval', 'approx 6 months') }
    if (interval === 'approx 6 months') { Session.set('expiryInterval', 'approx 1 year') }
    if (interval === 'approx 1 year') { Session.set('expiryInterval', 'approx 30 days') }
    estimateExpiry(false) // update estimated expiry using existing blockheight
  },
})

Template.multisigSpend.onRendered(() => {
  Session.set('expiryInterval', 'approx 30 days')
  Session.set('activeMultisigTab', 'spend')
  Session.set('multisigTransferFromAddressSet', false)
})

// helpers and events for multisig selection modal

Template.msTable.helpers({
  msAddresses() {
    return Session.get('multiSigAddresses')
  },
  msLoading() {
    return Session.get('loadingmultiSigAddresses')
  },
  hasMultisig() {
    if (Session.get('multiSigAddresses').length > 0) {
      return true
    }
    return false
  },
})

Template.msTable.events({
  'click #chooseSpendAddressTable tr': (event) => {
    const a = event.currentTarget.cells[0].textContent.trim()
    const b = event.currentTarget.cells[1].textContent.trim()
    Session.set('multisigTransferFromAddress', a)
    Session.set('multisigTransferFromBalance', b)
    Session.set('multisigTransferFromAddressSet', true)
    estimateExpiry(true) // estimate expiry getting a fresh block height
    $('#chooseSpendAddress').modal('hide')
  },
})
