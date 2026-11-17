import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filters,
  isPullRequest,
  isMergeable,
  mergeableText,
  reviewText,
  stateTone,
  formatTime,
  commandFor,
  type PullRequest,
  type PendingAction,
} from './pr-helpers.ts'

const basePr: PullRequest = {
  number: 42,
  title: 'feat: add telemetry',
  repo: 'org/repo',
  url: 'https://github.com/org/repo/pull/42',
  author: 'dev1',
  mergeable: true,
  mergeStateStatus: 'CLEAN',
  reviewDecision: 'APPROVED',
  failingChecks: [],
  labels: ['enhancement'],
  updatedAt: '2026-11-17T12:00:00Z',
  orgAllowlisted: true,
}

test('isPullRequest validates valid object', () => {
  assert.equal(isPullRequest(basePr), true)
})

test('isPullRequest rejects non-objects and missing required fields', () => {
  assert.equal(isPullRequest(null), false)
  assert.equal(isPullRequest(undefined), false)
  assert.equal(isPullRequest('string'), false)
  assert.equal(isPullRequest(123), false)
  assert.equal(isPullRequest({ number: 42 }), false)
  assert.equal(isPullRequest({ ...basePr, number: 'not a number' }), false)
  assert.equal(isPullRequest({ ...basePr, title: 123 }), false)
  assert.equal(isPullRequest({ ...basePr, repo: null }), false)
  assert.equal(isPullRequest({ ...basePr, url: undefined }), false)
  assert.equal(isPullRequest({ ...basePr, failingChecks: null }), false)
  assert.equal(isPullRequest({ ...basePr, labels: 'label' }), false)
})

test('isMergeable identifies true and MERGEABLE variants', () => {
  assert.equal(isMergeable({ ...basePr, mergeable: true }), true)
  assert.equal(isMergeable({ ...basePr, mergeable: 'MERGEABLE' }), true)
  assert.equal(isMergeable({ ...basePr, mergeable: false }), false)
  assert.equal(isMergeable({ ...basePr, mergeable: 'CONFLICTING' }), false)
  assert.equal(isMergeable({ ...basePr, mergeable: 'UNKNOWN' }), false)
  assert.equal(isMergeable({ ...basePr, mergeable: null }), false)
})

test('mergeableText formats human readable statuses', () => {
  assert.equal(mergeableText({ ...basePr, mergeable: true }), 'mergeable')
  assert.equal(mergeableText({ ...basePr, mergeable: 'MERGEABLE' }), 'mergeable')
  assert.equal(mergeableText({ ...basePr, mergeable: false }), 'conflicting')
  assert.equal(mergeableText({ ...basePr, mergeable: 'CONFLICTING' }), 'conflicting')
  assert.equal(mergeableText({ ...basePr, mergeable: 'UNKNOWN' }), 'unknown')
  assert.equal(mergeableText({ ...basePr, mergeable: null }), 'unknown')
})

test('reviewText maps GitHub review decisions', () => {
  assert.equal(reviewText('APPROVED'), 'approved')
  assert.equal(reviewText('CHANGES_REQUESTED'), 'changes requested')
  assert.equal(reviewText('REVIEW_REQUIRED'), 'review required')
  assert.equal(reviewText(null), 'not reviewed')
  assert.equal(reviewText('COMMENTED'), 'not reviewed')
})

test('stateTone maps tones for clean, warning, and bad states', () => {
  assert.equal(stateTone('CLEAN'), 'good')
  assert.equal(stateTone('BEHIND'), 'warn')
  assert.equal(stateTone('UNSTABLE'), 'warn')
  assert.equal(stateTone('UNKNOWN'), 'warn')
  assert.equal(stateTone('BLOCKED'), 'bad')
  assert.equal(stateTone('DIRTY'), 'bad')
  assert.equal(stateTone('HAS_HOOKS'), 'bad')
})

test('formatTime parses valid date strings and handles invalid fallbacks', () => {
  const formatted = formatTime('2026-11-17T12:00:00Z')
  assert.ok(typeof formatted === 'string' && formatted.length > 0)
  assert.equal(formatTime('invalid-date'), 'invalid-date')
})

test('commandFor formats update-branch and close-as-dupe commands', () => {
  const updateAction: PendingAction = { kind: 'update-branch', pr: basePr, stage: 'review' }
  const dupeAction: PendingAction = { kind: 'close-as-dupe', pr: basePr, stage: 'review' }
  const winnerUrl = 'https://github.com/org/repo/pull/10'

  assert.equal(
    commandFor(updateAction, winnerUrl, false),
    'npm run pr:action -- update-branch https://github.com/org/repo/pull/42'
  )
  assert.equal(
    commandFor(updateAction, winnerUrl, true),
    'npm run pr:action -- update-branch https://github.com/org/repo/pull/42 --execute'
  )
  assert.equal(
    commandFor(dupeAction, winnerUrl, false),
    'npm run pr:action -- close-as-dupe https://github.com/org/repo/pull/42 https://github.com/org/repo/pull/10'
  )
  assert.equal(
    commandFor(dupeAction, winnerUrl, true),
    'npm run pr:action -- close-as-dupe https://github.com/org/repo/pull/42 https://github.com/org/repo/pull/10 --execute'
  )
})

test('filters correctly match corresponding pull requests', () => {
  const behindFilter = filters.find((f) => f.id === 'behind')!
  const ciRedFilter = filters.find((f) => f.id === 'ci-red')!
  const dirtyFilter = filters.find((f) => f.id === 'dirty')!
  const reviewBlockedFilter = filters.find((f) => f.id === 'review-blocked')!
  const readyFilter = filters.find((f) => f.id === 'ready')!

  // behind
  assert.equal(behindFilter.matches({ ...basePr, mergeStateStatus: 'BEHIND' }), true)
  assert.equal(behindFilter.matches({ ...basePr, mergeStateStatus: 'CLEAN' }), false)

  // ci-red
  assert.equal(ciRedFilter.matches({ ...basePr, failingChecks: ['ci/test'] }), true)
  assert.equal(ciRedFilter.matches({ ...basePr, failingChecks: [] }), false)

  // dirty
  assert.equal(dirtyFilter.matches({ ...basePr, mergeStateStatus: 'DIRTY' }), true)
  assert.equal(dirtyFilter.matches({ ...basePr, mergeable: false }), true)
  assert.equal(dirtyFilter.matches({ ...basePr, mergeable: 'CONFLICTING' }), true)
  assert.equal(dirtyFilter.matches({ ...basePr, mergeStateStatus: 'CLEAN', mergeable: true }), false)

  // review-blocked
  assert.equal(reviewBlockedFilter.matches({ ...basePr, reviewDecision: 'CHANGES_REQUESTED' }), true)
  assert.equal(reviewBlockedFilter.matches({ ...basePr, reviewDecision: 'APPROVED' }), false)

  // ready
  assert.equal(readyFilter.matches({ ...basePr, mergeStateStatus: 'CLEAN', reviewDecision: 'APPROVED' }), true)
  assert.equal(readyFilter.matches({ ...basePr, mergeStateStatus: 'BEHIND', reviewDecision: 'APPROVED' }), false)
  assert.equal(readyFilter.matches({ ...basePr, mergeStateStatus: 'CLEAN', reviewDecision: null }), false)
})
