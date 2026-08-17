#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';
import {
  bootstrapReceipt,
  cancelledReceipt,
  createAtomicReceiptWriter,
  envelope,
  errorReceipt,
  evaluateEligibility,
  fetchPrSnapshot,
  fetchRepositoryPolicy,
  HOLD_LABELS,
  installProcessSignalHandlers,
  RECEIPT_SCHEMA,
} from './lib/pr-preparation-safety.mjs';

export {
  cancelledReceipt,
  createAtomicReceiptWriter,
  evaluateEligibility,
  fetchPrSnapshot,
  fetchRepositoryPolicy,
  HOLD_LABELS,
  installProcessSignalHandlers,
  RECEIPT_SCHEMA,
};

export const PLAN_SCHEMA = 'jovie-pr-preparation-canary-plan/v1';
const MAX_PLAN_AGE_MS = 86_400_000;
const PLAN_KEYS = new Set(
  'schema,repository,baseRef,enabled,expiresAt,maxParallel,entries'.split(',')
);
const ENTRY_KEYS = new Set(
  'number,action,expectedAuthor,expectedHeadOwner,headRefName,headOid'.split(
    ','
  )
);

const isObject = value =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isSha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
const onlyKeys = (value, allowed) =>
  Object.keys(value).every(key => allowed.has(key));
const hash = value => createHash('sha256').update(value).digest('hex');

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
