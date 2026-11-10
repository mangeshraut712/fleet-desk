import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isWinningPullUrl } from './pull-url.ts'

test('accepts a bare pull URL', () => {
  assert.equal(isWinningPullUrl('https://github.com/example/project/pull/12'), true)
})

test('accepts a trailing slash', () => {
  assert.equal(isWinningPullUrl('https://github.com/example/project/pull/12/'), true)
})

for (const suffix of ['files', 'commits', 'checks']) {
  test(`accepts a copied /${suffix} pull URL`, () => {
    assert.equal(isWinningPullUrl(`https://github.com/example/project/pull/12/${suffix}`), true)
  })
}

test('accepts a www.github.com pull URL', () => {
  assert.equal(isWinningPullUrl('https://www.github.com/example/project/pull/12'), true)
})

test('trims surrounding whitespace', () => {
  assert.equal(isWinningPullUrl('  https://github.com/example/project/pull/12/files  '), true)
})

for (const bad of [
  'https://github.com/example/project/pull/12e2',
  'https://github.com/example/project/pull/12e2/files',
  'https://github.com/example/project/pull/0x10',
  'https://github.com/example/project/issues/12',
  'http://github.com/example/project/pull/12',
  'not a url',
]) {
  test(`rejects ${bad}`, () => {
    assert.equal(isWinningPullUrl(bad), false)
  })
}
