#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HOSTED_REPAIR_POLICY_VERSION =
  'jovie-hosted-ci-remediation/2026-08-29';
export const HOSTED_REPAIR_REPOSITORY = 'JovieInc/Jovie';

export const HOSTED_REPAIR_PLAN_SCHEMA = 'jovie-hosted-ci-repair-plan/v1';
export const HOSTED_ACCEPTANCE_RECEIPT_SCHEMA =
  'jovie-hosted-ci-acceptance-receipt/v1';
export const HOSTED_TEST_RECEIPT_SCHEMA = 'jovie-hosted-ci-test-receipt/v1';
export const HOSTED_TERMINAL_RECEIPT_SCHEMA =
  'jovie-hosted-ci-terminal-receipt/v1';
export const HOSTED_REPAIR_MAX_CONCURRENT = 1;
export const HOSTED_REPAIR_MAX_FILES = 8;
export const HOSTED_REPAIR_MAX_PATCH_BYTES = 512 * 1024;
export const HOSTED_GATE_MAX_AGE_MS = 5 * 60 * 1000;
export const HOSTED_ACCEPTANCE_TTL_MS = 45 * 60 * 1000;
export const HOSTED_REPAIR_NODE_COMMAND = 'node';
export const HOSTED_REPAIR_STOP_LABELS = Object.freeze(['hold', 'gated']);
const HOSTED_VERIFICATION_ENV_KEYS = Object.freeze(
  'CI HOME LANG LC_ALL PATH PNPM_HOME TMPDIR XDG_CACHE_HOME'.split(' ')
);

