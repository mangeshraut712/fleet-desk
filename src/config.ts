/** Fleet Desk's intentional, shared collection policy. */
export const fleetDeskConfig = {
  author: "mangeshraut712",
  organizationAllowlist: [
    { name: "Apple", slugs: ["apple"] },
    { name: "Meta", slugs: ["meta", "facebook"] },
    { name: "Anthropic", slugs: ["anthropics"] },
    { name: "OpenAI", slugs: ["openai"] },
    { name: "Netflix", slugs: ["netflix"] },
    { name: "Microsoft", slugs: ["microsoft"] },
    { name: "Tesla", slugs: ["teslamotors"] },
    { name: "SpaceX / xAI", slugs: ["spacex", "xai-org"] },
    { name: "Samsung", slugs: ["samsung"] },
    { name: "LG", slugs: ["lg"] },
    { name: "Walmart", slugs: ["walmartlabs"] },
    { name: "JPMorgan", slugs: ["jpmorganchase"] },
    { name: "Amazon / AWS", slugs: ["amazon", "aws", "awslabs"] },
    { name: "Adobe", slugs: ["adobe"] },
    { name: "NVIDIA", slugs: ["nvidia"] },
  ],
  skipRules: {
    openaiCreatePrWhenCollaboratorBlocked: true,
    pyreflyFixtureStubVanityPrs: true,
  },
} as const;

export { shouldSkipPullRequest } from "./skip-pr.js";

const allAllowedSlugs: readonly string[] = fleetDeskConfig.organizationAllowlist.flatMap(
  ({ slugs }) => slugs,
);

export function isAllowlistedRepo(repo?: string | null): boolean {
  if (!repo) return false;
  const organization = repo.trim().split("/")[0]?.toLowerCase();
  return Boolean(organization && allAllowedSlugs.includes(organization));
}

export function getOrganizationForRepo(repo?: string | null): string | null {
  if (!repo) return null;
  const organization = repo.trim().split("/")[0]?.toLowerCase();
  if (!organization) return null;
  const match = fleetDeskConfig.organizationAllowlist.find(({ slugs }) =>
    (slugs as readonly string[]).includes(organization),
  );
  return match?.name ?? null;
}
