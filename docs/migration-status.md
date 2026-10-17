# UI Migration Status

Last updated: 2026-02-14

## Baseline Metrics

From `npm run audit:migration`:

- Semantic class usages: `844`
- Semantic plugin calls (`.modal/.dropdown/.tab/.form/...`): `135`
- jQuery calls (`$(`): `559`
- File status summary:
  - `migrated`: 24 files
  - `in-progress`: 2 files
  - `legacy`: 46 files

## Completed In This Pass

- Migrated tools index page to Tailwind/DaisyUI:
  - `imports/ui/pages/tools/tools.html`
  - `imports/ui/pages/tools/tools.js`
- Added Vue interactivity on tools index (search + category filtering):
  - `vue` dependency in `package.json`
  - Vue island mounted inside `imports/ui/pages/tools/tools.js`
- Migrated mobile shell to Tailwind/DaisyUI and removed Semantic dropdown/modal dependency:
  - `imports/ui/mobile/mobile.html`
  - `imports/ui/mobile/mobile.js`
- Removed jQuery modal handling from close page:
  - `imports/ui/pages/close/close.js`
- Migrated not-found page to Tailwind/DaisyUI:
  - `imports/ui/pages/not-found/not-found.html`
- Added shared DOM helpers for modernized controllers:
  - `imports/ui/lib/dom.js`
- Added repeatable migration audit script:
  - `.scripts/migration-audit.js`
  - `package.json` script: `audit:migration`

## Route-Level Status

`migrated` means no Semantic class usage in template and no Semantic plugin calls in controller.

- `/`, `/create`: migrated
- `/create/:address`: in-progress (jQuery QR plugin usage remains)
- `/open`: migrated
- `/close`: migrated
- `/verify`: migrated
- `/verify-txid/:txId`: migrated
- `/tools`: migrated
- `/transfer`, `/reloadTransfer`: legacy (largest remaining block)
- `/tokens/create`, `/tokens/create/confirm`, `/tokens/create/result`: legacy
- `/tools/message/*`: legacy
- `/tools/notarise/*`: legacy
- `/tools/keybase/*`: legacy
- `/tools/github/*`: legacy
- `/tools/multisig/*`: legacy
- `/tools/addTokens`: legacy
- `/tools/NFT`: legacy
- `/tools/xmssindex/update`: legacy
- mobile shell (`mobile` layout): migrated

## Remaining High-Risk Legacy Blocks

Top files by legacy score (from audit):

- `imports/ui/pages/transfer/transfer.html`
- `imports/ui/pages/transfer/transfer.js`
- `imports/ui/pages/tools/multisig/multisigVote.html`
- `imports/ui/pages/tools/multisig/multisigSpend.html`
- `imports/ui/pages/tools/multisig/multisigCreate.js`

## Recommended Next Migration Order

1. `transfer` route (template + controller + modal/tab flows)
2. `tokens` create/confirm/result flow
3. message/notarise/keybase/github flows (shared modal/confirm pattern)
4. multisig flows (last; highest logic and UI complexity)
