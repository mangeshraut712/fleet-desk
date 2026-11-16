import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { shouldSkipPullRequest } from './config.ts'
import { isWinningPullUrl } from './pull-url.ts'

type MergeState = 'BEHIND' | 'BLOCKED' | 'CLEAN' | 'UNSTABLE' | 'DIRTY' | 'UNKNOWN' | 'HAS_HOOKS'
type Mergeable = boolean | 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
type PullRequest = {
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
type SourceMode = 'fixture' | 'live'
type FilterId = 'behind' | 'ci-red' | 'dirty' | 'review-blocked' | 'ready'
type ActionKind = 'update-branch' | 'close-as-dupe'
type PendingAction = { kind: ActionKind; pr: PullRequest; stage: 'review' | 'confirm' }
type LogEntry = { id: number; message: string; timestamp: string; kind: 'dry-run' | 'handoff' }

const filters: Array<{ id: FilterId; label: string; matches: (pr: PullRequest) => boolean }> = [
  { id: 'behind', label: 'BEHIND', matches: (pr) => pr.mergeStateStatus === 'BEHIND' },
  { id: 'ci-red', label: 'CI-red', matches: (pr) => pr.failingChecks.length > 0 },
  { id: 'dirty', label: 'CONFLICTING / DIRTY', matches: (pr) => pr.mergeStateStatus === 'DIRTY' || pr.mergeable === false || pr.mergeable === 'CONFLICTING' },
  { id: 'review-blocked', label: 'review-BLOCKED', matches: (pr) => pr.reviewDecision === 'CHANGES_REQUESTED' },
  { id: 'ready', label: 'CLEAN / APPROVED', matches: (pr) => pr.mergeStateStatus === 'CLEAN' && pr.reviewDecision === 'APPROVED' },
]

function isPullRequest(value: unknown): value is PullRequest {
  if (!value || typeof value !== 'object') return false
  const pr = value as Record<string, unknown>
  return typeof pr.number === 'number' && typeof pr.title === 'string' && typeof pr.repo === 'string' && typeof pr.url === 'string' && Array.isArray(pr.failingChecks) && Array.isArray(pr.labels)
}

function isMergeable(pr: PullRequest) { return pr.mergeable === true || pr.mergeable === 'MERGEABLE' }
function mergeableText(pr: PullRequest) { return isMergeable(pr) ? 'mergeable' : pr.mergeable === false || pr.mergeable === 'CONFLICTING' ? 'conflicting' : 'unknown' }
function reviewText(value: string | null) { return value === 'APPROVED' ? 'approved' : value === 'CHANGES_REQUESTED' ? 'changes requested' : value === 'REVIEW_REQUIRED' ? 'review required' : 'not reviewed' }
function stateTone(state: MergeState) { return state === 'CLEAN' ? 'good' : state === 'BEHIND' || state === 'UNSTABLE' || state === 'UNKNOWN' ? 'warn' : 'bad' }
function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}
function commandFor(action: PendingAction, winningUrl: string, execute = false) {
  const target = action.pr.url
  const base = action.kind === 'update-branch'
    ? `npm run pr:action -- update-branch ${target}`
    : `npm run pr:action -- close-as-dupe ${target} ${winningUrl}`
  return execute ? `${base} --execute` : base
}

