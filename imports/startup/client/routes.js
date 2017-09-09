import {
    FlowRouter
} from 'meteor/kadira:flow-router'
import {
    BlazeLayout
} from 'meteor/kadira:blaze-layout'

// Import needed templates
import '../../ui/layouts/body/body.js'
import '../../ui/pages/home/home.js'
import '../../ui/pages/not-found/not-found.js'
import '../../ui/pages/create/create.js'
import '../../ui/pages/view/view.js'
import '../../ui/pages/transfer/transfer.js'

// Set up all routes in the app
FlowRouter.route('/', {
    name: 'App.home',
    action() {
        BlazeLayout.render('appBody', {
            main: 'appHome'
        })
    },
})
FlowRouter.route('/create', {
    name: 'App.create',
    action() {
        BlazeLayout.render('appBody', {
            main: 'appCreate'
        })
    },
})
FlowRouter.route('/view', {
    name: 'App.home',
    action() {
        BlazeLayout.render('appBody', {
            main: 'appView'
        })
    },
})
FlowRouter.route('/transfer', {
    name: 'App.home',
    action() {
        BlazeLayout.render('appBody', {
            main: 'appTransfer'
        })
    },
})
FlowRouter.notFound = {
    action() {
        BlazeLayout.render('appBody', {
            main: 'appNotFound'
        })
    },
}