import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { collectPulls, run } from './fetch-live-prs.mjs'

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
