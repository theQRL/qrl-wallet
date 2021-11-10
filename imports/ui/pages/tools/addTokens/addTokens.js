import { Session } from 'meteor/session'
import BetterStorage from 'meteor-better-storage'

Template.appAddTokens.helpers({
  searchItemsFound() {
    let x = false
    if (Session.get('tokenSearch').length > 0 || Session.get('searchShown') === false) {
      x = true
    }
    return x
  },
  tokens() {
    return Session.get('tokenList')
  },
  tokenSearch() {
    return Session.get('tokenSearch')
  },
})

Template.appAddTokens.events({
  'click #searchButton': function () {
    Session.set('searchShown', true)
    const held = Session.get('tokensHeld')
    const list = Session.get('tokenList')
    const search = held
    if (list.length > 0) {
      const newSearch = []
      held.forEach((element) => {
        if (!list.find((token) => token.hash === element.hash)) {
          newSearch.push(element)
        }
      })
      Session.set('tokenSearch', newSearch)
    } else {
      Session.set('tokenSearch', search)
    }
  },
  'click .addClick': function (event) {
    const hashToAdd = event.target.getAttribute('hash')
    const held = Session.get('tokensHeld')
    const tokenToAdd = held.find(
      (token) => token.hash === hashToAdd
    )
    const list = Session.get('tokenList')
    list.push(tokenToAdd)
    Session.set('tokenList', list)
    const addr = Session.get('address').state.address
    const obj = {}
    obj[addr] = list
    BetterStorage.set('tokenList', obj)
    const search = Session.get('tokenSearch')
    const newSearch = search.filter(
      (token) => token.hash !== hashToAdd
    )
    Session.set('tokenSearch', newSearch)
  },
  'click .removeClick': function (event) {
    Session.set('searchShown', false)
    Session.set('tokenSearch', [])
    const hashToRemove = event.target.getAttribute('hash')
    const list = Session.get('tokenList')
    const newList = list.filter(
      (token) => token.hash !== hashToRemove
    )
    Session.set('tokenList', newList)
    const addr = Session.get('address').state.address
    const obj = {}
    obj[addr] = newList
    BetterStorage.set('tokenList', obj)
  },
})

Template.appAddTokens.onRendered(function () {
  Session.set('tokenSearch', [])
  Session.set('searchShown', false)
  const addr = Session.get('address').state.address
  Session.set('tokenList', [])
  try {
    if (BetterStorage.fetch('tokenList')[addr].length > 0) {
      Session.set('tokenList', BetterStorage.fetch('tokenList')[addr])
    }
  } catch (e) {
    return null
  }
  return null
})
