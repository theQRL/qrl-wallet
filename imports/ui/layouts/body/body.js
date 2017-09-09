import './body.html'
import './sidebar.html'

BlazeLayout.setRoot('body')
Template.appBody.onRendered(() => {
    $('.ui.dropdown').dropdown()
    $('.modal').modal()
    $('.sidebar').first().sidebar('attach events', '#hamburger', 'show')
})

Template.appBody.events({
    'click #hamburger': (event) => {
        event.preventDefault()
        $('.ui.sidebar').sidebar('toggle')
    },
    'click .search': (event) => {
        // console.log('search clicked')
        // console.log($(e.currentTarget).prev().val())
        const s = $(event.currentTarget).prev().val()
            // check if s is an integer
        const x = parseFloat(s)
            // let f = false // found an exit point?
        if (((x) && (parseInt(x, 10)) === x)) {
            // f = false
            if (s.length === 64) {
                // f = true
                // console.log('search string is likely a txhash')
                FlowRouter.go(`/tx/${s}`)
            } else {
                // f = false
            }
        } else {
            // f = false
            if (s.length === 69 && s.charAt(0) === 'Q') {
                // console.log("Searching for address")
                // f = true
                FlowRouter.go(`/a/${s}`)
                    // ADDRESS display
            } else {
                // console.log('likely a block number')
                // f = true
                FlowRouter.go(`/block/${x}`)
            }
        }
        // return f
    },
    'keypress input': (event) => {
        // let f = false
        if (event.keyCode === 13) {
            // console.log('search clicked')
            if ($(':focus').is('input')) {
                const s = $(':focus').val()
                    // check if s is an integer
                const x = parseFloat(s)
                if (((x) && (parseInt(x, 10)) === x)) {
                    // console.log('likely a block number')
                    // f = true
                    FlowRouter.go(`/block/${x}`)
                } else {
                    // f = false
                    if (s.length === 69 && s.charAt(0) === 'Q') {
                        // console.log("Searching for address")
                        FlowRouter.go(`/a/${s}`)
                            // ADDRESS display
                    } else {
                        // f = false
                        if (s.length === 64) {
                            // console.log('search string is likely a txhash')
                            // f = true
                            FlowRouter.go(`/tx/${s}`)
                        } else {
                            // console.log('not sure what is being searched for...')
                        }
                    }
                }
                event.stopPropagation()
                return false
            }
        }
        return true
    },
})

Template.sidebar.events({
    click: (event) => {
        if (event.target.tagName === 'INPUT') {
            // cows
        } else {
            $('.ui.sidebar').sidebar('toggle')
        }
    },
})