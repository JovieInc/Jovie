#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';

const execFileAsync = promisify(execFile);
export const PLAN_SCHEMA = 'jovie-pr-preparation-canary-plan/v1';
const RECEIPT_SCHEMA = 'jovie-pr-preparation-canary-receipt/v1';
const MAX_PLAN_AGE_MS = 86_400_000;
const REQUIRED_CHECKS =
  'PR Ready,Migration Guard,Fork PR Gate,PR Size Guard'.split(',');
const HOLD_LABELS =
  'needs-human,hold,gated,queue-deferred,needs-conflict-resolution,needs-manual-rebase'.split(
    ','
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

const PR_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number state isDraft baseRefName baseRefOid headRefName headRefOid isCrossRepository mergeable mergeStateStatus reviewDecision author{login} headRepositoryOwner{login} headRepository{nameWithOwner} mergeQueueEntry{id position} autoMergeRequest{enabledAt} labels(first:100){nodes{name}} commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{... on CheckRun{__typename name status conclusion} ... on StatusContext{__typename context state}}}}}}}}}}}`;

const isObject = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isSha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
const onlyKeys = (value, allowed) =>
  Object.keys(value).every(key => allowed.has(key));
const hash = value => createHash('sha256').update(value).digest('hex');
const envelope = value => ({
  ...value,
  receiptSha256: hash(`${JSON.stringify(value)}\n`),
});

async function writeReceipt(path, value) {
  const target = resolve(path);
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(envelope(value), null, 2)}\n`);
  await rename(temporary, target);
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

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30_000,
    killSignal: 'SIGKILL',
  });
  return JSON.parse(stdout);
}

export async function fetchRepositoryPolicy(repo) {
  const metadata = await ghJson(['api', `repos/${repo}`]);
  const ref = await ghJson([
    'api',
    `repos/${repo}/git/ref/heads/${encodeURIComponent(metadata.default_branch)}`,
  ]);
  return {
    defaultBranch: metadata.default_branch,
    sha: ref?.object?.sha ?? null,
  };
}

export async function fetchPrSnapshot(repo, number) {
  const [owner, name] = repo.split('/');
  const response = await ghJson([
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
  ]);
  const pr = response?.data?.repository?.pullRequest;
  if (!pr) return null;
  return {
    ...pr,
    labels: pr.labels?.nodes ?? [],
    statusCheckRollup:
      pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [],
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

export async function runPreparedEntry(options, dependencies = {}) {
  const now = dependencies.nowImpl ?? Date.now;
  const save = dependencies.writeReceiptImpl ?? writeReceipt;
  const rawPlan = await readFile(options.planPath);
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
  let receipt = {
    schema: RECEIPT_SCHEMA,
    kind: 'item',
    repository: plan.repository,
    baseRef: plan.baseRef,
    trustedDefaultBranchSha: options.trustedDefaultBranchSha,
    planHash,
    mode: options.mode,
    runId: String(options.runId),
    runAttempt: String(options.runAttempt),
    pr: entry.number,
    entry,
    startedAt: new Date(now()).toISOString(),
    completedAt: null,
    outcome: 'started',
    reason: 'receipt persisted before live GitHub reads',
    mutationAttempted: false,
    mutationApplied: false,
  };
  const persist = async next => {
    receipt = next;
    await save(options.receiptPath, receipt);
    options.onReceipt?.(receipt);
  };
  await persist(receipt);
  try {
    const livePolicy = await (
      dependencies.fetchRepositoryPolicyImpl ?? fetchRepositoryPolicy
    )(plan.repository);
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
    const pr = await (dependencies.fetchPrImpl ?? fetchPrSnapshot)(
      plan.repository,
      entry.number
    );
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
    await persist({
      ...receipt,
      completedAt: new Date(now()).toISOString(),
      outcome: 'error',
      reason: error.message,
    });
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const planPath = need(options, 'plan');
  if (options.command === 'plan') {
    const rawPlan = await readFile(planPath);
    const plan = JSON.parse(rawPlan);
    const trustedDefaultBranchSha = need(options, 'trustedDefaultSha');
    const bundle = createPlanBundle({
      rawPlan,
      plan,
      trustedDefaultBranchSha,
      livePolicy: await fetchRepositoryPolicy(plan.repository),
      mode: options.mode,
      confirmation: options.confirmation,
      runId: options.runId,
      runAttempt: options.runAttempt,
    });
    await writeFile(
      need(options, 'matrix'),
      `${JSON.stringify(bundle.matrix)}\n`
    );
    await writeFile(
      need(options, 'receipt'),
      `${JSON.stringify(bundle.receipt, null, 2)}\n`
    );
    console.log(
      JSON.stringify({
        planHash: bundle.planHash,
        trustedDefaultBranchSha,
        hasEntries: bundle.matrix.include.length > 0,
        outcome: bundle.outcome,
      })
    );
    return;
  }
  if (options.command !== 'run') throw new Error('command must be plan or run');
  let latest;
  const receiptPath = need(options, 'receipt');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, async () => {
      if (latest)
        await writeReceipt(receiptPath, cancelledReceipt(latest, signal));
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  const result = await runPreparedEntry({
    planPath,
    planHash: need(options, 'planHash'),
    trustedDefaultBranchSha: need(options, 'trustedDefaultSha'),
    mode: options.mode,
    confirmation: options.confirmation,
    prNumber: Number(need(options, 'pr')),
    receiptPath,
    runId: options.runId,
    runAttempt: options.runAttempt,
    onReceipt: value => {
      latest = value;
    },
  });
  console.log(JSON.stringify(result));
  if (['update_failed', 'error'].includes(result.outcome)) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
