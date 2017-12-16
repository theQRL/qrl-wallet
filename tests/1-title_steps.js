module.exports = function () {  
  'use strict';

   this.Then(/^I should see the Title as "([^"]*)"$/, function (arg1) {
     expect(browser.getTitle()).toEqual(arg1)
   })
};