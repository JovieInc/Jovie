import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const POST_UPDATE_VERIFY_DELAYS_MS = [0, 250, 500, 1000, 2000];
const NO_MUTATION = { mutationAttempted: false, mutationApplied: false };

const UPDATE_PULL_REQUEST_BRANCH_MUTATION = `
  mutation UpdatePullRequestBranch(
    $pullRequestId: ID!
    $expectedHeadOid: GitObjectID!
  ) {
    updatePullRequestBranch(
      input: {
        pullRequestId: $pullRequestId
        expectedHeadOid: $expectedHeadOid
        updateMethod: REBASE
      }
    ) {
      pullRequest {
        id
        baseRefName
        headRefName
        headRefOid
      }
    }
  }
`;

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

function errorText(error) {
  const raw = [error?.stderr, error?.stdout, error?.message]
    .filter(Boolean)
    .join(' ')
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();
  return (raw || 'unknown GitHub API error').slice(0, 300);
}

function failureCategory(error) {
  const text = errorText(error);
  if (
    /timed? out|timeout|HTTP 50[234]|rate limit|temporar|ECONNRESET|EAI_AGAIN|connection reset|server error/i.test(
      text
    )
  ) {
    return 'transient';
  }
  if (
    /authentication|unauthorized|forbidden|resource not accessible|requires authentication|HTTP 40[13]/i.test(
      text
    )
  ) {
    return 'auth';
  }
  return 'api_failure';
}

export function classifyGitHubRebaseFailure({ error, before, after }) {
  const detail = errorText(error);

  // expectedHeadOid makes a concurrent head update fail safely. Never call
  // that a conflict: another actor already produced a newer authoritative head.
  if (
    before?.headRefOid &&
    after?.headRefOid &&
    before.headRefOid !== after.headRefOid
  ) {
    return {
      ok: false,
      conflict: false,
      category: 'stale_head',
      reason: `head changed during GitHub rebase (${before.headRefOid.slice(0, 12)} -> ${after.headRefOid.slice(0, 12)}); leaving the newer head untouched`,
    };
  }

  // GitHub's post-failure mergeability snapshot is the only conflict proof.
  // CLI exit status and error prose also cover auth, rate limits, and outages.
  if (after?.mergeable === 'CONFLICTING') {
    return {
      ok: false,
      conflict: true,
      category: 'conflict',
      reason: `GitHub rebase confirmed merge conflicts: ${detail}`,
    };
  }

  if (
    before?.headRefOid === after?.headRefOid &&
    /already up.to.date|already current|not behind/i.test(detail)
  ) {
    return {
      ok: true,
      updated: false,
      conflict: false,
      category: 'no_change',
      reason: 'GitHub reports the pull request branch is already current',
    };
  }

  const category = failureCategory(error);
  return {
    ok: false,
    conflict: false,
    category,
    reason: `GitHub rebase ${category.replace('_', ' ')}: ${detail}`,
  };
}

async function fetchPrSnapshot(repo, prNumber, ghJsonImpl) {
  return ghJsonImpl([
    'pr',
    'view',
    String(prNumber),
    '-R',
    repo,
    '--json',
    'id,state,isDraft,baseRefName,headRefName,headRefOid,mergeable',
  ]);
}

async function tryFetchPrSnapshot(repo, prNumber, ghJsonImpl) {
  try {
    return await fetchPrSnapshot(repo, prNumber, ghJsonImpl);
  } catch {
    return null;
  }
}

function sleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function pollForUpdatedHead({
  repo,
  prNumber,
  before,
  mutated,
  ghJsonImpl,
  sleepImpl,
}) {
  let lastSnapshot = null;
  const mutationReturnedUpdatedHead = mutated.headRefOid !== before.headRefOid;

  for (const delayMs of POST_UPDATE_VERIFY_DELAYS_MS) {
    if (delayMs > 0) await sleepImpl(delayMs);

    const snapshot = await tryFetchPrSnapshot(repo, prNumber, ghJsonImpl);
    if (!snapshot) continue;
    lastSnapshot = snapshot;

    if (
      snapshot.id !== before.id ||
      snapshot.baseRefName !== before.baseRefName ||
      snapshot.headRefName !== before.headRefName
    ) {
      return { snapshot, identityChanged: true };
    }
    if (
      mutationReturnedUpdatedHead &&
      snapshot.headRefOid === mutated.headRefOid
    ) {
      return { snapshot, converged: true };
    }
    if (snapshot.headRefOid !== before.headRefOid) {
      if (!mutationReturnedUpdatedHead) {
        return {
          snapshot,
          headChanged: true,
          asynchronousUpdateIndeterminate: true,
        };
      }
      return { snapshot, headChanged: true };
    }
  }

  // A same-head mutation response is ambiguous: GitHub may still create the
  // rebased commit after this window. Never turn elapsed polling into a
  // successful no-op or enroll a later head without causal integration proof.
  if (!mutationReturnedUpdatedHead) {
    return {
      snapshot: lastSnapshot,
      timedOut: true,
      asynchronousUpdateIndeterminate: true,
    };
  }

  return { snapshot: lastSnapshot, timedOut: true };
}

