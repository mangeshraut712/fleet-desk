#!/usr/bin/env node

/**
 * Deliberately small, command-line action bridge for Fleet Desk.
 * It prints commands by default. Only the explicit --execute switch calls gh.
 */
import { execFileSync } from 'node:child_process'

function usage(exitCode = 0) {
  process.stderr.write(`Usage:\n  npm run pr:action -- update-branch <pr-url> [--execute]\n  npm run pr:action -- view <pr-url> [--execute]\n  npm run pr:action -- diff <pr-url> [--execute]\n  npm run pr:action -- checks <pr-url> [--execute]\n  npm run pr:action -- checkout <pr-url> [--execute]\n  npm run pr:action -- ready <pr-url> [--execute]\n  npm run pr:action -- close <pr-url> [--execute]\n  npm run pr:action -- reopen <pr-url> [--execute]\n  npm run pr:action -- lock <pr-url> [--execute]\n  npm run pr:action -- unlock <pr-url> [--execute]\n  npm run pr:action -- comment <pr-url> "<comment-body>" [--execute]\n  npm run pr:action -- close-as-dupe <duplicate-pr-url> <winning-pr-url> [--execute]\n`)
  process.exit(exitCode)
}

function parsePullUrl(value) {
  let url

  try {
    url = new URL(value)
  } catch {
    throw new Error(`Expected a GitHub pull request URL, received: ${value}`)
  }

  const parts = url.pathname.split('/').filter(Boolean)
  // Number("12e2") is 1200 and Number("0x10") is 16; only accept a digit string.
  if (!/^\d+$/.test(parts[3] || '')) {
    throw new Error(`Expected https://github.com/<owner>/<repo>/pull/<number>, received: ${value}`)
  }
  const number = Number(parts[3])
  const host = url.hostname.replace(/^www\./, '')
  // Browser copies often include a tab path (/files, /commits, /checks) or www.
  if (
    url.protocol !== 'https:' ||
    host !== 'github.com' ||
    parts.length < 4 ||
    // URL.pathname preserves escapes, but gh may decode them as repository aliases.
    parts[0].includes('%') ||
    parts[1].includes('%') ||
    parts[2] !== 'pull' ||
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw new Error(`Expected https://github.com/<owner>/<repo>/pull/<number>, received: ${value}`)
  }

  return {
    number,
    repo: `${parts[0]}/${parts[1]}`,
    // Drop tab suffixes (/files, /commits) so comments and logs use the PR itself.
    url: `https://github.com/${parts[0]}/${parts[1]}/pull/${number}`,
  }
}

function display(args) {
  return `gh ${args.map((part) => (part.includes(' ') ? JSON.stringify(part) : part)).join(' ')}`
}

const input = process.argv.slice(2)
const shouldExecute = input.includes('--execute')
const args = input.filter((part) => part !== '--execute')

if (args.length === 0 || args.includes('--help') || args.includes('-h')) usage()

try {
  const [action, ...urls] = args
  let commands

  if (action === 'update-branch' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Update branch',
      ['pr', 'update-branch', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'view' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'View pull request',
      ['pr', 'view', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'diff' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'View pull request diff',
      ['pr', 'diff', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'checks' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'View pull request checks',
      ['pr', 'checks', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'checkout' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Checkout pull request',
      ['pr', 'checkout', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'ready' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Mark pull request ready for review',
      ['pr', 'ready', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'close' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Close pull request',
      ['pr', 'close', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'reopen' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Reopen pull request',
      ['pr', 'reopen', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'lock' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Lock pull request conversation',
      ['pr', 'lock', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'unlock' && urls.length === 1) {
    const pr = parsePullUrl(urls[0])
    commands = [[
      'Unlock pull request conversation',
      ['pr', 'unlock', String(pr.number), '--repo', pr.repo],
    ]]
  } else if (action === 'comment' && urls.length >= 2) {
    const pr = parsePullUrl(urls[0])
    const commentBody = urls.slice(1).join(' ').trim()
    if (!commentBody) {
      throw new Error('Comment body must not be empty.')
    }
    commands = [[
      'Comment on pull request',
      ['pr', 'comment', String(pr.number), '--repo', pr.repo, '--body', commentBody],
    ]]
  } else if (action === 'close-as-dupe' && urls.length === 2) {
    const duplicate = parsePullUrl(urls[0])
    const winner = parsePullUrl(urls[1])
    if (duplicate.repo.toLowerCase() === winner.repo.toLowerCase() && duplicate.number === winner.number) {
      throw new Error('A pull request cannot be its own duplicate.')
    }
    const comment = `Closing as a duplicate of ${winner.url}.`
    commands = [
      ['Comment on duplicate', ['pr', 'comment', String(duplicate.number), '--repo', duplicate.repo, '--body', comment]],
      ['Close duplicate', ['pr', 'close', String(duplicate.number), '--repo', duplicate.repo]],
    ]
  } else {
    usage(1)
  }

  if (!shouldExecute) {
    process.stdout.write('DRY RUN — append --execute only after reviewing these commands:\n\n')
    for (const [label, command] of commands) {
      process.stdout.write(`${label}:\n  ${display(command)}\n`)
    }
    process.exit(0)
  }

  process.stdout.write('Executing explicitly requested GitHub action(s):\n')
  for (const [label, command] of commands) {
    process.stdout.write(`${label}: ${display(command)}\n`)
    execFileSync('gh', command, { stdio: 'inherit' })
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${detail}\n`)
  process.exitCode = 1
}
