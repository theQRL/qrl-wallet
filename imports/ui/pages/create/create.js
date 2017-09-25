import './create.html'

Template.appCreate.events({
  'click #generate': () => {
    $('#generate').hide()
    $('#generating').show()
    // CALL WASM HERE
  },
  'click #generating': () => {
    $('#generating').hide()
    $('#warning').hide()
    $('#result').show()
    // SHOW NEW ADDRESS HERE
  },
})
