import { FlowRouter } from 'meteor/ostrio:flow-router-extra'
/* eslint no-console:0 */

import './reload.html'

Template.appReloadTransfer.onCreated(() => {
  const path = FlowRouter.path('/transfer', {})
  FlowRouter.go(path)
})
