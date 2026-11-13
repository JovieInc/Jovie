// api-budget: github-actions-token 15/hr - existing 20-minute liveness gate, at most one linked-PR query plus four closure-proof reads per run
import { hasExactSuccessfulMergeGroupProof } from '../../.github/scripts/verify-main-release-readiness.mjs';
import { createGitHubClient } from '../../packages/api-client/github.ts';
import { ADMISSION_BLOCKING_LABELS } from './admission-hold-labels.mjs';

const SHA = /^[a-f0-9]{40}$/;
const held = labels =>
  labels.some(label =>
    ADMISSION_BLOCKING_LABELS.includes(String(label.name).toLowerCase())
  );
const stamp = value => Date.parse(value ?? '');
// These fields extend the existing progress read, not its call budget. The
// bounded connections fail closed; a truncated fleet is never an idle proof.
const checks =
  'statusCheckRollup { state contexts(first:100) { nodes { ... on CheckRun { name conclusion detailsUrl completedAt checkSuite { app { slug } } } } pageInfo { hasNextPage } } }';
const pr = `number body headRefOid isDraft mergedAt mergeCommit { oid } commits(last:1) { nodes { commit { oid statusCheckRollup { state } } } } labels(first:100) { nodes { name } pageInfo { hasNextPage } }`;
export const QUEUE_RECOVERY_FIELDS = `
  open: pullRequests(baseRefName:$branch,states:OPEN,first:100) { nodes { ${pr} isInMergeQueue mergeStateStatus createdAt } pageInfo { hasNextPage } }
  ref(qualifiedName:$branch) { target { ... on Commit { oid history(first:100) { nodes { oid } } } } }
`;
export const QUEUE_MERGED_FIELDS = pr;
export const QUEUE_CHECK_FIELDS = checks;

export function queueSnapshot(repository, nowMs) {
  const entries = repository?.mergeQueue?.entries;
  const open = repository?.open;
  const merged = repository?.pullRequests?.nodes;
  if (
    !entries ||
    !Array.isArray(entries.nodes) ||
    !Array.isArray(open?.nodes) ||
    !Array.isArray(merged) ||
    entries.pageInfo?.hasNextPage !== false ||
    !Number.isInteger(entries.totalCount) ||
    entries.totalCount !== entries.nodes.length ||
    open.nodes.some(
      p =>
        !Array.isArray(p.labels?.nodes) ||
        p.labels.pageInfo?.hasNextPage !== false
    )
  )
    return { known: false, observedAt: new Date(nowMs).toISOString() };
  const eligible = open.nodes.filter(
    p =>
      !p.isDraft &&
      !held(p.labels.nodes) &&
      !p.isInMergeQueue &&
      ['CLEAN', 'UNSTABLE', 'HAS_HOOKS'].includes(p.mergeStateStatus)
  );
  const failures = entries.nodes
    .flatMap(entry => {
      const commit = entry.headCommit;
      return (commit?.statusCheckRollup?.contexts?.nodes ?? [])
        .filter(
          c =>
            c.conclusion === 'FAILURE' &&
            c.checkSuite?.app?.slug === 'github-actions'
        )
        .map(c => ({ head: commit.oid, check: c.name, url: c.detailsUrl }));
    })
    .sort(
      (a, b) => a.check.localeCompare(b.check) || a.head.localeCompare(b.head)
    );
  return {
    known: true,
    eligibilityComplete: open.pageInfo?.hasNextPage === false,
    observedAt: new Date(nowMs).toISOString(),
    queued: entries.totalCount,
    eligible,
    open: open.nodes,
    merged,
    main: repository.ref?.target ?? null,
    failures,
    lastMergeAt:
      merged
        .map(p => p.mergedAt)
        .filter(t => Number.isFinite(stamp(t)))
        .sort()
        .at(-1) ?? null,
  };
}

export function linkedRepairNumbers(issue, repair) {
  return [
    ...new Set([
      ...(repair?.pr ? [repair.pr] : []),
      ...(issue?.attachments?.nodes ?? []).flatMap(a => {
        const match =
          /^https:\/\/github\.com\/JovieInc\/Jovie\/pull\/(\d+)$/.exec(
            a.url ?? ''
          );
        return match ? [Number(match[1])] : [];
      }),
    ]),
  ];
}

/** At most one targeted PR read and four ledger-backed REST reads per closure
 * candidate. Unknown/failed reads preserve the incident; no reruns or mutations. */
