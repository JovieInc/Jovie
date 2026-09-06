#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runSourceAdmission } from './lib/source-admission-policy.mjs';

export async function publishSourceAdmission({
  event,
  env = process.env,
  evaluate = runSourceAdmission,
  api = githubApi,
}) {
  const repository = event.repository?.full_name;
  const reviewRun = event.workflow_run?.event === 'pull_request_review';
  const linked = reviewRun ? event.workflow_run.pull_requests : null;
  if (reviewRun && (!Array.isArray(linked) || linked.length !== 1))
    throw new Error('Ambiguous review signal');
  const number = reviewRun ? linked[0].number : event.pull_request?.number;
  // workflow_run executes trusted default-branch policy with secrets. Never
  // load an artifact or executable content from the untrusted review run.
  const head = reviewRun ? linked[0].head?.sha : event.pull_request?.head?.sha;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository || '') ||
    !Number.isInteger(number) ||
    !/^[0-9a-f]{40}$/.test(head || '')
  )
    throw new Error('Invalid exact-head metadata event');
  const [owner, name] = repository.split('/');
  const query =
    'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid mergeQueueEntry{headCommit{oid}}}}}';
  let lastObserved;
  const current = () => {
    try {
      const response = api('graphql', {
        query,
        variables: { owner, name, number },
      });
      const pr = response.data?.repository?.pullRequest;
      if (response.errors?.length || !pr?.headRefOid)
        throw new Error('Missing current PR');
      lastObserved = pr;
      return pr;
    } catch {
      const status = {
        context: 'Fork PR Gate',
        state: 'failure',
        description: 'Source policy metadata unavailable',
      };
      api(`repos/${repository}/statuses/${head}`, status);
      const group = lastObserved?.mergeQueueEntry?.headCommit?.oid;
      if (/^[0-9a-f]{40}$/.test(group || '') && group !== head)
        api(`repos/${repository}/statuses/${group}`, status);
      throw new Error('Source policy metadata unavailable');
    }
  };
  const before = current();
  if (before?.headRefOid !== head) return { disposition: 'stale-event' };
  let result;
  try {
    result = await evaluate({
      repository,
      prNumber: number,
      expectedHead: head,
      token: env.GH_TOKEN,
    });
  } catch {
    result = { allowed: false, blockers: ['policy-evidence-unavailable'] };
  }
  const after = current();
  if (after?.headRefOid !== head) return { disposition: 'stale-event' };
  const status = {
    context: 'Fork PR Gate',
    state: result.allowed ? 'success' : 'failure',
    description: (result.allowed
      ? 'Source metadata and fork policy passed'
      : result.blockers.join(', ')
    ).slice(0, 140),
    target_url: `https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}`,
  };
  api(`repos/${repository}/statuses/${head}`, status);
  // A new hold/review can arrive after group checks passed. Invalidate that
  // exact queued group as well; never publish success over its integration check.
  const groupHead = after.mergeQueueEntry?.headCommit?.oid;
  if (
    !result.allowed &&
    /^[0-9a-f]{40}$/.test(groupHead || '') &&
    groupHead !== head
  ) {
    api(`repos/${repository}/statuses/${groupHead}`, status);
  }
  return { disposition: result.allowed ? 'allowed' : 'blocked', ...result };
}

export function githubApi(endpoint, payload) {
  return JSON.parse(
    execFileSync(
      'gh',
      payload ? ['api', endpoint, '--input', '-'] : ['api', endpoint],
      {
        input: payload ? JSON.stringify(payload) : undefined,
        encoding: 'utf8',
        timeout: 15000,
      }
    )
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  publishSourceAdmission({
    event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
  })
    .then(result => {
      console.log(JSON.stringify(result));
      if (result.disposition === 'blocked') process.exitCode = 1;
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
