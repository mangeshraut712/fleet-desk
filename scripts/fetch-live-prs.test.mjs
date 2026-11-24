import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PAGE_SIZE, collectPulls, failedChecks, mapPull, orgAllowlist, parsePageSize, readOption, rollupFailingChecks, run } from './fetch-live-prs.mjs'

function page(nodes, hasNextPage, endCursor) {
  return JSON.stringify({
    data: {
      search: {
        pageInfo: { hasNextPage, endCursor },
        nodes,
      },
    },
  })
}

function pr(n, repo = 'example/project') {
  return {
    number: n,
    title: `PR ${n}`,
    url: `https://github.com/${repo}/pull/${n}`,
    author: { login: 'mangeshraut712' },
    repository: { nameWithOwner: repo, owner: { login: repo.split('/')[0] } },
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: 'REVIEW_REQUIRED',
    labels: { nodes: [] },
    updatedAt: '2026-11-10T00:00:00Z',
    statusCheckRollup: { contexts: { nodes: [] } },
  }
}

test('collectPulls walks every GraphQL search page past the 100-item cap', () => {
  const first = Array.from({ length: 100 }, (_, i) => pr(i + 1))
  const second = Array.from({ length: 54 }, (_, i) => pr(i + 101))
  const cursors = []
  const runGraphql = (cursor) => {
    cursors.push(cursor)
    if (!cursor) return page(first, true, 'cursor-page-2')
    if (cursor === 'cursor-page-2') return page(second, false, null)
    throw new Error(`unexpected cursor ${cursor}`)
  }

  const prs = collectPulls(runGraphql, 'mangeshraut712')
  assert.deepEqual(cursors, [undefined, 'cursor-page-2'])
  assert.equal(prs.length, 154)
  assert.equal(prs[0].number, 1)
  assert.equal(prs[99].number, 100)
  assert.equal(prs[100].number, 101)
  assert.equal(prs[153].number, 154)
  assert.equal(prs[0].repo, 'example/project')
})

test('run writes every page to the fixture file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-desk-'))
  const output = join(dir, 'live-prs.json')
  const first = [pr(1), pr(2)]
  const second = [pr(3)]
  const runGraphql = (cursor) => (cursor ? page(second, false, null) : page(first, true, 'c2'))
  const result = run(['node', 'fetch-live-prs.mjs', '--output', output], runGraphql)
  assert.equal(result.count, 3)
  const written = JSON.parse(readFileSync(output, 'utf8'))
  assert.deepEqual(written.map((item) => item.number), [1, 2, 3])
})

test('collectPulls drops a collaborator-blocked OpenAI CreatePR and a pyrefly vanity stub', () => {
  const blocked = pr(7, 'openai/codex')
  blocked.title = 'CreatePR: add a collaborator-only workflow'
  blocked.labels = { nodes: [{ name: 'collaborator-blocked' }] }
  const vanity = pr(8, 'facebook/pyrefly')
  vanity.title = 'add a fixture-stub for the vanity demo'
  const kept = pr(9, 'microsoft/vscode')
  const prs = collectPulls(() => page([blocked, vanity, kept], false, null), 'mangeshraut712')
  assert.deepEqual(prs.map((item) => item.number), [9])
})

test('mapPull shares organization allowlist with src/config.ts', () => {
  for (const repo of [
    'google/adk-go',
    'google-gemini/cookbook',
    'salesforce/zana',
    'intel/dokimi',
    'ibm/javacore-analyser',
    'carbon-design-system/carbon',
    'awslabs/stickler',
  ]) {
    const mapped = mapPull(pr(42, repo), 'mangeshraut712')
    assert.equal(mapped.orgAllowlisted, true, `${repo} should be allowlisted`)
  }
  assert.equal(mapPull(pr(43, 'unaffiliated/example'), 'mangeshraut712').orgAllowlisted, false)
  assert.equal(orgAllowlist.has('google'), true)
  assert.equal(orgAllowlist.has('salesforce'), true)
})

