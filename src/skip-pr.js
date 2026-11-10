/** Deliberate exclusions shared by the board and the live fetch. */
export function shouldSkipPullRequest(pr, rules = {
  openaiCreatePrWhenCollaboratorBlocked: true,
  pyreflyFixtureStubVanityPrs: true,
}) {
  const repo = String(pr.repo || "").toLowerCase()
  const title = String(pr.title || "").toLowerCase()
  const labels = (pr.labels || []).map((label) => String(label).toLowerCase())
  const hasLabel = (label) => labels.includes(label)

  const isOpenAiCreatePr = repo.startsWith("openai/") && /create\s*-?\s*pr/.test(title)
  if (rules.openaiCreatePrWhenCollaboratorBlocked && isOpenAiCreatePr && hasLabel("collaborator-blocked")) {
    return true
  }

  const isPyrefly = repo.endsWith("/pyrefly")
  const isFixtureStub = title.includes("fixture-stub") || hasLabel("fixture-stub")
  const isVanity = title.includes("vanity") || hasLabel("vanity")
  return Boolean(rules.pyreflyFixtureStubVanityPrs && isPyrefly && isFixtureStub && isVanity)
}