function App() {
  const [mode, setMode] = useState<SourceMode>('fixture')
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [activeFilters, setActiveFilters] = useState<FilterId[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)
  const [dryRun, setDryRun] = useState(true)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [winningUrl, setWinningUrl] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const path = mode === 'fixture' ? '/fixtures/prs.json' : '/fixtures/live-prs.json'
    async function load() {
      setLoading(true); setError(null)
      try {
        const response = await fetch(path, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`)
        const payload: unknown = await response.json()
        const rows = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && Array.isArray((payload as { prs?: unknown }).prs) ? (payload as { prs: unknown[] }).prs : []
        if (!rows.every(isPullRequest)) throw new Error('The PR data did not have the expected shape.')
        setPrs(rows.filter((pr) => !shouldSkipPullRequest(pr))); setLastRefresh(new Date().toISOString())
      } catch (reason) {
        if (controller.signal.aborted) return
        setPrs([])
        setError(mode === 'live' ? 'Live snapshot unavailable. Run the documented refresh command, then try again.' : reason instanceof Error ? reason.message : 'Could not load fixture data.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [mode])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const visible = useMemo(() => activeFilters.length === 0 ? prs : prs.filter((pr) => activeFilters.some((id) => filters.find((filter) => filter.id === id)?.matches(pr))), [activeFilters, prs])
  const counts = useMemo(() => Object.fromEntries(filters.map((filter) => [filter.id, prs.filter(filter.matches).length])) as Record<FilterId, number>, [prs])
  const command = pending ? commandFor(pending, winningUrl.trim(), !dryRun) : ''
  const duplicateUrlValid = isWinningPullUrl(winningUrl)

  function chooseMode(next: SourceMode) { setMode(next); if (next === 'fixture') setDryRun(true) }
  function toggleFilter(id: FilterId) { setActiveFilters((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  function openAction(kind: ActionKind, pr: PullRequest) { setWinningUrl(''); setPending({ kind, pr, stage: 'review' }) }
  function addLog(kind: LogEntry['kind'], message: string) { setLogs((current) => [{ id: Date.now(), kind, message, timestamp: new Date().toISOString() }, ...current]) }
  async function confirmAction() {
    if (!pending) return
    const actionCommand = commandFor(pending, winningUrl.trim(), !dryRun)
    if (dryRun) {
      addLog('dry-run', `Would run: ${actionCommand}`); setToast('Dry run logged. No GitHub state changed.')
    } else {
      try { await navigator.clipboard.writeText(actionCommand); setToast('Command copied. It still needs to be run manually in a reviewed shell.') }
      catch { setToast('Command logged. Copy it from the action log to run manually.') }
      addLog('handoff', `Approved for manual execution: ${actionCommand}`)
    }
    setPending(null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PR watch board</p>
          <h1>Fleet Desk</h1>
          <p className="subtitle">Open pull requests by <strong>mangeshraut712</strong></p>
        </div>
        <div className="source-controls" aria-label="Data source controls">
          <div className="source-toggle" role="group" aria-label="Data source">
            <button className={mode === 'fixture' ? 'active' : ''} type="button" aria-pressed={mode === 'fixture'} onClick={() => chooseMode('fixture')}>Fixture</button>
            <button className={mode === 'live' ? 'active' : ''} type="button" aria-pressed={mode === 'live'} onClick={() => chooseMode('live')}>Live</button>
          </div>
          <label className="dry-run-switch" title={mode === 'fixture' ? 'Fixture mode is always dry run.' : undefined}>
            <input type="checkbox" checked={dryRun} disabled={mode === 'fixture'} onChange={(event) => setDryRun(event.target.checked)} />
            <span>Dry run</span>
          </label>
        </div>
      </header>

      <section className="board-meta" aria-label="Board status">
        <div><span className={`data-dot ${error ? 'error' : ''}`} aria-hidden="true" /><strong>{mode === 'fixture' ? 'Fixture data' : 'Live snapshot'}</strong><span className="muted">{loading ? 'Loading…' : error ? error : `${prs.length} open PRs${lastRefresh ? ` · refreshed ${formatTime(lastRefresh)}` : ''}`}</span></div>
        <p>{dryRun ? 'Commands are preview-only.' : 'Confirmation copies a command; the browser never runs gh.'}</p>
      </section>

      <section className="filter-panel" aria-labelledby="filter-heading">
        <div className="filter-heading-row"><div><p className="eyebrow" id="filter-heading">Triage filters</p><p className="filter-help">Choose one or more filters. Selected filters are combined.</p></div>{activeFilters.length > 0 && <button className="clear-filters" type="button" onClick={() => setActiveFilters([])}>Clear filters</button>}</div>
        <div className="filter-grid">
          {filters.map((filter) => <button key={filter.id} className={`filter-chip ${activeFilters.includes(filter.id) ? 'selected' : ''}`} type="button" aria-pressed={activeFilters.includes(filter.id)} onClick={() => toggleFilter(filter.id)}><span>{filter.label}</span><strong>{counts[filter.id]}</strong></button>)}
        </div>
      </section>

      <section className="list-heading" aria-live="polite"><div><p className="eyebrow">Queue</p><h2>{visible.length} matching pull requests</h2></div><p className="muted">Click a title to open GitHub.</p></section>
      <section className="pr-list" aria-label="Pull request list">
        {loading && <div className="empty-state"><span className="spinner" aria-hidden="true" /> Loading pull requests…</div>}
        {!loading && error && <div className="empty-state error-state"><strong>Data could not be loaded.</strong><span>{error}</span></div>}
        {!loading && !error && visible.length === 0 && <div className="empty-state"><strong>No PRs match these filters.</strong><button type="button" onClick={() => setActiveFilters([])}>Clear filters</button></div>}
        {!loading && !error && visible.map((pr) => (
          <article className="pr-card" key={`${pr.repo}-${pr.number}`}>
            <div className="pr-main">
              <div className="pr-title-row"><span className="pr-number">#{pr.number}</span><a href={pr.url} target="_blank" rel="noreferrer" className="pr-title">{pr.title}<span className="external-mark" aria-hidden="true">↗</span></a></div>
              <div className="pr-context"><code>{pr.repo}</code><span className={pr.orgAllowlisted ? 'allowlisted' : 'outside-allowlist'}>{pr.orgAllowlisted ? 'allowlisted org' : 'outside allowlist'}</span><span>updated {formatTime(pr.updatedAt)}</span></div>
              <div className="status-row" aria-label={`Status for PR ${pr.number}`}><span className={`status-pill ${isMergeable(pr) ? 'good' : pr.mergeable === 'UNKNOWN' || pr.mergeable === null ? 'warn' : 'bad'}`}>{mergeableText(pr)}</span><span className={`status-pill ${stateTone(pr.mergeStateStatus)}`}>{pr.mergeStateStatus.toLowerCase()}</span><span className={`status-pill ${pr.reviewDecision === 'APPROVED' ? 'good' : pr.reviewDecision === 'CHANGES_REQUESTED' ? 'bad' : 'neutral'}`}>{reviewText(pr.reviewDecision)}</span></div>
              <div className="detail-row"><div className="checks"><span className="detail-label">Checks</span>{pr.failingChecks.length > 0 ? pr.failingChecks.map((check) => <span className="check-fail" key={check}>{check}</span>) : <span className="check-ok">No failing checks</span>}</div>{pr.labels.length > 0 && <div className="labels" aria-label="Labels">{pr.labels.map((label) => <span className="label" key={label}>{label}</span>)}</div>}</div>
            </div>
            <div className="card-actions"><button className="action-button" type="button" disabled={pr.mergeStateStatus !== 'BEHIND'} title={pr.mergeStateStatus !== 'BEHIND' ? 'Only BEHIND PRs can update their branch.' : undefined} onClick={() => openAction('update-branch', pr)}>Update branch</button><button className="action-button quiet" type="button" onClick={() => openAction('close-as-dupe', pr)}>Close as dupe</button></div>
          </article>
        ))}
      </section>

      <section className="action-log" aria-labelledby="action-log-heading"><div className="action-log-title"><div><p className="eyebrow" id="action-log-heading">Action log</p><p className="muted">Dry runs show the exact command. No force-push actions are available.</p></div>{logs.length > 0 && <button className="clear-filters" type="button" onClick={() => setLogs([])}>Clear log</button>}</div>{logs.length === 0 ? <p className="log-empty">No actions yet.</p> : <ol className="log-list">{logs.map((entry) => <li key={entry.id} className={entry.kind}><time>{formatTime(entry.timestamp)}</time><code>{entry.message}</code></li>)}</ol>}</section>

      {pending && <div className="modal-backdrop" role="presentation" onMouseDown={() => setPending(null)}><section className="action-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title" onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">{pending.stage === 'review' ? 'Prepare action' : 'Explicit confirmation'}</p><h2 id="action-modal-title">{pending.kind === 'update-branch' ? 'Update branch' : 'Close as duplicate'} for #{pending.pr.number}</h2><p className="modal-pr">{pending.pr.repo} · {pending.pr.title}</p>{pending.kind === 'close-as-dupe' && pending.stage === 'review' && <label className="field-label">Winning PR URL<input autoFocus type="url" value={winningUrl} onChange={(event) => setWinningUrl(event.target.value)} placeholder="https://github.com/owner/repo/pull/123" /><span>Fleet Desk adds a short linking comment, then closes this PR. It never force-pushes.</span></label>}{pending.stage === 'review' && pending.kind === 'update-branch' && <p className="modal-copy">This only requests GitHub to update a BEHIND branch. It does not force-push.</p>}{pending.stage === 'confirm' && <div className="command-preview"><span>Command {dryRun ? 'that would run' : 'to copy for manual execution'}</span><code>{command}</code>{!dryRun && <p>This browser never runs gh. Confirmation copies this reviewed command.</p>}</div>}<div className="modal-actions">{pending.stage === 'confirm' ? <button className="action-button quiet" type="button" onClick={() => setPending((current) => current ? { ...current, stage: 'review' } : current)}>Back</button> : <button className="action-button quiet" type="button" onClick={() => setPending(null)}>Cancel</button>}{pending.stage === 'review' ? <button className="action-button" type="button" disabled={pending.kind === 'close-as-dupe' && !duplicateUrlValid} onClick={() => setPending((current) => current ? { ...current, stage: 'confirm' } : current)}>Review command</button> : <button className={`action-button ${dryRun ? '' : 'danger'}`} type="button" onClick={() => void confirmAction()}>{dryRun ? 'Confirm dry run' : 'Confirm & copy'}</button>}</div></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  )
}

export default App
