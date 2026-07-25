#!/usr/bin/env node

/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const UI_ROOT = path.join(ROOT, 'imports', 'ui')

function walk(dir) {
  const output = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      output.push(...walk(fullPath))
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
      output.push(fullPath)
    }
  })

  return output
}

function countMatches(content, regex) {
  const matches = content.match(regex)
  return matches ? matches.length : 0
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath)
}

function getStatus(row) {
  if (row.semanticClasses === 0 && row.semanticPlugins === 0 && row.jqueryCalls === 0) {
    return 'migrated'
  }
  if (row.semanticClasses > 0 || row.semanticPlugins > 0) {
    return 'legacy'
  }
  return 'in-progress'
}

if (!fs.existsSync(UI_ROOT)) {
  console.error('Could not find imports/ui directory')
  process.exit(1)
}

const files = walk(UI_ROOT)

const rows = files.map((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8')
  const extension = path.extname(filePath)

  const semanticClasses = extension === '.html'
    ? countMatches(content, /class="[^"]*\bui\b[^"]*"/g)
    : 0

  const semanticPlugins = extension === '.js'
    ? countMatches(content, /\.(modal|dropdown|tab|popup|form|checkbox)\s*\(/g)
    : 0

  const jqueryCalls = extension === '.js'
    ? countMatches(content, /\$\s*\(/g)
    : 0

  return {
    file: toRelative(filePath),
    semanticClasses,
    semanticPlugins,
    jqueryCalls,
  }
})

const totals = rows.reduce(
  (acc, row) => ({
    semanticClasses: acc.semanticClasses + row.semanticClasses,
    semanticPlugins: acc.semanticPlugins + row.semanticPlugins,
    jqueryCalls: acc.jqueryCalls + row.jqueryCalls,
  }),
  { semanticClasses: 0, semanticPlugins: 0, jqueryCalls: 0 },
)

const topLegacy = rows
  .filter((row) => row.semanticClasses > 0 || row.semanticPlugins > 0 || row.jqueryCalls > 0)
  .sort((a, b) => (
    (b.semanticClasses + b.semanticPlugins + b.jqueryCalls)
    - (a.semanticClasses + a.semanticPlugins + a.jqueryCalls)
  ))
  .slice(0, 20)

console.log('Migration audit summary')
console.log('----------------------')
console.log(`Semantic class usages: ${totals.semanticClasses}`)
console.log(`Semantic plugin calls: ${totals.semanticPlugins}`)
console.log(`jQuery calls: ${totals.jqueryCalls}`)
console.log('')

console.log('Top legacy-heavy files')
console.log('----------------------')
topLegacy.forEach((row) => {
  const score = row.semanticClasses + row.semanticPlugins + row.jqueryCalls
  console.log(
    `${row.file} | score=${score} | ui=${row.semanticClasses} plugins=${row.semanticPlugins} jquery=${row.jqueryCalls}`,
  )
})

const statusCounts = rows.reduce((acc, row) => {
  const status = getStatus(row)
  acc[status] = (acc[status] || 0) + 1
  return acc
}, {})

console.log('')
console.log('File status')
console.log('-----------')
Object.keys(statusCounts).sort().forEach((status) => {
  console.log(`${status}: ${statusCounts[status]}`)
})
