export type ParsedPullUrl = {
  repo: string
  number: number
  url: string
}

/** Same acceptance and canonicalization rules as scripts/pr-action.mjs parsePullUrl. */
export function parseWinningPullUrl(value: string): ParsedPullUrl | null {
  let url: URL
  try {
    url = new URL(String(value).trim())
  } catch {
    return null
  }
  const parts = url.pathname.split("/").filter(Boolean)
  const host = url.hostname.replace(/^www\./, "")
  if (url.protocol !== "https:" || host !== "github.com") return null
  if (
    parts.length < 4 ||
    parts[0].includes("%") ||
    parts[1].includes("%") ||
    // GitHub owner and repository names only use letters, digits, '.', '_' and '-'.
    !/^[A-Za-z0-9_.-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_.-]+$/.test(parts[1]) ||
    parts[2] !== "pull" ||
    !/^\d+$/.test(parts[3] || "")
  ) {
    return null
  }
  const number = Number(parts[3])
  if (!Number.isSafeInteger(number) || number < 1) return null
  return {
    repo: `${parts[0]}/${parts[1]}`,
    number,
    url: `https://github.com/${parts[0]}/${parts[1]}/pull/${number}`,
  }
}

export function isWinningPullUrl(value: string): boolean {
  return parseWinningPullUrl(value) !== null
}

export function isWinningPullUrlForTarget(
  value: string,
  target: { repo: string; number: number },
): boolean {
  const parsed = parseWinningPullUrl(value)
  if (!parsed) return false
  return parsed.repo.toLowerCase() !== target.repo.toLowerCase() || parsed.number !== target.number
}