export async function tryGitHubRebase({
  repo,
  pr,
  expectedBaseRefName,
  dryRun,
  ghJsonImpl = ghJson,
  sleepImpl = sleep,
}) {
  if (dryRun) {
    return {
      ...NO_MUTATION,
      ok: true,
      updated: true,
      dryRun: true,
      baseRefName: expectedBaseRefName,
      reason:
        'dry-run: would request an exact-head GitHub Update Branch rebase',
    };
  }

  let before;
  try {
    before = await fetchPrSnapshot(repo, pr.number, ghJsonImpl);
  } catch (error) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'snapshot_failure',
      reason: `could not read exact PR head before GitHub rebase: ${errorText(error)}`,
    };
  }

  if (
    before.state !== 'OPEN' ||
    before.isDraft ||
    before.headRefName !== pr.headRefName
  ) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'stale_pr',
      baseRefName: before.baseRefName,
      reason: 'PR state or head ref changed before GitHub rebase',
    };
  }
  if (expectedBaseRefName && before.baseRefName !== expectedBaseRefName) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'stale_base',
      baseRefName: before.baseRefName,
      reason: `PR base changed before GitHub rebase (${expectedBaseRefName} -> ${before.baseRefName})`,
    };
  }
  if (!before.id || !before.headRefOid) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'snapshot_failure',
      baseRefName: before.baseRefName,
      reason: 'GitHub PR snapshot omitted id or headRefOid; refusing mutation',
    };
  }
  if (before.mergeable === 'CONFLICTING') {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: true,
      category: 'conflict',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: before.headRefOid,
      reason: 'GitHub confirmed merge conflicts before rebase',
    };
  }

  let mutation;
  try {
    mutation = await ghJsonImpl([
      'api',
      'graphql',
      '-f',
      `query=${UPDATE_PULL_REQUEST_BRANCH_MUTATION}`,
      '-f',
      `pullRequestId=${before.id}`,
      '-f',
      `expectedHeadOid=${before.headRefOid}`,
    ]);
  } catch (error) {
    const after = await tryFetchPrSnapshot(repo, pr.number, ghJsonImpl);
    return {
      ...classifyGitHubRebaseFailure({ error, before, after }),
      mutationAttempted: true,
      mutationApplied: false,
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after?.headRefOid ?? null,
    };
  }

  const mutated = mutation?.data?.updatePullRequestBranch?.pullRequest;
  const mutationState = {
    mutationAttempted: true,
    mutationApplied: Boolean(
      mutated?.headRefOid && mutated.headRefOid !== before.headRefOid
    ),
  };
  if (
    !mutated?.headRefOid ||
    mutated.id !== before.id ||
    mutated.baseRefName !== before.baseRefName ||
    mutated.headRefName !== before.headRefName
  ) {
    return {
      ...mutationState,
      ok: false,
      conflict: false,
      category: 'verification_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      reason:
        'GitHub rebase returned without a verifiable PR identity, base, or head; refusing enrollment mutation',
    };
  }

  const verification = await pollForUpdatedHead({
    repo,
    prNumber: pr.number,
    before,
    mutated,
    ghJsonImpl,
    sleepImpl,
  });
  const after = verification.snapshot;
  const verifiedMutationState = mutationState;
  if (verification.identityChanged || verification.headChanged) {
    return {
      ...verifiedMutationState,
      ok: false,
      conflict: false,
      category: 'verification_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after.headRefOid,
      reason: verification.asynchronousUpdateIndeterminate
        ? 'GitHub acknowledged the rebase without a new head; a later head change is not causally attributable to that mutation, so enrollment is refused'
        : 'PR identity, base, or head changed after GitHub rebase; refusing enrollment mutation',
    };
  }
  if (!verification.converged || !after?.headRefOid) {
    return {
      ...verifiedMutationState,
      ok: false,
      conflict: false,
      category: 'verification_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after?.headRefOid ?? null,
      reason: verification.asynchronousUpdateIndeterminate
        ? `GitHub acknowledged the rebase without a new head; bounded verification ended after ${POST_UPDATE_VERIFY_DELAYS_MS.length} reads, so the result remains indeterminate and enrollment is refused`
        : `GitHub rebase head was not visible after ${POST_UPDATE_VERIFY_DELAYS_MS.length} bounded verification reads; refusing enrollment mutation`,
    };
  }

  return {
    ...verifiedMutationState,
    ok: true,
    updated: true,
    conflict: false,
    category: 'updated',
    baseRefName: before.baseRefName,
    expectedHeadOid: before.headRefOid,
    observedHeadOid: after.headRefOid,
    reason: `GitHub rebased ${before.headRefOid.slice(0, 12)} -> ${after.headRefOid.slice(0, 12)} onto ${before.baseRefName}`,
  };
}
