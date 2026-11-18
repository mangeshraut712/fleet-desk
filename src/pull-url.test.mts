import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isWinningPullUrl, isWinningPullUrlForTarget, parseWinningPullUrl } from './pull-url.ts'

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
  'https://github.com/%65xample/project/pull/12',
  'https://github.com/example/%70roject/pull/12',
  'https://github.com/example/%2570roject/pull/12',
  'not a url',
]) {
  test(`rejects ${bad}`, () => {
    assert.equal(isWinningPullUrl(bad), false)
  })
}

test('parseWinningPullUrl canonicalizes host, zero-padded numbers, and tab suffixes', () => {
  assert.deepEqual(parseWinningPullUrl('https://www.github.com/Example/Project/pull/0042/files?tab=files#diff'), {
    repo: 'Example/Project',
    number: 42,
    url: 'https://github.com/Example/Project/pull/42',
  })
  assert.equal(parseWinningPullUrl('not-a-url'), null)
})

test('isWinningPullUrlForTarget rejects self-duplicates across aliases and accepts distinct PRs', () => {
  const target = { repo: 'example/project', number: 12 }
  assert.equal(isWinningPullUrlForTarget('https://github.com/example/project/pull/12', target), false)
  assert.equal(isWinningPullUrlForTarget('https://github.com/EXAMPLE/PROJECT/pull/012/files#discussion', target), false)
  assert.equal(isWinningPullUrlForTarget('https://github.com/example/project/pull/13', target), true)
  assert.equal(isWinningPullUrlForTarget('https://github.com/other/project/pull/12', target), true)
})
