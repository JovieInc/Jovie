#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseRollingCiState,
  ROLLING_CI_POLICY_VERSION,
  rollingCiStateMarker,
  runDispatch,
  TRUSTED_REPOSITORY,
} from './rolling-ci-dispatch.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  fxConfigurationIncident,
  isImplementerLeaseLive,
  parseHandoffReceipt,
  resolveFxAdapter,
  resolveRemediationRoute,
  validateHandoffReceipt,
} from './rolling-ci-handoff.mjs';

export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v1/agents';
export const FX_EXECUTION_RECEIPT_SCHEMA = 'jovie-fx-execution-receipt/v1';
export const FX_NAMED_OUTCOMES = Object.freeze([
  'launched',
  'repaired',
  'skipped_stale',
  'writer_missing',
  'no_key',
  'blocked_executor',
  'needs_human',
]);
export const RUNNER_FAILURE_CLASSES = Object.freeze([
  'checkout',
  'infra',
  'flake',
]);
export const FX_RUNNER_IDEMPOTENCY_KEY = 'jov-fx-ci-runners-20260822';
export const HOSTED_REPAIR_PLAN_SCHEMA = 'jovie-hosted-ci-repair-plan/v1';
export const HOSTED_PRELAUNCH_RECEIPT_SCHEMA =
  'jovie-hosted-ci-prelaunch-receipt/v1';
export const HOSTED_ACCEPTANCE_RECEIPT_SCHEMA =
  'jovie-hosted-ci-acceptance-receipt/v1';
export const HOSTED_TERMINAL_RECEIPT_SCHEMA =
  'jovie-hosted-ci-terminal-receipt/v1';
export const HOSTED_POLICY_RECEIPT_SCHEMA =
  'jovie-hosted-ci-policy-admission/v1';
export const HOSTED_REPAIR_MAX_CONCURRENT = 1;
export const HOSTED_REPAIR_MAX_FILES = 8;
export const HOSTED_REPAIR_MAX_PATCH_BYTES = 512 * 1024;
export const HOSTED_GATE_MAX_AGE_MS = 5 * 60 * 1000;
export const HOSTED_ACCEPTANCE_TTL_MS = 45 * 60 * 1000;
export const HOSTED_CURSOR_VERSION = '2026.08.25-3e8eec8';
export const HOSTED_CURSOR_ARCHIVE_URL =
  'https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/x64/agent-cli-package.tar.gz';
export const HOSTED_CURSOR_ARCHIVE_SHA256 =
  '7a212e5a17ff9316f5acc78808e33c536940d5455645022e6388d99ba48c8425';

const HOSTED_REPAIR_TEST_COMMANDS = Object.freeze([
  'pnpm biome check <changed-files>',
  'pnpm run typecheck',
  'node scripts/run-affected-tests.mjs --base <expected-head>',
]);
const HOSTED_ALLOWED_PATH_RE = Object.freeze([
  /^apps\/web\/components\/marketing\/.+\.(?:[cm]?[jt]sx?)$/,
]);
const HOSTED_DENIED_PATH_RE = Object.freeze([
  /(^|\/)\.github(\/|$)/i,
  /(^|\/)\.(?:agents|claude|codex|cursor)(\/|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(?:credential|secret|token|private[-_]?key|\.pem$|\.p12$|\.key$)/i,
  /(^|\/)(?:drizzle|migrations?)(?:[._-]|\/|$)/i,
  /(^|\/)(?:auth|authentication|oauth|clerk|sessions?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:billing|payments?|stripe|entitlements?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:release|deployment|deploy|vercel)(?:[._-]|\/|$)/i,
  /(?:^|\/)proxy\.ts$/i,
  /(?:^|\/)(?:api|admin|data|database|db|queries?|security|server|supabase|permissions?|middleware|webhooks?|cron|jobs?|workers?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|turbo\.json|biome\.jsonc?)$/i,
  /(?:^|\/)(?:tests?|__tests__|__snapshots__)(?:\/|$)/i,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/i,
  /scripts\/lib\/(?:rolling-ci|safe-pr-remediation)/i,
]);
const HOSTED_DENIED_PATH_TOKEN_RE =
  /^(?:drizzle|migrations?|auth.*|oauth|clerk|sessions?|billing|payments?|stripe|entitlements?|release|deployment|deploy|vercel|api|admin|data|database|db|queries?|security|server|supabase|permissions?|middleware|webhooks?|cron|jobs?|workers?)$/;
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

function normalizeHostedAllowedPaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 40) {
    throw new Error('hosted repair requires a bounded original-PR file set');
  }
  const policies = paths.map(path => validateHostedRepairPath(path));
  const deniedIndex = policies.findIndex(policy => !policy.allowed);
  if (deniedIndex >= 0) {
    throw new Error(
      `${String(paths[deniedIndex])}: original PR contains a path outside hosted repair policy`
    );
  }
  return [...new Set(policies.map(policy => policy.path))].sort();
}

function normalizeHostedPullRequestFiles(records) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 40) {
    throw new Error('hosted repair requires bounded original-PR file records');
  }
  const acceptedStatuses = new Set(['added', 'modified']);
  const normalized = records.map((record, index) => {
    const filename = String(record?.filename ?? '');
    const status = String(record?.status ?? '');
    const previousFilename = String(record?.previous_filename ?? '');
    if (!filename) {
      throw new Error(`original PR file record ${index} is missing filename`);
    }
    if (!acceptedStatuses.has(status) || previousFilename) {
      throw new Error(
        `${filename}: original PR file transition ${status || 'missing'} is not eligible for hosted repair`
      );
    }
    return { filename, status };
  });
  const allowedPaths = normalizeHostedAllowedPaths(
    normalized.map(record => record.filename)
  );
  if (
    new Set(normalized.map(record => record.filename)).size !==
    normalized.length
  ) {
    throw new Error('original PR file records contain duplicate paths');
  }
  return {
    records: normalized.sort((a, b) => a.filename.localeCompare(b.filename)),
    allowedPaths,
  };
}

