module.exports = function () {  
  'use strict';

  this.When(/^I click Open Wallet$/, function () {
    client.moveToObject('#openWalletButton')
    browser.click('#openWalletButton')
  })

  this.When(/^click Unlock Wallet$/, function () {
    client.moveToObject('#unlockButton')
    browser.click('#unlockButton')
  })

  this.Then(/^I should see "([^"]*)" on the page$/, function (arg1) {
    let _el = '#unlocking p'
    browser.waitForVisible(_el, 30000)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should then see my wallet address "([^"]*)" on the page$/, function (arg1) {
    let _el = '#walletAddress'
    // All time for gRPC call to be made and reply with data for view state.
    browser.waitForText(_el, 30000)
    expect(browser.getText(_el)).toEqual(arg1)
  })
};