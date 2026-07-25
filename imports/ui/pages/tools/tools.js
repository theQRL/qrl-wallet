/* eslint no-console:0 */
/* global QRLLIB, XMSS_OBJECT, LocalStore, QrlLedger, isElectrified, selectedNetwork,loadAddressTransactions, getTokenBalances, updateBalanceField, refreshTransferPage */
/* global pkRawToB32Address, hexOrB32, rawToHexOrB32, anyAddressToRawAddress, stringToBytes, binaryToBytes, bytesToString, bytesToHex, hexToBytes, toBigendianUint64BytesUnsigned, numberToString, decimalToBinary */
/* global getMnemonicOfFirstAddress, getXMSSDetails, isWalletFileDeprecated, waitForQRLLIB, addressForAPI, binaryToQrlAddress, toUint8Vector, concatenateTypedArrays, getQrlProtoShasum */
/* global resetWalletStatus, passwordPolicyValid, countDecimals, supportedBrowser, wrapMeteorCall, getBalance, otsIndexUsed, ledgerHasNoTokenSupport, resetLocalStorageState, nodeReturnedValidResponse */
/* global POLL_TXN_RATE, POLL_MAX_CHECKS, DEFAULT_NETWORKS, findNetworkData, SHOR_PER_QUANTA, WALLET_VERSION, QRLPROTO_SHA256,  */

import { computed, createApp, h, ref } from 'vue'
import './tools.html'

const TOOLS = [
  {
    href: '/tokens/create',
    title: 'Create Token',
    description: 'Create your own QRT.',
    category: 'asset',
    badge: 'Asset',
    ledgerIncompatible: true,
  },
  {
    href: '/tools/notarise/start',
    title: 'Notarise Document',
    description: 'Notarise a document on the QRL.',
    category: 'identity',
    badge: 'Identity',
  },
  {
    href: '/tools/message/create',
    title: 'Message',
    description: 'Save a message on the QRL.',
    category: 'identity',
    badge: 'Identity',
  },
  {
    href: '/tools/xmssindex/update',
    title: 'Set XMSS Index',
    description: 'Update the XMSS index on a Ledger Nano S.',
    category: 'advanced',
    badge: 'Ledger',
    ledgerOnly: true,
  },
  {
    href: '/tools/keybase',
    title: 'Keybase ID',
    description: 'Add or remove a Keybase ID for your address.',
    category: 'identity',
    badge: 'Identity',
  },
  {
    href: '/tools/multisig',
    title: 'Multisig',
    description: 'Multisignature wallet functionality.',
    category: 'advanced',
    badge: 'Advanced',
    ledgerIncompatible: true,
  },
  {
    href: '/tools/addTokens',
    title: 'Add/Remove Tokens',
    description: 'Manage held tokens in your wallet.',
    category: 'asset',
    badge: 'Asset',
  },
  {
    href: '/tools/NFT',
    title: 'Mint QR NFT',
    description: 'Create a quantum-resistant non-fungible token.',
    category: 'asset',
    badge: 'Asset',
    ledgerIncompatible: true,
  },
]

const CATEGORY_LABELS = {
  all: 'All categories',
  asset: 'Asset',
  identity: 'Identity',
  advanced: 'Advanced',
}

const CATEGORY_STYLES = {
  asset: {
    iconWrapClass: 'border-primary/25 bg-primary/10 text-primary',
    iconPath: 'M3 7.5l9-4.5 9 4.5-9 4.5-9-4.5zm0 4.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  },
  identity: {
    iconWrapClass: 'border-secondary/25 bg-secondary/10 text-secondary',
    iconPath: 'M12 11a3 3 0 100-6 3 3 0 000 6zm-7.5 8.25a7.5 7.5 0 0115 0',
  },
  advanced: {
    iconWrapClass: 'border-accent/25 bg-accent/10 text-accent',
    iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  },
}

function normalize(value) {
  return String(value || '').toLowerCase().trim()
}

function renderToolIcon(tool) {
  const style = CATEGORY_STYLES[tool.category] || CATEGORY_STYLES.advanced
  return h('div', { class: `inline-flex h-11 w-11 items-center justify-center rounded-box border ${style.iconWrapClass}` }, [
    h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      class: 'h-5 w-5',
      fill: 'none',
      viewBox: '0 0 24 24',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    }, [
      h('path', { d: style.iconPath }),
    ]),
  ])
}

