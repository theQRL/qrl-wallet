var fs = require('fs')

module.exports = function () {
  'use strict';

  this.setDefaultTimeout(300000); // 5 minute default timeout

  this.When(/^set the transfer type to my recently created token$/, function () {
    // Grab txn hash from temp file
    var txnHash = fs.readFileSync('/tmp/chimp-TOKEN_HASH').toString()
    
    // Give API 10 seconds to respond with address state for tokens
    browser.pause(10000)

    // This is how we have to click the Semantic UI dropdowns ...
    browser.waitForVisible('#amountFields', 30000)
    browser.click('#amountFields > div')

    browser.waitForVisible('#amountFields > div > div.menu.transition.visible > div:nth-child(2)', 30000)
    browser.click('#amountFields > div > div.menu.transition.visible > div:nth-child(2)')
  })

  this.Then(/^I should then see a form confirming my token transfer transaction$/, function () {
    let _el = '#confirmTokenTransactionArea'
    browser.waitForVisible(_el, 60000)
  })

  this.When(/^I then click confirmation transaction for token transfer$/, function () {
    browser.click('#confirmTokenTransaction')
  })

  this.Then(/^I should see a token relaying message "([^"]*)"$/, function (arg1) {
    let _el = '#tokenTransferRelayingMsg'
    browser.waitForVisible(_el)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should see shortly after sending my token transfer "([^"]*)"$/, function (arg1) {
    let _el = '#successMessage'
    browser.waitForVisible(_el, 120000)
    expect(browser.getText(_el)).toEqual(arg1)

    // Write txn hash to file for Explorer test 10
    fs.writeFileSync('/tmp/chimp-TOKEN_XFER_HASH', browser.getText('#confirmedTransferTokenTxnHash'))
  })

  this.Then(/^I should see the token transfer pending "([^"]*)"$/, function (arg1) {
    let _el = '#finalTokenXferTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 300000, 'expected transaction to be in pending state')
  })

  this.Then(/^shortly after I should see the token transfer complete "([^"]*)"$/, function (arg1) {
    let _el = '#finalTokenXferTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 300000, 'expected transaction confirmation within 5 minutes')

  })

};