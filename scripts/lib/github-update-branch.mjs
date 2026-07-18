import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

export async function tryGitHubRebase({
  repo,
  pr,
  expectedBaseRefName,
  dryRun,
  ghJsonImpl = ghJson,
}) {
  if (dryRun) {
    return {
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
      ok: false,
      conflict: false,
      category: 'stale_pr',
      baseRefName: before.baseRefName,
      reason: 'PR state or head ref changed before GitHub rebase',
    };
  }
  if (expectedBaseRefName && before.baseRefName !== expectedBaseRefName) {
    return {
      ok: false,
      conflict: false,
      category: 'stale_base',
      baseRefName: before.baseRefName,
      reason: `PR base changed before GitHub rebase (${expectedBaseRefName} -> ${before.baseRefName})`,
    };
  }
  if (!before.id || !before.headRefOid) {
    return {
      ok: false,
      conflict: false,
      category: 'snapshot_failure',
      baseRefName: before.baseRefName,
      reason: 'GitHub PR snapshot omitted id or headRefOid; refusing mutation',
    };
  }
  if (before.mergeable === 'CONFLICTING') {
    return {
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
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after?.headRefOid ?? null,
    };
  }

  const mutated = mutation?.data?.updatePullRequestBranch?.pullRequest;
  const after = await tryFetchPrSnapshot(repo, pr.number, ghJsonImpl);
  if (!mutated?.headRefOid || !after?.headRefOid) {
    return {
      ok: false,
      conflict: false,
      category: 'verification_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      reason:
        'GitHub rebase returned without a verifiable post-update head; refusing enrollment mutation',
    };
  }
  if (
    mutated.id !== before.id ||
    after.id !== before.id ||
    mutated.baseRefName !== before.baseRefName ||
    after.baseRefName !== before.baseRefName ||
    mutated.headRefName !== before.headRefName ||
    after.headRefName !== before.headRefName ||
    mutated.headRefOid !== after.headRefOid
  ) {
    return {
      ok: false,
      conflict: false,
      category: 'verification_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after.headRefOid,
      reason:
        'PR identity, base, or head changed after GitHub rebase; refusing enrollment mutation',
    };
  }
  if (after.headRefOid === before.headRefOid) {
    if (after.mergeable === 'CONFLICTING') {
      return {
        ok: false,
        conflict: true,
        category: 'conflict',
        baseRefName: before.baseRefName,
        expectedHeadOid: before.headRefOid,
        observedHeadOid: after.headRefOid,
        reason: 'GitHub rebase left the head unchanged and confirmed conflicts',
      };
    }
    return {
      ok: true,
      updated: false,
      conflict: false,
      category: 'no_change',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after.headRefOid,
      reason: 'GitHub reports the pull request branch is already current',
    };
  }

  return {
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