export function hostedRepairTestCommands(plan, changes) {
  const paths = validateHostedChanges(changes).map(change => change.path);
  return [
    { command: 'pnpm', args: ['biome', 'check', ...paths] },
    { command: 'pnpm', args: ['run', 'typecheck'] },
    {
      command: HOSTED_REPAIR_NODE_COMMAND,
      args: [
        'scripts/run-affected-tests.mjs',
        '--base',
        plan.expectedHeadOid,
        '--changed-files-json',
        JSON.stringify(paths),
      ],
    },
  ];
}
const HOSTED_ALLOWED_PATH_RE = Object.freeze([
  /^apps\/web\/(?:app|components|hooks|lib|types)\/.+\.(?:[cm]?[jt]sx?)$/,
  /^packages\/[^/]+\/src\/.+\.(?:[cm]?[jt]sx?)$/,
]);
const HOSTED_DENIED_PATH_RE = Object.freeze([
  /(^|\/)\.github(\/|$)/i,
  /(^|\/)\.(?:agents|claude|codex|cursor)(\/|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(?:credential|secret|token|private[-_]?key|\.pem$|\.p12$|\.key$)/i,
  /(^|\/)(?:drizzle|migrations?)(?:[._-]|\/|$)/i,
  /(^|\/)[@()]*(?:auth|authentication|oauth|clerk|sessions?)(?:[)._/-]|$)/i,
  /(?:^|\/)[@()]*(?:billing|payments?|stripe|entitlements?)(?:[)._/-]|$)/i,
  /(?:^|\/)[@()]*(?:release|deployments?|deploy|vercel)(?:[)._/-]|$)/i,
  /(?:^|\/)proxy\.ts$/i,
  /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|turbo\.json|biome\.jsonc?)$/i,
  /(?:^|\/)(?:tests?|__tests__|__snapshots__)(?:\/|$)/i,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/i,
  /scripts\/lib\/(?:rolling-ci|safe-pr-remediation)/i,
]);
const CREATE_HOSTED_COMMIT_MUTATION = `mutation HostedCiRepair($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit { oid url }
  }
}`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function assertExactSha(value, name) {
  if (!/^[0-9a-f]{40}$/.test(String(value ?? ''))) {
    throw new Error(`${name} must be an exact lowercase SHA`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function assertSafeHeadRef(value) {
  const ref = String(value ?? '');
  if (
    !ref ||
    ref === 'main' ||
    ref.startsWith('refs/') ||
    ref.startsWith('gh-readonly-queue/') ||
    /(?:\.\.|[\s~^:?*\\[]|@\{|\.$|\/$)/.test(ref)
  ) {
    throw new Error('headRefName is main, synthetic, or not a safe branch ref');
  }
  return ref;
}

function assertHostedRepairPlan(plan) {
  if (
    plan?.schema !== HOSTED_REPAIR_PLAN_SCHEMA ||
    plan.policyVersion !== HOSTED_REPAIR_POLICY_VERSION ||
    plan.repository !== HOSTED_REPAIR_REPOSITORY ||
    plan.producerEvent !== 'pull_request' ||
    typeof plan.fingerprint !== 'string' ||
    !plan.fingerprint.startsWith('ci:')
  ) {
    throw new Error('invalid hosted repair plan authority');
  }
  assertPositiveInteger(plan.prNumber, 'prNumber');
  assertPositiveInteger(plan.workflowRunAttempt, 'workflowRunAttempt');
  if (!/^\d+$/.test(String(plan.workflowRunId ?? ''))) {
    throw new Error('workflowRunId must be numeric');
  }
  if (!/^\d+$/.test(String(plan.checkSuiteId ?? ''))) {
    throw new Error('checkSuiteId must be numeric');
  }
  assertExactSha(plan.expectedHeadOid, 'expectedHeadOid');
  assertExactSha(plan.trustedPolicyOid, 'trustedPolicyOid');
  assertSafeHeadRef(plan.headRefName);
  const expectedKey = [
    plan.repository,
    `pr-${plan.prNumber}`,
    plan.expectedHeadOid,
    plan.fingerprint,
    plan.policyVersion,
  ].join(':');
  if (plan.idempotencyKey !== expectedKey) {
    throw new Error('hosted repair idempotency key is not exact-head bound');
  }
  return plan;
}

/** Build the immutable authority passed from the trusted controller. */
export function buildHostedRepairPlan(input = {}) {
  const event = input.dispatch?.events?.find(
    candidate =>
      candidate.fingerprint === input.dispatch?.state?.claim?.fingerprint
  );
  if (
    input.dispatch?.mutate !== true ||
    !['dispatch_implementer', 'dispatch_superseding_head'].includes(
      input.dispatch?.action
    ) ||
    !event
  ) {
    throw new Error('dispatch does not authorize a hosted repair');
  }
  const plan = {
    schema: HOSTED_REPAIR_PLAN_SCHEMA,
    policyVersion: HOSTED_REPAIR_POLICY_VERSION,
    repository: event.repository,
    prNumber: event.pr,
    expectedHeadOid: event.head,
    trustedPolicyOid: input.trustedPolicyOid,
    headRefName: assertSafeHeadRef(input.headRefName),
    producerEvent: event.source?.producerEvent,
    workflowRunId: event.workflowRunId,
    workflowRunAttempt: event.attempt,
    checkSuiteId: event.checkSuiteId,
    fingerprint: event.fingerprint,
    failedChecks: (input.dispatch.events ?? []).map(candidate => ({
      check: candidate.check,
      failedSteps: [...(candidate.failedSteps ?? [])],
    })),
    idempotencyKey: `${event.repository}:pr-${event.pr}:${event.head}:${event.fingerprint}:${HOSTED_REPAIR_POLICY_VERSION}`,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
  };
  return assertHostedRepairPlan(plan);
}

export function isHostedRemediationSelfTrigger({ plan, commitMessage }) {
  assertHostedRepairPlan(plan);
  const message = String(commitMessage ?? '');
  return (
    message.includes('Jovie hosted CI remediation') &&
    message.includes(`Policy: ${plan.policyVersion}`) &&
    message.includes(`Failure: ${plan.fingerprint}`)
  );
}

/**
 * @param {{receipt?: Record<string, any>, trustedPolicyOid?: string, now?: Date, maxAgeMs?: number}} [options]
 */
export function validateHostedGateAdmission({
  receipt,
  trustedPolicyOid,
  now = new Date(),
  maxAgeMs = HOSTED_GATE_MAX_AGE_MS,
} = {}) {
  assertExactSha(trustedPolicyOid, 'trustedPolicyOid');
  const observedAt = Date.parse(receipt?.observedAt ?? '');
  const ageMs = new Date(now).getTime() - observedAt;
  const remediation = receipt?.remediationAdmission;
  const gem = receipt?.concurrency?.gem;
  const valid =
    receipt?.schema === 'jovie-fleet-gate/v1' &&
    Number.isFinite(observedAt) &&
    ageMs >= -60_000 &&
    ageMs <= maxAgeMs &&
    receipt?.signals?.main?.sha === trustedPolicyOid &&
    remediation?.allowed === true &&
    remediation?.localAllowed === true &&
    remediation?.pushAllowed === true &&
    remediation?.authority === 'single-pr-writer-exact-head' &&
    remediation?.activities?.includes('expected-head-pr-update') &&
    Number.isInteger(remediation?.maxConcurrent) &&
    remediation.maxConcurrent >= HOSTED_REPAIR_MAX_CONCURRENT &&
    gem?.evidenceAccepted === true &&
    gem?.newMutationAllowed === true &&
    Number.isInteger(gem?.maxConcurrent) &&
    gem.maxConcurrent >= HOSTED_REPAIR_MAX_CONCURRENT;
  return valid
    ? {
        accepted: true,
        observedAt: receipt.observedAt,
        receiptSha256: sha256(Buffer.from(JSON.stringify(receipt))),
        maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
      }
    : { accepted: false, reason: 'fresh-typed-capacity-not-admitted' };
}

export function validateHostedRepairPath(path) {
  const normalized = String(path ?? '').replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('/../') ||
    normalized.startsWith('../') ||
    HOSTED_DENIED_PATH_RE.some(pattern => pattern.test(normalized)) ||
    !HOSTED_ALLOWED_PATH_RE.some(pattern => pattern.test(normalized))
  ) {
    return { allowed: false, reason: 'path-outside-hosted-repair-policy' };
  }
  return { allowed: true, path: normalized };
}

function readPrivateArtifactFile(
  root,
  path,
  { requirePrivateRoot = true } = {}
) {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('..') ||
    path.includes('\\')
  ) {
    throw new Error('artifact path is unsafe');
  }
  const rootStat = lstatSync(root);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    (requirePrivateRoot && (rootStat.mode & 0o077) !== 0) ||
    (requirePrivateRoot &&
      typeof process.getuid === 'function' &&
      rootStat.uid !== process.getuid())
  ) {
    throw new Error('artifact root must be a private runner-owned directory');
  }
  const realRoot = realpathSync(root);
  let cursor = realRoot;
  for (const part of path.split('/')) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`${path}: symlink artifact is forbidden`);
    }
  }
  const resolved = realpathSync(cursor);
  const containment = relative(realRoot, resolved);
  if (
    !containment ||
    containment === '..' ||
    containment.startsWith(`..${sep}`)
  ) {
    throw new Error(`${path}: artifact escaped its private root`);
  }
  const handle = openSync(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!fstatSync(handle).isFile()) {
      throw new Error(`${path}: artifact is not a regular file`);
    }
    return readFileSync(handle);
  } finally {
    closeSync(handle);
  }
}