export async function readClosureEvidence({
  snapshot,
  repair,
  openedAt,
  token = null,
  fetchImpl = globalThis.fetch,
  client = null,
  numbers = repair?.pr ? [repair.pr] : [],
}) {
  if (!token && !client) return;
  const github = client ?? createGitHubClient({ token, fetch: fetchImpl });
  const options = {
    priority: 'repair',
    timeoutMs: 10_000,
    maxAttempts: 1,
    maxWaitMs: 0,
    conditional: false,
  };
  const read = async path => {
    const response = await github.rest('GET', path, undefined, options);
    if (
      response.status !== 200 ||
      /rel="next"/.test(response.headers.get('link') ?? '')
    )
      throw new Error('incomplete-recovery-proof');
    return response.json();
  };
  try {
    const existing = new Set(
      [...snapshot.open, ...snapshot.merged].map(p => p.number)
    );
    const missing = numbers.filter(n => !existing.has(n));
    if (missing.length > 3) {
      snapshot.repairLinksKnown = false;
      return;
    }
    if (missing.length) {
      snapshot.repairLinksKnown = false;
      const fields = missing
        .map(
          (n, i) => `p${i}:pullRequest(number:${n}){${pr} state baseRefName}`
        )
        .join(' ');
      const data = await github.graphql(
        `query{repository(owner:"JovieInc",name:"Jovie"){${fields}}}`,
        {},
        options
      );
      const linked = missing.map((_, i) => data?.repository?.[`p${i}`]);
      if (
        linked.some(
          p =>
            !p ||
            p.baseRefName !== 'main' ||
            !Array.isArray(p.labels?.nodes) ||
            p.labels.pageInfo?.hasNextPage !== false
        )
      ) {
        snapshot.repairLinksKnown = false;
        return;
      }
      snapshot.linkedRepairs = linked;
      snapshot.repairLinksKnown = true;
    }
    const linked = [
      ...snapshot.open,
      ...snapshot.merged,
      ...(snapshot.linkedRepairs ?? []),
    ].find(p => p.number === repair?.pr);
    if (!linked || linked.state === 'CLOSED') return;
    if (
      linked.headRefOid !== repair.head ||
      !linked.mergedAt ||
      stamp(linked.mergedAt) <= stamp(openedAt) ||
      stamp(linked.mergedAt) > stamp(snapshot.observedAt) ||
      !SHA.test(linked.mergeCommit?.oid ?? '') ||
      !SHA.test(snapshot.main?.oid ?? '')
    )
      return;
    const receipts = [];
    for (const [event, head] of [
      ['merge_group', linked.mergeCommit.oid],
      ['push', snapshot.main.oid],
    ]) {
      const payload = await read(
        `/repos/JovieInc/Jovie/actions/workflows/ci.yml/runs?event=${event}&head_sha=${head}&per_page=10`
      );
      if (!Array.isArray(payload.workflow_runs)) return;
      const run = payload.workflow_runs
        .filter(r => r.head_sha === head && r.event === event)
        .sort((a, b) => b.run_number - a.run_number)[0];
      if (
        !run ||
        run.path !== '.github/workflows/ci.yml' ||
        run.status !== 'completed' ||
        run.conclusion !== 'success' ||
        !Number.isFinite(stamp(run.created_at)) ||
        stamp(run.created_at) < stamp(openedAt) ||
        stamp(run.created_at) > stamp(snapshot.observedAt) ||
        !Number.isSafeInteger(run.id) ||
        !Number.isSafeInteger(run.run_attempt)
      )
        return;
      if (event === 'push' && run.head_branch !== 'main') return;
      const jobs = await read(
        `/repos/JovieInc/Jovie/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`
      );
      if (
        !Array.isArray(jobs.jobs) ||
        jobs.jobs.length !== jobs.total_count ||
        jobs.jobs.some(
          j =>
            j.run_id !== run.id ||
            j.run_attempt !== run.run_attempt ||
            j.head_sha !== head
        )
      )
        return;
      const proven =
        event === 'merge_group'
          ? hasExactSuccessfulMergeGroupProof({
              sha: head,
              runs: [run],
              jobsByRun: new Map([[run.id, jobs.jobs]]),
            })
          : jobs.jobs.some(
              j =>
                j.name === 'Main Release Ready' &&
                j.status === 'completed' &&
                j.conclusion === 'success'
            );
      if (!proven) return;
      receipts.push({
        event,
        head,
        runId: run.id,
        attempt: run.run_attempt,
        url: run.html_url,
      });
    }
    snapshot.closure = {
      proven: true,
      repairSha: linked.mergeCommit.oid,
      mainSha: snapshot.main.oid,
      receipts,
    };
  } catch {
    snapshot.closure = {
      proven: false,
      reason: 'queue-main-proof-unavailable',
    };
  }
}
