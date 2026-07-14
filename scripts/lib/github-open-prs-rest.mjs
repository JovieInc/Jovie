function upper(value) {
  return String(value ?? '').toUpperCase();
}

function mergeableValue(value) {
  if (value === true) return 'MERGEABLE';
  if (value === false) return 'CONFLICTING';
  return 'UNKNOWN';
}

function checkRun(check) {
  return {
    __typename: 'CheckRun',
    name: check.name,
    status: upper(check.status),
    conclusion: upper(check.conclusion),
    startedAt: check.started_at,
    completedAt: check.completed_at,
  };
}

function statusContext(status) {
  return {
    __typename: 'StatusContext',
    context: status.context,
    state: upper(status.state),
    startedAt: status.created_at,
  };
}

export function normalizeRestPullRequest(detail, statusCheckRollup) {
  return {
    number: detail.number,
    title: detail.title,
    url: detail.html_url,
    author: detail.user ? { login: detail.user.login } : null,
    createdAt: detail.created_at,
    updatedAt: detail.updated_at,
    isDraft: detail.draft === true,
    mergeable: mergeableValue(detail.mergeable),
    mergeStateStatus: upper(detail.mergeable_state || 'UNKNOWN'),
    baseRefName: detail.base?.ref ?? '',
    headRefName: detail.head?.ref ?? '',
    headRepository: detail.head?.repo
      ? {
          name: detail.head.repo.name,
          nameWithOwner: detail.head.repo.full_name,
        }
      : null,
    headRepositoryOwner: detail.head?.repo?.owner
      ? { login: detail.head.repo.owner.login }
      : null,
    isCrossRepository:
      Boolean(detail.base?.repo?.full_name) &&
      Boolean(detail.head?.repo?.full_name) &&
      detail.base.repo.full_name !== detail.head.repo.full_name,
    labels: (detail.labels ?? []).map(label => ({ name: label.name })),
    changedFiles: detail.changed_files ?? 0,
    additions: detail.additions ?? 0,
    deletions: detail.deletions ?? 0,
    maintainerCanModify: detail.maintainer_can_modify === true,
    statusCheckRollup,
  };
}

async function fetchCompleteCollection({
  request,
  endpoint,
  key,
  label,
  prNumber,
}) {
  const items = [];
  let expectedTotal = null;
  for (let page = 1; ; page += 1) {
    const response = await request(`${endpoint}&page=${page}`);
    if (
      !Array.isArray(response?.[key]) ||
      !Number.isInteger(response?.total_count) ||
      response.total_count < 0 ||
      (expectedTotal !== null && response.total_count !== expectedTotal)
    ) {
      throw new Error(`REST ${label} for PR #${prNumber} were incomplete`);
    }
    expectedTotal = response.total_count;
    items.push(...response[key]);
    if (items.length > expectedTotal) {
      throw new Error(`REST ${label} for PR #${prNumber} were inconsistent`);
    }
    if (items.length === expectedTotal) return items;
    if (response[key].length === 0) {
      throw new Error(`REST ${label} for PR #${prNumber} were incomplete`);
    }
  }
}

export async function fetchOpenPrsRest({ repo, limit = 200, request }) {
  const summaries = [];
  for (let page = 1; summaries.length < limit; page += 1) {
    const pageSize = Math.min(100, limit - summaries.length);
    const batch = await request(
      `repos/${repo}/pulls?state=open&per_page=${pageSize}&page=${page}`
    );
    if (!Array.isArray(batch)) {
      throw new Error('REST open-PR response was not an array');
    }
    summaries.push(...batch);
    if (batch.length < pageSize) break;
  }

  const prs = [];
  for (const summary of summaries.slice(0, limit)) {
    const detail = await request(`repos/${repo}/pulls/${summary.number}`);
    const sha = detail.head?.sha;
    if (!sha) {
      throw new Error(`REST PR #${summary.number} is missing head.sha`);
    }
    const checkRuns = await fetchCompleteCollection({
      request,
      endpoint: `repos/${repo}/commits/${sha}/check-runs?per_page=100`,
      key: 'check_runs',
      label: 'checks',
      prNumber: summary.number,
    });
    const statusContexts = await fetchCompleteCollection({
      request,
      endpoint: `repos/${repo}/commits/${sha}/status?per_page=100`,
      key: 'statuses',
      label: 'statuses',
      prNumber: summary.number,
    });
    const rollup = [
      ...checkRuns.map(checkRun),
      ...statusContexts.map(statusContext),
    ];
    prs.push(normalizeRestPullRequest(detail, rollup));
  }
  return prs;
}
