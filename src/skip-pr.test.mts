import assert from "node:assert/strict"
import { test } from "node:test"
import { shouldSkipPullRequest } from "./skip-pr.js"

const openaiBlocked = {
  repo: "openai/codex",
  title: "CreatePR: add a collaborator-only workflow",
  labels: ["collaborator-blocked"],
}

const pyreflyVanity = {
  repo: "facebook/pyrefly",
  title: "add a fixture-stub for the vanity demo",
  labels: [],
}

test("skips an OpenAI CreatePR that is collaborator-blocked", () => {
  assert.equal(shouldSkipPullRequest(openaiBlocked), true)
  assert.equal(shouldSkipPullRequest({ ...openaiBlocked, title: "Create PR for tools" }), true)
})

test("keeps an OpenAI CreatePR that is not collaborator-blocked", () => {
  assert.equal(shouldSkipPullRequest({ ...openaiBlocked, labels: ["needs-review"] }), false)
})

test("skips a pyrefly fixture-stub vanity PR", () => {
  assert.equal(shouldSkipPullRequest(pyreflyVanity), true)
  assert.equal(
    shouldSkipPullRequest({ repo: "acme/pyrefly", title: "docs", labels: ["fixture-stub", "vanity"] }),
    true,
  )
})

test("keeps a pyrefly fixture-stub that is not vanity", () => {
  assert.equal(shouldSkipPullRequest({ ...pyreflyVanity, title: "add a fixture-stub only" }), false)
})

test("keeps an unrelated PR", () => {
  assert.equal(
    shouldSkipPullRequest({ repo: "microsoft/vscode", title: "terminal wrap", labels: ["terminal"] }),
    false,
  )
})
