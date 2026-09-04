#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  parseHandoffReceipt,
  resolveFxAdapter,
  resolveRemediationRoute,
} from './rolling-ci-handoff.mjs';

export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v1/agents';
export const FX_EXECUTION_RECEIPT_SCHEMA = 'jovie-fx-execution-receipt/v1';
export const FX_GITHUB_RUNNER_EXECUTOR = 'github-actions-runner';
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
export const HOSTED_REPAIR_MAX_CONCURRENT = 1;
export const HOSTED_REPAIR_MAX_FILES = 8;
export const HOSTED_REPAIR_MAX_PATCH_BYTES = 512 * 1024;
export const HOSTED_GATE_MAX_AGE_MS = 5 * 60 * 1000;
export const HOSTED_ACCEPTANCE_TTL_MS = 45 * 60 * 1000;

const HOSTED_REPAIR_TEST_COMMANDS = Object.freeze([
  'pnpm biome check <changed-files>',
  'pnpm run typecheck',
  'node scripts/run-affected-tests.mjs --base <expected-head>',
]);
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
  /(^|\/)(?:auth|authentication|oauth|clerk|sessions?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:billing|payments?|stripe|entitlements?)(?:[._-]|\/|$)/i,
  /(?:^|\/)(?:release|deployment|deploy|vercel)(?:[._-]|\/|$)/i,
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
  assertSafeHeadRef(plan.headRefName);
  const expectedKey = `${plan.repository}:pr-${plan.prNumber}:${plan.expectedHeadOid}:${plan.fingerprint}:${plan.policyVersion}`;
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
    policyVersion: ROLLING_CI_POLICY_VERSION,
    repository: event.repository,
    prNumber: event.pr,
    expectedHeadOid: event.head,
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
    idempotencyKey: `${event.repository}:pr-${event.pr}:${event.head}:${event.fingerprint}:${ROLLING_CI_POLICY_VERSION}`,
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
  const acceptedChanges = validateHostedChanges(changes);
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
      acceptance.executor?.kind !== 'cursor-cli' ||
      !/^[0-9a-f]{64}$/.test(acceptance.executor?.installerSha256 ?? '') ||
      typeof acceptance.executor?.version !== 'string' ||
      acceptance.executor.version.length < 1 ||
      JSON.stringify(acceptance.testCommands) !==
        JSON.stringify(HOSTED_REPAIR_TEST_COMMANDS)
    ) {
      return { accepted: false, reason: 'acceptance-identity-mismatch' };
    }
    validateHostedChanges(acceptance.changedFiles);
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
    'repaired',
    'superseded_green',
    'stale_head',
    'capacity_denied',
    'patch_rejected',
    'tests_failed',
    'executor_failed',
    'recursive_dispatch_blocked',
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
  if (action === 'launch_local' || action === 'launch' || action === 'dedup') {
    return 'launched';
  }
  if (action === 'configuration_incident' || reason === 'fx-auth-missing') {
    if (reason === 'fx-safe-executor-unavailable') return 'blocked_executor';
    return 'no_key';
  }
  if (action === 'writer_missing') return 'writer_missing';
  if (action === 'skip' && reason === 'implementer_lease_live') {
    return 'implementer_owned';
  }
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
    runnerLocal = false,
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
    runnerLocal
      ? 'You are running on an ephemeral GitHub Actions runner checked out at the source PR head. Read .fx-ci/failure.log for the exact failed-run evidence. Modify and test the working tree only; do not commit, push, open a pull request, merge, or access credentials. The trusted controller performs delivery after independently verifying your diff.'
      : 'Work on the current source pull-request branch at the exact failed head. Add the smallest tested repair; do not open a sibling pull request, merge, or weaken gates.',
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
    fxAuthConfigured = false,
    runnerLocalAvailable = false,
    remoteMutationAllowed = false,
    producerEvent,
    runnerClass = null,
  } = input;
  if (runnerLocalAvailable === true) {
    if (fxAuthConfigured !== true) {
      return {
        action: 'configuration_incident',
        reason: 'fx-auth-missing',
        incident: fxConfigurationIncident(),
      };
    }
    return {
      action: 'launch_local',
      reason: 'ci-failed-after-webhook',
      executor: FX_GITHUB_RUNNER_EXECUTOR,
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
            runnerLocal: true,
          }),
        },
        name: `Jovie CI repair ${fingerprint}`.slice(0, 100),
        repository,
        prNumber,
        headSha,
        sourceHead,
        fingerprint,
      },
    };
  }
  if (typeof cursorApiKey !== 'string' || cursorApiKey.trim().length === 0) {
    return {
      action: 'configuration_incident',
      reason: 'fx-auth-missing',
      incident: fxConfigurationIncident(),
    };
  }
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
    fxAuthConfigured = false,
    runnerLocalAvailable = false,
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
      authConfigured:
        fxAuthConfigured || Boolean(String(cursorApiKey ?? '').trim()),
    },
    now,
  });
  const action = dispatch?.action ?? '';
  const isFailureDispatch =
    action === 'dispatch_implementer' ||
    action === 'dispatch_superseding_head' ||
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
      fxAuthConfigured,
      runnerLocalAvailable,
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
    latest?.conclusion !== 'failure'
  ) {
    return { committed: false, outcome: 'stale_head' };
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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function hostedPlanCommand(args) {
  const input = readJson(args.input);
  const plan = buildHostedRepairPlan({
    dispatch: input.dispatch,
    headRefName: input.headRefName,
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
    })
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

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const command = process.argv[2];
  if (command?.startsWith('hosted-')) {
    const args = cliArgs(process.argv.slice(3));
    if (command === 'hosted-plan') return hostedPlanCommand(args);
    if (command === 'hosted-prelaunch') return hostedPrelaunchCommand(args);
    if (command === 'hosted-stage') return hostedStageCommand(args);
    if (command === 'hosted-acceptance') return hostedAcceptanceCommand(args);
    if (command === 'hosted-commit') return hostedCommitCommand(args);
    if (command === 'hosted-terminal') return hostedTerminalCommand(args);
    throw new Error(`unknown hosted remediation command: ${command}`);
  }
  const input = await readInput();
  const receipt =
    input.receipt ??
    parseHandoffReceipt(input.handoffCommentBody ?? '') ??
    null;
  const cursorApiKey = input.cursorApiKey ?? process.env.CURSOR_API_KEY ?? '';
  const fxAuthConfigured =
    input.fxAuthConfigured === true ||
    Boolean(String(process.env.AI_GATEWAY_API_KEY ?? '').trim());
  let cursorAgents = Array.isArray(input.cursorAgents)
    ? input.cursorAgents
    : [];
  if (
    input.remoteMutationAllowed === true &&
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
    fxAdapter: input.fxAdapter ?? {
      name: FX_ADAPTER_NAME,
      authConfigured: fxAuthConfigured || Boolean(String(cursorApiKey).trim()),
    },
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
    fxAdapter: input.fxAdapter,
    cursorAgents,
    cursorApiKey,
    fxAuthConfigured,
    runnerLocalAvailable: input.runnerLocalAvailable === true,
    remoteMutationAllowed: input.remoteMutationAllowed === true,
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
