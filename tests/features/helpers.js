// This file contains steps shared over multiple tests.

module.exports = function() {  
  'use strict';

  this.Given(/^I am on the site$/, function () {
    browser.url('http://localhost:3000')
  })

  this.When(/^I click Create Wallet$/, function () {
    browser.click('#createWalletHome')
  })

  this.When(/^type a passphrase "([^"]*)" in$/, function (arg1) {
    // For some reason, having a password type input element on the page breaks
    // the tests. This is a hack to change the type of the passphrase input
    // to text such that the walletCode setValue statement works.
    browser.execute(function() {
        // browser context
        passphraseBox = document.getElementById("passphrase");
        passphraseBox.type = "text";
    })

    browser.setValue('#passphrase', arg1)
  })
  
  this.When(/^press Begin$/, function () {
    browser.click('#generate')
  })

  this.Then(/^I should see Generating New Wallet$/, function () {
    let _el = '#generating p'
    browser.waitForVisible(_el)
    expect(browser.getText(_el)).toEqual('Generating new wallet...')
  })

  this.Then(/^I should then see my wallet details$/, function () {
    let _el = '#walletDetails h2 a'
    browser.waitForVisible(_el, 30000) // Max 30 seconds wallet generation time.
    expect(browser.getText(_el)).toEqual('Address')
  })


  this.Then(/^I should see a loader icon$/, function () {
    let _el = '.loader'
    browser.waitForVisible(_el, 30000)
  })

};
