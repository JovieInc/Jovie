import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  addLinearIssueComment,
  reopenLinearIssue,
} from './lib/linear-issue-intake.mjs';
import {
  buildRankedFindingBody,
  pickRankedSloIntake,
  rankSloIntakeCandidates,
} from './lib/shipping-slo-ranked-intake.mjs';

export {
  buildRankedFindingBody,
  pickRankedSloIntake,
  rankSloIntakeCandidates,
  SLO_LATEST_PATHS,
  suggestedWinMetricLine,
} from './lib/shipping-slo-ranked-intake.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Object.assign(new Error(reason), { reason });
};

// Same identity the historical SLO findings already use. A sha256 is 64 hex
// characters, so this path never builds a Linear label and cannot hit the
// 80-character label-name limit.
export function sloFingerprint(repo, metric) {
  return hash(JSON.stringify(['shipping-slo', repo, metric]));
}

const OPEN_STATE_TYPES = new Set(['triage', 'backlog', 'unstarted', 'started']);

/**
 * Parse open JOV-6783 children whose descriptions carry our fingerprint markers
 * for the given candidate metrics. Used for sticky ranked intake.
 */
export async function listOpenRankedSloMetrics(
  { repo, metrics, ownerIssueId },
  { apiKey = process.env.LINEAR_API_KEY, fetchImpl = fetch } = {}
) {
  if (!ownerIssueId || !Array.isArray(metrics) || !metrics.length) return [];
  const request = async (query, variables, reason) => {
    const result = await linearRequest({
      key: apiKey,
      query,
      variables,
      fetchImpl,
    });
    if (!result.ok || result.data?.errors?.length || !result.data?.data) {
      fail(
        result.reason === 'missing_linear_api_key' || result.rateLimited
          ? result.reason
          : reason
      );
    }
    return result.data.data;
  };
  const fingerprintByMetric = new Map(
    metrics.map(metric => [metric, sloFingerprint(repo, metric)])
  );
  const markerByFingerprint = new Map(
    [...fingerprintByMetric.entries()].map(([metric, fp]) => [
      `Shipping SLO fingerprint: ${fp}`,
      metric,
    ])
  );
  const openMetrics = [];
  let after = null;
  const cursors = new Set();
  for (let page = 0; page < 20; page++) {
    const data = await request(
      `query ShippingSloOpenChildren($id: String!, $after: String) {
        issue(id: $id) {
          children(first: 50, after: $after) {
            nodes {
              id
              identifier
              description
              archivedAt
              state { type }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      { id: ownerIssueId, after },
      'open_children_lookup_failed'
    );
    const connection = data.issue?.children;
    if (
      !Array.isArray(connection?.nodes) ||
      typeof connection.pageInfo?.hasNextPage !== 'boolean'
    )
      fail('open_children_lookup_failed');
    for (const child of connection.nodes) {
      if (child?.archivedAt) continue;
      if (!OPEN_STATE_TYPES.has(child?.state?.type)) continue;
      const description = String(child.description ?? '');
      for (const [marker, metric] of markerByFingerprint) {
        if (description.includes(marker)) openMetrics.push(metric);
      }
    }
    if (!connection.pageInfo.hasNextPage) return [...new Set(openMetrics)];
    after = connection.pageInfo.endCursor;
    if (!after || cursors.has(after)) fail('open_children_lookup_incomplete');
    cursors.add(after);
  }
  // Same exhaustion guard as upsertSloFinding pages(): never silently truncate.
  fail('open_children_lookup_incomplete');
}

export async function upsertSloFinding(
  { repo, metric, title, body, runUrl },
  { apiKey = process.env.LINEAR_API_KEY, fetchImpl = fetch } = {}
) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !/^[a-z0-9_.-]+$/.test(metric) ||
    !runUrl?.startsWith(`https://github.com/${repo}/actions/runs/`)
  ) {
    fail('invalid_finding_identity');
  }
  const request = async (query, variables, reason) => {
    const result = await linearRequest({
      key: apiKey,
      query,
      variables,
      fetchImpl,
    });
    if (!result.ok || result.data?.errors?.length || !result.data?.data) {
      fail(
        result.reason === 'missing_linear_api_key' || result.rateLimited
          ? result.reason
          : reason
      );
    }
    return result.data.data;
  };
  // Use the current SLO owner's team, triage state and assignee. No GitHub issue fallback.
  const { issue: owner } = await request(
    `query ShippingSloOwner {
    issue(id: "JOV-6783") {
      id assignee { id }
      team { id states { nodes { id type } } }
    }
  }`,
    {},
    'owner_lookup_failed'
  );
  const triage = owner?.team?.states?.nodes?.find(
    state => state.type === 'triage'
  );
  if (!owner?.id || !owner.team?.id || !triage?.id)
    fail('owner_routing_missing');

  const fingerprint = sloFingerprint(repo, metric);
  // Plain markers survive Linear's Markdown normalization.
  const marker = `Shipping SLO fingerprint: ${fingerprint}`;
  const observation = `Shipping SLO observation: ${hash(runUrl)}`;
  const findingBody = `${body}\n\n${marker}\n${observation}`;
  const pages = async (query, variables, select, reason) => {
    const rows = [];
    let after = null;
    const cursors = new Set();
    for (let page = 0; page < 20; page++) {
      const connection = select(
        await request(query, { ...variables, after }, reason)
      );
      if (
        !Array.isArray(connection?.nodes) ||
        typeof connection.pageInfo?.hasNextPage !== 'boolean'
      )
        fail(reason);
      rows.push(...connection.nodes);
      if (!connection.pageInfo.hasNextPage) return rows;
      after = connection.pageInfo.endCursor;
      if (!after || cursors.has(after)) fail(`${reason}_incomplete`);
      cursors.add(after);
    }
    fail(`${reason}_incomplete`);
  };
  const matches = await pages(
    `query ShippingSloIssues(
    $teamId: ID!, $title: String!, $marker: String!, $after: String
  ) {
    issues(first: 100, after: $after, includeArchived: true, filter: {
      team: { id: { eq: $teamId } }
      or: [{ title: { eq: $title } }, { description: { contains: $marker } }]
    }) {
      nodes { id identifier url description archivedAt state { type } }
      pageInfo { hasNextPage endCursor }
    }
  }`,
    { teamId: owner.team.id, title, marker },
    data => data.issues,
    'issue_lookup_failed'
  );
  if (matches.length > 1) fail('ambiguous_canonical_issue');
  const receipt = issue => ({
    issue: issue.identifier,
    url: issue.url,
    metric,
    fingerprint,
    observation,
  });
  if (!matches.length) {
    // Unknown results may have committed. Reconcile on the next run, never retry a mutation.
    const { issueCreate } = await request(
      `mutation ShippingSloCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier url } }
    }`,
      {
        input: {
          teamId: owner.team.id,
          parentId: owner.id,
          assigneeId: owner.assignee?.id ?? null,
          stateId: triage.id,
          title,
          description: findingBody,
          priority: 2,
        },
      },
      'create_result_unknown'
    );
    if (
      !issueCreate?.success ||
      !issueCreate.issue?.id ||
      !issueCreate.issue.identifier ||
      !issueCreate.issue.url
    )
      fail('create_result_unknown');
    return { action: 'created', ...receipt(issueCreate.issue) };
  }
  const issue = matches[0];
  if (
    !issue?.id ||
    !issue.identifier ||
    !issue.url ||
    !issue.state?.type ||
    issue.archivedAt
  )
    fail('canonical_issue_unavailable');
  if (String(issue.description ?? '').includes(observation))
    return { action: 'replayed', ...receipt(issue) };
  const comments = await pages(
    `query ShippingSloComments($id: String!, $after: String) {
    issue(id: $id) {
      comments(first: 100, after: $after) {
        nodes { body }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`,
    { id: issue.id },
    data => data.issue?.comments,
    'comment_lookup_failed'
  );
  if (
    comments.some(comment => String(comment.body ?? '').includes(observation))
  )
    return { action: 'replayed', ...receipt(issue) };
  // Reopen the same metric on recurrence while preserving human-owned content and assignment.
  if (['completed', 'canceled'].includes(issue.state.type)) {
    const reopened = await reopenLinearIssue({
      issueId: issue.id,
      stateId: triage.id,
      apiKey,
      fetchImpl,
    });
    if (!reopened.ok) fail('reopen_result_unknown');
  }
  const posted = await addLinearIssueComment({
    issueId: issue.id,
    body: findingBody,
    apiKey,
    fetchImpl,
  });
  if (!posted.ok || !posted.id) fail('comment_result_unknown');
  return { action: 'observed', ...receipt(issue) };
}

/**
 * Deliver exactly one ranked slo-regression finding for the current top
 * (or sticky open) regression. Idempotent via per-metric fingerprint upsert.
 */
export async function deliverReport(
  report,
  { repo, runUrl, apiKey, fetchImpl } = /** @type {{
    repo?: string,
    runUrl?: string,
    apiKey?: string,
    fetchImpl?: typeof fetch,
  }} */ ({})
) {
  const ranked = rankSloIntakeCandidates(report);
  const receipt = {
    schema: 'jovie-shipping-slo-delivery/v1',
    owner: 'JOV-6783',
    destination: 'linear',
    mode: 'ranked-one',
    runUrl,
    status: 'succeeded',
    ranked: ranked.map(row => ({
      metric: row.metric,
      severity: row.severity,
      changeFraction: row.changeFraction,
    })),
    findings: [],
  };
  if (!ranked.length) return receipt;

  let openMetrics = [];
  let ownerIssueId = null;
  try {
    const ownerLookup = await linearRequest({
      key: apiKey ?? process.env.LINEAR_API_KEY,
      query: `query ShippingSloOwnerId {
        issue(id: "JOV-6783") { id }
      }`,
      variables: {},
      fetchImpl,
    });
    if (
      !ownerLookup.ok ||
      ownerLookup.data?.errors?.length ||
      !ownerLookup.data?.data?.issue?.id
    ) {
      fail(
        ownerLookup.reason === 'missing_linear_api_key' ||
          ownerLookup.rateLimited
          ? ownerLookup.reason
          : 'owner_lookup_failed'
      );
    }
    ownerIssueId = ownerLookup.data.data.issue.id;
    openMetrics = await listOpenRankedSloMetrics(
      { repo, metrics: ranked.map(r => r.metric), ownerIssueId },
      { apiKey, fetchImpl }
    );
  } catch (error) {
    receipt.status = 'failed';
    receipt.findings.push({
      metric: ranked[0]?.metric,
      status: 'failed',
      reason: error.reason ?? 'delivery_failed',
      retryDecision: 'reconcile-before-retry',
    });
    return receipt;
  }

  const pick = pickRankedSloIntake(ranked, { openMetrics });
  if (!pick) return receipt;
  receipt.selection = { metric: pick.target.metric, mode: pick.mode };
  const finding = buildRankedFindingBody(pick.target, {
    runUrl,
    ranked: pick.ranked,
    mode: pick.mode,
  });

  try {
    receipt.findings.push({
      status: 'succeeded',
      selectionMode: pick.mode,
      ...(await upsertSloFinding(
        { ...finding, repo, runUrl },
        { apiKey, fetchImpl }
      )),
    });
  } catch (error) {
    receipt.status = 'failed';
    receipt.findings.push({
      metric: finding.metric,
      status: 'failed',
      reason: error.reason ?? 'delivery_failed',
      retryDecision: 'reconcile-before-retry',
    });
  }
  return receipt;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = Object.fromEntries(
    Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) => [
      process.argv[2 + i * 2],
      process.argv[3 + i * 2],
    ])
  );
  let receipt;
  try {
    receipt = await deliverReport(
      JSON.parse(readFileSync(args['--report'], 'utf8')),
      { repo: args['--repo'], runUrl: args['--run-url'] }
    );
  } catch {
    receipt = {
      schema: 'jovie-shipping-slo-delivery/v1',
      owner: 'JOV-6783',
      destination: 'linear',
      mode: 'ranked-one',
      status: 'failed',
      reason: 'invalid_report',
      retryDecision: 'repair-input',
    };
  }
  writeFileSync(args['--receipt'], `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.status === 'succeeded' ? 0 : 1;
}