export function readHostedArtifactFile(root, path, options) {
  const policy = validateHostedRepairPath(path);
  if (!policy.allowed) throw new Error(`${path}: ${policy.reason}`);
  return readPrivateArtifactFile(root, policy.path, options);
}

export function buildHostedVerificationEnvironment(environment = {}) {
  return Object.fromEntries(
    HOSTED_VERIFICATION_ENV_KEYS.flatMap(key =>
      typeof environment[key] === 'string' ? [[key, environment[key]]] : []
    )
  );
}

export function assertCredentialFreeHostedAcceptance(environment = {}) {
  if (environment.GH_TOKEN || environment.STATUS_TOKEN) {
    throw new Error(
      'hosted acceptance must run before writer credentials exist'
    );
  }
}

function validateHostedChanges(changes) {
  if (
    !Array.isArray(changes) ||
    changes.length < 1 ||
    changes.length > HOSTED_REPAIR_MAX_FILES
  ) {
    throw new Error('hosted repair must modify a bounded non-empty file set');
  }
  const unique = new Set();
  for (const change of changes) {
    const policy = validateHostedRepairPath(change?.path);
    if (!policy.allowed) throw new Error(`${change?.path}: ${policy.reason}`);
    if (unique.has(policy.path)) throw new Error('duplicate changed path');
    unique.add(policy.path);
    if (
      change?.status !== 'M' ||
      change?.symlink === true ||
      !Number.isInteger(change?.bytes) ||
      change.bytes < 1 ||
      change.bytes > HOSTED_REPAIR_MAX_PATCH_BYTES ||
      !/^[0-9a-f]{64}$/.test(change?.sha256 ?? '')
    ) {
      throw new Error(`${policy.path}: unsafe repair file transition`);
    }
  }
  return [...changes].sort((left, right) =>
    left.path.localeCompare(right.path)
  );
}

