import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const RECEIPT_SCHEMA = 'jovie-pr-preparation-canary-receipt/v1';
const REQUIRED_CHECKS =
  'PR Ready,Migration Guard,Fork PR Gate,PR Size Guard'.split(',');
export const HOLD_LABELS = Object.freeze(
  'needs-human,hold,gated,queue-deferred,needs-conflict-resolution,needs-manual-rebase,fast'.split(
    ','
  )
);
const ACTIVE = new Set(
  'QUEUED,IN_PROGRESS,WAITING,PENDING,EXPECTED,REQUESTED'.split(',')
);
const FAILED = new Set(
  'FAILURE,ERROR,TIMED_OUT,ACTION_REQUIRED,STARTUP_FAILURE,STALE'.split(',')
);
const CHECK_CONTEXT_FIELDS = `nodes{... on CheckRun{__typename name status conclusion} ... on StatusContext{__typename context state}} pageInfo{hasNextPage endCursor} totalCount`;
const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number title state isDraft baseRefName baseRefOid headRefName headRefOid isCrossRepository mergeable mergeStateStatus reviewDecision author{login} headRepositoryOwner{login} headRepository{nameWithOwner} mergeQueueEntry{id position} autoMergeRequest{enabledAt} labels(first:100){nodes{name} pageInfo{hasNextPage endCursor} totalCount} commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){${CHECK_CONTEXT_FIELDS}}}}}}}}}}`;
const PR_CONTEXT_PAGE_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$cursor){${CHECK_CONTEXT_FIELDS}}}}}}}}}}`;
const PR_INVARIANT_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number title state isDraft baseRefName baseRefOid headRefName headRefOid isCrossRepository mergeable mergeStateStatus reviewDecision author{login} headRepositoryOwner{login} headRepository{nameWithOwner} mergeQueueEntry{id position} autoMergeRequest{enabledAt} labels(first:100){nodes{name} pageInfo{hasNextPage endCursor} totalCount}}}}}`;

const hash = value => createHash('sha256').update(value).digest('hex');

export function createApplyConfirmation({
  planHash,
  controllerSha,
  dryRunReceiptSha256,
}) {
  return hash(
    `jovie-pr-preparation-apply/v1\n${planHash}\n${controllerSha}\n${dryRunReceiptSha256}\n`
  );
}

export function validateApplyEvidence(options, entry) {
  const dryRun = options.dryRunReceipt;
  if (!dryRun || typeof dryRun !== 'object' || Array.isArray(dryRun))
    throw new Error('apply requires a dry-run receipt');
  const { receiptSha256, ...body } = dryRun;
  if (envelope(body).receiptSha256 !== receiptSha256)
    throw new Error('dry-run receipt integrity check failed');
  if (
    !/^[0-9a-f]{40}$/u.test(options.controllerSha ?? '') ||
    options.controllerSha !== options.trustedDefaultBranchSha ||
    dryRun.kind !== 'item' ||
    dryRun.mode !== 'dry-run' ||
    dryRun.outcome !== 'eligible_dry_run' ||
    dryRun.planHash !== options.planHash ||
    dryRun.trustedDefaultBranchSha !== options.trustedDefaultBranchSha ||
    dryRun.pr !== entry.number ||
    dryRun.expectedHeadOid !== entry.headOid ||
    dryRun.observedHeadOid !== entry.headOid ||
    dryRun.mutationAttempted !== false ||
    dryRun.mutationApplied !== false
  )
    throw new Error(
      'apply requires a matching trusted-main exact-head dry-run receipt'
    );
  const expected = createApplyConfirmation({
    planHash: options.planHash,
    controllerSha: options.controllerSha,
    dryRunReceiptSha256: receiptSha256,
  });
  if (options.confirmation !== expected)
    throw new Error('apply confirmation does not match bound dry-run evidence');
}

export const envelope = value => {
  const { receiptSha256: _discarded, ...body } = value;
  return { ...body, receiptSha256: hash(`${JSON.stringify(body)}\n`) };
};

export function createAtomicReceiptWriter(path, dependencies = {}) {
  const target = resolve(path);
  const writeFileImpl = dependencies.writeFileImpl ?? writeFile;
  const renameImpl = dependencies.renameImpl ?? rename;
  const unlinkImpl = dependencies.unlinkImpl ?? unlink;
  const randomIdImpl = dependencies.randomIdImpl ?? randomUUID;
  const beforeRenameImpl = dependencies.beforeRenameImpl ?? (async () => {});
  let chain = Promise.resolve();
  let latest = null;
  let sealed = false;

  const write = (value, { terminal = false } = {}) => {
    if (sealed) return chain.then(() => latest);
    if (terminal) sealed = true;
    latest = envelope(value);
    const captured = latest;
    const temporary = `${target}.tmp-${process.pid}-${randomIdImpl()}`;
    const operation = chain
      .catch(() => {})
      .then(async () => {
        try {
          await writeFileImpl(
            temporary,
            `${JSON.stringify(captured, null, 2)}\n`
          );
          await beforeRenameImpl({ temporary, target, receipt: captured });
          await renameImpl(temporary, target);
        } catch (error) {
          await unlinkImpl(temporary).catch(() => {});
          throw error;
        }
        return captured;
      });
    chain = operation;
    return operation;
  };
  return { getLatest: () => latest, write, flush: () => chain };
}

const checkState = check =>
  String(
    check.__typename === 'StatusContext'
      ? check.state
      : ((check.status && check.status !== 'COMPLETED'
          ? check.status
          : check.conclusion) ?? '')
  ).toUpperCase();
const checkName = check =>
  String(check.name ?? check.context ?? '')
    .replace(/^CI\s*\/\s*/iu, '')
    .trim();

function requiredChecksGreen(checks = []) {
  if (checks.some(check => ACTIVE.has(checkState(check)))) return false;
  return REQUIRED_CHECKS.every(name => {
    const matches = checks.filter(check => checkName(check) === name);
    return (
      matches.some(check => checkState(check) === 'SUCCESS') &&
      !matches.some(check => FAILED.has(checkState(check)))
    );
  });
}

export function evaluateEligibility({ entry, plan, pr, livePolicy }) {
  const no = (outcome, reason) => ({ eligible: false, outcome, reason });
  if (!pr) return no('no_op_missing_pr', 'planned PR no longer exists');
  if (
    livePolicy.defaultBranch !== plan.baseRef ||
    livePolicy.sha !== pr.baseRefOid ||
    pr.baseRefName !== plan.baseRef
  )
    return no('no_op_base_changed', 'default branch or exact base changed');
  if (pr.number !== entry.number || pr.state !== 'OPEN' || pr.isDraft)
    return no('no_op_not_ready', 'PR identity or ready state changed');
  if (pr.headRefOid !== entry.headOid)
    return no('no_op_stale_head', 'planned head is no longer current');
  if (
    pr.headRefName !== entry.headRefName ||
    pr.author?.login !== entry.expectedAuthor
  )
    return no('no_op_identity_changed', 'head ref or author changed');
  if (
    pr.headRefName.startsWith('gtmq_') ||
    /\[graphite mq\]/iu.test(pr.title ?? '')
  )
    return no(
      'no_op_graphite_merge_queue',
      'Graphite merge-queue branches are never preparation targets'
    );
  if (
    pr.isCrossRepository ||
    pr.headRepositoryOwner?.login !== entry.expectedHeadOwner ||
    pr.headRepository?.nameWithOwner !== plan.repository
  )
    return no(
      'no_op_external_head',
      'PR is not the exact same-repository head'
    );
  if (pr.mergeQueueEntry || pr.autoMergeRequest)
    return no(
      'no_op_already_admitted',
      'PR already has queue or auto-merge state'
    );
  const labels = new Set((pr.labels ?? []).map(label => label.name ?? label));
  const hold = HOLD_LABELS.find(label => labels.has(label));
  if (hold) return no('no_op_held', `PR carries safety hold ${hold}`);
  if (pr.reviewDecision === 'CHANGES_REQUESTED')
    return no('no_op_changes_requested', 'review changes requested');
  if (pr.mergeable !== 'MERGEABLE')
    return no('no_op_not_mergeable', 'GitHub does not report the PR mergeable');
  if (pr.mergeStateStatus === 'CLEAN')
    return no('no_op_already_integrated', 'base update is unnecessary');
  if (pr.mergeStateStatus !== 'BEHIND')
    return no('no_op_not_behind', 'PR is not clean-behind');
  if (!requiredChecksGreen(pr.statusCheckRollup))
    return no('no_op_checks_not_green', 'required source checks are not green');
  return {
    eligible: true,
    outcome: 'eligible',
    reason: 'all exact plan and eligibility fences passed',
  };
}

async function ghJson(args, { timeoutMs = 30_000 } = {}) {
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  return JSON.parse(stdout);
}

export async function fetchRepositoryPolicy(
  repo,
  { ghJsonImpl = ghJson, timeoutMs = 30_000 } = {}
) {
  const metadata = await ghJsonImpl(['api', `repos/${repo}`], { timeoutMs });
  const ref = await ghJsonImpl(
    [
      'api',
      `repos/${repo}/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`,
    ],
    { timeoutMs }
  );
  return {
    defaultBranch: metadata.default_branch,
    sha: ref?.object?.sha ?? null,
  };
}

function readContextPage(pr, expected = {}) {
  const commit = pr?.commits?.nodes?.[0]?.commit;
  const contexts = commit?.statusCheckRollup?.contexts;
  if (
    !commit?.oid ||
    !contexts ||
    !Array.isArray(contexts.nodes) ||
    typeof contexts.pageInfo?.hasNextPage !== 'boolean' ||
    !Number.isInteger(contexts.totalCount) ||
    contexts.totalCount < 0
  )
    throw new Error(
      'GitHub statusCheckRollup contexts page was incomplete; refusing eligibility'
    );
  if (
    expected.headRefOid &&
    (pr.headRefOid !== expected.headRefOid || commit.oid !== expected.commitOid)
  )
    throw new Error(
      'PR head changed while paginating statusCheckRollup contexts'
    );
  if (
    contexts.pageInfo.hasNextPage &&
    (typeof contexts.pageInfo.endCursor !== 'string' ||
      !contexts.pageInfo.endCursor)
  )
    throw new Error(
      'GitHub statusCheckRollup pagination omitted the next cursor'
    );
  return { commit, contexts };
}

function invariantSnapshot(pr) {
  if (
    !pr ||
    !Array.isArray(pr.labels?.nodes) ||
    pr.labels?.pageInfo?.hasNextPage !== false ||
    pr.labels.totalCount !== pr.labels.nodes.length
  ) {
    throw new Error(
      'GitHub final PR invariant read was incomplete; refusing eligibility'
    );
  }
  return JSON.stringify({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    isDraft: pr.isDraft,
    baseRefName: pr.baseRefName,
    baseRefOid: pr.baseRefOid,
    headRefName: pr.headRefName,
    headRefOid: pr.headRefOid,
    isCrossRepository: pr.isCrossRepository,
    mergeable: pr.mergeable,
    mergeStateStatus: pr.mergeStateStatus,
    reviewDecision: pr.reviewDecision,
    author: pr.author?.login ?? null,
    headRepositoryOwner: pr.headRepositoryOwner?.login ?? null,
    headRepository: pr.headRepository?.nameWithOwner ?? null,
    mergeQueueEntry: pr.mergeQueueEntry ?? null,
    autoMergeRequest: pr.autoMergeRequest ?? null,
    labels: pr.labels.nodes.map(label => label.name).sort(),
  });
}
export async function fetchPrSnapshot(
  repo,
  number,
  { ghJsonImpl = ghJson, timeoutMs = 30_000 } = {}
) {
  const [owner, name] = repo.split('/');
  const request = (query, cursor = null) =>
    ghJsonImpl(
      [
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-f',
        `owner=${owner}`,
        '-f',
        `name=${name}`,
        '-F',
        `number=${number}`,
        ...(cursor ? ['-f', `cursor=${cursor}`] : []),
      ],
      { timeoutMs }
    );
  const response = await request(PR_QUERY);
  const pr = response?.data?.repository?.pullRequest;
  if (!pr) return null;
  if (
    !Array.isArray(pr.labels?.nodes) ||
    pr.labels?.pageInfo?.hasNextPage !== false ||
    pr.labels.totalCount !== pr.labels.nodes.length
  )
    throw new Error(
      'GitHub labels page was incomplete; refusing to infer current hold state'
    );
  const first = readContextPage(pr);
  const expected = { headRefOid: pr.headRefOid, commitOid: first.commit.oid };
  const contexts = [...first.contexts.nodes];
  const seenCursors = new Set();
  let pageInfo = first.contexts.pageInfo;
  const totalCount = first.contexts.totalCount;
  while (pageInfo.hasNextPage) {
    if (seenCursors.has(pageInfo.endCursor))
      throw new Error('GitHub statusCheckRollup pagination repeated a cursor');
    seenCursors.add(pageInfo.endCursor);
    const pageResponse = await request(
      PR_CONTEXT_PAGE_QUERY,
      pageInfo.endCursor
    );
    const pagePr = pageResponse?.data?.repository?.pullRequest;
    if (!pagePr)
      throw new Error('PR disappeared while paginating statusCheckRollup');
    const page = readContextPage(pagePr, expected);
    if (page.contexts.totalCount !== totalCount)
      throw new Error(
        'GitHub statusCheckRollup context count changed during pagination'
      );
    contexts.push(...page.contexts.nodes);
    if (contexts.length > totalCount)
      throw new Error(
        'GitHub statusCheckRollup pagination returned duplicate or excess contexts'
      );
    pageInfo = page.contexts.pageInfo;
  }
  if (contexts.length !== totalCount)
    throw new Error(
      'GitHub statusCheckRollup pagination ended before all contexts were read'
    );
  const finalResponse = await request(PR_INVARIANT_QUERY);
  const finalPr = finalResponse?.data?.repository?.pullRequest;
  if (invariantSnapshot(finalPr) !== invariantSnapshot(pr)) {
    throw new Error(
      'PR queue, hold, review, auto-merge, label, identity, base, or head state changed after statusCheckRollup pagination'
    );
  }
  return {
    ...finalPr,
    labels: finalPr.labels.nodes,
    statusCheckRollup: contexts,
  };
}

export function cancelledReceipt(receipt, signal, nowMs = Date.now()) {
  return {
    ...receipt,
    completedAt: new Date(nowMs).toISOString(),
    outcome: 'cancelled_indeterminate',
    reason: `${signal} received; mutation outcome must be re-read from GitHub`,
    mutationAttempted: null,
    mutationApplied: null,
    observedHeadOid: null,
    requiresExactRereadBeforeRetry: true,
  };
}

export function errorReceipt(receipt, error, nowMs = Date.now()) {
  return {
    ...receipt,
    completedAt: new Date(nowMs).toISOString(),
    outcome: 'error',
    reason: String(error?.message ?? error),
  };
}

export function bootstrapReceipt(kind, options, nowMs = Date.now()) {
  return {
    schema: RECEIPT_SCHEMA,
    kind,
    repository: null,
    baseRef: null,
    trustedDefaultBranchSha: options.trustedDefaultBranchSha ?? null,
    planHash: options.planHash ?? null,
    mode: options.mode ?? 'dry-run',
    runId: String(options.runId ?? ''),
    runAttempt: String(options.runAttempt ?? ''),
    pr: Number.isInteger(options.prNumber) ? options.prNumber : null,
    startedAt: new Date(nowMs).toISOString(),
    completedAt: null,
    outcome: 'initializing',
    reason: 'receipt persisted before plan parsing or validation',
    mutationAttempted: false,
    mutationApplied: false,
  };
}

export function installProcessSignalHandlers({
  getLatest,
  writeReceiptImpl,
  nowImpl = Date.now,
  exitImpl = code => process.exit(code),
  processImpl = process,
}) {
  let handling = false;
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      if (handling) return;
      handling = true;
      const latest = getLatest();
      Promise.resolve(
        latest
          ? writeReceiptImpl(cancelledReceipt(latest, signal, nowImpl()), {
              terminal: true,
            })
          : undefined
      )
        .catch(error => {
          console.error(
            `could not persist ${signal} receipt: ${error.message}`
          );
        })
        .finally(() => exitImpl(signal === 'SIGINT' ? 130 : 143));
    };
    handlers.set(signal, handler);
    processImpl.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers)
      processImpl.removeListener(signal, handler);
  };
}
