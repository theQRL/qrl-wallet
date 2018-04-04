module.exports = function () {
  'use strict';

  this.setDefaultTimeout(300000); // 5 minute default timeout

  let newAddress
  let newMnemonic

  this.Then(/^I should then see my wallet details for test 4$/, function () {
    let _el = '#newAddressMnemonic'
    browser.waitForText(_el, 30000) // Wait for a mnemonic to appear

    // Store new address and mnemonic phrase
    newAddress = browser.getText('#newAddress')
    newMnemonic = browser.getText('#newAddressMnemonic')
  })

  this.When(/^I enter my new mnemonic phrase$/, function () {4
    // For some reason, having a password type input element on the page breaks
    // the tests. This is a hack to change the type of the passphrase input
    // to text such that the walletCode setValue statement works.
    browser.execute(function() {
        // browser context
        passphraseBox = document.getElementById("passphrase");
        passphraseBox.type = "text";
    })
    
    console.log(newMnemonic)

    browser.setValue('#walletCode', newMnemonic)
  })

  this.Then(/^I should then see my new address on the page$/, function () {
    let _el = '#walletAddress'
    // All time for gRPC call to be made and reply with data for view state.
    browser.waitForText(_el, 30000)
    expect(browser.getText(_el)).toEqual(newAddress)
  })

  this.When(/^I then click Send and Receive$/, function () {4
    client.moveToObject('#sendAndReceiveButton')
    browser.click('#sendAndReceiveButton')
  })

  this.Then(/^I should see my new address$/, function () {
    let _el = '#transferFormFromAddress'

    // All time for gRPC call to be made and reply with data for view state.
    browser.waitForText(_el, 30000)
  })

  this.Then(/^I should see a precalculated OTS Key Index as "([^"]*)"$/, function (arg1) {
    let _el = '#otsKey'
    client.moveToObject('#otsKey')
    browser.waitForValue(_el, 30000);
    expect(browser.getValue(_el)).toEqual(arg1)
  })

  this.When(/^I then fill in the to address as "([^"]*)"$/, function (arg1) {
    browser.setValue('#to_1', arg1)
  })

  this.When(/^enter the amount as "([^"]*)"$/, function (arg1) {
    browser.setValue('#amounts_1', arg1)
  })

  this.When(/^enter the fee as "([^"]*)"$/, function (arg1) {
    browser.setValue('#fee', arg1)
  })

  this.When(/^change the OTS Key Index to "([^"]*)"$/, function (arg1) {
    browser.setValue('#otsKey', arg1)
  })

  this.When(/^click confirm$/, function () {
    browser.click('#generateTransaction')
  })

  this.Then(/^I should then see a form confirming my transaction$/, function () {
    let _el = '#confirmTransactionArea'
    browser.waitForVisible(_el, 20000)
  })

  this.When(/^I then click confirmation transaction$/, function () {
    browser.click('#confirmTransaction')
  })

  this.Then(/^I should see "([^"]*)"$/, function (arg1) {
    let _el = '#transferRelayingMsg'
    browser.waitForVisible(_el)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should see shortly after "([^"]*)"$/, function (arg1) {
    let _el = '#transferSuccessMessage'
    browser.waitForVisible(_el, 20000)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should "([^"]*)"$/, function (arg1) {
    let _el = '#transferFinalTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 300000, 'expected transaction to be in pending state')
  })

  this.Then(/^shortly after I should see "([^"]*)"$/, function (arg1) {
    let _el = '#transferFinalTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 300000, 'expected transaction confirmation within 5 minutes')

  })

};