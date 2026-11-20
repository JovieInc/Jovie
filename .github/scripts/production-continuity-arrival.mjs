// api-budget: github-actions-token 24/hr - one poll-priority read per existing continuity tick; dual five-minute clock/backstop, one attempt.
import { createApiClient } from '../../packages/api-client/client.ts';
import { hashCredential } from '../../packages/api-client/store.ts';

const isSha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const timestamp = value =>
  typeof value === 'string' ? Date.parse(value) : NaN;
const unknown = reason => ({ ok: false, reason });

/** Observe arrival from CI push receipts, never from an authored/queue date. */
export async function readMainArrival({
  compare,
  liveSha,
  mainSha,
  repository,
  token,
  fetchImpl,
  githubApiUrl,
  now,
  timeoutMs,
  githubClient,
  staleAfterSeconds,
}) {
  const commits = compare?.commits;
  if (
    !Array.isArray(commits) ||
    commits.length > compare.ahead_by ||
    !commits.length
  )
    return unknown('unshipped-range-unreadable');
  const shas = new Set(commits.map(commit => commit?.sha));
  const rangeComplete =
    commits.length === compare.ahead_by && shas.has(mainSha);
  const truncated =
    commits.length < compare.ahead_by &&
    compare.status === 'ahead' &&
    compare.total_commits === compare.ahead_by &&
    compare.merge_base_commit?.sha === liveSha;
  if (
    shas.size !== commits.length ||
    ![...shas].every(isSha) ||
    !(rangeComplete || truncated) ||
    shas.has(liveSha)
  )
    return unknown('unshipped-range-unreadable');
  // A validated ahead comparison proves its main endpoint is unshipped even
  // when GitHub truncates the commit inventory. It can prove a stale lower
  // bound, but never certify freshness for the unread portion of the range.
  shas.add(mainSha);
  const oldestUnshippedAt = commits[0]?.commit?.committer?.date;
  if (!Number.isFinite(timestamp(oldestUnshippedAt)))
    return unknown('unshipped-age-unreadable');
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return unknown('unshipped-arrival-unreadable');
  let ledger;
  try {
    const client =
      githubClient ??
      createApiClient({
        provider: 'github',
        credential: hashCredential('github', token || 'public'),
        fetch: fetchImpl,
      });
    const response = await client.request({
      url: `${githubApiUrl}/repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=100`,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      priority: 'poll',
      conditional: false,
      maxAttempts: 1,
      maxWaitMs: 0,
      timeoutMs,
    });
    if (response.status !== 200) return unknown('unshipped-arrival-unreadable');
    ledger = await response.json();
  } catch {
    return unknown('unshipped-arrival-unreadable');
  }
  const runs = ledger?.workflow_runs;
  if (
    !Array.isArray(runs) ||
    !runs.length ||
    runs.length > 100 ||
    !Number.isSafeInteger(ledger.total_count) ||
    ledger.total_count < runs.length
  )
    return unknown('unshipped-arrival-unreadable');
  if (
    runs.some(
      run =>
        !isSha(run?.head_sha) ||
        run.event !== 'push' ||
        run.head_branch !== 'main' ||
        !Number.isFinite(timestamp(run.created_at)) ||
        timestamp(run.created_at) > nowMs
    )
  )
    return unknown('unshipped-arrival-unreadable');
  // Freshness requires the whole range and arrival window. A matching old
  // unshipped receipt alone can prove staleness; an unrelated old page cannot.
  const complete =
    ledger.total_count === runs.length ||
    runs.some(
      run => run.head_sha === commits[0].sha || run.head_sha === liveSha
    );
  const arrivals = runs
    .filter(run => shas.has(run.head_sha))
    .map(run => timestamp(run.created_at));
  if (!arrivals.length) return unknown('unshipped-arrival-unreadable');
  const arrivedMs = Math.min(...arrivals);
  const unshippedAgeSeconds = Math.max(
    0,
    Math.floor((nowMs - arrivedMs) / 1000)
  );
  const unshippedAgeIsLowerBound = !(rangeComplete && complete);
  if (
    unshippedAgeIsLowerBound &&
    !(
      Number.isFinite(staleAfterSeconds) &&
      staleAfterSeconds > 0 &&
      unshippedAgeSeconds >= staleAfterSeconds
    )
  )
    return unknown('unshipped-arrival-unreadable');
  return {
    ok: true,
    oldestUnshippedAt,
    unshippedArrivedAt: new Date(arrivedMs).toISOString(),
    unshippedAgeSeconds,
    unshippedAgeIsLowerBound,
  };
}
