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

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const defaultOutput = resolve(scriptDirectory, '../public/fixtures/live-prs.json')

export const PAGE_SIZE = 100

export const orgAllowlist = new Set([
  'apple',
  'meta',
  'facebook',
  'anthropics',
  'openai',
  'netflix',
  'microsoft',
  'teslamotors',
  'spacex',
  'xai-org',
  'samsung',
  'lg',
  'walmartlabs',
  'jpmorganchase',
  'amazon',
  'aws',
  'awslabs',
  'adobe',
  'nvidia',
])

export const query = `
  query FleetDesk($searchQuery: String!, $cursor: String) {
    search(query: $searchQuery, type: ISSUE, first: 100, after: $cursor) {
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
            contexts(first: 100) {
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
  const index = argv.indexOf(name)
  return index === -1 ? fallback : argv[index + 1] || fallback
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
    failingChecks: failedChecks(pr.statusCheckRollup?.contexts?.nodes),
    labels: pr.labels.nodes.map((label) => label.name),
    updatedAt: pr.updatedAt,
    orgAllowlisted: orgAllowlist.has(pr.repository.owner.login.toLowerCase()),
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
    const search = JSON.parse(raw).data.search
    for (const pr of (search.nodes ?? []).filter(Boolean)) {
      const key = pr.url || `${pr.repository?.nameWithOwner}#${pr.number}`
      if (seen.has(key)) continue
      seen.add(key)
      prs.push(mapPull(pr, author))
    }
    if (!search.pageInfo?.hasNextPage || !search.pageInfo.endCursor) break
    cursor = search.pageInfo.endCursor
  }

  return prs
}

export function defaultGraphqlRunner(author) {
  return (cursor) => {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `searchQuery=is:pr is:open author:${author} archived:false`,
    ]
    if (cursor) {
      args.push('-f', `cursor=${cursor}`)
    }
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  }
}

export function run(argv = process.argv, runGraphql) {
  const author = readOption(argv, '--author', 'mangeshraut712')
  const output = resolve(readOption(argv, '--output', defaultOutput))
  const prs = collectPulls(runGraphql ?? defaultGraphqlRunner(author), author)
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
