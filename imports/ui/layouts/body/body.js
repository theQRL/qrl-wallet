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
})

Template.sidebar.events({
  click: () => {
    $('.ui.sidebar').sidebar('toggle')
  },
})
