#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';

const execFileAsync = promisify(execFile);
export const PLAN_SCHEMA = 'jovie-pr-preparation-canary-plan/v1';
export const RECEIPT_SCHEMA = 'jovie-pr-preparation-canary-receipt/v1';
const MAX_PLAN_AGE_MS = 86_400_000;
const REQUIRED_CHECKS =
  'PR Ready,Migration Guard,Fork PR Gate,PR Size Guard'.split(',');
export const HOLD_LABELS = Object.freeze(
  'needs-human,hold,gated,queue-deferred,needs-conflict-resolution,needs-manual-rebase,fast'.split(
    ','
  )
);
const PLAN_KEYS = new Set(
  'schema,repository,baseRef,enabled,expiresAt,maxParallel,entries'.split(',')
);
const ENTRY_KEYS = new Set(
  'number,action,expectedAuthor,expectedHeadOwner,headRefName,headOid'.split(
    ','
  )
);
const ACTIVE = new Set(
  'PENDING,QUEUED,REQUESTED,WAITING,IN_PROGRESS'.split(',')
);
const FAILED = new Set(
  'FAILURE,ERROR,TIMED_OUT,ACTION_REQUIRED,STARTUP_FAILURE,STALE'.split(',')
);

const CHECK_CONTEXT_FIELDS = `nodes{... on CheckRun{__typename name status conclusion} ... on StatusContext{__typename context state}} pageInfo{hasNextPage endCursor} totalCount`;
const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number title state isDraft baseRefName baseRefOid headRefName headRefOid isCrossRepository mergeable mergeStateStatus reviewDecision author{login} headRepositoryOwner{login} headRepository{nameWithOwner} mergeQueueEntry{id position} autoMergeRequest{enabledAt} labels(first:100){nodes{name} pageInfo{hasNextPage endCursor} totalCount} commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100){${CHECK_CONTEXT_FIELDS}}}}}}}}}}`;
const PR_CONTEXT_PAGE_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String!){repository(owner:$owner,name:$name){pullRequest(number:$number){headRefOid commits(last:1){nodes{commit{oid statusCheckRollup{contexts(first:100,after:$cursor){${CHECK_CONTEXT_FIELDS}}}}}}}}}}`;

const isObject = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isSha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
const onlyKeys = (value, allowed) =>
  Object.keys(value).every(key => allowed.has(key));
const hash = value => createHash('sha256').update(value).digest('hex');
export const envelope = value => {
  const { receiptSha256: _discarded, ...body } = value;
  return {
    ...body,
    receiptSha256: hash(`${JSON.stringify(body)}\n`),
  };
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

  return {
    getLatest: () => latest,
    write,
    flush: () => chain,
  };
}

