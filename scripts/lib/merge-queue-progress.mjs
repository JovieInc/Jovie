import { githubHeaders } from './github-json-read.mjs';
import {
  QUEUE_CHECK_FIELDS,
  QUEUE_MERGED_FIELDS,
  QUEUE_RECOVERY_FIELDS,
  queueSnapshot,
} from './merge-queue-recovery-evidence.mjs';

const TIMEOUT_MS = 10_000;
/**
 * Merge-queue progress (2026-10-20: the queue stalled 39 min with no alarm,
 * JOV-8706). An empty queue is a fresh proof; otherwise the proof is the later
 * of the last merged PR and the oldest entry's enqueue time, so a
 * non-empty queue that stops merging goes silent. Unreadable is silence.
 */
export async function observeMergeQueueProgress(
  receipt,
  { fetchImpl, token, nowMs, apiUrl }
) {
  if (!token) return { ok: false, reason: 'merge-queue-token-missing' };
  const [owner, name] = String(receipt.repo).split('/');
  const branch = receipt.branch ?? 'main';
  const query = `query($owner:String!,$name:String!,$branch:String!){repository(owner:$owner,name:$name){mergeQueue(branch:$branch){entries(first:100){totalCount nodes{enqueuedAt headCommit { oid ${QUEUE_CHECK_FIELDS} }} pageInfo{hasNextPage}}} ${QUEUE_RECOVERY_FIELDS} pullRequests(baseRefName:$branch,states:MERGED,first:10,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{${QUEUE_MERGED_FIELDS}}}}}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body;
  try {
    const response = await fetchImpl(`${apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        ...githubHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { owner, name, branch },
      }),
      signal: controller.signal,
    });
    if (response.status !== 200)
      return { ok: false, reason: `merge-queue-http-${response.status}` };
    body = await response.json();
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.name === 'AbortError'
          ? 'merge-queue-timeout'
          : 'merge-queue-transport',
    };
  } finally {
    clearTimeout(timer);
  }
  const repo = body?.data?.repository;
  const entries = repo?.mergeQueue?.entries;
  if (!repo || body?.errors?.length || !entries)
    return { ok: false, reason: 'merge-queue-unreadable' };
  const recoverySnapshot = queueSnapshot(repo, nowMs);
  if (!recoverySnapshot.known)
    return {
      ok: false,
      reason: 'merge-queue-incomplete-snapshot',
      recoverySnapshot,
    };
  if (!entries.totalCount && !recoverySnapshot.eligibilityComplete)
    return {
      ok: false,
      reason: 'eligible-pr-pagination-incomplete',
      recoverySnapshot,
    };
  if (!entries.totalCount && recoverySnapshot.eligible.length)
    return {
      ok: false,
      reason: 'eligible-enqueue-evidence-required',
      recoverySnapshot,
    };
  if (
    Number(entries.totalCount) === 0 &&
    recoverySnapshot.eligible.length === 0
  )
    return {
      ok: true,
      lastProofAt: new Date(nowMs).toISOString(),
      reason: 'merge-queue-idle',
      recoverySnapshot,
    };
  const merges = (repo.pullRequests?.nodes ?? [])
    .map(node => Date.parse(node?.mergedAt ?? ''))
    .filter(Number.isFinite);
  const lastMerge = merges.length ? Math.max(...merges) : Number.NaN;
  const enqueued = (entries.nodes ?? [])
    .map(node => Date.parse(node?.enqueuedAt ?? ''))
    .filter(Number.isFinite);
  const waitingSince = enqueued.length ? Math.min(...enqueued) : Number.NaN;
  const proof = Math.max(
    Number.isFinite(lastMerge) ? lastMerge : -Infinity,
    Number.isFinite(waitingSince) ? waitingSince : -Infinity
  );
  if (!Number.isFinite(proof))
    return { ok: false, reason: 'merge-queue-times-unreadable' };
  return {
    ok: true,
    lastProofAt: new Date(proof).toISOString(),
    reason: `${entries.totalCount}-queued;${recoverySnapshot.eligible.length}-eligible-unqueued`,
    recoverySnapshot,
  };
}
