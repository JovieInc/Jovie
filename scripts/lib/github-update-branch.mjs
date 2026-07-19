import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const POST_UPDATE_VERIFY_DELAYS_MS = [
  0, 250, 500, 1000, 2000, 4000, 8000, 14000,
];
const UPDATE_OPERATION_BUDGET_MS = 30_000;
const SUBPROCESS_CLEANUP_GRACE_MS = 250;
const NO_MUTATION = { mutationAttempted: false, mutationApplied: false };
const PROOF_FETCH_DEPTH = '256';

class DeadlineExceededError extends Error {
  constructor(operation) {
    super(`absolute update-branch deadline exceeded during ${operation}`);
    this.name = 'DeadlineExceededError';
    this.code = 'UPDATE_BRANCH_DEADLINE_EXCEEDED';
  }
}

function isDeadlineExceeded(error) {
  return error?.code === 'UPDATE_BRANCH_DEADLINE_EXCEEDED';
}

function remainingDeadlineMs(deadline, operation) {
  const remainingMs = Math.floor(deadline.deadlineAtMs - deadline.nowImpl());
  if (remainingMs <= 0) throw new DeadlineExceededError(operation);
  return remainingMs;
}

async function runWithinDeadline(
  deadline,
  operation,
  run,
  { reserveCleanupGrace = false } = {}
) {
  const timeoutMs = remainingDeadlineMs(deadline, operation);
  const cleanupGraceMs = reserveCleanupGrace
    ? Math.min(SUBPROCESS_CLEANUP_GRACE_MS, Math.floor(timeoutMs / 2))
    : 0;
  const operationTimeoutMs = Math.max(1, timeoutMs - cleanupGraceMs);
  let timeoutId;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => run(operationTimeoutMs)),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new DeadlineExceededError(operation)),
          timeoutMs
        );
      }),
    ]);
    remainingDeadlineMs(deadline, operation);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isSubprocessTimeout(error) {
  return (
    error?.killed === true ||
    error?.code === 'ETIMEDOUT' ||
    /timed? out|timeout/i.test(error?.message ?? '')
  );
}

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

export async function execFileTerminating(file, args, options = {}) {
  return execFileAsync(file, args, {
    ...options,
    killSignal: 'SIGKILL',
  });
}

async function ghJson(args, { timeoutMs } = {}) {
  const { stdout } = await execFileTerminating('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: timeoutMs,
  });
  return JSON.parse(stdout);
}

async function runGhJson(ghJsonImpl, args, deadline, operation) {
  try {
    return await runWithinDeadline(
      deadline,
      operation,
      timeoutMs => ghJsonImpl(args, { timeoutMs }),
      { reserveCleanupGrace: true }
    );
  } catch (error) {
    if (isSubprocessTimeout(error)) throw new DeadlineExceededError(operation);
    throw error;
  }
}