export function buildHostedTestReceipt({
  plan,
  patchBytes,
  changes,
  results,
  now = new Date(),
}) {
  assertHostedRepairPlan(plan);
  const normalized = (results ?? []).map(result => ({
    command: result?.command,
    args: result?.args,
    exitCode: result?.exitCode,
  }));
  const expected = hostedRepairTestCommands(plan, changes).map(command => ({
    ...command,
    exitCode: 0,
  }));
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    throw new Error('hosted repair tests are missing, failing, or reordered');
  }
  return {
    schema: HOSTED_TEST_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    patchSha256: sha256(Buffer.from(patchBytes ?? '')),
    changedFilesSha256: sha256(
      Buffer.from(JSON.stringify(validateHostedChanges(changes)))
    ),
    results: normalized,
    observedAt: new Date(now).toISOString(),
  };
}

function assertHostedCandidateState({
  plan,
  changes,
  repository,
  environment,
}) {
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
    env: environment,
  }).trim();
  if (currentHead !== plan.expectedHeadOid) {
    throw new Error('verification checkout is not the exact planned head');
  }
  const records = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: repository, env: environment }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const paths = records.map(record => {
    if (!record.startsWith(' M ')) {
      throw new Error(`unsafe candidate git transition: ${record.slice(0, 2)}`);
    }
    return record.slice(3);
  });
  if (
    JSON.stringify(paths.sort((left, right) => left.localeCompare(right))) !==
    JSON.stringify(changes.map(change => change.path))
  ) {
    throw new Error('candidate dirty set does not match accepted changes');
  }
  for (const change of changes) {
    if (
      sha256(
        readHostedArtifactFile(repository, change.path, {
          requirePrivateRoot: false,
        })
      ) !== change.sha256
    ) {
      throw new Error(
        `${change.path}: verification bytes do not match acceptance`
      );
    }
  }
}

function executeHostedCommand(command, args, options) {
  execFileSync(command, args, options);
}

export function runHostedVerification({
  plan,
  patchBytes,
  changes,
  repository,
  now = new Date(),
  environment = process.env,
  execute = executeHostedCommand,
  inspect = assertHostedCandidateState,
}) {
  assertHostedRepairPlan(plan);
  const acceptedChanges = validateHostedChanges(changes);
  const cleanEnvironment = buildHostedVerificationEnvironment(environment);
  inspect({
    plan,
    changes: acceptedChanges,
    repository,
    environment: cleanEnvironment,
  });
  const results = hostedRepairTestCommands(plan, acceptedChanges).map(
    command => {
      execute(command.command, command.args, {
        cwd: repository,
        stdio: 'inherit',
        env: cleanEnvironment,
      });
      return { ...command, exitCode: 0 };
    }
  );
  inspect({
    plan,
    changes: acceptedChanges,
    repository,
    environment: cleanEnvironment,
  });
  return buildHostedTestReceipt({
    plan,
    patchBytes,
    changes: acceptedChanges,
    results,
    now,
  });
}

