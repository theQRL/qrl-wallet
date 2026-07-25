/* eslint-disable no-param-reassign */
/* eslint-disable func-names */
import { $ } from 'meteor/jquery'

const DEFAULT_FORM_RULES = {
  empty(value) {
    return String(value || '').trim().length > 0
  },
  number(value) {
    if (String(value || '').trim() === '') return false
    return Number.isFinite(Number(value))
  },
  checked(value, $field) {
    if ($field && $field.is(':checkbox')) return $field.is(':checked')
    if ($field && $field.find(':checkbox').length > 0) return $field.find(':checkbox').first().is(':checked')
    return Boolean(value)
  },
}

const customFormRules = {}

function parseRuleType(type) {
  const parsed = String(type || '').match(/^([a-zA-Z0-9_]+)\[(.*)\]$/)
  if (!parsed) return { name: String(type || ''), arg: null }
  return { name: parsed[1], arg: parsed[2] }
}

function parseRuleArg(name, arg) {
  if (arg === null || arg === undefined) return null
  if (name === 'maxLength' || name === 'minLength') return Number(arg)
  if (name === 'regExp') {
    const m = String(arg).match(/^\/(.+)\/([gimsuy]*)$/)
    if (m) return new RegExp(m[1], m[2])
    return new RegExp(String(arg))
  }
  return arg
}

function fieldSelector(fieldName, fieldConfig) {
  const identifier = fieldConfig.identifier || fieldConfig.id || fieldName
  return `#${identifier}, [name="${identifier}"], [name="${identifier}[]"]`
}

function getFieldValue($field) {
  if ($field.is(':checkbox')) return $field.is(':checked')
  if ($field.is('select')) return $field.val()
  if ($field.find(':checkbox').length > 0) return $field.find(':checkbox').first().is(':checked')
  const $input = $field.is('input,textarea,select') ? $field : $field.find('input,textarea,select').first()
  if ($input.length === 0) return ''
  return $input.val()
}

function clearFieldError($target) {
  $target.removeClass('error')
  $target.find('> .wallet-form-error').remove()
}

function setFieldError($target, message) {
  $target.addClass('error')
  $target.find('> .wallet-form-error').remove()
  if (message) {
    $target.append(`<div class="wallet-form-error text-error text-xs mt-1">${message}</div>`)
  }
}

function evaluateRule(ruleType, value, $field) {
  const { name, arg } = parseRuleType(ruleType)
  const parsedArg = parseRuleArg(name, arg)

  if (name === 'maxLength') return String(value || '').length <= parsedArg
  if (name === 'minLength') return String(value || '').length >= parsedArg
  if (name === 'regExp') return parsedArg.test(String(value || ''))
  if (DEFAULT_FORM_RULES[name]) return DEFAULT_FORM_RULES[name](value, $field)

  const customRule = customFormRules[name]
  if (typeof customRule === 'function') return customRule(value, parsedArg, $field)

  // Unknown rule: do not block submit.
  return true
}

function validateField($form, fieldName, fieldConfig) {
  const $field = $form.find(fieldSelector(fieldName, fieldConfig)).first()
  if ($field.length === 0) return true

  const $fieldContainer = $field.closest('.field').length > 0 ? $field.closest('.field') : $field.parent()
  clearFieldError($fieldContainer)

  const value = getFieldValue($field)
  const rules = fieldConfig.rules || []

  for (const rule of rules) {
    const isValid = evaluateRule(rule.type, value, $field)
    if (!isValid) {
      setFieldError($fieldContainer, rule.prompt || 'Invalid value')
      return false
    }
  }

  return true
}

function validateForm($form, settings) {
  let valid = true
  const fields = settings.fields || {}
  Object.keys(fields).forEach((fieldName) => {
    const fieldValid = validateField($form, fieldName, fields[fieldName] || {})
    if (!fieldValid) valid = false
  })
  return valid
}

function resolveElements(target) {
  if (!target) return $()
  if (target.jquery) return target
  return $(target)
}

function modalOptions($modal) {
  return $modal.data('wallet-modal-options') || {}
}

function setModalOptions($modal, options = {}) {
  const current = modalOptions($modal)
  $modal.data('wallet-modal-options', { ...current, ...options })
}

function bindModalActions($modal) {
  if ($modal.data('wallet-modal-bound')) return

  $modal.on('click.walletModal', '.approve, .positive, .confirm, .btn-success', function () {
    const options = modalOptions($modal)
    let shouldHide = true
    if (typeof options.onApprove === 'function') {
      shouldHide = options.onApprove.call($modal[0]) !== false
    }
    if (shouldHide) hideModal($modal)
  })

  $modal.on('click.walletModal', '.cancel, .negative, .deny, .close, .btn-error', function () {
    const options = modalOptions($modal)
    let shouldHide = true
    if (typeof options.onDeny === 'function') {
      shouldHide = options.onDeny.call($modal[0]) !== false
    }
    if (shouldHide) hideModal($modal)
  })

  $modal.on('click.walletModal', function (event) {
    const options = modalOptions($modal)
    if (options.closable === false) return
    if (event.target === $modal[0]) hideModal($modal)
  })

  $modal.data('wallet-modal-bound', true)
}