function assertHostedRepairPlan(plan) {
  if (
    plan?.schema !== HOSTED_REPAIR_PLAN_SCHEMA ||
    plan.policyVersion !== ROLLING_CI_POLICY_VERSION ||
    plan.repository !== TRUSTED_REPOSITORY ||
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
  assertExactSha(plan.policySha, 'policySha');
  assertSafeHeadRef(plan.headRefName);
  const expectedKey = `${plan.repository}:pr-${plan.prNumber}:${plan.expectedHeadOid}:${plan.fingerprint}:${plan.policySha}:${plan.policyVersion}`;
  if (plan.idempotencyKey !== expectedKey) {
    throw new Error('hosted repair idempotency key is not exact-head bound');
  }
  const sourceFiles = normalizeHostedPullRequestFiles(plan.sourceFiles);
  if (
    JSON.stringify(plan.sourceFiles) !== JSON.stringify(sourceFiles.records)
  ) {
    throw new Error('hosted repair source file records are not normalized');
  }
  const allowedPaths = normalizeHostedAllowedPaths(plan.allowedPaths);
  if (JSON.stringify(plan.allowedPaths) !== JSON.stringify(allowedPaths)) {
    throw new Error('hosted repair allowed paths are not normalized');
  }
  if (
    JSON.stringify(plan.allowedPaths) !==
    JSON.stringify(sourceFiles.allowedPaths)
  ) {
    throw new Error(
      'hosted repair allowed paths do not match source file records'
    );
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
    ![
      'dispatch_implementer',
      'dispatch_superseding_head',
      'dispatch_superseding_policy',
    ].includes(input.dispatch?.action) ||
    !event
  ) {
    throw new Error('dispatch does not authorize a hosted repair');
  }
  const sourceFiles = normalizeHostedPullRequestFiles(input.fileRecords);
  const plan = {
    schema: HOSTED_REPAIR_PLAN_SCHEMA,
    policyVersion: ROLLING_CI_POLICY_VERSION,
    repository: event.repository,
    prNumber: event.pr,
    expectedHeadOid: event.head,
    policySha: input.policySha,
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
    sourceFiles: sourceFiles.records,
    allowedPaths: sourceFiles.allowedPaths,
    idempotencyKey: `${event.repository}:pr-${event.pr}:${event.head}:${event.fingerprint}:${input.policySha}:${ROLLING_CI_POLICY_VERSION}`,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
  };
  return assertHostedRepairPlan(plan);
}

export function buildHostedPrelaunchReceipt({ plan, now = new Date() }) {
  assertHostedRepairPlan(plan);
  return {
    schema: HOSTED_PRELAUNCH_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'prelaunch',
    status: 'planned',
    terminal: false,
    repository: plan.repository,
    prNumber: plan.prNumber,
    expectedHeadOid: plan.expectedHeadOid,
    fingerprint: plan.fingerprint,
    idempotencyKey: plan.idempotencyKey,
    maxConcurrent: HOSTED_REPAIR_MAX_CONCURRENT,
    observedAt: new Date(now).toISOString(),
  };
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
 * @param {{receipt?: Record<string, any>, now?: Date, maxAgeMs?: number}} [options]
 */
export function validateHostedGateAdmission({
  receipt,
  now = new Date(),
  maxAgeMs = HOSTED_GATE_MAX_AGE_MS,
} = {}) {
  const observedAt = Date.parse(receipt?.observedAt ?? '');
  const ageMs = new Date(now).getTime() - observedAt;
  const remediation = receipt?.remediationAdmission;
  const gem = receipt?.concurrency?.gem;
  const valid =
    receipt?.schema === 'jovie-fleet-gate/v1' &&
    Number.isFinite(observedAt) &&
    ageMs >= -60_000 &&
    ageMs <= maxAgeMs &&
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

export function validateHostedPolicyBase({ eventPolicySha, currentMainSha }) {
  assertExactSha(eventPolicySha, 'eventPolicySha');
  assertExactSha(currentMainSha, 'currentMainSha');
  const accepted = eventPolicySha === currentMainSha;
  return {
    schema: HOSTED_POLICY_RECEIPT_SCHEMA,
    accepted,
    status: accepted ? 'accepted' : 'blocked',
    reason: accepted ? null : 'stale_policy_base',
    eventPolicySha,
    currentMainSha,
  };
}

export function resolveHostedHandoffAdmission({
  comments,
  repository,
  prNumber,
  liveHead,
  now = new Date().toISOString(),
}) {
  if (
    repository !== TRUSTED_REPOSITORY ||
    !Number.isInteger(prNumber) ||
    prNumber < 1 ||
    !/^[0-9a-f]{40}$/.test(String(liveHead ?? '')) ||
    !Array.isArray(comments)
  ) {
    return { valid: false, allowed: false, reason: 'invalid-handoff-input' };
  }
  if (comments.length === 0) {
    return {
      schema: 'jovie-hosted-ci-handoff-admission/v1',
      valid: true,
      allowed: true,
      reason: 'no-handoff-receipt',
      repository,
      prNumber,
      liveHead,
    };
  }
  if (comments.length !== 1) {
    return {
      schema: 'jovie-hosted-ci-handoff-admission/v1',
      valid: false,
      allowed: false,
      reason: 'ambiguous-handoff-receipts',
      repository,
      prNumber,
      liveHead,
    };
  }
  const body = String(comments[0] ?? '');
  const markers = [
    ...body.matchAll(
      /<!-- jovie-rolling-ci-handoff:([A-Za-z0-9_-]+) -->/g
    ),
  ];
  const receipt = markers.length === 1 ? parseHandoffReceipt(body) : null;
  if (!receipt || receipt.pr !== prNumber) {
    return {
      schema: 'jovie-hosted-ci-handoff-admission/v1',
      valid: false,
      allowed: false,
      reason: 'invalid-handoff-receipt',
      repository,
      prNumber,
      liveHead,
    };
  }
  const validation = validateHandoffReceipt(receipt, { liveHead, now });
  const nonBlockingErrors = new Set([
    'stale handoff head',
    'implementer lease is expired',
  ]);
  const hardErrors = validation.errors.filter(
    error => !nonBlockingErrors.has(error)
  );
  if (hardErrors.length > 0) {
    return {
      schema: 'jovie-hosted-ci-handoff-admission/v1',
      valid: false,
      allowed: false,
      reason: 'invalid-handoff-receipt',
      errors: hardErrors,
      repository,
      prNumber,
      liveHead,
    };
  }
  if (isImplementerLeaseLive(receipt, { liveHead, now })) {
    return {
      schema: 'jovie-hosted-ci-handoff-admission/v1',
      valid: true,
      allowed: false,
      reason: 'implementer-lease-live',
      repository,
      prNumber,
      liveHead,
      remediationOwner: receipt.remediationOwner,
      leaseExpiresAt: receipt.leaseExpiresAt,
    };
  }
  return {
    schema: 'jovie-hosted-ci-handoff-admission/v1',
    valid: true,
    allowed: true,
    reason: validation.errors.includes('stale handoff head')
      ? 'stale-handoff-head'
      : validation.errors.includes('implementer lease is expired')
        ? 'implementer-lease-expired'
        : `handoff-${receipt.status}`,
    repository,
    prNumber,
    liveHead,
  };
}

export function validateHostedRepairPath(path) {
  const raw = String(path ?? '');
  const normalized = raw.replaceAll('\\', '/');
  const pathTokens = normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (
    !normalized ||
    normalized !== raw ||
    !/^[-A-Za-z0-9_./@+]+$/.test(normalized) ||
    normalized.startsWith('/') ||
    normalized.includes('/../') ||
    normalized.startsWith('../') ||
    HOSTED_DENIED_PATH_RE.some(pattern => pattern.test(normalized)) ||
    pathTokens.some(token => HOSTED_DENIED_PATH_TOKEN_RE.test(token)) ||
    !HOSTED_ALLOWED_PATH_RE.some(pattern => pattern.test(normalized))
  ) {
    return { allowed: false, reason: 'path-outside-hosted-repair-policy' };
  }
  return { allowed: true, path: normalized };
}

export function validateHostedCandidateTree({ repository, allowedPaths }) {
  const root = resolve(String(repository ?? ''));
  const allowed = normalizeHostedAllowedPaths(allowedPaths);

  function scan(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!prefix && entry.name === '.git') continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = join(directory, entry.name);
      const stat = lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`${path}: candidate symlink is forbidden`);
      }
      if (stat.isDirectory()) scan(fullPath, path);
    }
  }

  scan(root);
  const trackedModes = new Map();
  const records = execFileSync('git', ['ls-files', '--stage', '-z'], {
    cwd: root,
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  for (const record of records) {
    const match = /^(\d{6}) [0-9a-f]+ \d+\t(.+)$/.exec(record);
    if (!match) throw new Error('candidate git index is malformed');
    const [, mode, path] = match;
    if (mode === '160000') {
      throw new Error(`${path}: candidate gitlink is forbidden`);
    }
    trackedModes.set(path, mode);
  }
  for (const path of allowed) {
    const mode = trackedModes.get(path);
    if (!['100644', '100755'].includes(mode)) {
      throw new Error(
        `${path}: hosted repair path is not a regular tracked file`
      );
    }
    if (!lstatSync(join(root, path)).isFile()) {
      throw new Error(`${path}: hosted repair path is not a regular file`);
    }
  }
  return {
    schema: 'jovie-hosted-ci-candidate-tree/v1',
    accepted: true,
    allowedPaths: allowed,
  };
}

export function applyHostedPatchProposal({ plan, repository, proposalBytes }) {
  assertHostedRepairPlan(plan);
  const root = resolve(String(repository ?? ''));
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (currentHead !== plan.expectedHeadOid) {
    throw new Error('candidate checkout is not the exact planned head');
  }
  validateHostedCandidateTree({
    repository: root,
    allowedPaths: plan.allowedPaths,
  });
  if (
    execFileSync(
      'git',
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      { cwd: root }
    ).length > 0
  ) {
    throw new Error('candidate checkout must be clean before proposal apply');
  }

  const patch = Buffer.from(proposalBytes ?? '');
  const text = patch.toString('utf8');
  if (
    patch.length < 1 ||
    patch.length > HOSTED_REPAIR_MAX_PATCH_BYTES ||
    !Buffer.from(text, 'utf8').equals(patch) ||
    text.includes('\0') ||
    text.includes('\r') ||
    !text.startsWith('diff --git ')
  ) {
    throw new Error('hosted proposal is not a bounded UTF-8 git patch');
  }
  if (
    /^(?:new file mode|deleted file mode|old mode|new mode|similarity index|rename from|rename to|copy from|copy to|GIT binary patch|Binary files )/m.test(
      text
    )
  ) {
    throw new Error('hosted proposal contains a forbidden file transition');
  }
  const diffHeaders = [...text.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
  const rawHeaderCount = (text.match(/^diff --git /gm) ?? []).length;
  if (diffHeaders.length < 1 || diffHeaders.length !== rawHeaderCount) {
    throw new Error('hosted proposal contains an unsupported diff header');
  }
  const allowedPaths = new Set(plan.allowedPaths);
  const paths = [];
  for (const [, before, after] of diffHeaders) {
    if (before !== after) {
      throw new Error('hosted proposal may not rename or copy files');
    }
    const policy = validateHostedRepairPath(after);
    if (!policy.allowed || !allowedPaths.has(policy.path)) {
      throw new Error(`${after}: proposal path is outside planned authority`);
    }
    if (paths.includes(policy.path)) {
      throw new Error('hosted proposal contains duplicate diff paths');
    }
    paths.push(policy.path);
  }
  const oldPaths = [...text.matchAll(/^--- a\/(\S+)$/gm)].map(
    match => match[1]
  );
  const newPaths = [...text.matchAll(/^\+\+\+ b\/(\S+)$/gm)].map(
    match => match[1]
  );
  if (
    JSON.stringify(oldPaths) !== JSON.stringify(paths) ||
    JSON.stringify(newPaths) !== JSON.stringify(paths)
  ) {
    throw new Error('hosted proposal file headers do not match diff authority');
  }

  execFileSync('git', ['apply', '--check', '--whitespace=error-all', '-'], {
    cwd: root,
    input: patch,
    maxBuffer: HOSTED_REPAIR_MAX_PATCH_BYTES + 1,
  });
  execFileSync('git', ['apply', '--whitespace=error-all', '-'], {
    cwd: root,
    input: patch,
    maxBuffer: HOSTED_REPAIR_MAX_PATCH_BYTES + 1,
  });
  const changed = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: root }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  if (
    changed.length !== paths.length ||
    changed.some(record => record.slice(0, 3) !== ' M ') ||
    JSON.stringify(changed.map(record => record.slice(3)).sort()) !==
      JSON.stringify([...paths].sort())
  ) {
    throw new Error('applied proposal produced an unauthorized git transition');
  }
  return {
    schema: 'jovie-hosted-ci-proposal-apply/v1',
    applied: true,
    paths: [...paths].sort(),
    proposalSha256: sha256(patch),
  };
}

function validateHostedChanges(changes, allowedPaths = null) {
  if (
    !Array.isArray(changes) ||
    changes.length < 1 ||
    changes.length > HOSTED_REPAIR_MAX_FILES
  ) {
    throw new Error('hosted repair must modify a bounded non-empty file set');
  }
  const unique = new Set();
  const allowed = allowedPaths
    ? new Set(normalizeHostedAllowedPaths(allowedPaths))
    : null;
  for (const change of changes) {
    const policy = validateHostedRepairPath(change?.path);
    if (!policy.allowed) throw new Error(`${change?.path}: ${policy.reason}`);
    if (allowed && !allowed.has(policy.path)) {
      throw new Error(
        `${policy.path}: path was not changed by the original PR`
      );
    }
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

export function verifyHostedRepairFiles({ plan, changes, fileContents }) {
  assertHostedRepairPlan(plan);
  const acceptedChanges = validateHostedChanges(changes, plan.allowedPaths);
  for (const change of acceptedChanges) {
    const contents = fileContents?.[change.path];
    if (
      !Buffer.isBuffer(contents) ||
      contents.length !== change.bytes ||
      sha256(contents) !== change.sha256
    ) {
      throw new Error(`${change.path}: tested file hash mismatch`);
    }
  }
  return {
    verified: true,
    changedFiles: acceptedChanges.map(change => change.path),
    manifestSha256: sha256(Buffer.from(JSON.stringify(acceptedChanges))),
  };
}

function isTrustedHostedExecutor(executor) {
  return (
    executor?.kind === 'cursor-cli' &&
    executor.archiveUrl === HOSTED_CURSOR_ARCHIVE_URL &&
    executor.archiveSha256 === HOSTED_CURSOR_ARCHIVE_SHA256 &&
    executor.version === HOSTED_CURSOR_VERSION &&
    /^[0-9a-f]{64}$/.test(executor.binarySha256 ?? '')
  );
}

export function buildHostedAcceptanceReceipt({
  plan,
  gateReceipt,
  patchBytes,
  changes,
  executor,
  now = new Date(),
}) {
  assertHostedRepairPlan(plan);
  const gate = validateHostedGateAdmission({ receipt: gateReceipt, now });
  if (!gate.accepted) throw new Error(gate.reason);
  const patch = Buffer.from(patchBytes ?? '');
  if (patch.length < 1 || patch.length > HOSTED_REPAIR_MAX_PATCH_BYTES) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  const acceptedChanges = validateHostedChanges(changes, plan.allowedPaths);
  if (!isTrustedHostedExecutor(executor)) {
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
    testCommands: [...HOSTED_REPAIR_TEST_COMMANDS],
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
    const gate = validateHostedGateAdmission({ receipt: gateReceipt, now });
    if (!gate.accepted) return gate;
    if (
      acceptance?.schema !== HOSTED_ACCEPTANCE_RECEIPT_SCHEMA ||
      acceptance.policyVersion !== plan.policyVersion ||
      acceptance.repository !== plan.repository ||
      acceptance.prNumber !== plan.prNumber ||
      acceptance.expectedHeadOid !== plan.expectedHeadOid ||
      acceptance.fingerprint !== plan.fingerprint ||
      acceptance.idempotencyKey !== plan.idempotencyKey ||
      acceptance.maxConcurrent !== HOSTED_REPAIR_MAX_CONCURRENT ||
      acceptance.testsPassed !== true ||
      acceptance.patchSha256 !== sha256(Buffer.from(patchBytes ?? '')) ||
      acceptance.gate?.receiptSha256 === undefined ||
      acceptance.gate.receiptSha256 !== gate.receiptSha256 ||
      !isTrustedHostedExecutor(acceptance.executor) ||
      JSON.stringify(acceptance.testCommands) !==
        JSON.stringify(HOSTED_REPAIR_TEST_COMMANDS)
    ) {
      return { accepted: false, reason: 'acceptance-identity-mismatch' };
    }
    validateHostedChanges(acceptance.changedFiles, plan.allowedPaths);
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
    'candidate_committed',
    'repaired',
    'superseded_green',
    'stale_head',
    'stale_policy_base',
    'capacity_denied',
    'patch_rejected',
    'tests_failed',
    'executor_failed',
    'recursive_dispatch_blocked',
    'writer_failed',
  ]);
  if (!allowedOutcomes.has(outcome))
    throw new Error('invalid terminal outcome');
  if (['candidate_committed', 'repaired'].includes(outcome))
    assertExactSha(committedHeadOid, 'committedHeadOid');
  return {
    schema: HOSTED_TERMINAL_RECEIPT_SCHEMA,
    policyVersion: plan.policyVersion,
    stage: 'terminal',
    status:
      outcome === 'candidate_committed'
        ? 'awaiting_verification'
        : outcome === 'repaired'
          ? 'completed'
          : 'aborted',
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

export function promoteHostedCandidateReceipt({
  commentAuthor,
  commentBody,
  repository,
  prNumber,
  greenHead,
  policySha,
  workflowRunId,
  workflowRunAttempt,
  checkSuiteId,
  now = new Date(),
}) {
  if (commentAuthor !== 'github-actions[bot]') {
    return { promoted: false, reason: 'untrusted-comment-author' };
  }
  if (repository !== TRUSTED_REPOSITORY) {
    return { promoted: false, reason: 'untrusted-repository' };
  }
  if (!Number.isInteger(prNumber) || prNumber < 1) {
    return { promoted: false, reason: 'invalid-pr-number' };
  }
  try {
    assertExactSha(greenHead, 'greenHead');
    assertExactSha(policySha, 'policySha');
    if (!/^\d+$/.test(String(workflowRunId ?? ''))) {
      throw new Error('workflowRunId must be numeric');
    }
    assertPositiveInteger(workflowRunAttempt, 'workflowRunAttempt');
    if (!/^\d+$/.test(String(checkSuiteId ?? ''))) {
      throw new Error('checkSuiteId must be numeric');
    }
  } catch {
    return { promoted: false, reason: 'invalid-green-identity' };
  }
  const markers = [
    ...String(commentBody ?? '').matchAll(
      /<!-- jovie-hosted-ci-terminal-receipt:([A-Za-z0-9+/=_-]+) -->/g
    ),
  ];
  if (markers.length === 0) {
    return { promoted: false, reason: 'no-candidate-receipt' };
  }
  if (markers.length !== 1) {
    return { promoted: false, reason: 'ambiguous-candidate-receipt' };
  }

  try {
    const candidate = JSON.parse(
      Buffer.from(markers[0][1], 'base64').toString('utf8')
    );
    assertExactSha(candidate.expectedHeadOid, 'expectedHeadOid');
    assertExactSha(candidate.committedHeadOid, 'committedHeadOid');
    const expectedIdempotencyKey = `${repository}:pr-${prNumber}:${candidate.expectedHeadOid}:${candidate.fingerprint}:${policySha}:${ROLLING_CI_POLICY_VERSION}`;
    if (
      candidate.schema !== HOSTED_TERMINAL_RECEIPT_SCHEMA ||
      candidate.policyVersion !== ROLLING_CI_POLICY_VERSION ||
      candidate.stage !== 'terminal' ||
      candidate.status !== 'awaiting_verification' ||
      candidate.terminal !== true ||
      candidate.outcome !== 'candidate_committed' ||
      candidate.repository !== repository ||
      candidate.prNumber !== prNumber ||
      candidate.committedHeadOid !== greenHead ||
      candidate.expectedHeadOid === greenHead ||
      !String(candidate.fingerprint ?? '').startsWith('ci:') ||
      candidate.idempotencyKey !== expectedIdempotencyKey ||
      !/^[0-9a-f]{64}$/.test(String(candidate.acceptanceSha256 ?? '')) ||
      !Number.isFinite(Date.parse(candidate.observedAt ?? ''))
    ) {
      return { promoted: false, reason: 'candidate-identity-mismatch' };
    }
    return {
      promoted: true,
      receipt: {
        ...candidate,
        status: 'completed',
        outcome: 'repaired',
        observedAt: new Date(now).toISOString(),
        verification: {
          workflow: 'CI',
          producerEvent: 'pull_request',
          conclusion: 'success',
          headOid: greenHead,
          policySha,
          workflowRunId: String(workflowRunId),
          workflowRunAttempt,
          checkSuiteId: String(checkSuiteId),
          runUrl: `https://github.com/${repository}/actions/runs/${workflowRunId}/attempts/${workflowRunAttempt}`,
        },
      },
    };
  } catch {
    return { promoted: false, reason: 'invalid-candidate-receipt' };
  }
}

export function resolveHostedTerminalOutcome(input = {}) {
  const typedOutcomes = [
    input.prelaunchTerminalOutcome,
    input.prepareTerminalOutcome,
    input.testTerminalOutcome,
    input.writeGateTerminalOutcome,
  ].filter(Boolean);
  if (typedOutcomes.includes('stale_policy_base')) {
    return 'stale_policy_base';
  }
  if (typedOutcomes.includes('capacity_denied')) {
    return 'capacity_denied';
  }
  if (
    input.prelaunchGateResult !== 'success' ||
    input.writeGateResult === 'failure'
  ) {
    return 'capacity_denied';
  }
  if (input.prepareResult !== 'success') return 'executor_failed';
  if (input.testResult !== 'success') return 'tests_failed';
  return 'writer_failed';
}

export function classifyHostedReceiptLiveness({
  plan,
  prelaunch,
  acceptance = null,
  terminal = null,
  now = new Date(),
}) {
  try {
    assertHostedRepairPlan(plan);
  } catch {
    return { live: false, state: 'invalid' };
  }
  const identityMatches = receipt =>
    receipt?.policyVersion === plan.policyVersion &&
    receipt?.repository === plan.repository &&
    receipt?.prNumber === plan.prNumber &&
    receipt?.expectedHeadOid === plan.expectedHeadOid &&
    receipt?.fingerprint === plan.fingerprint &&
    receipt?.idempotencyKey === plan.idempotencyKey;
  if (
    terminal?.schema === HOSTED_TERMINAL_RECEIPT_SCHEMA &&
    terminal.terminal === true &&
    identityMatches(terminal)
  ) {
    return { live: false, state: 'terminal', outcome: terminal.outcome };
  }
  if (
    acceptance?.schema === HOSTED_ACCEPTANCE_RECEIPT_SCHEMA &&
    identityMatches(acceptance)
  ) {
    const ageMs = new Date(now).getTime() - Date.parse(acceptance.observedAt);
    return Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs <= HOSTED_ACCEPTANCE_TTL_MS
      ? { live: true, state: 'accepted' }
      : { live: false, state: 'stale_acceptance' };
  }
  if (
    prelaunch?.schema === HOSTED_PRELAUNCH_RECEIPT_SCHEMA &&
    identityMatches(prelaunch)
  ) {
    return { live: false, state: 'prelaunch_only' };
  }
  return { live: false, state: 'missing' };
}

const CHECKOUT_FAILURE_RE = /checkout/i;
const INFRA_FAILURE_RE =
  /startup_failure|timed_out|heartbeat|hosted runner|lost communication|set up job|initialize containers|\brunner\b/i;
const FLAKE_FAILURE_RE =
  /flake|eagain|etimedout|rate.?limit|\b50[23]\b|spurious/i;
const PRODUCT_FAILURE_RE =
  /typecheck|unit tests|knip|eval|brand safety|overflow|layout|\blint\b|promptfoo/i;

export function cursorAuthHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`;
}

export function findOwnedAgents(agents, fingerprint) {
  const needle = String(fingerprint ?? '');
  if (!needle) return [];
  return (Array.isArray(agents) ? agents : [])
    .filter(agent =>
      JSON.stringify(agent ?? {})
        .toLowerCase()
        .includes(needle.toLowerCase())
    )
    .map(agent => agent?.id)
    .filter(id => typeof id === 'string' && id.length > 0);
}

const CURSOR_ERROR_BODY_LIMIT = 512;
const SENSITIVE_KEY_RE =
  /api[-_]?key|authorization|cookie|password|secret|token/i;

function sanitizeCursorDiagnostic(value) {
  const serialized =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, (key, nestedValue) =>
          SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : nestedValue
        );
  return String(serialized ?? '')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._-]+/gi, '$1 [REDACTED]')
    .slice(0, CURSOR_ERROR_BODY_LIMIT);
}

async function readCursorResponse(response) {
  if (typeof response.text === 'function') {
    const raw = await response.text();
    try {
      return { body: JSON.parse(raw), raw };
    } catch {
      return { body: {}, raw };
    }
  }
  const body = await response.json().catch(() => ({}));
  return { body, raw: JSON.stringify(body) };
}

function cursorApiError(operation, response, body, raw) {
  const details =
    body?.error && typeof body.error === 'object' ? body.error : body;
  const code = sanitizeCursorDiagnostic(details?.code ?? 'unknown');
  const message = sanitizeCursorDiagnostic(details?.message ?? 'unknown');
  const diagnosticBody = sanitizeCursorDiagnostic(
    body && Object.keys(body).length > 0 ? body : raw
  );
  return new Error(
    `cursor ${operation} failed: ${response.status}; code=${code}; message=${message}; body=${diagnosticBody}`
  );
}

function blockedExecutorIncident() {
  return {
    type: 'fx_safe_executor_unavailable',
    failure: 'fx-safe-executor-unavailable',
    owner: 'CI Platform',
    remedy:
      'provide a GitHub-runner-local executor that returns an exact-head terminal result without pushing, opening a PR, or mutating the queue',
  };
}

function blockedExecutorReceipt({
  repository,
  prNumber,
  headSha,
  fingerprint,
}) {
  return {
    schema: FX_EXECUTION_RECEIPT_SCHEMA,
    status: 'blocked',
    terminal: true,
    outcome: 'executor_unavailable',
    executor: 'cursor-cloud',
    repository,
    prNumber,
    headSha,
    fingerprint,
    agentId: null,
    runId: null,
    result: 'remote_mutation_not_authorized',
    remoteMutationAllowed: false,
  };
}

function terminalizeDispatch(dispatch, receipt) {
  const next = structuredClone(dispatch);
  const fingerprint = receipt.fingerprint;
  const failure = next.state?.failures?.[fingerprint];
  if (failure) {
    failure.terminalReceipt = receipt;
  }
  if (next.state?.claim?.fingerprint === fingerprint) {
    next.state.claim.status = 'terminal';
    next.state.claim.reason = receipt.result;
  }
  next.action = 'terminal_configuration_incident';
  const withoutMarker = String(next.body ?? '')
    .replace(/<!-- jovie-rolling-ci-state:[A-Za-z0-9+/=_-]+ -->/g, '')
    .replace(
      /The one-writer lease is pinned to this exact head\.[\s\S]*?before changing code\./,
      'The repair claim is terminal for this exact head and fingerprint. A new commit or green rerun supersedes it.'
    )
    .trim();
  next.body = `${withoutMarker}\n\n## FX execution terminal\n\n- Status: blocked\n- Reason: \`${receipt.result}\`\n- Owner: CI Platform\n- Next action: install a GitHub-runner-local executor; Cursor Cloud cannot repair repository code without pushing a branch.\n\n<!-- jovie-fx-execution-receipt:${Buffer.from(
    JSON.stringify(receipt)
  ).toString('base64url')} -->\n${rollingCiStateMarker(next.state)}`;
  return next;
}

/**
 * Webhook ingress: missing handoff routes to FX. Pickup-end
 * `resolveRemediationRoute` still keeps the implementer when no receipt.
 * @param {Record<string, any>} [input]
 */
export function resolveWebhookRemediationRoute(input = {}) {
  const {
    receipt = null,
    liveHead,
    implementer,
    fxAdapter = null,
    now,
  } = input;
  if (receipt) {
    const pickup = resolveRemediationRoute({
      receipt,
      liveHead,
      implementer,
      fxAdapter,
      now,
    });
    return pickup.route === 'implementer'
      ? { ...pickup, reason: 'implementer_lease_live' }
      : pickup;
  }

  const adapter = resolveFxAdapter(fxAdapter);
  if (!adapter.name || adapter.authConfigured !== true) {
    return {
      route: 'configuration_incident',
      writer: null,
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
  return {
    route: 'fx',
    writer: adapter.name,
    failure: FX_HANDOFF_FAILURE,
    reason: 'no_handoff_receipt',
  };
}

function sourcePrWriter(value) {
  return String(value ?? '').trim();
}

function failureLabels(failedJobs = []) {
  const labels = [];
  for (const job of failedJobs) {
    labels.push(String(job?.name ?? ''), String(job?.conclusion ?? ''));
    for (const step of job?.steps ?? []) {
      labels.push(String(step?.name ?? step));
    }
  }
  return labels.filter(Boolean);
}

function failedJobsFrom(input = {}) {
  if (Array.isArray(input.failedJobs) && input.failedJobs.length > 0) {
    return input.failedJobs;
  }
  return (input.dispatch?.events ?? []).map(event => ({
    name: event.check,
    steps: event.failedSteps ?? [],
    conclusion: event.conclusion,
  }));
}

/**
 * Runner-class CI failures are checkout, infra, or flake — not product
 * assertions. Mixed product steps stay on the implementer path.
 *
 * @param {unknown} failedJobs
 * @returns {'checkout' | 'infra' | 'flake' | null}
 */
export function classifyRunnerFailure(failedJobs = []) {
  const jobs = Array.isArray(failedJobs) ? failedJobs : [];
  const labels = failureLabels(jobs);
  if (labels.some(label => PRODUCT_FAILURE_RE.test(label))) return null;
  if (labels.some(label => CHECKOUT_FAILURE_RE.test(label))) return 'checkout';
  if (labels.some(label => FLAKE_FAILURE_RE.test(label))) return 'flake';
  if (labels.some(label => INFRA_FAILURE_RE.test(label))) return 'infra';
  if (
    jobs.some(
      job =>
        job?.conclusion === 'startup_failure' || job?.conclusion === 'timed_out'
    )
  ) {
    return 'infra';
  }
  return null;
}

/** @param {Record<string, any>} [input] */
export function resolveFxNamedOutcome(input = {}) {
  const action = input.launch?.action;
  const reason = String(input.launch?.reason ?? '');
  const dispatchAction = String(input.dispatch?.action ?? '');
  if (action === 'launch' || action === 'dedup') return 'launched';
  if (action === 'configuration_incident' || reason === 'fx-auth-missing') {
    if (reason === 'fx-safe-executor-unavailable') return 'blocked_executor';
    return 'no_key';
  }
  if (action === 'writer_missing') return 'writer_missing';
  if (
    (action === 'skip' && /stale/.test(reason)) ||
    /stale/.test(dispatchAction)
  ) {
    return 'skipped_stale';
  }
  if (dispatchAction === 'supersede_repairs_green') return 'repaired';
  return 'needs_human';
}

/**
 * Webhook writer for `runDispatch`. merge_group LIVE_AUTHOR can be blank
 * (`gh api pulls/$PR .user.login`). Prefer the source PR author; if still
 * blank, including a live implementer lease with an empty owner, use the
 * adapter name so planning reaches `launch_action` instead of throwing
 * `writer is required`.
 *
 * @param {Record<string, any>} [input]
 */
export function resolveDispatchWriter(input = {}) {
  const { route, priorClaimWriter, implementer } = input;
  const sourceWriter = sourcePrWriter(implementer);
  if (route?.route === 'implementer') {
    return sourcePrWriter(route.writer) || sourceWriter || FX_ADAPTER_NAME;
  }
  if (route?.route === 'fx') {
    const prior = sourcePrWriter(priorClaimWriter);
    if (prior && prior !== FX_ADAPTER_NAME) {
      return prior;
    }
    return sourceWriter || FX_ADAPTER_NAME;
  }
  return sourceWriter || FX_ADAPTER_NAME;
}

/** @param {Record<string, any>} [input] */
export function buildFxPrompt(input = {}) {
  const {
    repository,
    prNumber,
    headSha,
    sourceHead,
    fingerprint,
    failedChecks = [],
    producerEvent,
    runnerClass = null,
  } = input;
  const mergeGroup = producerEvent === 'merge_group';
  return [
    mergeGroup
      ? 'Repair the source pull request after a native merge_group CI failure. Do not open a sibling PR.'
      : 'Repair the current pull request at the exact failed head. Do not open a sibling PR.',
    runnerClass
      ? `Runner-class failure (${runnerClass}): checkout, infra, or flake. Remediate the runner/CI wiring at the exact head. Do not change product tests or weaken gates. Idempotency: ${FX_RUNNER_IDEMPOTENCY_KEY}.`
      : '',
    `Repository: ${repository}`,
    `PR: #${prNumber}`,
    mergeGroup
      ? `Failed merge_group head: ${headSha}`
      : `Exact head: ${headSha}`,
    mergeGroup && sourceHead ? `Source PR head: ${sourceHead}` : '',
    `Failure fingerprint: ${fingerprint}`,
    failedChecks.length ? `Failed checks: ${failedChecks.join(', ')}` : '',
    mergeGroup
      ? 'The failure reproduced on the combined queue head versus current main. Fix the source PR so the next merge_group succeeds. Do not waive ratchet growth.'
      : '',
    'Add or update the smallest regression test. Do not skip drafts. Do not merge.',
    'Do not invent a second fleet hold. Area collision holds only.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** @param {Record<string, any>} [input] */
export function planFxLaunch(input = {}) {
  const {
    repository,
    prNumber,
    headSha,
    sourceHead,
    fingerprint,
    failedChecks = [],
    cursorAgents = [],
    cursorApiKey,
    remoteMutationAllowed = false,
    producerEvent,
    runnerClass = null,
  } = input;
  if (remoteMutationAllowed !== true) {
    const receipt = blockedExecutorReceipt({
      repository,
      prNumber,
      headSha,
      fingerprint,
    });
    return {
      action: 'configuration_incident',
      reason: 'fx-safe-executor-unavailable',
      incident: blockedExecutorIncident(),
      receipt,
    };
  }
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'configuration_incident',
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
  const owned = findOwnedAgents(cursorAgents, fingerprint);
  if (owned.length > 0) {
    return {
      action: 'dedup',
      reason: 'agent_already_owns_fingerprint',
      existingAgentIds: owned,
    };
  }
  return {
    action: 'launch',
    reason: 'ci-failed-after-webhook',
    request: {
      prompt: {
        text: buildFxPrompt({
          repository,
          prNumber,
          headSha,
          sourceHead,
          fingerprint,
          failedChecks,
          producerEvent,
          runnerClass,
        }),
      },
      name: `Jovie CI repair ${fingerprint}`.slice(0, 100),
      repos: [
        {
          url: `https://github.com/${repository}`,
          prUrl: `https://github.com/${repository}/pull/${prNumber}`,
        },
      ],
      workOnCurrentBranch: true,
      autoCreatePR: false,
    },
  };
}

/**
 * @param {Record<string, any>} [input]
 * @returns {Record<string, any>}
 */
export function planFxWebhookRemediation(input = {}) {
  const {
    dispatch,
    receipt = null,
    liveHead,
    implementer,
    fxAdapter,
    cursorAgents = [],
    cursorApiKey = '',
    remoteMutationAllowed = false,
    now,
    repository,
    prNumber,
    headSha,
    sourceHead,
    headRef,
  } = input;
  const runnerClass = classifyRunnerFailure(
    failedJobsFrom({ ...input, dispatch })
  );
  const route = resolveWebhookRemediationRoute({
    receipt,
    liveHead,
    implementer,
    fxAdapter: fxAdapter ?? {
      name: FX_ADAPTER_NAME,
      authConfigured: Boolean(String(cursorApiKey ?? '').trim()),
    },
    now,
  });
  const action = dispatch?.action ?? '';
  const isFailureDispatch =
    action === 'dispatch_implementer' ||
    action === 'dispatch_superseding_head' ||
    action === 'dispatch_superseding_policy' ||
    action === 'reject_competing_writer';
  const allowRunnerClassFx = Boolean(runnerClass);

  /**
   * @param {Record<string, any>} result
   * @returns {Record<string, any>}
   */
  const withOutcome = result => {
    const terminalReceipt = result.launch?.receipt;
    const finalizedDispatch = terminalReceipt
      ? terminalizeDispatch(result.dispatch, terminalReceipt)
      : result.dispatch;
    return {
      ...result,
      dispatch: finalizedDispatch,
      runnerClass,
      outcome: resolveFxNamedOutcome({
        launch: result.launch,
        dispatch: finalizedDispatch,
      }),
    };
  };

  if (route.route === 'implementer' && !allowRunnerClassFx) {
    return withOutcome({
      dispatch,
      route,
      launch: { action: 'skip', reason: 'implementer_lease_live' },
    });
  }
  if (route.route === 'configuration_incident') {
    return withOutcome({
      dispatch,
      route,
      launch: {
        action: 'configuration_incident',
        reason: 'fx-auth-missing',
        incident: route.incident,
      },
    });
  }
  if ((route.route !== 'fx' && !allowRunnerClassFx) || !isFailureDispatch) {
    return withOutcome({
      dispatch,
      route,
      launch: { action: 'skip', reason: action || route.route },
    });
  }

  return withOutcome({
    dispatch,
    route,
    launch: planFxLaunch({
      repository: repository ?? dispatch?.events?.[0]?.repository,
      prNumber: prNumber ?? dispatch?.events?.[0]?.pr,
      headSha: headSha ?? liveHead ?? dispatch?.state?.head,
      sourceHead,
      headRef,
      producerEvent: dispatch?.events?.[0]?.source?.producerEvent,
      fingerprint:
        dispatch?.state?.claim?.fingerprint ||
        dispatch?.events?.[0]?.fingerprint ||
        '',
      failedChecks: (dispatch?.events ?? []).map(event => event.check),
      cursorAgents,
      cursorApiKey,
      remoteMutationAllowed,
      runnerClass,
    }),
  });
}

/** @param {Record<string, any>} [input] */
export async function listCursorAgents(input = {}) {
  const { cursorApiKey, fetchImpl = fetch } = input;
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
  });
  const { body, raw } = await readCursorResponse(response);
  if (!response.ok) {
    throw cursorApiError('list', response, body, raw);
  }
  return Array.isArray(body?.items) ? body.items : [];
}