export function stageHostedRepairArtifact({
  plan,
  repository,
  output,
  environment = process.env,
}) {
  assertHostedRepairPlan(plan);
  assertCredentialFreeHostedAcceptance(environment);
  const cleanEnvironment = buildHostedVerificationEnvironment(environment);
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
    env: cleanEnvironment,
  }).trim();
  if (currentHead !== plan.expectedHeadOid) {
    throw new Error('candidate checkout is not the exact planned head');
  }
  const records = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: repository, env: cleanEnvironment }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  const files = {};
  const changes = validateHostedChanges(
    records.map(record => {
      if (!record.startsWith(' M ')) {
        throw new Error(
          `unsafe candidate git transition: ${record.slice(0, 2)}`
        );
      }
      const path = record.slice(3);
      const bytes = readHostedArtifactFile(repository, path, {
        requirePrivateRoot: false,
      });
      files[path] = bytes;
      return {
        path,
        status: 'M',
        symlink: false,
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    })
  );
  const patchBytes = execFileSync(
    'git',
    [
      'diff',
      '--binary',
      '--no-ext-diff',
      'HEAD',
      '--',
      ...changes.map(change => change.path),
    ],
    {
      cwd: repository,
      env: cleanEnvironment,
      maxBuffer: HOSTED_REPAIR_MAX_PATCH_BYTES + 1,
    }
  );
  if (
    patchBytes.length < 1 ||
    patchBytes.length > HOSTED_REPAIR_MAX_PATCH_BYTES
  ) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  assertHostedCandidateState({
    plan,
    changes,
    repository,
    environment: cleanEnvironment,
  });
  mkdirSync(output, { mode: 0o700 });
  writeFileSync(join(output, 'repair.patch'), patchBytes, { mode: 0o600 });
  writeJson(join(output, 'changes.json'), changes);
  for (const change of changes) {
    const destination = join(output, 'files', change.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, files[change.path], { mode: 0o600 });
  }
  return {
    staged: true,
    changedFiles: changes.map(change => change.path),
    patchSha256: sha256(patchBytes),
  };
}

function validateHostedTestReceipt({
  plan,
  receipt,
  patchBytes,
  changes,
  now,
}) {
  const ageMs = new Date(now).getTime() - Date.parse(receipt?.observedAt ?? '');
  if (
    receipt?.schema !== HOSTED_TEST_RECEIPT_SCHEMA ||
    receipt.policyVersion !== plan.policyVersion ||
    receipt.repository !== plan.repository ||
    receipt.prNumber !== plan.prNumber ||
    receipt.expectedHeadOid !== plan.expectedHeadOid ||
    receipt.fingerprint !== plan.fingerprint ||
    receipt.idempotencyKey !== plan.idempotencyKey ||
    receipt.patchSha256 !== sha256(Buffer.from(patchBytes ?? '')) ||
    receipt.changedFilesSha256 !==
      sha256(Buffer.from(JSON.stringify(validateHostedChanges(changes)))) ||
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs > HOSTED_ACCEPTANCE_TTL_MS
  ) {
    throw new Error('test receipt is stale or identity-mismatched');
  }
  return buildHostedTestReceipt({
    plan,
    patchBytes,
    changes,
    results: receipt.results,
    now: new Date(receipt.observedAt),
  });
}

export function buildHostedAcceptanceReceipt({
  plan,
  gateReceipt,
  patchBytes,
  changes,
  executor,
  testReceipt,
  now = new Date(),
  gateMaxAgeMs = HOSTED_ACCEPTANCE_TTL_MS,
}) {
  assertHostedRepairPlan(plan);
  const gate = validateHostedGateAdmission({
    receipt: gateReceipt,
    trustedPolicyOid: plan.trustedPolicyOid,
    now,
    maxAgeMs: gateMaxAgeMs,
  });
  if (!gate.accepted) throw new Error(gate.reason);
  const patch = Buffer.from(patchBytes ?? '');
  if (patch.length < 1 || patch.length > HOSTED_REPAIR_MAX_PATCH_BYTES) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  const acceptedChanges = validateHostedChanges(changes);
  const tests = validateHostedTestReceipt({
    plan,
    receipt: testReceipt,
    patchBytes: patch,
    changes: acceptedChanges,
    now,
  });
  if (
    executor?.kind !== 'cursor-cli' ||
    !/^[0-9a-f]{64}$/.test(executor?.installerSha256 ?? '') ||
    typeof executor?.version !== 'string' ||
    executor.version.length < 1
  ) {
    throw new Error('executor identity is missing or malformed');
  }
  return {
    schema: HOSTED_ACCEPTANCE_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'acceptance',
    status: 'accepted',
    terminal: false,
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
    gate,
    executor,
    patchSha256: sha256(patch),
    changedFiles: acceptedChanges,
    testsPassed: true,
    testCommands: hostedRepairTestCommands(plan, acceptedChanges),
    tests,
    observedAt: new Date(now).toISOString(),
  };
}

