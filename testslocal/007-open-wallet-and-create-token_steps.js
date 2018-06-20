var fs = require('fs')

module.exports = function () {
  'use strict';

  this.setDefaultTimeout(300000); // 5 minute default timeout

  this.When(/^I click Create Token$/, function () {4
    client.moveToObject('#createTokenButton')
    browser.click('#createTokenButton')
  })

  this.Then(/^I should see my new address$/, function () {
    let _el = '#transferFormFromAddress'

    // All time for gRPC call to be made and reply with data for view state.
    browser.waitForText(_el, 30000)
  })

  this.When(/^I fill in the Owner address as "([^"]*)"$/, function (arg1) {
    browser.setValue('#owner', arg1)
  })

  this.When(/^I fill in the token symbol as "([^"]*)"$/, function (arg1) {
    browser.setValue('#symbol', arg1)
  })


  this.When(/^I fill in the token name as "([^"]*)"$/, function (arg1) {
    browser.setValue('#name', arg1)
  })

  this.When(/^I set the decimals to "([^"]*)"$/, function (arg1) {
    browser.setValue('#decimals', arg1)
  })


  this.When(/^I fill in holder address 1 as "([^"]*)"$/, function (arg1) {
    browser.setValue('#initialBalancesAddress_1', arg1)
  })

  this.When(/^I fill in holder balance 1 as "([^"]*)"$/, function (arg1) {
    browser.setValue('#initialBalancesAddressAmount_1', arg1)
  })

  this.When(/^I click Add Another Holder$/, function () {4
    client.moveToObject('#addTokenHolder')
    browser.click('#addTokenHolder')
  })

  this.When(/^I fill in holder address 2 as "([^"]*)"$/, function (arg1) {
    browser.setValue('#initialBalancesAddress_2', arg1)
  })

  this.When(/^I fill in holder balance 2 as "([^"]*)"$/, function (arg1) {
    browser.setValue('#initialBalancesAddressAmount_2', arg1)
  })

  this.When(/^click create token$/, function () {
    client.moveToObject('#createToken')
    browser.click('#createToken')
  })

  this.Then(/^I should then see a form confirming my token creation transaction$/, function () {
    let _el = '#tokenCreationConfirmation'
    browser.waitForVisible(_el, 60000)
  })

  this.When(/^I then click confirmation token$/, function () {
    client.moveToObject('#confirmToken')
    browser.click('#confirmToken')
  })

  this.Then(/^I should see the relaying message "([^"]*)"$/, function (arg1) {
    let _el = '#tokenRelayingMsg'
    browser.waitForVisible(_el)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should see shortly after success message "([^"]*)"$/, function (arg1) {
    let _el = '#successMessage'
    browser.waitForVisible(_el, 120000)
    expect(browser.getText(_el)).toEqual(arg1)

    // Write token hash to file for Explorer test 8
    fs.writeFileSync('/tmp/chimp-TOKEN_HASH', browser.getText('#confirmedTokenHash'))
  })

  this.Then(/^I should see the pending message "([^"]*)"$/, function (arg1) {
    let _el = '#finalTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 300000, 'expected transaction to be in pending state')
  })

  this.Then(/^shortly after I should see confirmation message "([^"]*)"$/, function (arg1) {
    let _el = '#finalTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 300000, 'expected transaction confirmation within 5 minutes')

  })

};