function renderToolCard(tool) {
  const categoryLabel = CATEGORY_LABELS[tool.category] || tool.category
  const showBadge = tool.badge && normalize(tool.badge) !== normalize(categoryLabel)

  return h('a', {
    href: tool.href,
    class: 'group card bg-base-200 border border-base-300 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/55 hover:shadow-lg no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
  }, [
    h('div', { class: 'card-body p-5 gap-4' }, [
      h('div', { class: 'flex items-start justify-between gap-3' }, [
        h('div', { class: 'flex items-start gap-3 min-w-0' }, [
          renderToolIcon(tool),
          h('div', { class: 'min-w-0' }, [
            h('h3', { class: 'card-title text-lg text-base-content leading-tight' }, tool.title),
            h('p', { class: 'text-xs uppercase tracking-[0.16em] text-base-content/60 mt-1' }, categoryLabel),
          ]),
        ]),
        showBadge ? h('span', { class: 'badge badge-outline badge-sm shrink-0' }, tool.badge) : null,
      ]),
      h('p', { class: 'text-sm text-base-content/70 leading-relaxed min-h-11' }, tool.description),
      h('div', { class: 'card-actions justify-end pt-1' }, [
        h('span', { class: 'btn btn-sm btn-ghost border border-base-300 pointer-events-none group-hover:border-primary/40' }, [
          'Open',
          h('svg', {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'h-4 w-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
            'stroke-width': '2',
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'aria-hidden': 'true',
          }, [
            h('path', { d: 'M5 12h14M13 5l7 7-7 7' }),
          ]),
        ]),
      ]),
    ]),
  ])
}

function createToolsVueApp(tools, options = {}) {
  return {
    setup() {
      const query = ref('')
      const selectedCategory = ref('all')
      const showLedgerInfo = options.isLedgerWallet === true

      const categories = ['all', ...new Set(tools.map((tool) => tool.category))]

      const filteredTools = computed(() => {
        const category = selectedCategory.value
        const search = normalize(query.value)

        return tools.filter((tool) => {
          const inCategory = category === 'all' || tool.category === category
          if (!inCategory) return false

          if (!search) return true

          const text = normalize(`${tool.title} ${tool.description} ${tool.badge}`)
          return text.includes(search)
        })
      })

      return {
        categories,
        filteredTools,
        query,
        selectedCategory,
        showLedgerInfo,
      }
    },
    render() {
      const categoryOptions = this.categories.map((category) => (
        h('option', { value: category }, CATEGORY_LABELS[category] || category)
      ))

      const gridCards = this.filteredTools.map((tool) => renderToolCard(tool))
      const countLabel = `${this.filteredTools.length} tool${this.filteredTools.length === 1 ? '' : 's'}`

      return h('div', { class: 'space-y-4' }, [
        this.showLedgerInfo
          ? h('div', { class: 'alert alert-info' }, [
            h('span', {}, 'Additional tools are available for Wallets opened from files or via hexseed/mnemonic'),
          ])
          : null,
        h('div', { class: 'card bg-base-200 border border-base-300' }, [
          h('div', { class: 'card-body p-4 sm:flex-row gap-3 items-center' }, [
            h('input', {
              class: 'input w-full bg-base-100',
              placeholder: 'Search tools',
              value: this.query,
              onInput: (event) => {
                this.query = event.target.value
              },
            }),
            h('select', {
              class: 'select w-full sm:w-56 bg-base-100',
              value: this.selectedCategory,
              onChange: (event) => {
                this.selectedCategory = event.target.value
              },
            }, categoryOptions),
          ]),
        ]),
        h('p', { class: 'text-sm text-base-content/70 px-1' }, countLabel),
        h('div', { class: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5' }, gridCards),
        this.filteredTools.length === 0
          ? h('div', { class: 'alert' }, [
            h('span', {}, 'No tools match the current filter.'),
          ])
          : null,
      ])
    },
  }
}

Template.appTools.onRendered(function onRendered() {
  const mountElement = this.find('#toolsVueRoot')
  if (!mountElement) return

  let isLedgerWallet = false
  try {
    isLedgerWallet = getXMSSDetails().walletType === 'ledger'
  } catch (error) {
    isLedgerWallet = false
  }

  const availableTools = TOOLS.filter((tool) => {
    if (tool.ledgerOnly && !isLedgerWallet) return false
    if (isLedgerWallet && tool.ledgerIncompatible) return false
    return true
  })
  this.toolsVueApp = createApp(createToolsVueApp(availableTools, { isLedgerWallet }))
  this.toolsVueApp.mount(mountElement)
})

Template.appTools.onDestroyed(function onDestroyed() {
  if (this.toolsVueApp) {
    this.toolsVueApp.unmount()
    this.toolsVueApp = null
  }
})
