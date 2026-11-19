/** Deliberate exclusions shared by the board and the live fetch. */
export function shouldSkipPullRequest(pr, rules = {
  openaiCreatePrWhenCollaboratorBlocked: true,
  pyreflyFixtureStubVanityPrs: true,
}) {
  if (!pr || typeof pr !== "object") return false
  const effectiveRules = rules || {}
  const repo = String(pr.repo || "").toLowerCase()
  const title = String(pr.title || "").toLowerCase()
  const rawLabels = Array.isArray(pr.labels) ? pr.labels : []
  const labels = rawLabels.map((label) => String(label).toLowerCase())
  const hasLabel = (label) => labels.includes(label)

  const isOpenAiCreatePr = repo.startsWith("openai/") && /\bcreate\s*-?\s*prs?\b/.test(title)
  if (effectiveRules.openaiCreatePrWhenCollaboratorBlocked && isOpenAiCreatePr && hasLabel("collaborator-blocked")) {
    return true
  }

  const isPyrefly = repo.endsWith("/pyrefly")
  const isFixtureStub = title.includes("fixture-stub") || hasLabel("fixture-stub")
  const isVanity = title.includes("vanity") || hasLabel("vanity")
  return Boolean(effectiveRules.pyreflyFixtureStubVanityPrs && isPyrefly && isFixtureStub && isVanity)
}
