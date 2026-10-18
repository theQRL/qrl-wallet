import { Template } from 'meteor/templating'
import './qrcode.html'

Template.QRCode.onRendered(function () {
  const instance = this
  instance.autorun(() => {
    const data = Template.currentData() || {}
    const text = data.text || ''
    const size = parseInt(data.size, 10) || 128
    const container = instance.$('.qr-code')

    if (!text || !container.length) {
      return
    }

    container.empty().qrcode({
      text,
      width: size,
      height: size,
      background: '#ffffff',
      foreground: '#000000',
    })
  })
})

Template.QRCode.helpers({
  size() {
    return Template.instance().data.size || '128px'
  },
})
