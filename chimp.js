module.exports = {
  // - - - - WEBDRIVER-IO  - - - -
  webdriverio: {
    desiredCapabilities: {
      chromeOptions: {
        args: ["headless", "disable-gpu", "no-sandbox"]
      },
      isHeadless: true
    }
  },
};