function applyModalVisibility($modal, visible) {
  if (!$modal.is('dialog')) {
    return
  }

  if (visible) {
    if (!$modal[0].open) $modal[0].showModal()
  } else if ($modal[0].open) {
    $modal[0].close()
  }
}

function showModal(target, options = null) {
  const $modal = resolveElements(target).first()
  if ($modal.length === 0) return

  if (options && typeof options === 'object') {
    setModalOptions($modal, options)
  }
  bindModalActions($modal)
  applyModalVisibility($modal, true)

  const opts = modalOptions($modal)
  if (typeof opts.onVisible === 'function') {
    opts.onVisible.call($modal[0])
  }
}

function hideModal(target) {
  const $modal = resolveElements(target).first()
  if ($modal.length === 0) return
  const opts = modalOptions($modal)
  if (typeof opts.onHide === 'function') {
    const result = opts.onHide.call($modal[0])
    if (result === false) return
  }
  applyModalVisibility($modal, false)
}

function bindFormValidation(target, settings = {}) {
  const $forms = resolveElements(target)
  if ($forms.length === 0) return

  const mergedSettings = {
    fields: settings.fields || {},
    on: settings.on || 'submit',
    onSuccess: settings.onSuccess || null,
    onFailure: settings.onFailure || null,
  }

  $forms.each(function () {
    const $form = $(this)
    $form.data('wallet-form-settings', mergedSettings)

    $form.off('submit.walletForm').on('submit.walletForm', function (event) {
      const activeSettings = $form.data('wallet-form-settings') || mergedSettings
      const valid = validateForm($form, activeSettings)

      if (!valid) {
        event.preventDefault()
        event.stopPropagation()
        if (typeof activeSettings.onFailure === 'function') {
          activeSettings.onFailure.call(this, event)
        }
        return false
      }

      if (typeof activeSettings.onSuccess === 'function') {
        const result = activeSettings.onSuccess.call(this, event)
        if (result === false) {
          event.preventDefault()
          event.stopPropagation()
          return false
        }
      }
      return true
    })

    if (mergedSettings.on === 'blur') {
      Object.keys(mergedSettings.fields || {}).forEach((fieldName) => {
        const fieldConfig = mergedSettings.fields[fieldName] || {}
        $form.find(fieldSelector(fieldName, fieldConfig)).off('blur.walletForm').on('blur.walletForm', function () {
          validateField($form, fieldName, fieldConfig)
        })
      })
    }
  })
}

function addFormRule(name, validator) {
  if (typeof name === 'string' && typeof validator === 'function') {
    customFormRules[name] = validator
  }
}

function activateTab(tabName, scope) {
  if (!tabName) return
  const $scope = scope && scope.length ? scope : $(document)

  const $items = $scope.find(`[data-tab="${tabName}"]`)
  $items.each(function () {
    const $item = $(this)
    if ($item.closest('.tabs').length > 0 || $item.parent('#sendReceiveTabs').length > 0) {
      $item.siblings('[data-tab]').removeClass('active tab-active')
      $item.addClass('active tab-active')
    }
  })

  const $panels = $scope.find(`div[data-tab="${tabName}"]`)
  if ($panels.length > 0) {
    $scope.find('div[data-tab]').addClass('hidden').removeClass('block active')
    $panels.removeClass('hidden').addClass('block active')
  }
}

function initTabs(target) {
  const $items = resolveElements(target)
  if ($items.length === 0) return

  $items.off('click.walletTab').on('click.walletTab', function (event) {
    event.preventDefault()
    const name = $(this).data('tab')
    activateTab(name, $('body'))
  })
}

function changeTab(tabName) {
  activateTab(tabName, $(document))
}

function initDropdowns(target = 'select') {
  const $elements = resolveElements(target)
  if ($elements.length === 0) return
  $elements.each(function () {
    const $el = $(this)
    if ($el.is('select')) {
      $el.addClass('select bg-base-100')
      if (!$el.hasClass('w-full')) {
        $el.addClass('w-full')
      }
    }
  })
}

function isCheckboxChecked(target) {
  const $target = resolveElements(target).first()
  if ($target.length === 0) return false
  if ($target.is(':checkbox')) return $target.is(':checked')
  const $checkbox = $target.find(':checkbox').first()
  return $checkbox.length > 0 ? $checkbox.is(':checked') : false
}

const walletUi = {
  addFormRule,
  bindFormValidation,
  changeTab,
  hideModal,
  initDropdowns,
  initTabs,
  isCheckboxChecked,
  showModal,
}

if (typeof window !== 'undefined') {
  window.walletUi = walletUi
}

export default walletUi
