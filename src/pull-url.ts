/** Same acceptance rules as scripts/pr-action.mjs parsePullUrl. */
export function isWinningPullUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(String(value).trim())
  } catch {
    return false
  }
  const parts = url.pathname.split("/").filter(Boolean)
  const host = url.hostname.replace(/^www\./, "")
  if (url.protocol !== "https:" || host !== "github.com") return false
  if (parts.length < 4 || parts[2] !== "pull" || !/^\d+$/.test(parts[3] || "")) return false
  const number = Number(parts[3])
  return Number.isSafeInteger(number) && number >= 1
}
