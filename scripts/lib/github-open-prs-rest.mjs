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
    description: status.description ?? '',
    targetUrl: status.target_url ?? '',
    creator: status.creator
      ? { login: status.creator.login ?? '', type: status.creator.type ?? '' }
      : null,
    startedAt: status.created_at,
    createdAt: status.created_at,
  };
}

function graphqlStatusContext(status) {
  return {
    __typename: 'StatusContext',
    context: status.context,
    state: upper(status.state),
    description: status.description ?? '',
    targetUrl: status.targetUrl ?? '',
    creator: status.creator
      ? {
          login: status.creator.login ?? '',
          type: status.creator.__typename ?? '',
        }
      : null,
    startedAt: status.createdAt,
    createdAt: status.createdAt,
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
    autoMergeRequest: detail.auto_merge
      ? {
          enabledAt: detail.auto_merge.enabled_at ?? null,
          enabledBy: detail.auto_merge.enabled_by
            ? { login: detail.auto_merge.enabled_by.login ?? '' }
            : null,
          mergeMethod: upper(detail.auto_merge.merge_method ?? ''),
        }
      : null,
    mergeable: mergeableValue(detail.mergeable),
    mergeStateStatus: upper(detail.mergeable_state || 'UNKNOWN'),
    baseRefName: detail.base?.ref ?? '',
    baseRefOid: detail.base?.sha ?? '',
    headRefName: detail.head?.ref ?? '',
    headRefOid: detail.head?.sha ?? '',
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

export async function hydrateOpenPrStatusContexts({
  repo,
  prs,
  request,
  includeStatuses = () => true,
  batchSize = 40,
}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error('status hydration batchSize must be between 1 and 50');
  }
  const [owner, name] = repo.split('/');
  if (!owner || !name) throw new Error('repo must be OWNER/NAME');
  const hydrated = prs.map(pr => ({ ...pr, statusCheckRollup: [] }));
  const selected = hydrated
    .map((pr, index) => ({ pr, index }))
    .filter(({ pr }) => includeStatuses(pr));

  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize).map((item, i) => {
      if (!/^[0-9a-f]{40}$/u.test(item.pr.headRefOid ?? '')) {
        throw new Error(`PR #${item.pr.number} is missing exact headRefOid`);
      }
      return { ...item, alias: `c${i}` };
    });
    const selections = batch
      .map(
        ({ alias, pr }) =>
          `${alias}:object(oid:"${pr.headRefOid}"){... on Commit{oid status{contexts{context state description targetUrl createdAt creator{login __typename}}}}}`
      )
      .join(' ');
    const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){${selections}}}`;
    const response = await request({ owner, name, query });
    const repository = response?.data?.repository;
    if (!repository || typeof repository !== 'object') {
      throw new Error('GraphQL commit-status batch omitted repository data');
    }
    for (const { alias, index, pr } of batch) {
      const commit = repository[alias];
      if (!commit || commit.oid !== pr.headRefOid) {
        throw new Error(
          `GraphQL statuses for PR #${pr.number} omitted the exact head`
        );
      }
      const contexts = commit.status?.contexts ?? [];
      if (!Array.isArray(contexts)) {
        throw new Error(
          `GraphQL statuses for PR #${pr.number} were incomplete`
        );
      }
      hydrated[index].statusCheckRollup = contexts.map(graphqlStatusContext);
    }
  }
  return hydrated;
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
    if (!detail.base?.sha || !sha) {
      throw new Error(
        `REST PR #${summary.number} is missing exact base.sha or head.sha`
      );
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