export function validateHostedAcceptance({
  plan,
  acceptance,
  gateReceipt,
  patchBytes,
  now = new Date(),
}) {
  try {
    assertHostedRepairPlan(plan);
    const gate = validateHostedGateAdmission({
      receipt: gateReceipt,
      trustedPolicyOid: plan.trustedPolicyOid,
      now,
    });
    if (!gate.accepted) return gate;
    const ageMs =
      new Date(now).getTime() - Date.parse(acceptance?.observedAt ?? '');
    if (
      acceptance?.schema !== HOSTED_ACCEPTANCE_RECEIPT_SCHEMA ||
      acceptance.stage !== 'acceptance' ||
      acceptance.status !== 'accepted' ||
      acceptance.terminal !== false ||
      acceptance.policyVersion !== plan.policyVersion ||
      acceptance.repository !== plan.repository ||
      acceptance.prNumber !== plan.prNumber ||
      acceptance.expectedHeadOid !== plan.expectedHeadOid ||
      acceptance.fingerprint !== plan.fingerprint ||
      acceptance.idempotencyKey !== plan.idempotencyKey ||
      acceptance.maxConcurrent !== HOSTED_REPAIR_MAX_CONCURRENT ||
      acceptance.testsPassed !== true ||
      acceptance.patchSha256 !== sha256(Buffer.from(patchBytes ?? '')) ||
      typeof acceptance.gate?.receiptSha256 !== 'string' ||
      acceptance.executor?.kind !== 'cursor-cli' ||
      !/^[0-9a-f]{64}$/.test(acceptance.executor?.installerSha256 ?? '') ||
      typeof acceptance.executor?.version !== 'string' ||
      acceptance.executor.version.length < 1 ||
      !Number.isFinite(ageMs) ||
      ageMs < 0 ||
      ageMs > HOSTED_ACCEPTANCE_TTL_MS ||
      JSON.stringify(acceptance.testCommands) !==
        JSON.stringify(hostedRepairTestCommands(plan, acceptance.changedFiles))
    ) {
      return { accepted: false, reason: 'acceptance-identity-mismatch' };
    }
    validateHostedChanges(acceptance.changedFiles);
    validateHostedTestReceipt({
      plan,
      receipt: acceptance.tests,
      patchBytes,
      changes: acceptance.changedFiles,
      now,
    });
    return { accepted: true, gate };
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildHostedCommitVariables({
  plan,
  acceptance,
  gateReceipt,
  patchBytes,
  fileContents,
  now = new Date(),
}) {
  const accepted = validateHostedAcceptance({
    plan,
    acceptance,
    gateReceipt,
    patchBytes,
    now,
  });
  if (!accepted.accepted) throw new Error(accepted.reason);
  const additions = acceptance.changedFiles.map(change => {
    const contents = fileContents?.[change.path];
    if (!Buffer.isBuffer(contents) || sha256(contents) !== change.sha256) {
      throw new Error(`${change.path}: immutable artifact hash mismatch`);
    }
    if (
      contents.length !== change.bytes ||
      contents.length > HOSTED_REPAIR_MAX_PATCH_BYTES
    ) {
      throw new Error(`${change.path}: immutable artifact byte count mismatch`);
    }
    return { path: change.path, contents: contents.toString('base64') };
  });
  return {
    input: {
      branch: {
        repositoryNameWithOwner: plan.repository,
        branchName: plan.headRefName,
      },
      expectedHeadOid: plan.expectedHeadOid,
      message: {
        headline: 'fix(ci): apply bounded hosted remediation',
        body: `Jovie hosted CI remediation for PR #${plan.prNumber}.\n\nPolicy: ${plan.policyVersion}\nFailure: ${plan.fingerprint}\nReceipt: ${acceptance.patchSha256}`,
      },
      fileChanges: { additions },
    },
  };
}

export function buildHostedTerminalReceipt({
  plan,
  outcome,
  committedHeadOid = null,
  acceptance = null,
  now = new Date(),
}) {
  assertHostedRepairPlan(plan);
  const allowedOutcomes = new Set([
    'repaired',
    'superseded_green',
    'stale_head',
    'capacity_denied',
    'patch_rejected',
    'tests_failed',
    'executor_failed',
    'recursive_dispatch_blocked',
    'machine_held',
    'writer_failed',
  ]);
  if (!allowedOutcomes.has(outcome))
    throw new Error('invalid terminal outcome');
  if (outcome === 'repaired')
    assertExactSha(committedHeadOid, 'committedHeadOid');
  return {
    schema: HOSTED_TERMINAL_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'terminal',
    status: outcome === 'repaired' ? 'completed' : 'aborted',
    terminal: true,
    outcome,
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    committedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    acceptanceSha256: acceptance
      ? sha256(Buffer.from(JSON.stringify(acceptance)))
      : null,
    observedAt: new Date(now).toISOString(),
  };
}

async function githubJson(
  path,
  { token, method = 'GET', body = undefined, fetchImpl = fetch }
) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    redirect: 'follow',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path} returned ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * Revalidate exact-head PR/CI state, then perform the one atomic writer action.
 */
export async function commitHostedRepair({
  plan,
  acceptance,
  gateReceipt,
  patchBytes,
  fileContents,
  readToken,
  writeToken,
  clock = () => new Date(),
  request = githubJson,
}) {
  const pr = await request(`/repos/${plan.repository}/pulls/${plan.prNumber}`, {
    token: readToken,
  });
  if (
    pr?.state !== 'open' ||
    pr?.base?.ref !== 'main' ||
    pr?.base?.repo?.full_name !== HOSTED_REPAIR_REPOSITORY ||
    pr?.head?.repo?.full_name !== HOSTED_REPAIR_REPOSITORY ||
    pr?.head?.repo?.fork === true ||
    pr?.head?.ref !== plan.headRefName
  ) {
    return { committed: false, outcome: 'stale_head' };
  }
  const labels = new Set(
    (Array.isArray(pr?.labels) ? pr.labels : []).map(label =>
      String(label?.name ?? label)
        .trim()
        .toLowerCase()
    )
  );
  if (HOSTED_REPAIR_STOP_LABELS.some(label => labels.has(label))) {
    return { committed: false, outcome: 'machine_held' };
  }
  if (pr?.head?.sha !== plan.expectedHeadOid) {
    return { committed: false, outcome: 'stale_head' };
  }

  const runs = await request(
    `/repos/${plan.repository}/actions/runs?event=pull_request&head_sha=${plan.expectedHeadOid}&per_page=100`,
    { token: readToken }
  );
  const matchingRuns = (runs?.workflow_runs ?? [])
    .filter(
      run =>
        run?.name === 'CI' &&
        run?.path === '.github/workflows/ci.yml' &&
        run?.event === 'pull_request' &&
        run?.head_sha === plan.expectedHeadOid
    )
    .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0));
  const latest = matchingRuns[0];
  if (latest?.conclusion === 'success') {
    return { committed: false, outcome: 'superseded_green' };
  }
  if (
    String(latest?.id ?? '') !== String(plan.workflowRunId) ||
    Number(latest?.run_attempt ?? 0) !== plan.workflowRunAttempt ||
    latest?.status !== 'completed' ||
    latest?.conclusion !== 'failure'
  ) {
    return { committed: false, outcome: 'stale_head' };
  }

  const mutationNow = clock();
  const variables = buildHostedCommitVariables({
    plan,
    acceptance,
    gateReceipt,
    patchBytes,
    fileContents,
    now: mutationNow,
  });

  const response = await request('/graphql', {
    token: writeToken,
    method: 'POST',
    body: { query: CREATE_HOSTED_COMMIT_MUTATION, variables },
  });
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error('GitHub atomic expected-head update was rejected');
  }
  const commit = response?.data?.createCommitOnBranch?.commit;
  assertExactSha(commit?.oid, 'committedHeadOid');
  return {
    committed: true,
    outcome: 'repaired',
    committedHeadOid: commit.oid,
    url: commit.url ?? null,
  };
}

function cliArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('CLI arguments must be --name value pairs');
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function runtimePolicyOid() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

function readRunnerOwnedJson(name) {
  if (!process.env[name]) {
    throw new Error(`runner-owned ${name} is required`);
  }
  return JSON.parse(Buffer.from(process.env[name], 'base64').toString('utf8'));
}

function readTrustedPlan() {
  const plan = assertHostedRepairPlan(readRunnerOwnedJson('HOSTED_PLAN_B64'));
  if (plan.trustedPolicyOid !== runtimePolicyOid()) {
    throw new Error('plan is not bound to the checked-out trusted policy');
  }
  return plan;
}

function readTrustedGate() {
  return readRunnerOwnedJson('HOSTED_GATE_B64');
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function hostedAcceptanceCommand(args) {
  assertCredentialFreeHostedAcceptance(process.env);
  const plan = readTrustedPlan();
  const patchBytes = readPrivateArtifactFile(args.artifact, 'repair.patch');
  const changes = JSON.parse(
    readPrivateArtifactFile(args.artifact, 'changes.json').toString('utf8')
  );
  const testReceipt = runHostedVerification({
    plan,
    patchBytes,
    changes,
    repository: args.repository,
  });
  const receipt = buildHostedAcceptanceReceipt({
    plan,
    gateReceipt: readTrustedGate(),
    patchBytes,
    changes,
    executor: readRunnerOwnedJson('HOSTED_EXECUTOR_B64'),
    testReceipt,
  });
  mkdirSync(args['writer-root'], { mode: 0o700, recursive: true });
  writeJson(join(args['writer-root'], 'acceptance.json'), receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedStageCommand(args) {
  const result = stageHostedRepairArtifact({
    plan: readTrustedPlan(),
    repository: args.repository,
    output: args.output,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function hostedCommitCommand(args) {
  const plan = readTrustedPlan();
  const acceptance = JSON.parse(
    readPrivateArtifactFile(args['writer-root'], 'acceptance.json').toString(
      'utf8'
    )
  );
  const fileContents = Object.fromEntries(
    acceptance.changedFiles.map(change => [
      change.path,
      readHostedArtifactFile(join(args.artifact, 'files'), change.path),
    ])
  );
  const result = await commitHostedRepair({
    plan,
    acceptance,
    gateReceipt: readTrustedGate(),
    patchBytes: readPrivateArtifactFile(args.artifact, 'repair.patch'),
    fileContents,
    readToken: process.env.STATUS_TOKEN,
    writeToken: process.env.GH_TOKEN,
  });
  const terminal = buildHostedTerminalReceipt({
    plan,
    outcome: result.outcome,
    committedHeadOid: result.committedHeadOid ?? null,
    acceptance,
  });
  writeJson(args.output, terminal);
  process.stdout.write(`${JSON.stringify({ ...result, terminal })}\n`);
}

export async function runHostedWriterCli(argv = process.argv.slice(2)) {
  const command = argv[0];
  const args = cliArgs(argv.slice(1));
  if (command === 'hosted-stage') return hostedStageCommand(args);
  if (command === 'hosted-acceptance') return hostedAcceptanceCommand(args);
  if (command === 'hosted-commit') return hostedCommitCommand(args);
  throw new Error(`unknown hosted remediation command: ${command}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runHostedWriterCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
