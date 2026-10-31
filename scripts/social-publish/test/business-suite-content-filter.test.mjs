import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toggleContentFilter } from '../business-suite-content-filter.mjs'

test('placement menu uses named Filter regardless of combobox order', () => {
  const clicked = []
  const controls = ['Posts and stories', 'Media type', 'Filter\n\u200b'].map(innerText => ({innerText, click: () => clicked.push(innerText)}))
  globalThis.document = {querySelectorAll: () => controls}
  try {
    assert.equal(toggleContentFilter(), true)
    assert.deepEqual(clicked, ['Filter\n\u200b'])
    controls.reverse()
    toggleContentFilter()
    assert.equal(clicked.length, 2)
  } finally { delete globalThis.document }
})

test('missing or ambiguous Filter fails closed without clicking another menu', () => {
  for (const labels of [['Posts and stories'], ['Filter', 'Filter']]) {
    globalThis.document = {querySelectorAll: () => labels.map(innerText => ({innerText, click: () => assert.fail('unexpected click')}))}
    try { assert.throws(toggleContentFilter, /missing or ambiguous/) }
    finally { delete globalThis.document }
  }
})
