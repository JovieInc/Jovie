const PROFILES = {
  'coverage-audit': {
    branch: /^bot\/coverage-audit-[1-9]\d*-[1-9]\d*$/,
    title: 'chore(testing): refresh changed-evidence heatmap',
    files: new Set([
      'docs/TEST_COVERAGE_HEATMAP.md',
      'apps/web/reports/test-coverage-snapshot.json',
    ]),
  },
  'nightly-evidence': {
    branch: /^bot\/nightly-evidence-[1-9]\d*-[1-9]\d*$/,
    title: 'chore(testing): refresh nightly testing evidence',
    files: new Set([
      'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
      'apps/web/reports/nightly-agent/last-run.json',
    ]),
  },
};

// Preserve immutable measured-source branches. Only retire older, unmodified
// draft reports after a newer report has a successful publication receipt.
export function retireGeneratedReports({
  gh,
  repo,
  url,
  source,
  isAncestor,
  profile = 'coverage-audit',
}) {
  if (!Object.hasOwn(PROFILES, profile))
    throw new Error('Invalid generated report profile');
  const ownership = PROFILES[profile];
  const match = url.match(
    new RegExp(
      `^https://github\\.com/${repo.replaceAll('.', '\\.')}/pull/([1-9]\\d*)$`
    )
  );
  if (!match) throw new Error('Invalid replacement coverage report receipt');
  const replacement = Number(match[1]);
  const candidates = JSON.parse(
    gh([
      'pr',
      'list',
      '--repo',
      repo,
      '--state',
      'open',
      '--base',
      'main',
      '--limit',
      '1000',
      '--json',
      'number,headRefName,body,isDraft,labels',
    ])
  );
  const retired = [];
  for (const candidate of candidates) {
    if (
      candidate.number >= replacement ||
      !candidate.isDraft ||
      candidate.labels.length
    )
      continue;
    if (!ownership.branch.test(candidate.headRefName)) continue;
    const measured = candidate.body.match(
      /Measured source: `([a-f0-9]{40})`\./
    )?.[1];
    if (!measured || !isAncestor(measured, source)) continue;
    const read = () =>
      JSON.parse(gh(['api', `repos/${repo}/pulls/${candidate.number}`]));
    const valid = (pr, duplicate = false) =>
      pr.state === 'open' &&
      pr.draft &&
      (duplicate
        ? pr.labels.length === 1 && pr.labels[0].name === 'duplicate'
        : pr.labels.length === 0) &&
      pr.base.ref === 'main' &&
      pr.head.repo?.full_name === repo &&
      pr.head.ref === candidate.headRefName &&
      pr.body === candidate.body &&
      pr.title === ownership.title;
    const pr = read();
    if (!valid(pr)) continue;
    const commit = JSON.parse(
      gh(['api', `repos/${repo}/git/commits/${pr.head.sha}`])
    );
    if (commit.parents.length !== 1 || commit.parents[0].sha !== measured)
      continue;
    const files = gh([
      'api',
      '--paginate',
      `repos/${repo}/pulls/${candidate.number}/files`,
      '--jq',
      '.[].filename',
    ])
      .split('\n')
      .filter(Boolean);
    if (files.length === 0 || files.some(file => !ownership.files.has(file)))
      continue;
    // A writer may have taken over while inventory was read. Leave that PR alone.
    const live = read();
    if (!valid(live) || live.head.sha !== pr.head.sha) continue;
    // Only the proven, unmodified generated report can receive duplicate authority.
    // Re-read after marking: a hold, changed head, or revoked label prevents closure.
    gh([
      'pr',
      'edit',
      String(candidate.number),
      '--repo',
      repo,
      '--add-label',
      'duplicate',
    ]);
    const authorized = read();
    if (!valid(authorized, true) || authorized.head.sha !== pr.head.sha)
      continue;
    gh(['pr', 'close', String(candidate.number), '--repo', repo]);
    retired.push(candidate.number);
  }
  return retired;
}

// Keep the existing coverage API for callers that do not supply a profile.
export const retireCoverageReports = retireGeneratedReports;
