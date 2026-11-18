import { parseWinningPullUrl } from './pull-url.ts'

export type MergeState = 'BEHIND' | 'BLOCKED' | 'CLEAN' | 'UNSTABLE' | 'DIRTY' | 'UNKNOWN' | 'HAS_HOOKS'
export type Mergeable = boolean | 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
export type PullRequest = {
  number: number
  title: string
  repo: string
  url: string
  author: string
  mergeable: Mergeable
  mergeStateStatus: MergeState
  reviewDecision: string | null
  failingChecks: string[]
  labels: string[]
  updatedAt: string
  orgAllowlisted: boolean
}
export type SourceMode = 'fixture' | 'live'
export type FilterId = 'behind' | 'ci-red' | 'dirty' | 'review-blocked' | 'ready'
export type ActionKind = 'update-branch' | 'close-as-dupe'
export type PendingAction = { kind: ActionKind; pr: PullRequest; stage: 'review' | 'confirm' }
export type LogEntry = { id: number; message: string; timestamp: string; kind: 'dry-run' | 'handoff' }

export const filters: Array<{ id: FilterId; label: string; matches: (pr: PullRequest) => boolean }> = [
  { id: 'behind', label: 'BEHIND', matches: (pr) => pr.mergeStateStatus === 'BEHIND' },
  { id: 'ci-red', label: 'CI-red', matches: (pr) => pr.failingChecks.length > 0 },
  { id: 'dirty', label: 'CONFLICTING / DIRTY', matches: (pr) => pr.mergeStateStatus === 'DIRTY' || pr.mergeable === false || pr.mergeable === 'CONFLICTING' },
  { id: 'review-blocked', label: 'review-BLOCKED', matches: (pr) => pr.reviewDecision === 'CHANGES_REQUESTED' },
  { id: 'ready', label: 'CLEAN / APPROVED', matches: (pr) => pr.mergeStateStatus === 'CLEAN' && pr.reviewDecision === 'APPROVED' },
]

export function isPullRequest(value: unknown): value is PullRequest {
  if (!value || typeof value !== 'object') return false
  const pr = value as Record<string, unknown>
  return (
    typeof pr.number === 'number' &&
    typeof pr.title === 'string' &&
    typeof pr.repo === 'string' &&
    typeof pr.url === 'string' &&
    Array.isArray(pr.failingChecks) &&
    Array.isArray(pr.labels)
  )
}

export function isMergeable(pr: PullRequest): boolean {
  return pr.mergeable === true || pr.mergeable === 'MERGEABLE'
}

export function mergeableText(pr: PullRequest): string {
  return isMergeable(pr)
    ? 'mergeable'
    : pr.mergeable === false || pr.mergeable === 'CONFLICTING'
    ? 'conflicting'
    : 'unknown'
}

export function reviewText(value: string | null): string {
  return value === 'APPROVED'
    ? 'approved'
    : value === 'CHANGES_REQUESTED'
    ? 'changes requested'
    : value === 'REVIEW_REQUIRED'
    ? 'review required'
    : 'not reviewed'
}

export function stateTone(state: MergeState): 'good' | 'warn' | 'bad' {
  return state === 'CLEAN' ? 'good' : state === 'BEHIND' || state === 'UNSTABLE' || state === 'UNKNOWN' ? 'warn' : 'bad'
}

export function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
}

export function commandFor(action: PendingAction, winningUrl: string, execute = false): string {
  const target = action.pr.url
  const canonicalWinner = parseWinningPullUrl(winningUrl)?.url ?? winningUrl.trim()
  const base =
    action.kind === 'update-branch'
      ? `npm run pr:action -- update-branch ${target}`
      : `npm run pr:action -- close-as-dupe ${target} ${canonicalWinner}`
  return execute ? `${base} --execute` : base
}
