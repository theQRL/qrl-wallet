function resolveElement(target, root = document) {
  if (!target) return null
  if (typeof target === 'string') {
    return root.getElementById(target) || root.querySelector(target)
  }
  return target
}

export function show(target) {
  const element = resolveElement(target)
  if (!element) return null
  element.classList.remove('hidden')
  if (element.style.display === 'none') {
    element.style.display = ''
  }
  return element
}

export function hide(target) {
  const element = resolveElement(target)
  if (!element) return null
  element.classList.add('hidden')
  return element
}

export function toggle(target, force) {
  const element = resolveElement(target)
  if (!element) return null
  const next = typeof force === 'boolean' ? force : element.classList.contains('hidden')
  if (next) {
    show(element)
  } else {
    hide(element)
  }
  return element
}

export function isVisible(target) {
  const element = resolveElement(target)
  if (!element) return false
  if (element.classList.contains('hidden')) return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

export function getValue(target) {
  const element = resolveElement(target)
  if (!element) return ''
  return element.value || ''
}

export function setValue(target, value) {
  const element = resolveElement(target)
  if (!element) return null
  element.value = value
  return element
}

export function isChecked(target) {
  const element = resolveElement(target)
  if (!element) return false
  return Boolean(element.checked)
}

export function setChecked(target, checked) {
  const element = resolveElement(target)
  if (!element) return null
  element.checked = Boolean(checked)
  return element
}

export function openDialog(target) {
  const element = resolveElement(target)
  if (!element || typeof element.showModal !== 'function') return null
  if (!element.open) element.showModal()
  return element
}

export function closeDialog(target) {
  const element = resolveElement(target)
  if (!element || typeof element.close !== 'function') return null
  if (element.open) element.close()
  return element
}

export function resolve(target, root = document) {
  return resolveElement(target, root)
}