function gitEnvironment({ authenticated = false } = {}) {
  if (!authenticated || !process.env.GH_TOKEN) return process.env;

  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(
      `x-access-token:${process.env.GH_TOKEN}`
    ).toString('base64')}`,
  };
}

async function git(args, options = {}) {
  const { stdout } = await execFileTerminating('git', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: gitEnvironment(options),
    timeout: options.timeoutMs,
  });
  return stdout.trim();
}

async function runGit(gitImpl, args, options, deadline, operation) {
  try {
    return await runWithinDeadline(
      deadline,
      operation,
      timeoutMs => gitImpl(args, { ...options, timeoutMs }),
      { reserveCleanupGrace: true }
    );
  } catch (error) {
    if (isSubprocessTimeout(error)) throw new DeadlineExceededError(operation);
    throw error;
  }
}

async function fetchIntegrationObjects({
  prNumber,
  baseRefName,
  baseRefOid,
  headRefOid,
  deadline,
  gitImpl,
}) {
  // Read objects only. Branch mutation remains exclusively GitHub Update
  // Branch; this fetch never updates a local or remote branch ref.
  await runGit(
    gitImpl,
    [
      'fetch',
      '--no-tags',
      `--depth=${PROOF_FETCH_DEPTH}`,
      'origin',
      `refs/heads/${baseRefName}`,
      `refs/pull/${prNumber}/head`,
    ],
    { authenticated: true },
    deadline,
    'integration object fetch'
  );

  const [fetchedBase, fetchedHead] = await Promise.all([
    runGit(
      gitImpl,
      ['rev-parse', `${baseRefOid}^{commit}`],
      {},
      deadline,
      'exact base object verification'
    ),
    runGit(
      gitImpl,
      ['rev-parse', `${headRefOid}^{commit}`],
      {},
      deadline,
      'exact head object verification'
    ),
  ]);
  if (fetchedBase !== baseRefOid || fetchedHead !== headRefOid) {
    throw new Error(
      'fetched integration proof objects did not match exact OIDs'
    );
  }
}

async function isAncestor(ancestorOid, descendantOid, { deadline, gitImpl }) {
  try {
    await runGit(
      gitImpl,
      ['merge-base', '--is-ancestor', ancestorOid, descendantOid],
      {},
      deadline,
      'base ancestry verification'
    );
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

export async function gitIntegrationProof({
  phase,
  prNumber,
  baseRefName,
  baseRefOid,
  headRefOid,
  expectedIntegrationTreeOid = null,
  potentialMergeCommit = null,
  deadline,
  gitImpl = git,
}) {
  if (!deadline) {
    throw new Error('integration proof requires an absolute deadline');
  }
  await fetchIntegrationObjects({
    prNumber,
    baseRefName,
    baseRefOid,
    headRefOid,
    deadline,
    gitImpl,
  });

  const baseIsAncestor = await isAncestor(baseRefOid, headRefOid, {
    deadline,
    gitImpl,
  });
  const headTreeOid = await runGit(
    gitImpl,
    ['rev-parse', `${headRefOid}^{tree}`],
    {},
    deadline,
    'head tree verification'
  );

  if (phase === 'verify') {
    return {
      ok:
        baseIsAncestor &&
        Boolean(expectedIntegrationTreeOid) &&
        headTreeOid === expectedIntegrationTreeOid,
      baseIsAncestor,
      headTreeOid,
    };
  }

  if (baseIsAncestor) {
    return { alreadyIntegrated: true, headTreeOid };
  }

  const integrationTreeOid = (
    await runGit(
      gitImpl,
      ['merge-tree', '--write-tree', baseRefOid, headRefOid],
      {},
      deadline,
      'integration tree calculation'
    )
  ).split('\n')[0];
  if (!/^[0-9a-f]{40,64}$/u.test(integrationTreeOid)) {
    throw new Error('git merge-tree omitted an exact integration tree OID');
  }

  const potentialParents = potentialMergeCommit?.parents ?? [];
  if (
    potentialParents.length === 2 &&
    potentialParents[0] === baseRefOid &&
    potentialParents[1] === headRefOid &&
    potentialMergeCommit.treeOid !== integrationTreeOid
  ) {
    throw new Error(
      'GitHub potential-merge tree disagreed with exact local integration tree'
    );
  }

  return {
    alreadyIntegrated: false,
    expectedIntegrationTreeOid: integrationTreeOid,
    headTreeOid,
  };
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

  const category = failureCategory(error);
  return {
    ok: false,
    conflict: false,
    category,
    reason: `GitHub rebase ${category.replace('_', ' ')}: ${detail}`,
  };
}

async function fetchPrSnapshot(
  repo,
  prNumber,
  ghJsonImpl,
  deadline,
  { includePotentialMerge = false } = {}
) {
  const pr = await runGhJson(
    ghJsonImpl,
    [
      'pr',
      'view',
      String(prNumber),
      '-R',
      repo,
      '--json',
      'id,state,isDraft,baseRefName,baseRefOid,headRefName,headRefOid,headRepositoryOwner,isCrossRepository,mergeable,potentialMergeCommit',
    ],
    deadline,
    'PR snapshot read'
  );
  const exactBaseRef = await runGhJson(
    ghJsonImpl,
    [
      'api',
      `repos/${repo}/git/ref/heads/${encodeURIComponent(pr.baseRefName)}`,
    ],
    deadline,
    'exact base ref read'
  );
  const rawPotentialOid = pr?.potentialMergeCommit?.oid ?? null;
  let potentialMergeCommit = null;

  if (includePotentialMerge && rawPotentialOid && !pr.isCrossRepository) {
    const commit = await runGhJson(
      ghJsonImpl,
      ['api', `repos/${repo}/git/commits/${rawPotentialOid}`],
      deadline,
      'potential merge commit read'
    );
    potentialMergeCommit = {
      oid: commit?.sha ?? rawPotentialOid,
      treeOid: commit?.tree?.sha ?? null,
      parents: (commit?.parents ?? []).map(parent => parent.sha),
    };
  }

  return {
    ...pr,
    prBaseRefOid: pr.baseRefOid,
    baseRefOid: exactBaseRef?.object?.sha ?? null,
    potentialMergeCommit,
  };
}

async function tryFetchPrSnapshot(repo, prNumber, ghJsonImpl, deadline) {
  try {
    return await fetchPrSnapshot(repo, prNumber, ghJsonImpl, deadline);
  } catch (error) {
    if (isDeadlineExceeded(error)) throw error;
    return null;
  }
}

function sleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function sleepWithinDeadline(sleepImpl, requestedDelayMs, deadline) {
  const remainingMs = remainingDeadlineMs(deadline, 'post-update wait');
  const delayMs = Math.min(requestedDelayMs, remainingMs);
  await runWithinDeadline(deadline, 'post-update wait', () =>
    sleepImpl(delayMs)
  );
}

function runIntegrationProof(integrationProofImpl, input, deadline, operation) {
  return runWithinDeadline(deadline, operation, timeoutMs =>
    integrationProofImpl({ ...input, deadline, timeoutMs })
  );
}

async function pollForUpdatedHead({
  repo,
  prNumber,
  before,
  mutated,
  expectedIntegrationTreeOid,
  ghJsonImpl,
  integrationProofImpl,
  sleepImpl,
  deadline,
}) {
  let lastSnapshot = null;
  const mutationReturnedUpdatedHead = mutated.headRefOid !== before.headRefOid;

  for (const delayMs of POST_UPDATE_VERIFY_DELAYS_MS) {
    if (delayMs > 0) {
      try {
        await sleepWithinDeadline(sleepImpl, delayMs, deadline);
      } catch (error) {
        if (isDeadlineExceeded(error)) {
          return { snapshot: lastSnapshot, timedOut: true };
        }
        throw error;
      }
    }

    let snapshot;
    try {
      snapshot = await tryFetchPrSnapshot(repo, prNumber, ghJsonImpl, deadline);
    } catch (error) {
      if (isDeadlineExceeded(error)) {
        return { snapshot: lastSnapshot, timedOut: true };
      }
      throw error;
    }
    if (!snapshot) continue;
    lastSnapshot = snapshot;

    if (
      snapshot.id !== before.id ||
      snapshot.baseRefName !== before.baseRefName ||
      snapshot.baseRefOid !== before.baseRefOid ||
      snapshot.headRefName !== before.headRefName ||
      snapshot.isCrossRepository !== before.isCrossRepository ||
      snapshot.headRepositoryOwner?.login !== before.headRepositoryOwner?.login
    ) {
      return { snapshot, identityChanged: true };
    }
    if (snapshot.headRefOid !== before.headRefOid) {
      let semanticProof;
      try {
        semanticProof = await runIntegrationProof(
          integrationProofImpl,
          {
            phase: 'verify',
            repo,
            prNumber,
            baseRefName: before.baseRefName,
            baseRefOid: before.baseRefOid,
            headRefOid: snapshot.headRefOid,
            expectedIntegrationTreeOid,
          },
          deadline,
          'post-update integration proof'
        );
      } catch (error) {
        if (isDeadlineExceeded(error)) {
          return { snapshot, timedOut: true };
        }
        semanticProof = null;
      }

      if (semanticProof?.ok) {
        let confirmedSnapshot;
        try {
          confirmedSnapshot = await tryFetchPrSnapshot(
            repo,
            prNumber,
            ghJsonImpl,
            deadline
          );
        } catch (error) {
          if (isDeadlineExceeded(error)) {
            return { snapshot, timedOut: true };
          }
          throw error;
        }
        if (
          !confirmedSnapshot ||
          confirmedSnapshot.id !== before.id ||
          confirmedSnapshot.baseRefName !== before.baseRefName ||
          confirmedSnapshot.baseRefOid !== before.baseRefOid ||
          confirmedSnapshot.headRefName !== before.headRefName ||
          confirmedSnapshot.headRefOid !== snapshot.headRefOid ||
          confirmedSnapshot.isCrossRepository !== before.isCrossRepository ||
          confirmedSnapshot.headRepositoryOwner?.login !==
            before.headRepositoryOwner?.login
        ) {
          return {
            snapshot: confirmedSnapshot ?? snapshot,
            headChanged: true,
            semanticProofLostRace: true,
          };
        }
        return {
          snapshot: confirmedSnapshot,
          converged: true,
          asynchronousUpdate: !mutationReturnedUpdatedHead,
          semanticProof,
        };
      }
      return {
        snapshot,
        headChanged: true,
        semanticProofFailed: true,
        semanticProof,
      };
    }
  }

  // Consume any residual budget without starting another read that could run
  // past the same absolute deadline. This keeps the mutex bounded by wall time,
  // not by the nominal sum of sleeps plus unbounded subprocess time.
  try {
    await sleepWithinDeadline(
      sleepImpl,
      remainingDeadlineMs(deadline, 'post-update deadline wait'),
      deadline
    );
  } catch (error) {
    if (!isDeadlineExceeded(error)) throw error;
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
  integrationProofImpl = gitIntegrationProof,
  sleepImpl = sleep,
  nowImpl = Date.now,
  operationBudgetMs = UPDATE_OPERATION_BUDGET_MS,
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

  const deadline = {
    deadlineAtMs: nowImpl() + operationBudgetMs,
    nowImpl,
  };

  let before;
  try {
    before = await fetchPrSnapshot(repo, pr.number, ghJsonImpl, deadline, {
      includePotentialMerge: true,
    });
  } catch (error) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: isDeadlineExceeded(error)
        ? 'verification_failure'
        : 'snapshot_failure',
      reason: `could not read exact PR head before GitHub rebase: ${errorText(error)}`,
    };
  }

  if (
    before.state !== 'OPEN' ||
    before.isDraft ||
    before.headRefName !== pr.headRefName ||
    before.isCrossRepository ||
    before.headRepositoryOwner?.login?.toLowerCase() !==
      repo.split('/')[0]?.toLowerCase()
  ) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'stale_pr',
      baseRefName: before.baseRefName,
      reason:
        'PR state, head ref, or same-repository ownership changed before GitHub rebase',
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
  if (!before.id || !before.headRefOid || !before.baseRefOid) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'snapshot_failure',
      baseRefName: before.baseRefName,
      reason:
        'GitHub PR snapshot omitted id, headRefOid, or exact baseRefOid; refusing mutation',
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

  let preparedIntegration;
  try {
    preparedIntegration = await runIntegrationProof(
      integrationProofImpl,
      {
        phase: 'prepare',
        repo,
        prNumber: pr.number,
        baseRefName: before.baseRefName,
        baseRefOid: before.baseRefOid,
        headRefOid: before.headRefOid,
        potentialMergeCommit: before.potentialMergeCommit,
      },
      deadline,
      'pre-mutation integration proof'
    );
  } catch (error) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: isDeadlineExceeded(error)
        ? 'verification_failure'
        : 'snapshot_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: before.headRefOid,
      reason: `could not prepare exact base/head integration proof: ${errorText(error)}`,
    };
  }

  if (preparedIntegration?.alreadyIntegrated) {
    let confirmedBefore;
    try {
      confirmedBefore = await tryFetchPrSnapshot(
        repo,
        pr.number,
        ghJsonImpl,
        deadline
      );
    } catch (error) {
      return {
        ...NO_MUTATION,
        ok: false,
        conflict: false,
        category: 'verification_failure',
        baseRefName: before.baseRefName,
        expectedHeadOid: before.headRefOid,
        observedHeadOid: null,
        reason: `could not close the pre-mutation no-change race: ${errorText(error)}`,
      };
    }
    if (
      !confirmedBefore ||
      confirmedBefore.id !== before.id ||
      confirmedBefore.baseRefName !== before.baseRefName ||
      confirmedBefore.baseRefOid !== before.baseRefOid ||
      confirmedBefore.headRefName !== before.headRefName ||
      confirmedBefore.headRefOid !== before.headRefOid ||
      confirmedBefore.isCrossRepository !== before.isCrossRepository ||
      confirmedBefore.headRepositoryOwner?.login !==
        before.headRepositoryOwner?.login
    ) {
      return {
        ...NO_MUTATION,
        ok: false,
        conflict: false,
        category: 'stale_pr',
        baseRefName: before.baseRefName,
        expectedHeadOid: before.headRefOid,
        observedHeadOid: confirmedBefore?.headRefOid ?? null,
        reason:
          'PR identity, exact base, or head changed while proving pre-mutation no-change',
      };
    }
    return {
      ...NO_MUTATION,
      ok: true,
      updated: false,
      conflict: false,
      category: 'no_change',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: before.headRefOid,
      reason: `exact base ${before.baseRefOid.slice(0, 12)} is already an ancestor of the PR head`,
    };
  }

  const expectedIntegrationTreeOid =
    preparedIntegration?.expectedIntegrationTreeOid;
  if (!expectedIntegrationTreeOid || !before.potentialMergeCommit?.treeOid) {
    return {
      ...NO_MUTATION,
      ok: false,
      conflict: false,
      category: 'snapshot_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: before.headRefOid,
      reason:
        'GitHub PR snapshot or local merge proof omitted the pre-mutation integration tree; refusing mutation',
    };
  }

  let mutation;
  try {
    mutation = await runGhJson(
      ghJsonImpl,
      [
        'api',
        'graphql',
        '-f',
        `query=${UPDATE_PULL_REQUEST_BRANCH_MUTATION}`,
        '-f',
        `pullRequestId=${before.id}`,
        '-f',
        `expectedHeadOid=${before.headRefOid}`,
      ],
      deadline,
      'updatePullRequestBranch mutation'
    );
  } catch (error) {
    if (isDeadlineExceeded(error)) {
      return {
        mutationAttempted: true,
        mutationApplied: false,
        ok: false,
        conflict: false,
        category: 'verification_failure',
        baseRefName: before.baseRefName,
        expectedHeadOid: before.headRefOid,
        observedHeadOid: null,
        reason: `GitHub rebase could not be verified before the absolute deadline: ${errorText(error)}`,
      };
    }
    let after;
    try {
      after = await tryFetchPrSnapshot(repo, pr.number, ghJsonImpl, deadline);
    } catch (afterError) {
      return {
        mutationAttempted: true,
        mutationApplied: false,
        ok: false,
        conflict: false,
        category: 'verification_failure',
        baseRefName: before.baseRefName,
        expectedHeadOid: before.headRefOid,
        observedHeadOid: null,
        reason: `GitHub rebase failure could not be verified before the absolute deadline: ${errorText(afterError)}`,
      };
    }
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
    expectedIntegrationTreeOid,
    ghJsonImpl,
    integrationProofImpl,
    sleepImpl,
    deadline,
  });
  const after = verification.snapshot;
  const verifiedMutationState = {
    ...mutationState,
    mutationApplied:
      mutationState.mutationApplied || verification.asynchronousUpdate === true,
  };
  if (verification.identityChanged || verification.headChanged) {
    return {
      ...verifiedMutationState,
      ok: false,
      conflict: false,
      category: 'verification_failure',
      baseRefName: before.baseRefName,
      expectedHeadOid: before.headRefOid,
      observedHeadOid: after.headRefOid,
      reason: verification.semanticProofFailed
        ? 'post-update head failed exact base-ancestry or integration-tree proof; refusing enrollment mutation'
        : 'PR identity, exact base, or head changed after GitHub rebase; refusing enrollment mutation',
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
        ? `GitHub acknowledged the rebase without a new head; the ${operationBudgetMs}ms absolute verification deadline elapsed, so the result remains indeterminate and enrollment is refused`
        : `GitHub rebase head was not verifiable within the ${operationBudgetMs}ms absolute deadline; refusing enrollment mutation`,
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
