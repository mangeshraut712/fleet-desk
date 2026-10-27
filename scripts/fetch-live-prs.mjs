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

const orgAllowlist = new Set([
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

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1] || fallback
}

const author = readOption('--author', 'mangeshraut712')
const output = resolve(readOption('--output', defaultOutput))

const query = `
  query FleetDesk($searchQuery: String!) {
    search(query: $searchQuery, type: ISSUE, first: 100) {
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

function failedChecks(contexts = []) {
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

try {
  const raw = execFileSync(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `searchQuery=is:pr is:open author:${author} archived:false`,
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
  const nodes = JSON.parse(raw).data.search.nodes.filter(Boolean)
  const prs = nodes.map((pr) => ({
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
  }))

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(prs, null, 2)}\n`)
  process.stderr.write(`Wrote ${prs.length} live PRs to ${output}\n`)
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    `Unable to fetch live PRs. Install GitHub CLI and authenticate with gh auth login (or set GITHUB_TOKEN).\n${detail}\n`,
  )
  process.exitCode = 1
}
