#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const OPEN_PATTERN = /<div class="hidden fixed inset-0 z-50 items-center justify-center bg-black\/60 p-4 overflow-y-auto" id="([^"]+)">/
const ACTION_ROW_CLASS = 'class="mt-4 flex flex-wrap justify-end gap-2 border-t border-base-300 pt-3"'

function toUnix(text) {
  return text.replace(/\r\n/g, '\n')
}

function indentBlock(block, spaces = 4) {
  const pad = ' '.repeat(spaces)
  return block
    .split('\n')
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join('\n')
}

function convertModalBlocks(content, filePath) {
  let output = ''
  let cursor = 0
  let convertedCount = 0
  const input = toUnix(content)

  while (cursor < input.length) {
    const slice = input.slice(cursor)
    const match = slice.match(OPEN_PATTERN)
    if (!match) {
      output += input.slice(cursor)
      break
    }

    const start = cursor + match.index
    const openTag = match[0]
    const modalId = match[1]
    const openEnd = start + openTag.length

    output += input.slice(cursor, start)

    const divMatcher = /<\/?div\b[^>]*>/g
    divMatcher.lastIndex = openEnd

    let depth = 1
    let closeTagStart = -1
    let closeTagEnd = -1

    while (depth > 0) {
      const token = divMatcher.exec(input)
      if (!token) {
        throw new Error(`Unbalanced modal div in ${filePath} near id=${modalId}`)
      }

      const tag = token[0]
      if (tag.startsWith('</div')) {
        depth -= 1
        if (depth === 0) {
          closeTagStart = token.index
          closeTagEnd = divMatcher.lastIndex
          break
        }
      } else {
        depth += 1
      }
    }

    const rawInner = input.slice(openEnd, closeTagStart)
    const normalizedInner = rawInner
      .replace(new RegExp(ACTION_ROW_CLASS, 'g'), 'class="modal-action"')
      .replace(/<div class="([^"]*\bbtn\b[^"]*)"([^>]*)>([^<]*)<\/div>/g, (_, classes, attrs, text) => {
        const trimmedText = text.trim()
        return `<button type="button" class="${classes}"${attrs}>${trimmedText}</button>`
      })
      .trim()

    const wrapped = [
      `<dialog class="modal" id="${modalId}">`,
      '  <div class="modal-box wallet-modal-box">',
      indentBlock(normalizedInner, 4),
      '  </div>',
      '  <form method="dialog" class="modal-backdrop"><button>close</button></form>',
      '</dialog>',
    ].join('\n')

    output += wrapped
    cursor = closeTagEnd
    convertedCount += 1
  }

  return { output, convertedCount }
}

function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('Usage: node .scripts/convert-legacy-modals.js <file> [file...]')
    process.exit(1)
  }

  let totalConverted = 0

  files.forEach((relativePath) => {
    const filePath = path.resolve(ROOT, relativePath)
    const original = fs.readFileSync(filePath, 'utf8')
    const { output, convertedCount } = convertModalBlocks(original, relativePath)

    if (convertedCount > 0) {
      fs.writeFileSync(filePath, output)
    }

    totalConverted += convertedCount
    console.log(`${relativePath}: converted ${convertedCount} modal(s)`)
  })

  console.log(`Total converted modals: ${totalConverted}`)
}

main()
