function getText(_el) {
  return browser.getText(_el)
}

module.exports = function () {  
  'use strict';

  let newAddress

  this.When(/^I then click Transfer Quanta$/, function () {
    browser.click('#transferQuantaMainMenu')
  })

  this.Then(/^I should see my new address$/, function () {
    let _el = '#transferFormFromAddress'

    // All time for gRPC call to be made and reply with data for view state.
    browser.waitForText(_el, 30000)
    newAddress = browser.getText(_el)

    if(newAddress != '') {
      return true
    } else {
      return false
    }
  })

  this.Then(/^I should see a precalculated OTS Key Index as "([^"]*)"$/, function (arg1) {
    let _el = '#otsKey'
    browser.waitForValue(_el, 30000);
    expect(browser.getValue(_el)).toEqual(arg1)
  })

  this.When(/^I then fill in the to address as "([^"]*)"$/, function (arg1) {
    browser.setValue('#to', arg1)
  })

  this.When(/^enter the amount as "([^"]*)"$/, function (arg1) {
    browser.setValue('#amount', arg1)
  })

  this.When(/^enter the fee as "([^"]*)"$/, function (arg1) {
    browser.setValue('#fee', arg1)
  })

  this.When(/^change the OTS Key Index to "([^"]*)"$/, function (arg1) {
    browser.setValue('#otsKey', arg1)
  })

  this.When(/^click generate transaction$/, function () {
    browser.click('#generateTransaction')
  })

  this.Then(/^I should then see a form confirming my transaction$/, function () {
    let _el = '#confirmationBlock'
    browser.waitForVisible(_el, 20000)
  })

  this.When(/^I then click confirmation transaction$/, function () {
    browser.click('#confirmTransaction')
  })

  this.Then(/^I should see "([^"]*)"$/, function (arg1) {
    let _el = '#relayingmsg'
    browser.waitForVisible(_el)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should see shortly after "([^"]*)"$/, function (arg1) {
    let _el = '#successMessage'
    browser.waitForVisible(_el, 20000)
    expect(browser.getText(_el)).toEqual(arg1)
  })

  this.Then(/^I should "([^"]*)"$/, function (arg1) {
    let _el = '#finalTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 60000, 'expected transaction to be in pending state')
  })

  this.Then(/^shortly after I should see "([^"]*)"$/, function (arg1) {
    let _el = '#finalTxnStatus'

    browser.waitUntil(function () {
      const thisResult = browser.getText(_el)
      if(thisResult.indexOf(arg1) >=0) {
        return true
      }
    }, 120000, 'expected transaction confirmation within 2 minutes')

  })

};