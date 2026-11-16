import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

const script = new URL('./pr-action.mjs', import.meta.url)
// Even a regressed --execute guard must never reach an installed GitHub CLI.
const run = (...args) => spawnSync(process.execPath, [script.pathname, ...args], {
  encoding: 'utf8', env: { ...process.env, PATH: '' },
})

for (const winner of [
  'https://github.com/example/project/pull/12',
  'https://github.com/EXAMPLE/PROJECT/pull/12',
  'https://github.com/example/project/pull/012?tab=files#discussion',
]) {
  test(`rejects self-duplicate alias ${winner}`, () => {
    const result = run('close-as-dupe', 'https://github.com/example/project/pull/12', winner)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /cannot be its own duplicate/i)
    assert.equal(result.stdout, '')
  })
}

test('keeps a distinct winning PR as a dry run', () => {
  const result = run('close-as-dupe', 'https://github.com/example/project/pull/12', 'https://github.com/example/project/pull/13')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /DRY RUN/)
  assert.match(result.stdout, /gh pr close 12/)
  assert.match(result.stdout, /duplicate of https:\/\/github.com\/example\/project\/pull\/13/)
})

test('allows equal PR numbers in different repositories', () => {
  const result = run('close-as-dupe', 'https://github.com/example/project/pull/12', 'https://github.com/example/other/pull/12')
  assert.equal(result.status, 0)
})

test('preserves update-branch dry runs', () => {
  const result = run('update-branch', 'https://github.com/example/project/pull/12')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /gh pr update-branch 12 --repo example\/project/)
})

test('rejects self-duplicate before execution with gh unavailable', () => {
  const result = run('close-as-dupe', 'https://github.com/example/project/pull/12',
    'https://github.com/EXAMPLE/PROJECT/pull/12', '--execute')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /cannot be its own duplicate/i)
  assert.equal(result.stdout, '')
})

for (const encodedUrl of [
  'https://github.com/%65xample/project/pull/12',
  'https://github.com/example/%70roject/pull/12',
  'https://github.com/example/pro%6Aect/pull/12',
  'https://github.com/example/%2570roject/pull/12',
]) {
  for (const mode of [[], ['--execute']]) {
    for (const [label, args] of [
      ['duplicate', ['close-as-dupe', encodedUrl, 'https://github.com/example/project/pull/12']],
      ['winner', ['close-as-dupe', 'https://github.com/example/project/pull/12', encodedUrl]],
      ['update', ['update-branch', encodedUrl]],
    ]) {
      test(`rejects encoded ${label} URL ${encodedUrl} in ${mode.length ? 'execute' : 'dry-run'} mode`, () => {
        const result = run(...args, ...mode)
        assert.equal(result.status, 1)
        assert.match(result.stderr, /Expected https:\/\/github.com\//)
        assert.equal(result.stdout, '')
      })
    }
  }
}

test('preserves normal owner and repository punctuation', () => {
  const result = run('update-branch', 'https://github.com/example-org/project.name_2/pull/12')
  assert.equal(result.status, 0)
  assert.match(result.stdout, /gh pr update-branch 12 --repo example-org\/project\.name_2/)
})
