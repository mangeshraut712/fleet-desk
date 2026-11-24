#!/usr/bin/env node

/**
 * Read the authenticated user's view of mangeshraut712's open pull requests
 * and create the file consumed by Fleet Desk's Live mode. This script only
 * calls GitHub's read-only GraphQL API.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fleetDeskConfig, isAllowlistedRepo } from '../src/config.ts'
import { shouldSkipPullRequest } from '../src/skip-pr.js'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const defaultOutput = resolve(scriptDirectory, '../public/fixtures/live-prs.json')

export const PAGE_SIZE = 25

export const orgAllowlist = new Set(
  fleetDeskConfig.organizationAllowlist.flatMap(({ slugs }) => slugs),
)

export const query = `
  query FleetDesk($searchQuery: String!, $cursor: String, $pageSize: Int = 25) {
    search(query: $searchQuery, type: ISSUE, first: $pageSize, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          number
          title
          url
          author { login }
          repository { nameWithOwner owner { login } }
          mergeable
          mergeStateStatus
          reviewDecision
          labels(first: 30) { nodes { name } }
          updatedAt
          statusCheckRollup {
            state
            contexts(first: 100) {
              totalCount
              pageInfo { hasNextPage }
              nodes {
                __typename
                ... on CheckRun { name status conclusion }
                ... on StatusContext { context state }
              }
            }
          }
        }
      }
    }
  }
`

export function readOption(argv, name, fallback) {
  const prefix = `${name}=`
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith(prefix)) {
      const inlineValue = arg.slice(prefix.length)
      if (!inlineValue) throw new Error(`Missing value for ${name}.`)
      return inlineValue
    }
    if (arg === name) {
      const next = argv[i + 1]
      if (next === undefined || next === '' || next.startsWith('--')) {
        throw new Error(`Missing value for ${name}.`)
      }
      return next
    }
  }
  return fallback
}

export function failedChecks(contexts = []) {
  const failed = new Set()
  const failedConclusions = new Set([
    'ACTION_REQUIRED',
    'CANCELLED',
    'FAILURE',
    'STALE',
    'STARTUP_FAILURE',
    'TIMED_OUT',
  ])

  for (const check of contexts) {
    if (check.__typename === 'CheckRun' && failedConclusions.has(check.conclusion)) {
      failed.add(check.name)
    }

    if (check.__typename === 'StatusContext' && ['ERROR', 'FAILURE'].includes(check.state)) {
      failed.add(check.context)
    }
  }

  return [...failed]
}

/**
 * contexts(first: 100) is GitHub's cap, so a PR with more checks can have its
 * failures outside the page that was read. When the rollup says the PR failed
 * but no failing check was seen, report that instead of showing it as green.
 */
export function rollupFailingChecks(rollup) {
  const contexts = rollup?.contexts
  const nodes = contexts?.nodes ?? []
  const failing = failedChecks(nodes)
  if (
    failing.length === 0 &&
    contexts?.pageInfo?.hasNextPage &&
    ['ERROR', 'FAILURE'].includes(rollup?.state)
  ) {
    failing.push(
      `check rollup ${rollup.state} (read ${nodes.length} of ${contexts.totalCount ?? 'more'} checks)`,
    )
  }
  return failing
}

export function mapPull(pr, author) {
  return {
    number: pr.number,
    title: pr.title,
    repo: pr.repository.nameWithOwner,
    url: pr.url,
    author: pr.author?.login ?? author,
    mergeable: pr.mergeable ?? 'UNKNOWN',
    mergeStateStatus: pr.mergeStateStatus ?? 'UNKNOWN',
    reviewDecision: pr.reviewDecision ?? 'PENDING',
    failingChecks: rollupFailingChecks(pr.statusCheckRollup),
    labels: pr.labels.nodes.map((label) => label.name),
    updatedAt: pr.updatedAt,
    orgAllowlisted: isAllowlistedRepo(pr.repository.nameWithOwner),
  }
}

/**
 * Walk every search page. GitHub caps each page at 100; a single request
 * silently drops any open PRs after that.
 */
export function collectPulls(runGraphql, author) {
  const prs = []
  let cursor
  const seen = new Set()

  for (;;) {
    const raw = runGraphql(cursor)
    const parsed = JSON.parse(raw)
    const search = parsed?.data?.search
    if (!search) {
      const detail = Array.isArray(parsed?.errors) && parsed.errors.length > 0
        ? parsed.errors.map((err) => err?.message || String(err)).join('; ')
        : 'GraphQL response did not include data.search.'
      throw new Error(detail)
    }
    for (const pr of (search.nodes ?? []).filter(Boolean)) {
      const key = pr.url || `${pr.repository?.nameWithOwner}#${pr.number}`
      if (seen.has(key)) continue
      seen.add(key)
      const mapped = mapPull(pr, author)
      if (shouldSkipPullRequest(mapped)) continue
      prs.push(mapped)
    }
    if (!search.pageInfo?.hasNextPage || !search.pageInfo.endCursor) break
    cursor = search.pageInfo.endCursor
  }

  return prs
}

export function defaultGraphqlRunner(author, pageSize = PAGE_SIZE) {
  return (cursor) => {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `searchQuery=is:pr is:open author:${author} archived:false`,
      '-F',
      `pageSize=${pageSize}`,
    ]
    if (cursor) {
      args.push('-f', `cursor=${cursor}`)
    }
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  }
}

export function parsePageSize(raw, fallback = PAGE_SIZE) {
  if (raw === undefined || raw === null || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`Invalid --page-size "${raw}". Expected an integer between 1 and 100.`)
  }
  return parsed
}

export function run(argv = process.argv, runGraphql) {
  const author = readOption(argv, '--author', 'mangeshraut712')
  const output = resolve(readOption(argv, '--output', defaultOutput))
  const pageSize = parsePageSize(readOption(argv, '--page-size', undefined))
  const prs = collectPulls(runGraphql ?? defaultGraphqlRunner(author, pageSize), author)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(prs, null, 2)}\n`)
  return { output, count: prs.length }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isCli) {
  try {
    const result = run()
    process.stderr.write(`Wrote ${result.count} live PRs to ${result.output}\n`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    process.stderr.write(
      `Unable to fetch live PRs. Install GitHub CLI and authenticate with gh auth login (or set GITHUB_TOKEN).\n${detail}\n`,
    )
    process.exitCode = 1
  }
}
