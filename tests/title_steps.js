module.exports = function () {  
  'use strict';

   this.Given(/^I am on the site$/, function () {
   	browser.url('http://localhost:3000');
   });
   this.Then(/^I should see the Title as "([^"]*)"$/, function (arg1) {
     expect(browser.getTitle()).toEqual('QRL Wallet')
   });
};