export function validatePlan(plan, { nowMs = Date.now() } = {}) {
  const errors = [];
  if (!isObject(plan)) return { ok: false, errors: ['plan must be an object'] };
  if (!onlyKeys(plan, PLAN_KEYS)) errors.push('plan contains unknown fields');
  if (plan.schema !== PLAN_SCHEMA)
    errors.push(`schema must equal ${PLAN_SCHEMA}`);
  if (plan.repository !== 'JovieInc/Jovie')
    errors.push('repository must equal JovieInc/Jovie');
  if (plan.baseRef !== 'main') errors.push('baseRef must equal main');
  if (typeof plan.enabled !== 'boolean') errors.push('enabled must be boolean');
  if (
    !Number.isInteger(plan.maxParallel) ||
    plan.maxParallel < 1 ||
    plan.maxParallel > 4
  ) {
    errors.push('maxParallel must be an integer from 1 through 4');
  }
  if (!Array.isArray(plan.entries))
    return { ok: false, errors: [...errors, 'entries must be an array'] };
  if (plan.entries.length > 4) errors.push('entries cannot exceed 4');
  if (plan.entries.length > plan.maxParallel)
    errors.push('entries cannot exceed maxParallel');
  if (!plan.enabled && plan.entries.length)
    errors.push('disabled plans must have no entries');
  if (!plan.enabled && plan.expiresAt !== null)
    errors.push('disabled plans must set expiresAt to null');
  if (plan.enabled) {
    const expiry = Date.parse(plan.expiresAt ?? '');
    if (!Number.isFinite(expiry))
      errors.push('enabled plans require a valid expiresAt');
    else if (expiry <= nowMs) errors.push('plan is expired');
    else if (expiry - nowMs > MAX_PLAN_AGE_MS)
      errors.push('expiresAt cannot be more than 24 hours away');
  }
  const seen = {
    number: new Set(),
    headOid: new Set(),
    headRefName: new Set(),
  };
  for (const [index, entry] of plan.entries.entries()) {
    const at = `entries[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (!onlyKeys(entry, ENTRY_KEYS))
      errors.push(`${at} contains unknown fields`);
    if (!Number.isInteger(entry.number) || entry.number < 1)
      errors.push(`${at}.number is invalid`);
    if (entry.action !== 'update_branch_rebase')
      errors.push(`${at}.action is invalid`);
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(entry.expectedAuthor ?? '')
    ) {
      errors.push(`${at}.expectedAuthor is invalid`);
    }
    if (entry.expectedHeadOwner !== 'JovieInc')
      errors.push(`${at}.expectedHeadOwner must equal JovieInc`);
    if (
      typeof entry.headRefName !== 'string' ||
      !/^(?!\/|.*(?:\.\.|refs\/|[\s~^:?*[\\]))[^/].*[^/]$/u.test(
        entry.headRefName
      )
    ) {
      errors.push(`${at}.headRefName is invalid`);
    } else if (entry.headRefName.startsWith('gtmq_')) {
      errors.push(`${at}.headRefName cannot be a Graphite merge-queue ref`);
    }
    if (!isSha(entry.headOid))
      errors.push(`${at}.headOid must be a lowercase 40-character SHA`);
    for (const key of Object.keys(seen)) {
      if (seen[key].has(entry[key])) errors.push(`${at}.${key} is duplicated`);
      seen[key].add(entry[key]);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function createPlanBundle({
  rawPlan,
  plan,
  trustedDefaultBranchSha,
  livePolicy,
  mode = 'dry-run',
  confirmation = '',
  nowMs = Date.now(),
  runId = '',
  runAttempt = '',
}) {
  const validation = validatePlan(plan, { nowMs });
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (!['dry-run', 'apply'].includes(mode))
    throw new Error('mode must be dry-run or apply');
  if (
    !isSha(trustedDefaultBranchSha) ||
    livePolicy.sha !== trustedDefaultBranchSha
  ) {
    throw new Error(
      'trusted plan checkout is not the live default-branch head'
    );
  }
  if (livePolicy.defaultBranch !== plan.baseRef)
    throw new Error('repository default branch changed');
  const planHash = hash(rawPlan);
  if (
    mode === 'apply' &&
    (!plan.enabled || !plan.entries.length || confirmation !== planHash)
  ) {
    throw new Error(
      'apply requires an enabled plan and its exact SHA-256 confirmation'
    );
  }
  const outcome = !plan.enabled
    ? 'no_op_disabled'
    : plan.entries.length
      ? 'planned'
      : 'no_op_empty';
  const matrix = {
    include: plan.entries.map(entry => ({ ...entry, mode, planHash })),
  };
  const receipt = envelope({
    schema: RECEIPT_SCHEMA,
    kind: 'plan',
    repository: plan.repository,
    baseRef: plan.baseRef,
    trustedDefaultBranchSha,
    planHash,
    mode,
    runId: String(runId),
    runAttempt: String(runAttempt),
    observedAt: new Date(nowMs).toISOString(),
    outcome,
    entryCount: plan.entries.length,
    maxParallel: plan.maxParallel,
    entries: plan.entries,
  });
  return { planHash, matrix, receipt, outcome };
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
  ) {
    return no('no_op_base_changed', 'default branch or exact base changed');
  }
  if (pr.number !== entry.number || pr.state !== 'OPEN' || pr.isDraft)
    return no('no_op_not_ready', 'PR identity or ready state changed');
  if (pr.headRefOid !== entry.headOid)
    return no('no_op_stale_head', 'PR head changed');
  if (
    pr.headRefName !== entry.headRefName ||
    pr.author?.login !== entry.expectedAuthor
  )
    return no('no_op_identity_changed', 'head ref or author changed');
  if (
    pr.headRefName.startsWith('gtmq_') ||
    /\[graphite mq\]/iu.test(pr.title ?? '')
  ) {
    return no(
      'no_op_graphite_merge_queue',
      'Graphite merge-queue branches are never preparation targets'
    );
  }
  if (
    pr.isCrossRepository ||
    pr.headRepositoryOwner?.login !== entry.expectedHeadOwner ||
    pr.headRepository?.nameWithOwner !== plan.repository
  ) {
    return no(
      'no_op_external_head',
      'PR is not the exact same-repository head'
    );
  }
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
    return no('no_op_not_mergeable', 'GitHub does not report mergeable');
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
  ) {
    throw new Error(
      'GitHub statusCheckRollup contexts page was incomplete; refusing eligibility'
    );
  }
  if (
    expected.headRefOid &&
    (pr.headRefOid !== expected.headRefOid || commit.oid !== expected.commitOid)
  ) {
    throw new Error(
      'PR head changed while paginating statusCheckRollup contexts'
    );
  }
  if (
    contexts.pageInfo.hasNextPage &&
    (typeof contexts.pageInfo.endCursor !== 'string' ||
      !contexts.pageInfo.endCursor)
  ) {
    throw new Error(
      'GitHub statusCheckRollup pagination omitted the next cursor'
    );
  }
  return { commit, contexts };
}

export async function fetchPrSnapshot(
  repo,
  number,
  { ghJsonImpl = ghJson, timeoutMs = 30_000 } = {}
) {
  const [owner, name] = repo.split('/');
  const response = await ghJsonImpl(
    [
      'api',
      'graphql',
      '-f',
      `query=${PR_QUERY}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${number}`,
    ],
    { timeoutMs }
  );
  const pr = response?.data?.repository?.pullRequest;
  if (!pr) return null;
  if (
    !Array.isArray(pr.labels?.nodes) ||
    pr.labels?.pageInfo?.hasNextPage !== false ||
    pr.labels.totalCount !== pr.labels.nodes.length
  ) {
    throw new Error(
      'GitHub labels page was incomplete; refusing to infer current hold state'
    );
  }
  const first = readContextPage(pr);
  const expected = { headRefOid: pr.headRefOid, commitOid: first.commit.oid };
  const contexts = [...first.contexts.nodes];
  const seenCursors = new Set();
  let pageInfo = first.contexts.pageInfo;
  const totalCount = first.contexts.totalCount;
  while (pageInfo.hasNextPage) {
    if (seenCursors.has(pageInfo.endCursor)) {
      throw new Error('GitHub statusCheckRollup pagination repeated a cursor');
    }
    seenCursors.add(pageInfo.endCursor);
    const pageResponse = await ghJsonImpl(
      [
        'api',
        'graphql',
        '-f',
        `query=${PR_CONTEXT_PAGE_QUERY}`,
        '-f',
        `owner=${owner}`,
        '-f',
        `name=${name}`,
        '-F',
        `number=${number}`,
        '-f',
        `cursor=${pageInfo.endCursor}`,
      ],
      { timeoutMs }
    );
    const pagePr = pageResponse?.data?.repository?.pullRequest;
    if (!pagePr) {
      throw new Error('PR disappeared while paginating statusCheckRollup');
    }
    const page = readContextPage(pagePr, expected);
    if (page.contexts.totalCount !== totalCount) {
      throw new Error(
        'GitHub statusCheckRollup context count changed during pagination'
      );
    }
    contexts.push(...page.contexts.nodes);
    if (contexts.length > totalCount) {
      throw new Error(
        'GitHub statusCheckRollup pagination returned duplicate or excess contexts'
      );
    }
    pageInfo = page.contexts.pageInfo;
  }
  if (contexts.length !== totalCount) {
    throw new Error(
      'GitHub statusCheckRollup pagination ended before all contexts were read'
    );
  }
  return {
    ...pr,
    labels: pr.labels?.nodes ?? [],
    statusCheckRollup: contexts,
  };
}

export function cancelledReceipt(receipt, signal, nowMs = Date.now()) {
  return {
    ...receipt,
    completedAt: new Date(nowMs).toISOString(),
    outcome: 'cancelled_indeterminate',
    reason: `runner received ${signal}; reconcile the exact planned head before retry`,
    mutationAttempted: null,
    mutationApplied: null,
  };
}

function errorReceipt(receipt, error, nowMs = Date.now()) {
  return {
    ...receipt,
    completedAt: new Date(nowMs).toISOString(),
    outcome: 'error',
    reason: String(error?.message ?? error),
  };
}

function bootstrapReceipt(kind, options, nowMs = Date.now()) {
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
    for (const [signal, handler] of handlers) {
      processImpl.removeListener(signal, handler);
    }
  };
}

export async function runPreparedEntry(options, dependencies = {}) {
  const now = dependencies.nowImpl ?? Date.now;
  const ownedWriter = dependencies.writeReceiptImpl
    ? null
    : createAtomicReceiptWriter(options.receiptPath);
  const save =
    dependencies.writeReceiptImpl ??
    (async (_path, value) => ownedWriter.write(value));
  const fetchPolicy =
    dependencies.fetchRepositoryPolicyImpl ?? fetchRepositoryPolicy;
  const fetchPr = dependencies.fetchPrImpl ?? fetchPrSnapshot;
  let receipt = bootstrapReceipt('item', options, now());
  const persist = async next => {
    receipt = next;
    options.onReceipt?.(receipt);
    await save(options.receiptPath, receipt);
  };
  try {
    await persist(receipt);
    const rawPlan = await readFile(options.planPath, 'utf8');
    const plan = JSON.parse(rawPlan);
    const validation = validatePlan(plan, { nowMs: now() });
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    if (!['dry-run', 'apply'].includes(options.mode))
      throw new Error('mode must be dry-run or apply');
    const planHash = hash(rawPlan);
    if (planHash !== options.planHash) throw new Error('plan SHA-256 changed');
    if (options.mode === 'apply' && options.confirmation !== planHash)
      throw new Error('apply confirmation does not match plan');
    const entry = plan.entries.find(
      candidate => candidate.number === options.prNumber
    );
    if (!entry) throw new Error('planned PR entry is missing');
    await persist({
      ...receipt,
      repository: plan.repository,
      baseRef: plan.baseRef,
      trustedDefaultBranchSha: options.trustedDefaultBranchSha,
      planHash,
      pr: entry.number,
      entry,
      outcome: 'started',
      reason: 'validated plan receipt persisted before live GitHub reads',
    });
    const livePolicy = await fetchPolicy(plan.repository);
    if (
      livePolicy.sha !== options.trustedDefaultBranchSha ||
      livePolicy.defaultBranch !== plan.baseRef
    ) {
      await persist({
        ...receipt,
        completedAt: new Date(now()).toISOString(),
        outcome: 'no_op_default_branch_changed',
        reason: 'live default branch moved after plan checkout',
      });
      return receipt;
    }
    const pr = await fetchPr(plan.repository, entry.number);
    const eligibility = evaluateEligibility({ entry, plan, pr, livePolicy });
    if (!eligibility.eligible) {
      await persist({
        ...receipt,
        completedAt: new Date(now()).toISOString(),
        outcome: eligibility.outcome,
        reason: eligibility.reason,
        observedHeadOid: pr?.headRefOid ?? null,
      });
      return receipt;
    }
    const rebase = await (dependencies.rebaseImpl ?? tryGitHubRebase)({
      repo: plan.repository,
      pr: { number: entry.number, headRefName: entry.headRefName },
      expectedBaseRefName: plan.baseRef,
      expectedBaseOid: options.trustedDefaultBranchSha,
      expectedHeadOid: entry.headOid,
      dryRun: options.mode !== 'apply',
      preMutationCheckImpl: async ({ timeoutMs }) => {
        const currentPolicy = await fetchPolicy(plan.repository, { timeoutMs });
        const currentPr = await fetchPr(plan.repository, entry.number, {
          timeoutMs,
        });
        const currentEligibility = evaluateEligibility({
          entry,
          plan,
          pr: currentPr,
          livePolicy: currentPolicy,
        });
        return {
          ok: currentEligibility.eligible,
          category: currentEligibility.outcome,
          reason: currentEligibility.eligible
            ? 'current queue, auto-merge, hold, review, and check state revalidated'
            : `pre-mutation eligibility changed: ${currentEligibility.reason}`,
          observedHeadOid: currentPr?.headRefOid ?? null,
        };
      },
    });
    const outcome =
      options.mode !== 'apply'
        ? 'eligible_dry_run'
        : rebase.ok && rebase.updated
          ? 'updated'
          : rebase.ok
            ? 'no_op_already_integrated'
            : 'update_failed';
    await persist({
      ...receipt,
      completedAt: new Date(now()).toISOString(),
      outcome,
      reason: rebase.reason,
      expectedHeadOid: rebase.expectedHeadOid ?? entry.headOid,
      observedHeadOid: rebase.observedHeadOid ?? entry.headOid,
      mutationAttempted: Boolean(rebase.mutationAttempted),
      mutationApplied: Boolean(rebase.mutationApplied),
      category: rebase.category ?? null,
    });
    return receipt;
  } catch (error) {
    try {
      await persist(errorReceipt(receipt, error, now()));
    } catch (receiptError) {
      console.error(
        `could not update failure receipt: ${receiptError.message}`
      );
    }
    throw error;
  }
}

export async function runPlanCommand(options, dependencies = {}) {
  const now = dependencies.nowImpl ?? Date.now;
  const ownedWriter = dependencies.writeReceiptImpl
    ? null
    : createAtomicReceiptWriter(options.receiptPath);
  const save =
    dependencies.writeReceiptImpl ??
    (async (_path, value) => ownedWriter.write(value));
  let receipt = bootstrapReceipt('plan', options, now());
  const persist = async next => {
    receipt = next;
    options.onReceipt?.(receipt);
    await save(options.receiptPath, receipt);
  };
  try {
    await persist(receipt);
    const rawPlan = await readFile(options.planPath, 'utf8');
    const plan = JSON.parse(rawPlan);
    const validation = validatePlan(plan, { nowMs: now() });
    if (!validation.ok) throw new Error(validation.errors.join('; '));
    const trustedDefaultBranchSha = options.trustedDefaultBranchSha;
    const livePolicy = await (
      dependencies.fetchRepositoryPolicyImpl ?? fetchRepositoryPolicy
    )(plan.repository);
    const bundle = createPlanBundle({
      rawPlan,
      plan,
      trustedDefaultBranchSha,
      livePolicy,
      mode: options.mode,
      confirmation: options.confirmation,
      runId: options.runId,
      runAttempt: options.runAttempt,
      nowMs: now(),
    });
    await persist(bundle.receipt);
    await (dependencies.writeFileImpl ?? writeFile)(
      options.matrixPath,
      `${JSON.stringify(bundle.matrix)}\n`
    );
    return bundle;
  } catch (error) {
    try {
      await persist(errorReceipt(receipt, error, now()));
    } catch (receiptError) {
      console.error(
        `could not update failure receipt: ${receiptError.message}`
      );
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = { command: argv.shift(), mode: 'dry-run', confirmation: '' };
  while (argv.length) {
    const flag = argv.shift();
    if (!flag?.startsWith('--')) throw new Error(`unknown argument ${flag}`);
    options[
      flag.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())
    ] = argv.shift();
  }
  return options;
}
const need = (options, key) =>
  options[key] ||
  (() => {
    throw new Error(`--${key} is required`);
  })();

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

export async function runCli(argv) {
  const receiptPath = flagValue(argv, '--receipt');
  if (!receiptPath) throw new Error('--receipt is required');
  const writer = createAtomicReceiptWriter(receiptPath);
  const command = argv[0] ?? 'unknown';
  const initial = bootstrapReceipt(command === 'plan' ? 'plan' : 'item', {
    mode: flagValue(argv, '--mode') ?? 'dry-run',
    planHash: flagValue(argv, '--plan-hash'),
    trustedDefaultBranchSha: flagValue(argv, '--trusted-default-sha'),
    prNumber: Number(flagValue(argv, '--pr')) || null,
    runId: flagValue(argv, '--run-id'),
    runAttempt: flagValue(argv, '--run-attempt'),
  });
  const initialWrite = writer.write(initial);
  const removeSignalHandlers = installProcessSignalHandlers({
    getLatest: writer.getLatest,
    writeReceiptImpl: writer.write,
  });
  try {
    await initialWrite;
    const options = parseArgs([...argv]);
    const planPath = need(options, 'plan');
    if (options.command === 'plan') {
      const trustedDefaultBranchSha = need(options, 'trustedDefaultSha');
      const bundle = await runPlanCommand(
        {
          planPath,
          trustedDefaultBranchSha,
          mode: options.mode,
          confirmation: options.confirmation,
          runId: options.runId,
          runAttempt: options.runAttempt,
          matrixPath: need(options, 'matrix'),
          receiptPath,
        },
        {
          writeReceiptImpl: async (_path, value) => writer.write(value),
        }
      );
      console.log(
        JSON.stringify({
          planHash: bundle.planHash,
          trustedDefaultBranchSha,
          hasEntries: bundle.matrix.include.length > 0,
          outcome: bundle.outcome,
        })
      );
      return bundle.receipt;
    }
    if (options.command !== 'run')
      throw new Error('command must be plan or run');
    const result = await runPreparedEntry(
      {
        planPath,
        planHash: need(options, 'planHash'),
        trustedDefaultBranchSha: need(options, 'trustedDefaultSha'),
        mode: options.mode,
        confirmation: options.confirmation,
        prNumber: Number(need(options, 'pr')),
        receiptPath,
        runId: options.runId,
        runAttempt: options.runAttempt,
      },
      {
        writeReceiptImpl: async (_path, value) => writer.write(value),
      }
    );
    console.log(JSON.stringify(result));
    if (['update_failed', 'error'].includes(result.outcome))
      process.exitCode = 1;
    return result;
  } catch (error) {
    await writer.write(errorReceipt(writer.getLatest() ?? initial, error));
    throw error;
  } finally {
    removeSignalHandlers();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch(error => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
