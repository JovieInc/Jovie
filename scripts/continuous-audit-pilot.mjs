#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const defaultPolicyPath = path.join(
  repoRoot,
  'audits/continuous/activation.json'
);
const defaultStateDir = path.resolve(
  process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
  'state/continuous-audit-pilot'
);

export const PILOT_RECEIPT_SCHEMA = 'continuous-audit-pilot-receipt/v1';
export const PILOT_CONTROL_SCHEMA = 'continuous-audit-pilot-control/v1';
export const PILOT_ATTESTATION_SCHEMA = 'continuous-audit-pilot-attestation/v1';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  invariant(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`
  );
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} keys are invalid`
  );
}

function exactStrings(actual, expected, label) {
  invariant(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${label} is invalid`
  );
}

export function validateActivationPolicy(policy) {
  exactKeys(
    policy,
    [
      'schemaVersion',
      'pilotId',
      'status',
      'scope',
      'host',
      'stateDirectory',
      'trigger',
      'runnerLabels',
      'limits',
      'dataBoundary',
      'notification',
      'rollback',
    ],
    'activation policy'
  );
  invariant(policy.schemaVersion === 1, 'activation schemaVersion must be 1');
  invariant(
    policy.pilotId === 'jovie-continuous-audit-pilot',
    'pilotId is invalid'
  );
  invariant(policy.status === 'active', 'pilot must be explicitly active');
  invariant(
    policy.scope === 'registry-and-coverage-integrity',
    'pilot scope is invalid'
  );
  invariant(policy.host === 'gem', 'pilot host must be gem');
  invariant(
    policy.stateDirectory ===
      '/home/timwhite/gem-workspace/state/continuous-audit-pilot',
    'pilot state directory is invalid'
  );
  exactKeys(
    policy.trigger,
    ['workflow', 'event', 'branch', 'cadence'],
    'trigger'
  );
  invariant(
    policy.trigger.workflow === 'CI' &&
      policy.trigger.event === 'push' &&
      policy.trigger.branch === 'main' &&
      policy.trigger.cadence === 'event-driven-only',
    'pilot trigger exceeds the authorized event boundary'
  );
  exactStrings(
    policy.runnerLabels,
    ['self-hosted', 'Linux', 'X64', 'jovie-fixed'],
    'runner labels'
  );
  exactKeys(
    policy.limits,
    [
      'timeoutMinutes',
      'leaseMinutes',
      'concurrency',
      'artifactRetentionDays',
      'externalModelCalls',
      'incrementalModelSpendCents',
    ],
    'limits'
  );
  invariant(
    policy.limits.timeoutMinutes === 3 &&
      policy.limits.leaseMinutes === 5 &&
      policy.limits.concurrency === 1 &&
      policy.limits.artifactRetentionDays === 3 &&
      policy.limits.externalModelCalls === 0 &&
      policy.limits.incrementalModelSpendCents === 0,
    'pilot limits exceed the authorized ceiling'
  );
  exactKeys(
    policy.dataBoundary,
    [
      'customerDataAllowed',
      'secretMaterialAllowed',
      'externalCodeEgressAllowed',
    ],
    'data boundary'
  );
  invariant(
    Object.values(policy.dataBoundary).every(value => value === false),
    'pilot data boundary must fail closed'
  );
  exactKeys(
    policy.notification,
    ['channel', 'sourceId', 'externalDestinationsAllowed'],
    'notification'
  );
  invariant(
    policy.notification.channel === 'ovie' &&
      policy.notification.sourceId === 'continuous-audit-pilot' &&
      policy.notification.externalDestinationsAllowed === false,
    'pilot notification boundary is invalid'
  );
  exactKeys(
    policy.rollback,
    ['mode', 'disableOn', 'automaticReenable'],
    'rollback'
  );
  invariant(
    policy.rollback.mode === 'automatic-disable',
    'rollback mode is invalid'
  );
  exactStrings(
    policy.rollback.disableOn,
    ['audit-failed', 'invalid-receipt', 'runner-error'],
    'rollback conditions'
  );
  invariant(
    policy.rollback.automaticReenable === false,
    'automatic re-enable is forbidden'
  );
  return policy;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function exactSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function positiveIntegerString(value) {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
    ? value
    : null;
}

function parseTimestamp(value, label) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  invariant(Number.isFinite(timestamp), `${label} is invalid`);
  return timestamp;
}

function boundedReason(value) {
  invariant(
    typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value),
    'disable reason is invalid'
  );
  return value;
}

function validateStateDirectory(stateDir, policy) {
  const temporaryRoot = path.resolve(process.env.TMPDIR || '/tmp');
  invariant(
    stateDir === policy.stateDirectory ||
      stateDir.startsWith(`${temporaryRoot}${path.sep}`),
    'state directory exceeds the activation boundary'
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readControl(stateDir) {
  try {
    return await readJson(path.join(stateDir, 'control.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function validateControl(control, policy) {
  exactKeys(
    control,
    [
      'schema',
      'pilotId',
      'status',
      'reason',
      'observedAt',
      'leaseExpiresAt',
      'source',
      'automaticReenable',
      'policyDigest',
    ],
    'pilot control'
  );
  invariant(
    control.schema === PILOT_CONTROL_SCHEMA,
    'pilot control schema is invalid'
  );
  invariant(
    control.pilotId === policy.pilotId,
    'pilot control identity is invalid'
  );
  invariant(
    ['active', 'idle', 'disabled'].includes(control.status),
    'pilot control status is invalid'
  );
  invariant(
    control.status === 'disabled'
      ? typeof control.reason === 'string' &&
          /^[a-z0-9-]{1,64}$/.test(control.reason)
      : control.reason === null,
    'pilot control reason is invalid'
  );
  invariant(
    typeof control.observedAt === 'string' &&
      Number.isFinite(Date.parse(control.observedAt)),
    'pilot control timestamp is invalid'
  );
  invariant(
    control.status === 'active'
      ? typeof control.leaseExpiresAt === 'string' &&
          Number.isFinite(Date.parse(control.leaseExpiresAt)) &&
          Date.parse(control.leaseExpiresAt) > Date.parse(control.observedAt)
      : control.leaseExpiresAt === null,
    'pilot control lease is invalid'
  );
  exactKeys(
    control.source,
    ['sha', 'runId', 'runAttempt', 'event', 'branch'],
    'pilot control source'
  );
  invariant(
    control.automaticReenable === false,
    'pilot control may not re-enable automatically'
  );
  invariant(
    control.policyDigest === digest(policy),
    'pilot control policy digest is stale'
  );
  return control;
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, filePath);
}

function validateAuditResult(result) {
  exactKeys(
    result,
    [
      'valid',
      'registryId',
      'familyCount',
      'partitionCount',
      'auditedTrackedFileCount',
      'unmappedTrackedFileCount',
      'hyperagent',
      'schedule',
    ],
    'audit result'
  );
  invariant(result.valid === true, 'audit result is not valid');
  invariant(
    result.registryId === 'jovie-continuous-audit-registry',
    'audit registry identity is invalid'
  );
  invariant(result.familyCount === 13, 'audit family count is invalid');
  invariant(
    Number.isSafeInteger(result.partitionCount) && result.partitionCount > 0,
    'partition count is invalid'
  );
  invariant(
    Number.isSafeInteger(result.auditedTrackedFileCount) &&
      result.auditedTrackedFileCount > 0,
    'tracked file count is invalid'
  );
  invariant(
    result.unmappedTrackedFileCount === 0,
    'tracked coverage contains unmapped files'
  );
  invariant(
    result.hyperagent === 'unqualified-fail-closed',
    'Hyperagent must remain fail closed'
  );
  invariant(
    result.schedule === 'proposal-only',
    'family schedules must remain proposal only'
  );
  return result;
}

function sourceIdentity(env) {
  const sha = exactSha(env.GITHUB_SHA);
  const runId = positiveIntegerString(env.GITHUB_RUN_ID);
  const runAttempt = positiveIntegerString(env.GITHUB_RUN_ATTEMPT);
  invariant(sha && runId && runAttempt, 'GitHub source identity is malformed');
  invariant(env.GITHUB_EVENT_NAME === 'push', 'pilot only accepts push events');
  invariant(env.GITHUB_REF === 'refs/heads/main', 'pilot only accepts main');
  invariant(
    exactSha(env.GITHUB_CURRENT_MAIN_SHA) === sha,
    'pilot source is not current main'
  );
  return { sha, runId, runAttempt, event: 'push', branch: 'main' };
}

function compareSource(left, right) {
  const runOrder = BigInt(left.runId) - BigInt(right.runId);
  if (runOrder !== 0n) return runOrder;
  return BigInt(left.runAttempt) - BigInt(right.runAttempt);
}

function assertMonotonicSource(existing, incoming) {
  invariant(
    compareSource(existing, incoming) <= 0n,
    'pilot source is older than host control'
  );
}

function leaseExpiresAt(policy, observedAt) {
  return new Date(
    Date.parse(observedAt) + policy.limits.leaseMinutes * 60_000
  ).toISOString();
}

export function isControlActive(control, policy, at) {
  validateControl(control, policy);
  return (
    control.status === 'active' &&
    Date.parse(control.leaseExpiresAt) > Date.parse(at)
  );
}

function receiptFor({ policy, source, status, reason, audit, observedAt }) {
  return {
    schema: PILOT_RECEIPT_SCHEMA,
    pilotId: policy.pilotId,
    observedAt,
    status,
    reason,
    source,
    policyDigest: digest(policy),
    audit,
    safety: {
      externalModelCalls: 0,
      incrementalModelSpendCents: 0,
      customerDataTransferred: false,
      secretMaterialTransferred: false,
      externalCodeEgress: false,
      notificationChannel: 'ovie',
      artifactRetentionDays: 3,
    },
  };
}

function validatePassedReceipt(receipt, policy, source) {
  exactKeys(
    receipt,
    [
      'schema',
      'pilotId',
      'observedAt',
      'status',
      'reason',
      'source',
      'policyDigest',
      'audit',
      'safety',
    ],
    'pilot receipt'
  );
  invariant(
    receipt.schema === PILOT_RECEIPT_SCHEMA,
    'pilot receipt schema is invalid'
  );
  invariant(
    receipt.pilotId === policy.pilotId,
    'pilot receipt identity is invalid'
  );
  invariant(
    receipt.status === 'passed' && receipt.reason === null,
    'pilot receipt did not pass'
  );
  invariant(
    receipt.policyDigest === digest(policy),
    'pilot receipt policy digest is stale'
  );
  invariant(
    JSON.stringify(receipt.source) === JSON.stringify(source),
    'pilot receipt source identity is stale'
  );
  parseTimestamp(receipt.observedAt, 'pilot receipt observedAt');
  validateAuditResult(receipt.audit);
  exactKeys(
    receipt.safety,
    [
      'externalModelCalls',
      'incrementalModelSpendCents',
      'customerDataTransferred',
      'secretMaterialTransferred',
      'externalCodeEgress',
      'notificationChannel',
      'artifactRetentionDays',
    ],
    'pilot receipt safety'
  );
  invariant(
    receipt.safety.externalModelCalls === 0 &&
      receipt.safety.incrementalModelSpendCents === 0 &&
      receipt.safety.customerDataTransferred === false &&
      receipt.safety.secretMaterialTransferred === false &&
      receipt.safety.externalCodeEgress === false &&
      receipt.safety.notificationChannel === 'ovie' &&
      receipt.safety.artifactRetentionDays === 3,
    'pilot receipt safety boundary is invalid'
  );
  return receipt;
}

async function writeControl(
  stateDir,
  policy,
  source,
  status,
  reason,
  observedAt
) {
  const control = {
    schema: PILOT_CONTROL_SCHEMA,
    pilotId: policy.pilotId,
    status,
    reason,
    observedAt,
    leaseExpiresAt:
      status === 'active' ? leaseExpiresAt(policy, observedAt) : null,
    source,
    automaticReenable: false,
    policyDigest: digest(policy),
  };
  await atomicWrite(path.join(stateDir, 'control.json'), control);
  return control;
}

async function defaultAudit() {
  const { stdout } = await execFileAsync(
    process.execPath,
    [path.join(repoRoot, 'scripts/continuous-audit.mjs'), 'validate'],
    {
      cwd: repoRoot,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH },
    }
  );
  return stdout;
}

export async function runPilot({
  policy,
  stateDir,
  receiptFile,
  env,
  now = () => new Date().toISOString(),
  executeAudit = defaultAudit,
}) {
  validateActivationPolicy(policy);
  validateStateDirectory(stateDir, policy);
  const source = sourceIdentity(env);
  const observedAt = now();
  const existing = await readControl(stateDir);
  if (existing) {
    try {
      validateControl(existing, policy);
    } catch {
      const receipt = receiptFor({
        policy,
        source,
        status: 'disabled',
        reason: 'invalid-receipt',
        audit: null,
        observedAt,
      });
      await writeControl(
        stateDir,
        policy,
        source,
        'disabled',
        'invalid-receipt',
        observedAt
      );
      await atomicWrite(receiptFile, receipt);
      await atomicWrite(path.join(stateDir, 'latest.json'), receipt);
      return receipt;
    }
    assertMonotonicSource(existing.source, source);
  }
  if (existing?.status === 'disabled') {
    const receipt = receiptFor({
      policy,
      source,
      status: 'disabled',
      reason: 'previously-disabled',
      audit: null,
      observedAt,
    });
    await atomicWrite(receiptFile, receipt);
    await atomicWrite(path.join(stateDir, 'latest.json'), receipt);
    return receipt;
  }
  if (
    existing?.status === 'active' &&
    !isControlActive(existing, policy, observedAt)
  ) {
    const receipt = receiptFor({
      policy,
      source,
      status: 'disabled',
      reason: 'runner-error',
      audit: null,
      observedAt,
    });
    await writeControl(
      stateDir,
      policy,
      source,
      'disabled',
      'runner-error',
      observedAt
    );
    await atomicWrite(receiptFile, receipt);
    await atomicWrite(path.join(stateDir, 'latest.json'), receipt);
    return receipt;
  }

  let auditOutput;
  try {
    auditOutput = await executeAudit();
  } catch {
    auditOutput = null;
  }
  try {
    invariant(auditOutput != null, 'audit execution failed');
    const audit = validateAuditResult(
      typeof auditOutput === 'string' ? JSON.parse(auditOutput) : auditOutput
    );
    const receipt = receiptFor({
      policy,
      source,
      status: 'passed',
      reason: null,
      audit,
      observedAt,
    });
    await atomicWrite(receiptFile, receipt);
    await atomicWrite(path.join(stateDir, 'latest.json'), receipt);
    await writeControl(stateDir, policy, source, 'active', null, observedAt);
    return receipt;
  } catch (error) {
    const reason =
      auditOutput == null
        ? 'audit-failed'
        : error instanceof Error
          ? 'invalid-receipt'
          : 'audit-failed';
    const receipt = receiptFor({
      policy,
      source,
      status: 'disabled',
      reason,
      audit: null,
      observedAt,
    });
    await writeControl(
      stateDir,
      policy,
      source,
      'disabled',
      reason,
      observedAt
    );
    await atomicWrite(receiptFile, receipt);
    await atomicWrite(path.join(stateDir, 'latest.json'), receipt);
    return receipt;
  }
}

export async function disablePilot({
  policy,
  stateDir,
  receiptFile,
  env,
  reason,
  now = () => new Date().toISOString(),
}) {
  validateActivationPolicy(policy);
  validateStateDirectory(stateDir, policy);
  const observedAt = now();
  const source = sourceIdentity(env);
  let existing = await readControl(stateDir);
  try {
    if (existing) existing = validateControl(existing, policy);
  } catch {
    existing = null;
  }
  if (existing) assertMonotonicSource(existing.source, source);
  const bounded = boundedReason(
    existing?.status === 'disabled' ? existing.reason : reason
  );
  const receipt = receiptFor({
    policy,
    source,
    status: 'disabled',
    reason: bounded,
    audit: null,
    observedAt,
  });
  await writeControl(stateDir, policy, source, 'disabled', bounded, observedAt);
  await atomicWrite(receiptFile, receipt);
  await atomicWrite(path.join(stateDir, 'latest.json'), receipt);
  return receipt;
}

export async function attestPilot({
  policy,
  stateDir,
  receiptFile,
  env,
  now = () => new Date().toISOString(),
}) {
  validateActivationPolicy(policy);
  validateStateDirectory(stateDir, policy);
  const source = sourceIdentity(env);
  const receipt = validatePassedReceipt(
    await readJson(receiptFile),
    policy,
    source
  );
  const latest = validatePassedReceipt(
    await readJson(path.join(stateDir, 'latest.json')),
    policy,
    source
  );
  invariant(
    digest(receipt) === digest(latest),
    'host and artifact receipts differ'
  );
  const observedAt = now();
  const control = validateControl(await readControl(stateDir), policy);
  invariant(
    JSON.stringify(control.source) === JSON.stringify(source),
    'pilot control source identity is stale'
  );
  invariant(
    isControlActive(control, policy, observedAt),
    'pilot control lease is not active'
  );
  await writeControl(stateDir, policy, source, 'idle', null, observedAt);
  return {
    schema: PILOT_ATTESTATION_SCHEMA,
    pilotId: policy.pilotId,
    source,
    policyDigest: digest(policy),
    receiptDigest: digest(receipt),
    leaseExpiresAt: control.leaseExpiresAt,
  };
}

async function main() {
  const [command = 'run', ...tokens] = process.argv.slice(2);
  const options = Object.fromEntries(
    tokens.map(token => {
      invariant(
        token.startsWith('--') && token.includes('='),
        `invalid option: ${token}`
      );
      const split = token.indexOf('=');
      return [token.slice(2, split), token.slice(split + 1)];
    })
  );
  const policy = validateActivationPolicy(
    await readJson(path.resolve(options.policy || defaultPolicyPath))
  );
  const stateDir = path.resolve(options['state-dir'] || defaultStateDir);
  const receiptFile = path.resolve(
    options['receipt-file'] || path.join(stateDir, 'latest.json')
  );
  const input = { policy, stateDir, receiptFile, env: process.env };
  const receipt =
    command === 'run'
      ? await runPilot(input)
      : command === 'disable'
        ? await disablePilot({
            ...input,
            reason: options.reason || 'runner-error',
          })
        : command === 'attest'
          ? await attestPilot(input)
          : (() => {
              throw new Error(`unknown pilot command: ${command}`);
            })();
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (command === 'run' && receipt.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`continuous-audit-pilot: ${error.message}\n`);
    process.exitCode = 1;
  });
}
