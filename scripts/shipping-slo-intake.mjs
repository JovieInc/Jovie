import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  addLinearIssueComment,
  reopenLinearIssue,
} from './lib/linear-issue-intake.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (reason) => {
  throw Object.assign(new Error(reason), { reason });
};

// Same identity the historical SLO findings already use. A sha256 is 64 hex
// characters, so this path never builds a Linear label and cannot hit the
// 80-character label-name limit.
export function sloFingerprint(repo, metric) {
  return hash(JSON.stringify(['shipping-slo', repo, metric]));
}

export async function upsertSloFinding(
  { repo, metric, title, body, runUrl },
  { apiKey = process.env.LINEAR_API_KEY, fetchImpl = fetch } = {},
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
          : reason,
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
    'owner_lookup_failed',
  );
  const triage = owner?.team?.states?.nodes?.find(
    (state) => state.type === 'triage',
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
        await request(query, { ...variables, after }, reason),
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
    (data) => data.issues,
    'issue_lookup_failed',
  );
  if (matches.length > 1) fail('ambiguous_canonical_issue');
  const receipt = (issue) => ({
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
      'create_result_unknown',
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
    (data) => data.issue?.comments,
    'comment_lookup_failed',
  );
  if (
    comments.some((comment) => String(comment.body ?? '').includes(observation))
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

export async function deliverReport(
  report,
  { repo, runUrl, apiKey, fetchImpl } = {},
) {
  const findings = (report.evaluation?.regressions ?? []).map((row) => ({
    metric: row.key,
    title: `slo-regression: ${row.key} >20% over baseline`,
    body: [
      'Rolling 7d SLO regression detected by the shipping-SLO ratchet (JOV-6783).',
      '',
      '| Metric | Baseline | Observed | Change |',
      '| --- | --- | --- | --- |',
      `| \`${row.key}\` | ${row.baseline} | ${row.observed} | ${Math.floor(row.changeFraction * 100)}% |`,
      '',
      '## Top offenders',
      ...(report.offenders?.slowestPrs ?? []).map(
        (pr) =>
          `- #${pr.number} ${pr.title} — ${pr.lane} lane, ${Math.floor(pr.leadTimeSeconds / 360) / 10}h lead time`,
      ),
      '',
      'Slowest CI gate runs in the window:',
      ...(report.offenders?.slowestCiRuns ?? []).map(
        (run) =>
          `- run ${run.id} \`${run.head_branch}\` — ${Math.floor(run.seconds / 6) / 10}m (${run.conclusion})`,
      ),
      '',
      `Measurement run: ${runUrl}`,
      'Baseline: `docs/metrics/shipping-slo-baseline.json`',
    ].join('\n'),
  }));
  if (report.evaluation?.flatStall)
    findings.push({
      metric: 'throughput.growth_flat',
      title: 'slo-regression: throughput growth flat below +8% WoW target',
      body: [
        'Throughput improvement has flattened (JOV-6783).',
        'Investigate the limiting stage through the existing JOV-5817/JOV-5484 owner.',
        `Current readings: ${JSON.stringify(report.flat ?? {})}`,
        `Measurement run: ${runUrl}`,
      ].join('\n'),
    });
  const receipt = {
    schema: 'jovie-shipping-slo-delivery/v1',
    owner: 'Devin',
    runUrl,
    status: 'succeeded',
    findings: [],
  };
  for (const finding of findings) {
    try {
      receipt.findings.push({
        status: 'succeeded',
        ...(await upsertSloFinding(
          { ...finding, repo, runUrl },
          { apiKey, fetchImpl },
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
      // Stop this sweep at the first unknown state; a later run reconciles its marker.
      break;
    }
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
    ]),
  );
  let receipt;
  try {
    receipt = await deliverReport(
      JSON.parse(readFileSync(args['--report'], 'utf8')),
      { repo: args['--repo'], runUrl: args['--run-url'] },
    );
  } catch {
    receipt = {
      schema: 'jovie-shipping-slo-delivery/v1',
      owner: 'Devin',
      status: 'failed',
      reason: 'invalid_report',
      retryDecision: 'repair-input',
    };
  }
  writeFileSync(args['--receipt'], `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
  process.exitCode = receipt.status === 'succeeded' ? 0 : 1;
}
