# Fleet Desk

Fleet Desk is a small local board for reviewing open pull requests authored by
`mangeshraut712`. It starts with checked-in fixture data, so every filter and
dry-run action works without GitHub credentials or network access.

## Run it

```sh
npm install
npm run dev
```

For a production check:

```sh
npm run build
```

## Data modes

**Fixture** is the default. It reads `public/fixtures/prs.json`, which is part
of the repository and is intended for predictable offline use.

**Live** reads `public/fixtures/live-prs.json`. Generate or refresh that file
locally with an authenticated GitHub CLI session:

```sh
gh auth login
npm run fetch:live
```

`GITHUB_TOKEN` also works when `gh` is installed. The exporter makes one
read-only GraphQL request and writes only the local live-data file. It discovers
open PRs matching `author:mangeshraut712` that the current GitHub credential can
see. Use a different author or output file if needed:

```sh
node scripts/fetch-live-prs.mjs --author octocat --output /tmp/octocat-prs.json
```

If no live-data file has been generated, Live mode explains how to create one
and leaves the checked-in fixture unchanged.

## Actions

The board presents update-branch and close-as-duplicate as **dry runs** by
default. Selecting an action records the exact `gh` command it would use. The
included action bridge has the same default and has an explicit `--execute`
gate:

```sh
npm run pr:action -- update-branch https://github.com/OWNER/REPO/pull/123
npm run pr:action -- close-as-dupe https://github.com/OWNER/REPO/pull/123 https://github.com/OWNER/REPO/pull/456
```

Review the printed commands first. Add `--execute` to the selected command only
when you intend to mutate GitHub and have the necessary permission. A duplicate
action comments with the winning PR URL before it closes the duplicate. The
bridge never force-pushes or deletes a branch.

## Configuration

`src/config.ts` contains the author, the organization allowlist, and two
guardrails: skip OpenAI `CreatePR` work that is collaborator-blocked, and skip
Pyrefly fixture-stub vanity PRs. The live exporter carries the same organization
slugs so the board can label allowlisted repositories consistently.
