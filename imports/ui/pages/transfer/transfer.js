/* eslint no-console:0, no-len: 0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import JSONFormatter from 'json-formatter-js'
import { BigNumber } from 'bignumber.js'

import qrlAddressValdidator from '@theqrl/validate-qrl-address'
import helpers from '@theqrl/explorer-helpers'
import {
  isElectrified,
  createTransport,
  ledgerReturnedError,
} from '../../../startup/client/functions'
import './transfer.html'

async function verifyLedgerNanoAddress(callback) {
  console.log('-- Verify Ledger Nano S Address --')
  if (isElectrified()) {
    Meteor.call('ledgerVerifyAddress', [], (err, data) => {
      console.log('> Got Ledger Nano address verification from USB')
      console.log(data)
      callback(null, data)
    })
  } else {
    const QrlLedger = await createTransport()
    QrlLedger.viewAddress().then((data) => {
      console.log('> Got Ledger Nano address verification from WebUSB')
      console.log(data)
      callback(null, data)
    })
  }
}

async function getLedgerCreateTx(
  sourceAddr,
  fee,
  destAddr,
  destAmount,
  callback
) {
  console.log('-- Getting QRL Ledger Nano App createTx --')
  if (isElectrified()) {
    Meteor.call(
      'ledgerCreateTx',
      sourceAddr,
      fee,
      destAddr,
      destAmount,
      (err, data) => {
        console.log('> Got Ledger Nano createTx from USB')
        console.log(data)
        callback(null, data)
      }
    )
  } else {
    const QrlLedger = await createTransport()
    QrlLedger.createTx(sourceAddr, fee, destAddr, destAmount).then((data) => {
      console.log('> Got Ledger Nano createTx from WebUSB')
      console.log(data)
      callback(null, data)
    })
  }
}
async function getLedgerRetrieveSignature(request, callback) {
  console.log('-- Getting QRL Ledger Nano App Signature --')
  if (isElectrified()) {
    Meteor.call('ledgerRetrieveSignature', request, (err, data) => {
      console.log('> Got Ledger Nano retrieveSignature from USB')
      console.log(data)
      callback(null, data)
    })
  } else {
    const QrlLedger = await createTransport()
    QrlLedger.retrieveSignature(request).then((data) => {
      console.log('> Got Ledger Nano retrieveSignature from WebUSB')
      console.log(data)
      callback(null, data)
    })
  }
}

function enableSendButton() {
  $('#confirmTransaction').attr('disabled', false)
  $('#confirmTransaction').html('Click to Send')
}

function generateTransaction() {
  // Get to/amount details
  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const sendTo = document.getElementsByName('to[]')
  const sendAmounts = document.getElementsByName('amounts[]')

  // Capture outputs
  const thisAddressesTo = []
  const thisAmounts = []

  for (let i = 0; i < sendTo.length; i += 1) {
    const thisAddress = sendTo[i].value

    // Fail early if attempting to send to an Ethereum style 0x address
    if (thisAddress[0] === '0' && thisAddress[1] === 'x') {
      $('#generating').hide()
      $('#invalidAddress0x').modal('show')
      return
    }

    thisAddressesTo.push(anyAddressToRawAddress(thisAddress.trim()))
  }

  // Fail if more than 3 recipients using Ledger
  if (thisAddressesTo.length > 3 && getXMSSDetails().walletType === 'ledger') {
    $('#generating').hide()
    $('#maxThreeRecipientsLedger').modal('show')
  }

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    if (getXMSSDetails().walletType === 'ledger') {
      $('#ledgerOtsKeyReuseDetected').modal('show')
    } else {
      $('#otsKeyReuseDetected').modal('show')
    }
    return
  }

  // Format amounts correctly.
  for (let i = 0; i < sendAmounts.length; i += 1) {
    const convertAmountToBigNumber = new BigNumber(sendAmounts[i].value)
    const thisAmount = convertAmountToBigNumber
      .times(SHOR_PER_QUANTA)
      .toNumber()
    thisAmounts.push(thisAmount)
  }

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    fromAddress: sendFrom,
    addresses_to: thisAddressesTo,
    amounts: thisAmounts,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  // add message field if present
  const userMessage = document.getElementById('message').value
  let messageBytes = null
  if (userMessage.length > 0) {
    messageBytes = stringToBytes(userMessage)
    request.message_data = messageBytes
  }

  wrapMeteorCall('transferCoins', request, (err, res) => {
    if (err) {
      Session.set('transactionGenerationError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      const confirmation_outputs = [] // eslint-disable-line

      const resAddrsTo =
        res.response.extended_transaction_unsigned.tx.transfer.addrs_to
      const resAmounts =
        res.response.extended_transaction_unsigned.tx.transfer.amounts
      let totalTransferAmount = 0

      for (let i = 0; i < resAddrsTo.length; i += 1) {
        // Create and store the output
        const thisOutput = {
          address: Buffer.from(resAddrsTo[i]),
          address_hex: helpers.rawAddressToHexAddress(resAddrsTo[i]),
          address_b32: helpers.rawAddressToB32Address(resAddrsTo[i]),
          amount: resAmounts[i] / SHOR_PER_QUANTA,
          name: 'Quanta',
        }
        confirmation_outputs.push(thisOutput)

        // Update total transfer amount
        totalTransferAmount += parseInt(resAmounts[i], 10)
      }

      const confirmation = {
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(
          res.response.extended_transaction_unsigned.addr_from
        ), // eslint-disable-line
        from_b32: helpers.rawAddressToB32Address(
          res.response.extended_transaction_unsigned.addr_from
        ), // eslint-disable-line
        outputs: confirmation_outputs,
        fee:
          res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        otsKey: otsKey, // eslint-disable-line
      }

      if (userMessage.length > 0) {
        messageBytes = stringToBytes(userMessage)
        confirmation.message_data = messageBytes
      }

      if (nodeReturnedValidResponse(request, confirmation, 'transferCoins')) {
        Session.set('transactionConfirmation', confirmation)
        Session.set(
          'transactionConfirmationAmount',
          totalTransferAmount / SHOR_PER_QUANTA
        )
        Session.set('transactionConfirmationFee', confirmation.fee)
        Session.set('transactionConfirmationMessage', confirmation.message_data)
        Session.set('transactionConfirmationResponse', res.response)

        // Show confirmation
        $('#generateTransactionArea').hide()
        $('#confirmTransactionArea').show()
      } else {
        // Hide generating component
        $('#generating').hide()
        // Show warning modal
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

function confirmTransaction() {
  const tx = Session.get('transactionConfirmationResponse')
  tx.message_data = Session.get('transactionConfirmationMessage')
  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType === 'seed') {
    XMSS_OBJECT.setIndex(
      parseInt(Session.get('transactionConfirmation').otsKey, 10)
    )
  }

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee) // eslint-disable-line
  )

  if (tx.message_data) {
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      tx.message_data
    )
  }

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.transfer.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.transfer.amounts
  const destAddr = []
  const destAmount = []
  for (let i = 0; i < addrsToRaw.length; i += 1) {
    // Add address
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      addrsToRaw[i] // eslint-disable-line
    )

    // Add amount
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      toBigendianUint64BytesUnsigned(amountsRaw[i]) // eslint-disable-line
    )

    // Add to array for Ledger Transactions
    destAddr.push(Buffer.from(addrsToRaw[i]))
    destAmount.push(toBigendianUint64BytesUnsigned(amountsRaw[i], true))
  }

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(concatenatedArrays)

  // Create sha256 sum of concatenatedarray
  const shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the transaction and relay into network.
  if (getXMSSDetails().walletType === 'seed') {
    // Show relaying message
    $('#relaying').show()

    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(
      XMSS_OBJECT.sign(shaSum)
    )

    // Calculate transaction hash
    const txnHashConcat = concatenateTypedArrays(
      Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      hexToBytes(XMSS_OBJECT.getPK()) // eslint-disable-line
    )

    const txnHashableBytes = toUint8Vector(txnHashConcat)

    const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

    console.log('Txn Hash: ', txnHash)

    // add ,message
    tx.message_data = Session.get('transactionConfirmationMessage')

    // Prepare gRPC call
    tx.network = selectedNetwork()

    wrapMeteorCall('confirmTransaction', tx, (err, res) => {
      if (res.error) {
        $('#transactionConfirmation').hide()
        $('#transactionFailed').show()

        Session.set('transactionFailed', res.error)
      } else {
        Session.set('transactionHash', txnHash)
        Session.set('transactionSignature', res.response.signature)
        Session.set('transactionRelayedThrough', res.relayed)

        // Show result
        $('#generateTransactionArea').hide()
        $('#confirmTransactionArea').hide()
        enableSendButton()
        $('#transactionResultArea').show()

        // Start polling this transcation
        // eslint-disable-next-line no-use-before-define
        pollTransaction(Session.get('transactionHash'), true)
      }
    })
  } else if (getXMSSDetails().walletType === 'ledger') {
    // Reset ledger sign modal view state
    $('#awaitingLedgerConfirmation').show()
    $('#signOnLedgerRejected').hide()
    $('#signOnLedgerTimeout').hide()
    $('#signOnLedgerError').hide()
    $('#ledgerHasConfirmed').hide()
    $('#relayLedgerTxnButton').hide()
    $('#noRemainingSignatures').hide()

    // Show ledger sign modal
    $('#ledgerConfirmationModal')
      .modal({
        closable: false,
        onDeny: () => {
          // Clear session state for transaction
          Session.set('ledgerTransaction', '')
          Session.set('ledgerTransactionHash', '')
        },
        onApprove: () => {
          // Hide modal, and show relaying message
          $('#ledgerConfirmationModal').modal('hide')
          $('#relaying').show()

          // Relay the transaction
          wrapMeteorCall(
            'confirmTransaction',
            Session.get('ledgerTransaction'),
            (err, res) => {
              if (res.error) {
                $('#transactionConfirmation').hide()
                $('#transactionFailed').show()

                Session.set('transactionFailed', res.error)
              } else {
                Session.set(
                  'transactionHash',
                  Session.get('ledgerTransactionHash')
                )
                Session.set('transactionSignature', res.response.signature)
                Session.set('transactionRelayedThrough', res.relayed)

                // Show result
                $('#generateTransactionArea').hide()
                $('#confirmTransactionArea').hide()
                enableSendButton()
                $('#transactionResultArea').show()

                // Start polling this transcation
                // eslint-disable-next-line no-use-before-define
                pollTransaction(Session.get('transactionHash'), true)
              }
            }
          )
        },
      })
      .modal('show')

    // Create a transaction
    const sourceAddr = hexToBytes(QRLLIB.getAddress(getXMSSDetails().pk))
    const fee = toBigendianUint64BytesUnsigned(
      tx.extended_transaction_unsigned.tx.fee,
      true
    )

    getLedgerCreateTx(
      sourceAddr,
      fee,
      destAddr,
      destAmount,
      function (err, txn) {
        getLedgerRetrieveSignature(txn, function (err, sigResponse) {
          // Hide the awaiting ledger confirmation spinner
          $('#awaitingLedgerConfirmation').hide()

          // Check if ledger rejected transaction
          if (sigResponse.return_code === 27014) {
            $('#signOnLedgerRejected').show()
            // Show no signatures remaining message if there are none remaining.
            if (Session.get('transactionConfirmation').otsKey >= 256) {
              $('#noRemainingSignatures').show()
            }
            // Check if the the request timed out waiting for response on ledger
          } else if (sigResponse.return_code === 14) {
            $('#signOnLedgerTimeout').show()
            // Check for unknown errors
          } else if (
            sigResponse.return_code === 1 &&
            sigResponse.error_message == 'Unknown error code'
          ) {
            $('#signOnLedgerError').show()
          } else {
            // Show confirmation message
            $('#ledgerHasConfirmed').show()

            tx.extended_transaction_unsigned.tx.signature =
              sigResponse.signature

            // Calculate transaction hash
            const txnHashConcat = concatenateTypedArrays(
              Uint8Array,
              binaryToBytes(shaSum),
              tx.extended_transaction_unsigned.tx.signature,
              hexToBytes(getXMSSDetails().pk) // eslint-disable-line
            )

            const txnHashableBytes = toUint8Vector(txnHashConcat)

            const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

            console.log('Txn Hash: ', txnHash)

            // Prepare gRPC call
            tx.network = selectedNetwork()

            // Set session values for later relaying
            Session.set('ledgerTransaction', tx)
            Session.set('ledgerTransactionHash', txnHash)

            // Show relay button
            $('#relayLedgerTxnButton').show()
          }
        }) // retrieveSignature
      }
    ) // getLedgerCreateTx
  }
}

function cancelTransaction() {
  Session.set('transactionConfirmation', '')
  Session.set('transactionConfirmationAmount', '')
  Session.set('transactionConfirmationFee', '')
  Session.set('transactionConfirmationResponse', '')
  Session.set('transactionConfirmationMessage', '')
  Session.set('transactionFailed', 'User requested cancellation')

  $('#generateTransactionArea').show()
  $('#confirmTransactionArea').hide()
  enableSendButton()
  $('#transactionResultArea').hide()
}

function sendTokensTxnCreate(tokenHash, decimals) {
  // No Token Support for Ledger Nano
  if (getXMSSDetails().walletType === 'ledger') {
    ledgerHasNoTokenSupport()
    return
  }

  // Get to/amount details
  const sendFrom = anyAddressToRawAddress(Session.get('transferFromAddress'))
  const txnFee = document.getElementById('fee').value
  const otsKey = document.getElementById('otsKey').value
  const sendTo = document.getElementsByName('to[]')
  const sendAmounts = document.getElementsByName('amounts[]')

  // Convert strings to bytes
  const pubKey = hexToBytes(getXMSSDetails().pk)
  const tokenHashBytes = stringToBytes(tokenHash)

  // Fail if OTS Key reuse is detected
  if (otsIndexUsed(Session.get('otsBitfield'), otsKey)) {
    $('#generating').hide()
    $('#otsKeyReuseDetected').modal('show')
    return
  }

  // Capture outputs
  const thisAddressesTo = []
  const thisAmounts = []

  for (let i = 0; i < sendTo.length; i += 1) {
    const thisAddress = sendTo[i].value
    thisAddressesTo.push(anyAddressToRawAddress(thisAddress.trim()))
  }
  for (let i = 0; i < sendAmounts.length; i += 1) {
    const convertAmountToBigNumber = new BigNumber(sendAmounts[i].value)
    const thisAmount = convertAmountToBigNumber
      .times(Math.pow(10, decimals))
      .toNumber() // eslint-disable-line
    thisAmounts.push(thisAmount)
  }

  // Calculate txn fee
  const convertFeeToBigNumber = new BigNumber(txnFee)
  const thisTxnFee = convertFeeToBigNumber.times(SHOR_PER_QUANTA).toNumber()

  // Construct request
  const request = {
    addressFrom: sendFrom,
    addresses_to: thisAddressesTo,
    amounts: thisAmounts,
    tokenHash: tokenHashBytes,
    fee: thisTxnFee,
    xmssPk: pubKey,
    network: selectedNetwork(),
  }

  wrapMeteorCall('createTokenTransferTxn', request, (err, res) => {
    if (err) {
      Session.set('tokenTransferError', err.reason)
      $('#transactionGenFailed').show()
      $('#transferForm').hide()
    } else {
      const tokenDetails = {}
      _.each(Session.get('tokensHeld'), (token) => {
        if (token.hash === tokenHash) {
          tokenDetails.symbol = token.symbol
          tokenDetails.name = token.symbol
          tokenDetails.token_txhash = token.hash
          tokenDetails.decimals = token.decimals
        }
      })

      const confirmationOutputs = []

      const resAddrsTo =
        res.response.extended_transaction_unsigned.tx.transfer_token.addrs_to
      const resAmounts =
        res.response.extended_transaction_unsigned.tx.transfer_token.amounts
      let totalTransferAmount = 0

      for (let i = 0; i < resAddrsTo.length; i += 1) {
        // Create and store the output
        const thisOutput = {
          address: Buffer.from(resAddrsTo[i]),
          address_hex: helpers.rawAddressToHexAddress(resAddrsTo[i]),
          address_b32: helpers.rawAddressToB32Address(resAddrsTo[i]),
          amount: resAmounts[i] / Math.pow(10, decimals), // eslint-disable-line
          name: tokenDetails.symbol,
        }
        confirmationOutputs.push(thisOutput)

        // Update total transfer amount
        totalTransferAmount += parseInt(resAmounts[i], 10)
      }

      const confirmation = {
        hash: res.txnHash,
        from: Buffer.from(res.response.extended_transaction_unsigned.addr_from),
        from_hex: helpers.rawAddressToHexAddress(
          res.response.extended_transaction_unsigned.addr_from
        ), // eslint-disable-line
        from_b32: helpers.rawAddressToB32Address(
          res.response.extended_transaction_unsigned.addr_from
        ), // eslint-disable-line
        outputs: confirmationOutputs,
        fee:
          res.response.extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA,
        tokenHash:
          res.response.extended_transaction_unsigned.tx.transfer_token
            .token_txhash,
        otsKey: otsKey, // eslint-disable-line
      }

      if (
        nodeReturnedValidResponse(
          request,
          confirmation,
          'createTokenTransferTxn',
          decimals
        )
      ) {
        Session.set('tokenTransferConfirmation', confirmation)
        Session.set('tokenTransferConfirmationDetails', tokenDetails)
        Session.set('tokenTransferConfirmationResponse', res.response)
        Session.set(
          'tokenTransferConfirmationAmount',
          totalTransferAmount / Math.pow(10, decimals)
        ) // eslint-disable-line

        // Show confirmation
        $('#generateTransactionArea').hide()
        $('#confirmTokenTransactionArea').show()
      } else {
        $('#invalidNodeResponse').modal('show')
      }
    }
  })
}

function confirmTokenTransfer() {
  // No Token Support for Ledger Nano
  if (getXMSSDetails().walletType === 'ledger') {
    ledgerHasNoTokenSupport()
    return
  }

  const tx = Session.get('tokenTransferConfirmationResponse')

  // Set OTS Key Index for seed wallets
  if (getXMSSDetails().walletType === 'seed') {
    XMSS_OBJECT.setIndex(
      parseInt(Session.get('tokenTransferConfirmation').otsKey, 10)
    )
  }

  // Concatenate Uint8Arrays
  let concatenatedArrays = concatenateTypedArrays(
    Uint8Array,
    toBigendianUint64BytesUnsigned(tx.extended_transaction_unsigned.tx.fee),
    tx.extended_transaction_unsigned.tx.transfer_token.token_txhash // eslint-disable-line
  )

  // Now append all recipient (outputs) to concatenatedArrays
  const addrsToRaw = tx.extended_transaction_unsigned.tx.transfer_token.addrs_to
  const amountsRaw = tx.extended_transaction_unsigned.tx.transfer_token.amounts
  for (let i = 0; i < addrsToRaw.length; i += 1) {
    // Add address
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      addrsToRaw[i] // eslint-disable-line
    )

    // Add amount
    concatenatedArrays = concatenateTypedArrays(
      Uint8Array,
      concatenatedArrays,
      toBigendianUint64BytesUnsigned(amountsRaw[i]) // eslint-disable-line
    )
  }

  // Convert Uint8Array to VectorUChar
  const hashableBytes = toUint8Vector(concatenatedArrays)

  // Create sha256 sum of concatenatedarray
  const shaSum = QRLLIB.sha2_256(hashableBytes)

  // Sign the transaction and relay into network.
  if (getXMSSDetails().walletType === 'seed') {
    // Sign the sha sum
    tx.extended_transaction_unsigned.tx.signature = binaryToBytes(
      XMSS_OBJECT.sign(shaSum)
    )

    // Calculate transaction hash
    const txnHashConcat = concatenateTypedArrays(
      Uint8Array,
      binaryToBytes(shaSum),
      tx.extended_transaction_unsigned.tx.signature,
      hexToBytes(XMSS_OBJECT.getPK()) // eslint-disable-line
    )

    const txnHashableBytes = toUint8Vector(txnHashConcat)

    const txnHash = QRLLIB.bin2hstr(QRLLIB.sha2_256(txnHashableBytes))

    console.log('Txn Hash: ', txnHash)

    tx.network = selectedNetwork()

    wrapMeteorCall('confirmTokenTransfer', tx, (err, res) => {
      if (res.error) {
        $('#tokenCreationConfirmation').hide()
        $('#transactionFailed').show()

        Session.set('transactionFailed', res.error)
      } else {
        Session.set('transactionHash', txnHash)
        Session.set('transactionSignature', res.response.signature)
        Session.set('transactionRelayedThrough', res.relayed)

        // Show result
        $('#generateTransactionArea').hide()
        $('#confirmTokenTransactionArea').hide()
        $('#tokenTransactionResultArea').show()

        // Start polling this transcation
        // eslint-disable-next-line no-use-before-define
        pollTransaction(Session.get('transactionHash'), true)
      }
    })
  } else if (getXMSSDetails().walletType === 'ledger') {
    // TODO When Supported
  }
}

function setRawDetail() {
  try {
    const myJSON = Session.get('txhash').transaction
    const formatter = new JSONFormatter(myJSON)
    $('#quantaJsonbox').html(formatter.render())
    $('#tokenJsonbox').html(formatter.render())
  } catch (err) {
    console.log('Error adding transaction to raw detail.')
  }
}

// Checks the result of a stored txhash object, and polls again if not completed or failed.
function checkResult(thisTxId, failureCount) {
  try {
    if (Session.get('txhash').transaction.header != null) {
      // Complete
      const userMessage = `Complete - Transaction ${thisTxId} is in block ${
        Session.get('txhash').transaction.header.block_number
      } with 1 confirmation.`
      Session.set('txstatus', userMessage)
      Session.set('transactionConfirmed', 'true')
      $('.loading').hide()
      $('#loadingHeader').hide()
      refreshTransferPage(function () {
        // Show warning is otsKeysRemaining is low
        if (Session.get('otsKeysRemaining') < 50) {
          // Shown low OTS Key warning modal
          $('#lowOtsKeyWarning').modal('transition', 'disable').modal('show')
        }
      })
      loadAddressTransactions(getXMSSDetails().address, 1)
      updateBalanceField()
    } else if (Session.get('txhash').error != null) {
      // We attempt to find the transaction 5 times below absolutely failing.
      if (failureCount < 5) {
        // eslint-disable-next-line no-use-before-define
        setTimeout(() => {
          pollTransaction(thisTxId, false, failureCount + 1)
        }, POLL_TXN_RATE)
      } else {
        // Transaction error - Give up
        const errorMessage = `Error - ${Session.get('txhash').error}`
        Session.set('txstatus', errorMessage)
        Session.set('transactionConfirmed', 'false')
        $('.loading').hide()
        $('#loadingHeader').hide()
      }
    } else {
      // Poll again
      // eslint-disable-next-line no-use-before-define
      setTimeout(() => {
        pollTransaction(thisTxId)
      }, POLL_TXN_RATE)
    }
  } catch (err) {
    // Most likely is that the mempool is not replying the transaction.
    // We attempt to find it ongoing for a while
    console.log(`Caught Error: ${err}`)

    // Continue to check the txn status until POLL_MAX_CHECKS is reached in failureCount
    if (failureCount < POLL_MAX_CHECKS) {
      // eslint-disable-next-line no-use-before-define
      setTimeout(() => {
        pollTransaction(thisTxId, false, failureCount + 1)
      }, POLL_TXN_RATE)
    } else {
      // Transaction error - Give up
      Session.set('txstatus', 'Error')
      Session.set('transactionConfirmed', 'false')
      $('.loading').hide()
      $('#loadingHeader').hide()
    }
  }
}

// Poll a transaction for its status after relaying into network.
function pollTransaction(thisTxId, firstPoll = false, failureCount = 0) {
  // Reset txhash on first poll.
  if (firstPoll === true) {
    Session.set('txhash', {})
  }

  Session.set('txstatus', 'Pending')
  Session.set('transactionConfirmed', 'false')

  const request = {
    query: thisTxId,
    network: selectedNetwork(),
  }

  if (thisTxId) {
    wrapMeteorCall('getTxnHash', request, (err, res) => {
      if (err) {
        if (failureCount < POLL_MAX_CHECKS) {
          Session.set('txhash', {})
          Session.set('txstatus', 'Pending')
        } else {
          Session.set('txhash', { error: err, id: thisTxId })
          Session.set('txstatus', 'Error')
        }
        checkResult(thisTxId, failureCount)
      } else {
        res.error = null
        Session.set('txhash', res)
        setRawDetail()
        checkResult(thisTxId, failureCount)
      }
    })
  }
}

// Get list of ids for recipients
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
          type: 'validFloat',
          prompt: 'You must enter a valid amount to send',
        },
        {
          type: 'empty',
          prompt: 'You must enter a valid amount to send',
        },
        {
          type: 'number',
          prompt: 'Amount must be a number',
        },
        {
          type: 'maxDecimals',
          prompt:
            'You can only enter up to 9 decimal places in the amount field',
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

  validationRules['message'] = {
    id: 'message',
    rules: [
      {
        type: 'maxLength[80]',
        prompt: 'The max length of a message is 80 bytes.',
      },
    ],
  }

  // Valid float
  $.fn.form.settings.rules.validFloat = function (value) {
    // == is intended here
    if (parseFloat(value) == value && parseFloat(value).toString().length === value.length) { // eslint-disable-line
      return true
    }
    return false
  }

  // Max of 9 decimals
  $.fn.form.settings.rules.maxDecimals = function (value) {
    try {
      return countDecimals(value) <= 9
    } catch (e) {
      return false
    }
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
    inline: true,
    on: 'blur',
  })
}

Template.appTransfer.onCreated(() => {
  // Route to open wallet is already opened
  if (Session.get('walletStatus').unlocked === false) {
    const params = {}
    const path = FlowRouter.path('/open', params)
    FlowRouter.go(path)
  }
})

Template.appTransfer.onRendered(() => {
  // Initialise dropdowns
  $('.ui.dropdown').dropdown()

  // Initialise Form Validation
  initialiseFormValidation()

  // Initialise tabs
  $('#sendReceiveTabs .item').tab()

  // Load transactions
  refreshTransferPage(function () {
    // Show warning is otsKeysRemaining is low
    if (Session.get('otsKeysRemaining') < 50) {
      // Shown low OTS Key warning modal
      $('#lowOtsKeyWarning').modal('transition', 'disable').modal('show')
    }
  })
  loadAddressTransactions(getXMSSDetails().address, 1)
  updateBalanceField()

  // Warn if user is has opened the 0 byte address (test mode on Ledger)
  if (
    getXMSSDetails().address ===
    'Q000400846365cd097082ce4404329d143959c8e4557d19b866ce8bf5ad7c9eb409d036651f62bd'
  ) {
    $('#zeroBytesAddressWarning').modal('transition', 'disable').modal('show')
  }

  Tracker.autorun(function () {
    if (Session.get('walletStatus') !== undefined) {
      if (Session.get('walletStatus').unlocked !== false) {
        const xmss = getXMSSDetails()
        if (xmss !== null) {
          if (LocalStore.get('addressFormat') === 'bech32') {
            $('.qr-code-container').empty()
            $('.qr-code-container').qrcode({
              width: 142,
              height: 142,
              text: getXMSSDetails().addressB32,
            })
          } else {
            $('.qr-code-container').empty()
            $('.qr-code-container').qrcode({
              width: 142,
              height: 142,
              text: getXMSSDetails().address,
            })
          }
          $('#recQR').empty()
          $('#recQR').qrcode({ width: 142, height: 142, text: xmss.hexseed })
        }
      }
    }
  })
})

Template.appTransfer.events({
  'click .transactionRecord': (event) => {
    event.preventDefault()
    event.stopPropagation()
    const txhash = $(event.target)
      .closest('.transactionRecord')
      .attr('data-txhash')

    FlowRouter.go(`/verify-txid/${txhash}`)
  },
  'click #showMessageField': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#messageField').show()
    $('#showMessageField').hide()
  },
  'click #clearMessageField': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#message').val('')
    $('#messageField').hide()
    $('#showMessageField').show()
  },
  'submit #generateTransactionForm': (event) => {
    event.preventDefault()
    event.stopPropagation()
    $('#generating').show()
    setTimeout(() => {
      // Determine if Quanta or Token transfer
      const selectedType = document.getElementById('amountType').value
      // Quanta Xfer
      if (selectedType === 'quanta') {
        generateTransaction()
      } else {
        // Token Xfer
        const tokenHash = selectedType.split('-')[1]
        const decimals = selectedType.split('-')[2]
        sendTokensTxnCreate(tokenHash, decimals)
      }
    }, 200)
  },
  'click #confirmTransaction': () => {
    $('#confirmTransaction').attr('disabled', true)
    $('#confirmTransaction').html('<div class="ui active inline loader"></div>')
    setTimeout(() => {
      confirmTransaction()
    }, 200)
  },
  'click #confirmTokenTransaction': () => {
    $('#relayingTokenXfer').show()
    setTimeout(() => {
      confirmTokenTransfer()
    }, 200)
  },
  'click #cancelTransaction': () => {
    cancelTransaction()
  },
  'click #quantaJsonClick': () => {
    if (!$('#quantaJsonbox').html()) {
      setRawDetail()
    }
    $('#quantaJsonbox').toggle()
  },
  'click #tokenJsonClick': () => {
    if (!$('#tokenJsonbox').html()) {
      setRawDetail()
    }
    $('#tokenJsonbox').toggle()
  },
  'change #amountType': () => {
    updateBalanceField()
  },
  'click #addTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Prevent adding more than 2 additional recipients when using Ledger Nano
    if (
      getRecipientIds().length > 2 &&
      getXMSSDetails().walletType === 'ledger'
    ) {
      $('#maxRecipientsReached').modal('show')
    } else {
      // Increment count of recipients
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
      initialiseFormValidation()
    }
  },
  'click .removeTransferRecipient': (event) => {
    event.preventDefault()
    event.stopPropagation()

    // Remove the recipient
    $(event.currentTarget).parent().parent().parent().remove()

    // Initialise form validation
    initialiseFormValidation()
  },
  'click .pagination': (event) => {
    let b = 0
    Session.set('addressTransactions', {})
    if (parseInt(event.target.text, 10)) {
      b = parseInt(event.target.text, 10)
      Session.set('active', b)
    } else {
      const a = event.target.getAttribute('qrl-data')
      b = Session.get('active')
      const c = Session.get('pages').length
      if (a === 'forward') {
        b += 1
      }
      if (a === 'back') {
        b -= 1
      }
      if (b > c) {
        b = c
      }
      if (b < 1) {
        b = 1
      }
    }
    // const startIndex = (b - 1) * 10
    Session.set('active', b)
    Session.set('fetchedTx', false)
    $('.loader').show()
    $('#loadingTransactions').show()
    loadAddressTransactions(getXMSSDetails().address, b)
  },
  'keypress #paginator': (event) => {
    if (event.keyCode === 13) {
      const x = parseInt($('#paginator').val(), 10)
      const max = Session.get('pages').length
      if (x < max + 1 && x > 0) {
        loadAddressTransactions(getXMSSDetails().address, x)
      }
    }
  },
  'click #showRecoverySeed': () => {
    $('#recoverySeedModal').modal('show')
  },
  'click #verifyLedgerNanoAddress': () => {
    $('#verifyLedgerNanoAddressModal').modal('show')
    verifyLedgerNanoAddress(function () {})
  },
})

Template.appTransfer.helpers({
  includesMessage() {
    try {
      const m = Session.get('transactionConfirmationMessage')
      if (m.length > 0) {
        return true
      }
      return false
    } catch (e) {
      return false
    }
  },
  messageText() {
    return Buffer.from(Session.get('transactionConfirmationMessage')).toString()
  },
  tokenTotalTransferred() {
    const num = this.totalTransferred
    const { decimals } = this.tx.transfer_token
    const convertAmountToBigNumber = new BigNumber(num)
    return convertAmountToBigNumber.dividedBy(Math.pow(10, decimals)).toString() // eslint-disable-line
  },
  transferFrom() {
    const transferFrom = {}
    transferFrom.balance = Session.get('transferFromBalance')
    transferFrom.address = hexOrB32(Session.get('transferFromAddress'))
    return transferFrom
  },
  bech32() {
    if (LocalStore.get('addressFormat') === 'bech32') {
      return true
    }
    return false
  },
  transactionConfirmation() {
    const confirmation = Session.get('transactionConfirmation')
    return confirmation
  },
  transactionConfirmationAmount() {
    const confirmationAmount = Session.get('transactionConfirmationAmount')
    return confirmationAmount
  },
  transactionConfirmationFee() {
    try {
      if (Session.get('transactionConfirmationResponse') === undefined) {
        return false
      }
      const transactionConfirmationFee =
        Session.get('transactionConfirmationResponse')
          .extended_transaction_unsigned.tx.fee / SHOR_PER_QUANTA
      return transactionConfirmationFee
    } catch (e) {
      return false
    }
  },
  transactionGenerationError() {
    const error = Session.get('transactionGenerationError')
    return error
  },
  otsKeyEstimate() {
    const otsKeyEstimate = Session.get('otsKeyEstimate')
    return otsKeyEstimate
  },
  otsKeysRemaining() {
    const otsKeysRemaining = Session.get('otsKeysRemaining')
    return otsKeysRemaining
  },
  nodeExplorerUrl() {
    if (
      Session.get('nodeExplorerUrl') === '' ||
      Session.get('nodeExplorerUrl') === null
    ) {
      return DEFAULT_NETWORKS[0].explorerUrl
    }
    return Session.get('nodeExplorerUrl')
  },
  transactionFailed() {
    const failed = Session.get('transactionFailed')
    return failed
  },
  transactionHash() {
    const hash = Session.get('transactionHash')
    return hash
  },
  transactionSignature() {
    const hash = Session.get('transactionSignature')
    return hash
  },
  transactionStatus() {
    const status = Session.get('txstatus')
    return status
  },
  transactionRelayedThrough() {
    const status = Session.get('transactionRelayedThrough')
    return status
  },
  txDetail() {
    try {
      if (Session.get('txhash') === undefined) {
        return false
      }
      const txDetail = Session.get('txhash').transaction.tx.transfer
      txDetail.amount /= SHOR_PER_QUANTA
      txDetail.fee /= SHOR_PER_QUANTA
      return txDetail
    } catch (e) {
      return false
    }
  },
  tokenTransferConfirmation() {
    try {
      const confirmation = Session.get('tokenTransferConfirmation')
      if (confirmation !== undefined) {
        confirmation.tokenHash = Buffer.from(confirmation.tokenHash).toString(
          'hex'
        )
      }
      return confirmation
    } catch (e) {
      return false
    }
  },
  tokenTransferConfirmationAmount() {
    const amount = Session.get('tokenTransferConfirmationAmount')
    return amount
  },
  tokenDetails() {
    const confirmation = Session.get('tokenTransferConfirmationDetails')
    return confirmation
  },
  otsKey() {
    let otsKey = Session.get('txhash').transaction.tx.signature
    otsKey = parseInt(otsKey.substring(0, 8), 16)
    return otsKey
  },
  addressTransactions() {
    const transactions = Session.get('addressTransactions')
    const formatted = []
    _.each(transactions, (transaction) => {
      const txOut = transaction
      if (transaction.tx.transactionType === 'transfer_token') {
        const lookFor = transaction.tx.transfer_token.token_txhash
        let found = null
        _.each(Session.get('tokensHeld'), (output) => {
          if (output.hash === lookFor) {
            found = output
          }
        })
        if (found) {
          txOut.tx.transfer_token.name = found.name
          txOut.tx.transfer_token.symbol = found.symbol
          txOut.tx.transfer_token.decimals = found.decimals
        }
      }
      formatted.push(txOut)
    })
    return formatted
  },
  addressHasTransactions() {
    try {
      if (Session.get('addressTransactions').length > 0) {
        return true
      }
      return false
    } catch (e) {
      return false
    }
  },
  isMyAddress(address) {
    const a = Buffer.from(anyAddressToRawAddress(address))
    const b = Buffer.from(anyAddressToRawAddress(getXMSSDetails().address))
    if (a.equals(b)) {
      return true
    }
    return false
  },
  isTransfer(txType) {
    if (txType.toLowerCase() === 'transfer') {
      return true
    }
    return false
  },
  isTokenCreation(txType) {
    if (txType.toLowerCase() === 'token') {
      return true
    }
    return false
  },
  isTokenTransfer(txType) {
    if (txType.toLowerCase() === 'transfer_token') {
      return true
    }
    return false
  },
  isCoinbaseTxn(txType) {
    if (txType.toLowerCase() === 'coinbase') {
      return true
    }
    return false
  },
  isSlaveTxn(txType) {
    if (txType.toLowerCase() === 'slave') {
      return true
    }
    return false
  },
  isLatticePKTxn(txType) {
    if (txType.toLowerCase() === 'latticepk') {
      return true
    }
    return false
  },
  isCreateMultiSigTxn(txType) {
    if (txType.toLowerCase() === 'multi_sig_create') {
      return true
    }
    return false
  },
  isSpendMultiSigTxn(txType) {
    if (txType.toLowerCase() === 'multi_sig_spend') {
      return true
    }
    return false
  },
  isVoteMultiSigTxn(txType) {
    if (txType.toLowerCase() === 'multi_sig_vote') {
      return true
    }
    return false
  },
  isMessageTxn(txType) {
    if (txType.toLowerCase() === 'message') {
      return true
    }
    return false
  },
  isDocumentNotarisation(txType) {
    if (txType.toLowerCase() === 'document_notarisation') {
      return true
    }
    return false
  },
  ts() {
    const x = moment.unix(this.timestamp)
    return moment(x).format('HH:mm D MMM YYYY')
  },
  openedAddress() {
    try {
      if (LocalStore.get('addressFormat') === 'bech32') {
        return getXMSSDetails().addressB32
      }
      return getXMSSDetails().address
    } catch (e) {
      return false
    }
  },
  tokensHeld() {
    const tokens = []
    _.each(Session.get('tokensHeld'), (token) => {
      token.shortHash = token.hash.slice(-5) // eslint-disable-line
      tokens.push(token)
    })
    return tokens
  },
  balanceAmount() {
    const b = Session.get('balanceAmount')
    if (b !== '') {
      return b
    }
    return Session.get('transferFromBalance')
  },
  balanceSymbol() {
    return Session.get('balanceSymbol')
  },
  addressValidation() {
    try {
      const thisAddress = getXMSSDetails().address
      const validationResult = qrlAddressValdidator.hexString(thisAddress)

      const result = {}
      result.height = validationResult.sig.height
      result.totalSignatures = validationResult.sig.number
      result.signatureScheme = validationResult.sig.type
      result.hashFunction = validationResult.hash.function

      return result
    } catch (e) {
      return false
    }
  },
  // Pagination for address transactions
  pages() {
    let ret = []
    const active = Session.get('active')
    if (Session.get('pages').length > 0) {
      ret = Session.get('pages')
      if (active - 5 <= 0) {
        ret = ret.slice(0, 9)
      } else {
        if (active + 10 > ret.length) {
          // eslint-disable-line
          ret = ret.slice(ret.length - 10, ret.length)
        } else {
          ret = ret.slice(active - 5, active + 4)
        }
      }
    }
    return ret
  },
  isActive() {
    let ret = ''
    if (this.number === Session.get('active')) {
      ret = 'active'
    }
    return ret
  },
  pback() {
    let ret = false
    if (Session.get('active') !== 1) {
      ret = true
    }
    return ret
  },
  pforward() {
    let ret = false
    if (Session.get('active') !== Session.get('pages').length) {
      ret = true
    }
    return ret
  },
  pagination() {
    let ret = false
    if (Session.get('pages').length > 1) {
      ret = true
    }
    return ret
  },
  currentPage() {
    return Session.get('active')
  },
  totalPages() {
    if (Session.get('pages')) {
      return Session.get('pages').length
    }
    return false
  },
  ledgerWalletDisabled() {
    try {
      if (getXMSSDetails().walletType === 'ledger') {
        return 'disabled'
      }
      return ''
    } catch (error) {
      return ''
    }
  },
  isLedgerWallet() {
    try {
      if (getXMSSDetails().walletType === 'ledger') {
        return true
      }
      return false
    } catch (error) {
      return ''
    }
  },
  isSeedWallet() {
    try {
      if (getXMSSDetails().walletType === 'seed') {
        return true
      }
      return false
    } catch (error) {
      return ''
    }
  },
  errorLoadingTransactions() {
    if (Session.get('errorLoadingTransactions') === true) {
      return true
    }
    return false
  },
  loadingTransactions() {
    if (Session.get('loadingTransactions') === true) {
      return true
    }
    return false
  },
})
Template.recoverySeedModal.helpers({
  recoverySeed() {
    try {
      return getXMSSDetails()
    } catch (e) {
      return false
    }
  },
})