/** @param {Record<string, any>} [input] */
export async function launchCursorAgent(input = {}) {
  const { request, cursorApiKey, fetchImpl = fetch } = input;
  const response = await fetchImpl(CURSOR_AGENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: cursorAuthHeader(cursorApiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const { body, raw } = await readCursorResponse(response);
  if (!response.ok) {
    throw cursorApiError('launch', response, body, raw);
  }
  if (
    typeof body?.agent?.id !== 'string' ||
    body.agent.id.length === 0 ||
    typeof body?.run?.id !== 'string' ||
    body.run.id.length === 0 ||
    body.run.agentId !== body.agent.id
  ) {
    throw new Error('cursor launch returned no bound agent/run acceptance');
  }
  return body;
}

/**
 * @param {string} path
 * @param {{token: string, method?: string, body?: unknown, fetchImpl?: typeof fetch}} options
 */
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
  now = new Date(),
  request = githubJson,
}) {
  const variables = buildHostedCommitVariables({
    plan,
    acceptance,
    gateReceipt,
    patchBytes,
    fileContents,
    now,
  });
  const pr = await request(`/repos/${plan.repository}/pulls/${plan.prNumber}`, {
    token: readToken,
  });
  if (
    pr?.state !== 'open' ||
    pr?.base?.ref !== 'main' ||
    pr?.base?.repo?.full_name !== TRUSTED_REPOSITORY ||
    pr?.head?.repo?.full_name !== TRUSTED_REPOSITORY ||
    pr?.head?.repo?.fork === true ||
    pr?.head?.ref !== plan.headRefName
  ) {
    return { committed: false, outcome: 'stale_head' };
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
    !['failure', 'timed_out'].includes(latest?.conclusion)
  ) {
    return { committed: false, outcome: 'stale_head' };
  }

  const currentMain = await request(`/repos/${plan.repository}/commits/main`, {
    token: readToken,
  });
  if (
    !validateHostedPolicyBase({
      eventPolicySha: plan.policySha,
      currentMainSha: currentMain?.sha,
    }).accepted
  ) {
    return { committed: false, outcome: 'stale_policy_base' };
  }

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
    outcome: 'candidate_committed',
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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function hostedGateCommand(args) {
  const result = validateHostedGateAdmission({
    receipt: readJson(args.receipt),
  });
  if (!result.accepted) throw new Error(result.reason);
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function hostedPolicyCommand(args) {
  const result = validateHostedPolicyBase({
    eventPolicySha: args['event-sha'],
    currentMainSha: args['main-sha'],
  });
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function hostedHandoffAdmissionCommand(args) {
  const input = readJson(args.input);
  const result = resolveHostedHandoffAdmission(input);
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function hostedPlanCommand(args) {
  const input = readJson(args.input);
  const plan = buildHostedRepairPlan({
    dispatch: input.dispatch,
    headRefName: input.headRefName,
    fileRecords: input.fileRecords,
    policySha: input.policySha,
  });
  writeJson(args.output, plan);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

function hostedPrelaunchCommand(args) {
  const receipt = buildHostedPrelaunchReceipt({ plan: readJson(args.plan) });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedStageCommand(args) {
  const plan = assertHostedRepairPlan(readJson(args.plan));
  const repository = args.repository;
  const currentHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  if (currentHead !== plan.expectedHeadOid) {
    throw new Error('candidate checkout is not the exact planned head');
  }
  const rawStatus = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: repository }
  ).toString('utf8');
  const records = rawStatus.split('\0').filter(Boolean);
  const paths = records.map(record => {
    if (record.slice(0, 2) !== ' M' || record[2] !== ' ') {
      throw new Error(`unsafe candidate git transition: ${record.slice(0, 2)}`);
    }
    return record.slice(3);
  });
  const changes = validateHostedChanges(
    paths.map(path => {
      const fullPath = join(repository, path);
      const stat = lstatSync(fullPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`${path}: symlink repair is forbidden`);
      }
      const bytes = readFileSync(fullPath);
      return {
        path,
        status: 'M',
        symlink: false,
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    }),
    plan.allowedPaths
  );
  const patchBytes = execFileSync(
    'git',
    ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...paths],
    { cwd: repository, maxBuffer: HOSTED_REPAIR_MAX_PATCH_BYTES + 1 }
  );
  if (
    patchBytes.length < 1 ||
    patchBytes.length > HOSTED_REPAIR_MAX_PATCH_BYTES
  ) {
    throw new Error('hosted repair patch is empty or exceeds the byte limit');
  }
  mkdirSync(args.output, { recursive: true });
  writeFileSync(join(args.output, 'repair.patch'), patchBytes, { mode: 0o600 });
  writeJson(join(args.output, 'changes.json'), changes);
  writeJson(join(args.output, 'plan.json'), plan);
  for (const change of changes) {
    const destination = join(args.output, 'files', change.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(join(repository, change.path)), {
      mode: 0o600,
    });
  }
  process.stdout.write(
    `${JSON.stringify({ staged: true, changedFiles: changes.map(change => change.path) })}\n`
  );
}

function hostedAcceptanceCommand(args) {
  const receipt = buildHostedAcceptanceReceipt({
    plan: readJson(args.plan),
    gateReceipt: readJson(args.gate),
    patchBytes: readFileSync(args.patch),
    changes: readJson(args.changes),
    executor: readJson(args.executor),
  });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedVerifyTreeCommand(args) {
  const plan = readJson(args.plan);
  const changes = readJson(args.changes);
  const fileContents = Object.fromEntries(
    changes.map(change => {
      const fullPath = join(args.repository, change.path);
      if (lstatSync(fullPath).isSymbolicLink()) {
        throw new Error(`${change.path}: tested symlink is forbidden`);
      }
      return [change.path, readFileSync(fullPath)];
    })
  );
  const receipt = verifyHostedRepairFiles({ plan, changes, fileContents });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedValidateCandidateCommand(args) {
  const plan = assertHostedRepairPlan(readJson(args.plan));
  const receipt = validateHostedCandidateTree({
    repository: args.repository,
    allowedPaths: plan.allowedPaths,
  });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedApplyProposalCommand(args) {
  const receipt = applyHostedPatchProposal({
    plan: readJson(args.plan),
    repository: args.repository,
    proposalBytes: readFileSync(args.proposal),
  });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function hostedCommitCommand(args) {
  const plan = readJson(args.plan);
  const acceptance = readJson(args.acceptance);
  const fileContents = Object.fromEntries(
    acceptance.changedFiles.map(change => [
      change.path,
      readFileSync(join(args.files, change.path)),
    ])
  );
  const result = await commitHostedRepair({
    plan,
    acceptance,
    gateReceipt: readJson(args.gate),
    patchBytes: readFileSync(args.patch),
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

function hostedTerminalCommand(args) {
  const receipt = buildHostedTerminalReceipt({
    plan: readJson(args.plan),
    outcome: args.outcome,
    committedHeadOid: args['committed-head'] ?? null,
    acceptance: args.acceptance ? readJson(args.acceptance) : null,
  });
  writeJson(args.output, receipt);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function hostedPromoteGreenCommand(args) {
  const input = readJson(args.input);
  const result = promoteHostedCandidateReceipt({
    commentAuthor: input.commentAuthor,
    commentBody: input.commentBody,
    repository: input.repository,
    prNumber: input.prNumber,
    greenHead: input.greenHead,
    policySha: input.policySha,
    workflowRunId: input.workflowRunId,
    workflowRunAttempt: input.workflowRunAttempt,
    checkSuiteId: input.checkSuiteId,
  });
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

function hostedResolveTerminalCommand(args) {
  const outcome = resolveHostedTerminalOutcome(readJson(args.input));
  const result = { outcome };
  writeJson(args.output, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const command = process.argv[2];
  if (command?.startsWith('hosted-')) {
    const args = cliArgs(process.argv.slice(3));
    if (command === 'hosted-gate') return hostedGateCommand(args);
    if (command === 'hosted-policy') return hostedPolicyCommand(args);
    if (command === 'hosted-handoff-admission')
      return hostedHandoffAdmissionCommand(args);
    if (command === 'hosted-plan') return hostedPlanCommand(args);
    if (command === 'hosted-prelaunch') return hostedPrelaunchCommand(args);
    if (command === 'hosted-stage') return hostedStageCommand(args);
    if (command === 'hosted-validate-candidate')
      return hostedValidateCandidateCommand(args);
    if (command === 'hosted-apply-proposal')
      return hostedApplyProposalCommand(args);
    if (command === 'hosted-verify-tree') return hostedVerifyTreeCommand(args);
    if (command === 'hosted-acceptance') return hostedAcceptanceCommand(args);
    if (command === 'hosted-commit') return hostedCommitCommand(args);
    if (command === 'hosted-terminal') return hostedTerminalCommand(args);
    if (command === 'hosted-promote-green')
      return hostedPromoteGreenCommand(args);
    if (command === 'hosted-resolve-terminal')
      return hostedResolveTerminalCommand(args);
    throw new Error(`unknown hosted remediation command: ${command}`);
  }
  const input = await readInput();
  const mergeGroup = input.source?.producerEvent === 'merge_group';
  const remoteMutationAllowed =
    mergeGroup !== true && input.remoteMutationAllowed === true;
  const receipt =
    input.receipt ??
    parseHandoffReceipt(input.handoffCommentBody ?? '') ??
    null;
  const cursorApiKey = input.cursorApiKey ?? process.env.CURSOR_API_KEY ?? '';
  const effectiveFxAdapter = input.fxAdapter ?? {
    name: FX_ADAPTER_NAME,
    authConfigured: mergeGroup || Boolean(String(cursorApiKey).trim()),
  };
  let cursorAgents = Array.isArray(input.cursorAgents)
    ? input.cursorAgents
    : [];
  if (
    remoteMutationAllowed &&
    cursorApiKey &&
    cursorAgents.length === 0 &&
    input.listCursorAgents !== false
  ) {
    try {
      cursorAgents = await listCursorAgents({ cursorApiKey });
    } catch {
      cursorAgents = [];
    }
  }
  const route = resolveWebhookRemediationRoute({
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: effectiveFxAdapter,
    now: input.now,
  });
  const priorClaimWriter =
    input.priorClaimWriter ||
    parseRollingCiState(input.priorCommentBody)?.claim?.writer;
  const writer = resolveDispatchWriter({
    route,
    priorClaimWriter,
    implementer: input.writer,
  });
  const runnerClass = classifyRunnerFailure(input.failedJobs);
  let dispatch;
  try {
    dispatch = runDispatch({ ...input, writer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'writer is required') {
      const result = {
        route,
        runnerClass,
        dispatch: { action: 'writer_missing', mutate: false },
        launch: { action: 'writer_missing', reason: 'writer is required' },
        outcome: 'writer_missing',
      };
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    throw error;
  }
  const result = planFxWebhookRemediation({
    dispatch,
    receipt,
    liveHead: input.liveHead,
    implementer: input.writer,
    fxAdapter: effectiveFxAdapter,
    cursorAgents,
    cursorApiKey,
    remoteMutationAllowed,
    now: input.now,
    repository: input.repository,
    prNumber: input.prNumber,
    headSha: input.headSha,
    sourceHead: input.sourceHead,
    headRef: input.headRef,
    failedJobs: input.failedJobs,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
