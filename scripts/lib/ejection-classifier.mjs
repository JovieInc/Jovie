// api-budget: linear-requests 120/hr - repeated merge-queue failure issue reconciliation
// Event-driven feedback only. Protected-main policy; never enqueues or emits a check.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLinearClient } from '../../packages/api-client/linear.ts';
import { AGGREGATE_JOBS } from './merge-group-ahead-attribution.mjs';
import { parseQueueBranch } from './merge-queue-retry-policy.mjs';
import { artifactJson, digest, githubIo } from './promotion-github.mjs';

export function classifyRun({ repo, run, jobs, recent = [], now }) {
  const identity = parseQueueBranch(run?.head_branch);
  if (!identity || !Number.isSafeInteger(run.id) || !Number.isFinite(now))
    throw new Error('invalid merge-group identity');
  const bad = jobs.filter(j =>
    ['failure', 'timed_out', 'cancelled'].includes(j.conclusion)
  );
  const leaves = bad.filter(j => !AGGREGATE_JOBS.has(j.name));
  const classifications = (
    leaves.length
      ? leaves
      : [{ name: 'workflow startup', conclusion: run.conclusion }]
  ).map(job => {
    const text = [
      job.name,
      ...(job.annotations ?? []).map(
        a => `${a.title ?? ''} ${a.message ?? ''}`
      ),
      ...(job.steps ?? [])
        .filter(s => s.conclusion === 'failure')
        .map(s => s.name),
    ].join('\n');
    const prs = new Set([identity.pr]);
    for (const r of recent) {
      const id = parseQueueBranch(r.head_branch);
      const at = Date.parse(r.updated_at);
      if (
        id &&
        now >= at &&
        now - at <= 2 * 3600000 &&
        (r.jobs ?? []).some(
          j => j.name === job.name && j.conclusion === 'failure'
        )
      )
        prs.add(id.pr);
    }
    let cls = 'code';
    if (
      /merge conflict|CONFLICT \(|not mergeable|automatic merge failed/i.test(
        text
      )
    )
      cls = 'conflict';
    else if (
      /\b(?:403|429)\b.*(?:quota|rate limit)|(?:quota|rate limit).*\b(?:403|429)\b|runner.*(?:timeout|timed out|lost|offline)|job.*exceeded.*(?:time|minutes)/i.test(
        text
      ) ||
      job.conclusion === 'timed_out'
    )
      cls = 'infra';
    else if (
      /Merge Suite Scope|cannot claim|workflow.*(?:invalid|not valid|failed to load)|CI plumbing/i.test(
        text
      )
    )
      cls = 'contract';
    else if (
      /size (?:guard|cap)|exceeds.*(?:lines|files)|exceeds bounded integration-train/i.test(
        text
      )
    )
      cls = 'size';
    else if (prs.size >= 3) cls = 'systemic';
    else if (
      job.conclusion === 'cancelled' &&
      job.required === true &&
      !run.cascade
    )
      cls = 'infra';
    return { job: job.name, class: cls, prs: [...prs].sort((a, b) => a - b) };
  });
  // A code failure alongside infrastructure noise still needs a new commit.
  const priority = [
    'conflict',
    'size',
    'code',
    'systemic',
    'contract',
    'infra',
  ];
  const cls = priority.find(c => classifications.some(j => j.class === c));
  return {
    schema: 'ejection/v1',
    repo,
    ...identity,
    run: run.id,
    attempt: run.run_attempt ?? 1,
    class: cls,
    leaves: leaves.map(j => j.name),
    classifications,
    at: new Date(now).toISOString(),
  };
}

export function planLinearUpserts({ receipt, history, issues = [], now }) {
  const decisions = [];
  for (const item of receipt.classifications) {
    if (item.class === 'code') continue;
    const key = digest([receipt.repo, item.class, item.job]);
    if (decisions.some(d => d.key === key)) continue;
    const matching = [...history, receipt].filter(
      r =>
        r.schema === 'ejection/v1' &&
        r.repo === receipt.repo &&
        Number.isFinite(Date.parse(r.at)) &&
        now >= Date.parse(r.at) &&
        now - Date.parse(r.at) <= 7 * 86400000 &&
        r.classifications?.some(
          j => j.class === item.class && j.job === item.job
        )
    );
    const count = new Set(matching.map(r => `${r.run}:${r.attempt ?? 1}`)).size;
    if (count < 2) continue;
    const issue = issues.find(i =>
      i.description?.includes(`ejection-key:${key}`)
    );
    const stamp = issue?.description?.match(/ejection-upsert-at:(\d+)/)?.[1];
    // Server updatedAt also fences legacy receipts and concurrent edits.
    const last = Math.max(
      Number(stamp ?? 0),
      Date.parse(issue?.updatedAt) || 0
    );
    if (issue && now - last < 3600000) continue;
    decisions.push({ key, issue, count, class: item.class, job: item.job });
  }
  return decisions;
}

export async function upsertLinear({
  receipt = undefined,
  history = [],
  now = NaN,
  key = '',
  request = globalThis.fetch,
  clientOptions = {},
}) {
  if (!key) return { skipped: 'LINEAR_API_KEY absent' };
  const client = createLinearClient({
    ...clientOptions,
    identity: key,
    fetch: request,
    now: () => now,
    authorization: () =>
      /^Bearer\s/i.test(key) || key.startsWith('lin_api_')
        ? key
        : `Bearer ${key}`,
  });
  const linear = async (query, variables) => {
    return client.graphql(query, variables, {
      priority: 'repair',
      maxAttempts: 1,
      maxWaitMs: 0,
      timeoutMs: 10000,
    });
  };
  const data = await linear(
    `query($cursor:String){teams{nodes{id key}} issues(first:100,after:$cursor,filter:{team:{key:{eq:"JOV"}},title:{contains:"[MQ ejection]"}}){nodes{id description updatedAt} pageInfo{hasNextPage endCursor}}}`,
    { cursor: null }
  );
  const teamId = data.teams.nodes.find(team => team.key === 'JOV')?.id;
  if (!teamId) throw new Error('existing JOV team unavailable');
  const issues = [...data.issues.nodes];
  let connection = data.issues;
  for (let page = 1; connection.pageInfo.hasNextPage; page++) {
    if (page >= 50 || !connection.pageInfo.endCursor)
      throw new Error('Linear issue inventory incomplete');
    const next = await linear(
      `query($cursor:String){issues(first:100,after:$cursor,filter:{team:{key:{eq:"JOV"}},title:{contains:"[MQ ejection]"}}){nodes{id description updatedAt} pageInfo{hasNextPage endCursor}}}`,
      { cursor: connection.pageInfo.endCursor }
    );
    connection = next.issues;
    issues.push(...connection.nodes);
  }
  const plan = planLinearUpserts({ receipt, history, issues, now });
  for (const item of plan) {
    const description =
      `<!-- ejection-key:${item.key} ejection-upsert-at:${now} -->\n` +
      `Class: ${item.class}\nJob: ${item.job}\nCount: ${item.count} distinct ejections in 7 days.\n` +
      `Owner: Eve Runtime Owner. Source: JOV-13053.\n` +
      `https://github.com/${receipt.repo}/actions/runs/${receipt.run}\n\n` +
      'Add a pre-push or PR-stage twin, or fix the CI contract. Never re-enqueue from this issue.\n' +
      'Ship now: record the repeated failure. Re-evaluate when: the owning check is repaired. Then: verify first-pass landing.';
    const result = item.issue
      ? await linear(
          'mutation($id:String!,$input:IssueUpdateInput!){issueUpdate(id:$id,input:$input){success}}',
          { id: item.issue.id, input: { description } }
        )
      : await linear(
          'mutation($input:IssueCreateInput!){issueCreate(input:$input){success}}',
          {
            input: {
              teamId,
              title: `[MQ ejection] ${item.class}: ${item.job}`,
              description,
            },
          }
        );
    if (!(result.issueUpdate ?? result.issueCreate)?.success)
      throw new Error('Linear mutation rejected');
  }
  return { upserts: plan.length };
}

export async function runClassifier({
  repo,
  runId,
  io,
  now,
  linearKey = '',
  request = globalThis.fetch,
  writeReceipt = value => writeFileSync('ejection.json', JSON.stringify(value)),
}) {
  const run = await io.get(`actions/runs/${runId}`);
  if (run.event !== 'merge_group' || run.head_repository?.full_name !== repo)
    return null;
  const since = new Date(now - 2 * 3600000).toISOString();
  const recent = await io.pages(
    `actions/runs?event=merge_group&status=failure&created=${encodeURIComponent(`>=${since}`)}`,
    'workflow_runs'
  );
  for (const r of recent) r.jobs = await io.jobs(r);
  const receipt = classifyRun({
    repo,
    run,
    jobs: await io.annotatedJobs(run),
    recent,
    now,
  });
  writeReceipt(receipt); // Preserve receipt even if a downstream API write fails.
  await io.api(`repos/${repo}/issues/${receipt.pr}/labels`, {
    method: 'POST',
    body: { labels: [`mq-ejected:${receipt.class}`] },
  });
  if (!linearKey) return receipt;
  const history = [];
  const classifiers = await io.pages(
    `actions/workflows/ejection-classifier.yml/runs?branch=main&event=workflow_run&created=${encodeURIComponent(`>=${new Date(now - 7 * 86400000).toISOString()}`)}`,
    'workflow_runs'
  );
  for (const r of classifiers) {
    const artifacts = await io.pages(
      `actions/runs/${r.id}/artifacts`,
      'artifacts'
    );
    for (const artifact of artifacts.filter(
      a => !a.expired && /^ejection-\d+$/.test(a.name)
    )) {
      const zip = await io.api(
        `repos/${repo}/actions/artifacts/${artifact.id}/zip`,
        { binary: true }
      );
      history.push(artifactJson(zip, 'ejection.json'));
    }
  }
  await upsertLinear({ receipt, history, now, key: linearKey, request });
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const repo = process.env.REPO ?? process.env.GITHUB_REPOSITORY;
    const receipt = await runClassifier({
      repo,
      runId: Number(process.env.RUN_ID),
      io: githubIo({ repo, token: process.env.GH_TOKEN }),
      now: Date.now(),
      linearKey: process.env.LINEAR_API_KEY,
    });
    if (receipt) console.log(JSON.stringify(receipt));
  } catch (error) {
    console.error(`ejection classifier advisory: ${error.message}`);
  }
}
