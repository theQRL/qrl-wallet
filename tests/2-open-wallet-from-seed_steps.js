module.exports = function () {  
  'use strict';

  this.When(/^I click Open Wallet$/, function () {
    client.moveToObject('#openWalletButton')
    browser.click('#openWalletButton')
  })

  this.When(/^enter my mnemonic phrase "([^"]*)"$/, function (arg1) {
    // For some reason, having a password type input element on the page breaks
    // the tests. This is a hack to change the type of the passphrase input
    // to text such that the walletCode setValue statement works.
    browser.execute(function() {
        // browser context
        passphraseBox = document.getElementById("passphrase");
        passphraseBox.type = "text";
    })

    browser.setValue('#walletCode', arg1)
  })

  this.When(/^click Unlock Wallet$/, function () {
    client.moveToObject('#unlockButton')
    browser.click('#unlockButton')
  })

  this.Then(/^I should see "([^"]*)" on the page$/, function (arg1) {
    let _el = '#unlocking p'
    browser.waitForVisible(_el)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should then see my wallet address "([^"]*)" on the page$/, function (arg1) {
    let _el = '#walletAddress'
    // All time for gRPC call to be made and reply with data for view state.
    browser.waitForText(_el, 30000)
    expect(browser.getText(_el)).toEqual(arg1)
  })
};