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

export type SkipCandidate = {
  repo: string;
  title: string;
  labels: string[];
};

const allAllowedSlugs: readonly string[] = fleetDeskConfig.organizationAllowlist.flatMap(
  ({ slugs }) => slugs,
);

export function isAllowlistedRepo(repo: string): boolean {
  const organization = repo.split("/")[0]?.toLowerCase();
  return Boolean(organization && allAllowedSlugs.includes(organization));
}

/** Deliberate exclusions; do not offer actions for these PRs. */
export function shouldSkipPullRequest(pr: SkipCandidate): boolean {
  const repo = pr.repo.toLowerCase();
  const title = pr.title.toLowerCase();
  const labels = pr.labels.map((label) => label.toLowerCase());
  const hasLabel = (label: string) => labels.includes(label);

  const isOpenAiCreatePr =
    repo.startsWith("openai/") && /create\s*-?\s*pr/.test(title);
  if (
    fleetDeskConfig.skipRules.openaiCreatePrWhenCollaboratorBlocked &&
    isOpenAiCreatePr &&
    hasLabel("collaborator-blocked")
  ) {
    return true;
  }

  const isPyrefly = repo.endsWith("/pyrefly");
  const isFixtureStub = title.includes("fixture-stub") || hasLabel("fixture-stub");
  const isVanity = title.includes("vanity") || hasLabel("vanity");
  return (
    fleetDeskConfig.skipRules.pyreflyFixtureStubVanityPrs &&
    isPyrefly &&
    isFixtureStub &&
    isVanity
  );
}
