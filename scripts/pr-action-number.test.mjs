import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = new URL('./pr-action.mjs', import.meta.url)
const run = (...args) => spawnSync(process.execPath, [script.pathname, ...args], {
  encoding: 'utf8', env: { ...process.env, PATH: '' },
})

test('accepts a decimal pull request number', () => {
  const result = run('update-branch', 'https://github.com/example/project/pull/12')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /gh pr update-branch 12 --repo example\/project/)
})

test('accepts a zero-padded decimal pull request number', () => {
  const result = run('update-branch', 'https://github.com/example/project/pull/012')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /gh pr update-branch 12 --repo example\/project/)
})

for (const bad of ['12e2', '0x10', '12.0', '+12', '12abc']) {
  test(`rejects non-decimal pull number ${bad}`, () => {
    const result = run('update-branch', `https://github.com/example/project/pull/${bad}`)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Expected https:\/\/github.com\//)
    assert.equal(result.stdout, '')
  })
}