test('failedChecks extracts failing CheckRun and StatusContext entries without duplicates', () => {
  const contexts = [
    { __typename: 'CheckRun', name: 'unit-tests', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', name: 'unit-tests', conclusion: 'TIMED_OUT' },
    { __typename: 'CheckRun', name: 'lint', conclusion: 'SUCCESS' },
    { __typename: 'StatusContext', context: 'cla/google', state: 'FAILURE' },
    { __typename: 'StatusContext', context: 'codecov', state: 'SUCCESS' },
  ]
  assert.deepEqual(failedChecks(contexts), ['unit-tests', 'cla/google'])
})

test('parsePageSize defaults to PAGE_SIZE and rejects out-of-range values', () => {
  assert.equal(parsePageSize(undefined), PAGE_SIZE)
  assert.equal(parsePageSize(''), PAGE_SIZE)
  assert.equal(parsePageSize('50'), 50)
  assert.throws(() => parsePageSize('0'), /Invalid --page-size/)
  assert.throws(() => parsePageSize('101'), /Invalid --page-size/)
  assert.throws(() => parsePageSize('12.5'), /Invalid --page-size/)
  assert.throws(() => parsePageSize('abc'), /Invalid --page-size/)
})

test('readOption supports inline --flag=value and rejects missing option values', () => {
  assert.equal(readOption(['node', 'script', '--author=octocat'], '--author', 'default'), 'octocat')
  assert.equal(readOption(['node', 'script', '--page-size=15'], '--page-size', undefined), '15')
  assert.equal(readOption(['node', 'script'], '--author', 'default'), 'default')
  assert.throws(() => readOption(['node', 'script', '--output'], '--output', 'out.json'), /Missing value for --output/)
  assert.throws(
    () => readOption(['node', 'script', '--output', '--author', 'octocat'], '--output', 'out.json'),
    /Missing value for --output/,
  )
  assert.throws(() => readOption(['node', 'script', '--author='], '--author', 'default'), /Missing value for --author/)
})

test('collectPulls surfaces GraphQL errors when data.search is absent', () => {
  assert.throws(
    () => collectPulls(() => JSON.stringify({ errors: [{ message: 'API rate limit exceeded' }] }), 'mangeshraut712'),
    /API rate limit exceeded/,
  )
  assert.throws(
    () => collectPulls(() => JSON.stringify({ data: {} }), 'mangeshraut712'),
    /did not include data\.search/,
  )
})

test('rollupFailingChecks flags a failed rollup whose failing check is past the first 100 contexts', () => {
  const passing = Array.from({ length: 100 }, (_, i) => ({ __typename: 'CheckRun', name: `job-${i}`, status: 'COMPLETED', conclusion: 'SUCCESS' }))
  const rollup = { state: 'FAILURE', contexts: { totalCount: 140, pageInfo: { hasNextPage: true }, nodes: passing } }
  assert.deepEqual(rollupFailingChecks(rollup), ['check rollup FAILURE (read 100 of 140 checks)'])
})

test('rollupFailingChecks keeps named failures and does not invent one when every check was read', () => {
  const failing = { __typename: 'CheckRun', name: 'unit-tests', status: 'COMPLETED', conclusion: 'FAILURE' }
  assert.deepEqual(
    rollupFailingChecks({ state: 'FAILURE', contexts: { totalCount: 140, pageInfo: { hasNextPage: true }, nodes: [failing] } }),
    ['unit-tests'],
  )
  assert.deepEqual(
    rollupFailingChecks({ state: 'FAILURE', contexts: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] } }),
    [],
  )
  assert.deepEqual(rollupFailingChecks({ state: 'SUCCESS', contexts: { totalCount: 140, pageInfo: { hasNextPage: true }, nodes: [] } }), [])
  assert.deepEqual(rollupFailingChecks(null), [])
})
