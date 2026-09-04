/** Deterministic, pre-lease routing for Symphony issues. JOV-INV-006. */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export const SYMPHONY_ROUTING_SCHEMA = 'symphony-routing/v1';
export const ROUTING_PREFIX = '<!-- symphony-routing/v1 -->';
export const ROUTING_SUFFIX = '<!--/symphony-routing-->';
export const OFFICIAL_ROUTING_STATE_SCHEMA =
  'symphony-official-routing-state/v1';
export const OFFICIAL_ROUTING_RECEIPT_SCHEMA =
  'symphony-official-routing-receipt/v1';
export const OFFICIAL_PROCESS_OUTCOME_SCHEMA =
  'symphony-official-process-outcome/v1';

const OFFICIAL_MAX_MODEL_ATTEMPTS = 3;
const OFFICIAL_MAX_TIER_TRANSITIONS = 2;
const AVAILABILITY_COOLDOWN_MS = 30 * 60 * 1000;
const TIER_ORDER = Object.freeze(['economical', 'standard', 'premium']);
const TIER_POLICY = Object.freeze({
  economical: {
    modelId: 'codex-luna',
    qualityThreshold: 70,
    reasoningEffort: 'medium',
    usageClass: 'economical-included',
  },
  standard: {
    modelId: 'codex-terra',
    qualityThreshold: 80,
    reasoningEffort: 'high',
    usageClass: 'balanced-included',
  },
  premium: {
    modelId: 'codex-sol',
    qualityThreshold: 88,
    reasoningEffort: 'xhigh',
    usageClass: 'premium-included',
  },
});
const ACTIVE_STATES = new Set(['todo', 'in progress', 'merging', 'rework']);
const HANDOFF_STATES = new Set(['human review', 'in review']);
const TERMINAL_STATES = new Set([
  'done',
  'closed',
  'canceled',
  'cancelled',
  'duplicate',
]);
export const OFFICIAL_TIER_POLICY = TIER_POLICY;

const registry = JSON.parse(
  readFileSync(
    new URL('../symphony/config/model-registry.json', import.meta.url),
    'utf8'
  )
);
const MODEL_BY_ID = Object.freeze(
  Object.fromEntries(
    registry.models
      .filter(model => model.provider === 'codex')
      .map(model => [
        model.id,
        {
          model: model.model,
          capabilities: model.capabilities,
          costTier: model.cost_tier,
          quality: model.quality,
        },
      ])
  )
);

const TEXT = issue =>
  `${issue?.title || ''} ${issue?.description || ''}`.toLowerCase();
const labels = issue =>
  (issue?.labels?.nodes || issue?.labels || []).map(label =>
    String(typeof label === 'string' ? label : label?.name || '').toLowerCase()
  );

export function classifySymphonyIssue(issue) {
  const text = `${TEXT(issue)} ${labels(issue).join(' ')}`;
  const rootCause =
    /\b(root cause|regression|incident|broken|failure|500|crash|debug|investigat)\w*\b/.test(
      text
    );
  const architecture =
    /\b(architecture|orchestrat\w*|control[- ]plane|fleet|routing|workflow|infra(?:structure)?|queue|system)\b/.test(
      text
    );
  const mechanical =
    /\b(typo|copy|docs?|readme|format|lint|rename|comment|mechanical|test[- ]only)\b/.test(
      text
    );
  const tests = /\b(test|fixture|vitest|pytest|coverage)\b/.test(text);
  const protectedSurface =
    /\b(auth(?:entication|orization)?|billing|payment|security|secret|token|credential|webhook|database|schema|migration|deploy|release|production|irreversible|founder[- ]review|taste[- ]review)\w*\b/.test(
      text
    );
  const operationalSurface = /\b(ci|merge|queue|fleet|infra|workflow)\b/.test(
    text
  );
  const ambiguity =
    /\b(ambiguous|unclear|unknown|intermittent|flaky|nondeterministic|cannot reproduce|not proven)\b/.test(
      text
    );
  const risk = protectedSurface
    ? 'high'
    : operationalSurface || architecture || rootCause
      ? 'medium'
      : 'low';
  const complexity =
    architecture || rootCause || ambiguity
      ? 'high'
      : mechanical
        ? 'low'
        : 'standard';
  const capabilities =
    protectedSurface || rootCause || ambiguity
      ? ['root-cause', 'architecture']
      : architecture
        ? ['architecture', 'code']
        : mechanical
          ? ['mechanical', 'code']
          : tests
            ? ['tests', 'code']
            : ['code'];
  const baseTier =
    protectedSurface || rootCause || ambiguity
      ? 'premium'
      : architecture || operationalSurface
        ? 'standard'
        : 'economical';
  const primaryReason = protectedSurface
    ? 'protected-risk-surface'
    : ambiguity
      ? 'task-ambiguity'
      : rootCause
        ? 'root-cause-complexity'
        : architecture || operationalSurface
          ? 'operational-complexity'
          : mechanical || tests
            ? 'bounded-mechanical-first-pass'
            : 'economical-first-pass';
  return {
    risk,
    complexity,
    capabilities,
    ambiguity,
    protectedSurface,
    baseTier,
    qualityThreshold: TIER_POLICY[baseTier].qualityThreshold,
    primaryReason,
    reasons: [
      `capabilities=${capabilities.join(',')}`,
      `risk=${risk}`,
      `complexity=${complexity}`,
      `baseTier=${baseTier}`,
      `qualityThreshold=${TIER_POLICY[baseTier].qualityThreshold}`,
      `reason=${primaryReason}`,
    ],
  };
}

function fingerprint(issue, classification) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        issue: issue?.identifier,
        title: issue?.title,
        description: issue?.description,
        labels: labels(issue),
        classification,
      })
    )
    .digest('hex')
    .slice(0, 24);
}

function preferredModels(
  classification,
  minimumTier = classification.baseTier
) {
  const baseIndex = Math.max(
    TIER_ORDER.indexOf(classification.baseTier),
    TIER_ORDER.indexOf(minimumTier)
  );
  return TIER_ORDER.slice(Math.max(0, baseIndex)).map(
    tier => TIER_POLICY[tier].modelId
  );
}

function tierForModelId(modelId) {
  return TIER_ORDER.find(tier => TIER_POLICY[tier].modelId === modelId) || null;
}

function capacityEvidence(capacity) {
  if (capacity === undefined) return undefined;
  if (!capacity) return { accounts: 0, ready: 0, readable: false };
  return {
    accounts: capacity.accounts,
    ready: capacity.ready,
    active: capacity.active || null,
    observedAt: capacity.observedAt || null,
    readable: true,
  };
}

function capacityEvidenceIsReady(capacity) {
  return (
    capacity &&
    capacity.readable === true &&
    Number(capacity.accounts || 0) > 0 &&
    Number(capacity.ready || 0) > 0
  );
}

export function selectSymphonyRoute({
  issue,
  availableModels = MODEL_BY_ID,
  cooldowns = {},
  now = Date.now(),
  capacity = undefined,
  minimumTier = undefined,
}) {
  const classification = classifySymphonyIssue(issue);
  const preferred = preferredModels(classification, minimumTier);
  const capacityBlocked =
    capacity !== undefined &&
    (!capacity || capacity.accounts === 0 || capacity.ready === 0);
  const candidates = [];
  for (const id of preferred) {
    const model = availableModels[id] || MODEL_BY_ID[id];
    if (
      !model ||
      !model.capabilities.some(capability =>
        classification.capabilities.includes(capability)
      )
    ) {
      candidates.push({ id, status: 'incompatible' });
      continue;
    }
    if (capacityBlocked) {
      candidates.push({ id, status: 'unavailable', reason: 'codex-capacity' });
      continue;
    }
    const until = Number(cooldowns[id] || 0);
    if (until > now) {
      candidates.push({ id, status: 'cooldown', until });
      continue;
    }
    if (model.available === false) {
      candidates.push({ id, status: 'unavailable' });
      continue;
    }
    const modelTier = tierForModelId(id);
    const policy = TIER_POLICY[modelTier];
    const quality = Number(
      model.quality ?? MODEL_BY_ID[id]?.quality ?? policy.qualityThreshold
    );
    if (quality < policy.qualityThreshold) {
      candidates.push({
        id,
        status: 'incompatible',
        reason: 'quality-threshold',
      });
      continue;
    }
    const route = {
      schema: SYMPHONY_ROUTING_SCHEMA,
      issue: issue.identifier,
      modelId: id,
      model: model.model,
      modelTier,
      reasoningEffort: policy.reasoningEffort,
      usageClass: policy.usageClass,
      costClass:
        model.costTier || MODEL_BY_ID[id]?.costTier || 'subscription-included',
      quality,
      qualityThreshold: policy.qualityThreshold,
      reason:
        id === preferred[0]
          ? classification.primaryReason
          : `${classification.primaryReason}:candidate-unavailable`,
      escalation: id !== preferred[0],
      fallback: id !== preferred[0] ? 'cooldown-or-unavailable fallback' : null,
      classification,
      candidates,
      capacity: capacityEvidence(capacity),
      fingerprint: fingerprint(issue, classification),
    };
    return { status: 'selected', route };
  }
  return {
    status: 'blocked',
    reason: 'no-compatible-model-available',
    classification,
    candidates,
    capacity: capacityEvidence(capacity),
    fingerprint: fingerprint(issue, classification),
  };
}

export function buildRoutingReceipt(route) {
  return `${ROUTING_PREFIX}\n${JSON.stringify(route)}\n${ROUTING_SUFFIX}`;
}

export function parseRoutingReceipt(issue) {
  const comments = issue?.comments?.nodes || issue?.comments || [];
  let latest = null;
  for (const comment of comments) {
    const body = typeof comment === 'string' ? comment : comment?.body || '';
    const match = body.match(
      new RegExp(`${ROUTING_PREFIX}\\n(.*?)\\n${ROUTING_SUFFIX}`, 's')
    );
    if (!match) continue;
    try {
      const receipt = JSON.parse(match[1]);
      if (
        receipt.schema === SYMPHONY_ROUTING_SCHEMA &&
        receipt.issue === issue.identifier &&
        receipt.model
      )
        latest = receipt;
    } catch {
      /* malformed receipts are ignored and fail closed */
    }
  }
  return latest;
}

export { MODEL_BY_ID };

/**
 * Read codex-rotate account capacity (accounts root + state.json cooldowns).
 * Returns null when the state is unreadable so callers can fail closed.
 */
export function readCodexRotateCapacity({
  accountsRoot = process.env.CODEX_ACCOUNTS_ROOT ||
    join(homedir(), '.codex-accounts'),
  statePath = process.env.CODEX_ACCOUNTS_STATE ||
    join(accountsRoot, 'state.json'),
  now = Date.now(),
  maxAgeMs = 5 * 60 * 1000,
} = {}) {
  try {
    const accounts = readdirSync(accountsRoot, { withFileTypes: true })
      .filter(
        entry =>
          entry.isDirectory() &&
          existsSync(join(accountsRoot, entry.name, 'auth.json'))
      )
      .map(entry => entry.name);
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const observedAtMs = statSync(statePath).mtimeMs;
    if (
      !Number.isFinite(observedAtMs) ||
      observedAtMs > now + 60_000 ||
      now - observedAtMs > maxAgeMs
    ) {
      return null;
    }
    const cooldowns = state.cooldowns || {};
    const nowSeconds = Math.floor(now / 1000);
    const ready = accounts.filter(
      name => Number(cooldowns[name] || 0) <= nowSeconds
    );
    return {
      accounts: accounts.length,
      ready: ready.length,
      active: state.active || null,
      cooldowns,
      observedAt: new Date(observedAtMs).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Semantically verify a durable routing receipt: reconstruct the canonical
 * route from the current issue text plus the registry and reject any drift
 * in classification, model, escalation, or fingerprint. Returns the receipt
 * when valid, otherwise null.
 */
export function verifyRoutingReceipt(
  issue,
  { availableModels = MODEL_BY_ID, requireCapacityEvidence = false } = {}
) {
  const receipt = parseRoutingReceipt(issue);
  if (!receipt) return null;
  const classification = classifySymphonyIssue(issue);
  if (
    receipt.fingerprint !== fingerprint(issue, classification) ||
    JSON.stringify(receipt.classification) !== JSON.stringify(classification)
  )
    return null;
  const preferred = preferredModels(classification);
  if (!preferred.includes(receipt.modelId)) return null;
  const entry =
    availableModels[receipt.modelId] || MODEL_BY_ID[receipt.modelId];
  if (!entry || entry.model !== receipt.model) return null;
  if (
    !entry.capabilities.some(capability =>
      classification.capabilities.includes(capability)
    )
  )
    return null;
  if (receipt.escalation !== (receipt.modelId !== preferred[0])) return null;
  const candidates = Array.isArray(receipt.candidates)
    ? receipt.candidates
    : null;
  if (
    !candidates ||
    candidates.some(
      candidate =>
        !candidate ||
        typeof candidate.id !== 'string' ||
        !['incompatible', 'cooldown', 'unavailable'].includes(candidate.status)
    ) ||
    candidates.some(candidate => candidate.id === receipt.modelId)
  )
    return null;
  if (requireCapacityEvidence && !capacityEvidenceIsReady(receipt.capacity))
    return null;
  return receipt;
}

/**
 * Atomically bind a verified receipt into a Symphony workspace so the
 * launcher reads workspace-local evidence instead of trusting the network.
 */
export function materializeRoutingReceipt(issue, workspaceDir, options = {}) {
  const receipt = verifyRoutingReceipt(issue, options);
  if (!receipt) return null;
  mkdirSync(workspaceDir, { recursive: true });
  const target = join(workspaceDir, '.symphony-routing.json');
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target);
  return { path: target, receipt };
}

function isoTimestamp(now) {
  return new Date(now).toISOString();
}

function normalizedState(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function officialAttemptId(issueRevision, attemptCount) {
  return createHash('sha256')
    .update(`${issueRevision}:${attemptCount}`)
    .digest('hex')
    .slice(0, 24);
}

function escalationOutcome(kind) {
  return new Set([
    'model_unavailable',
    'process_failure',
    'process_outcome_missing',
    'test_failure',
  ]).has(kind);
}

function availabilityBlockReason(kind) {
  if (kind === 'account_unavailable') return 'account-unavailable';
  if (kind === 'rate_limited') return 'rate-limited';
  return null;
}

/**
 * Pure official-runtime planner. State is keyed by the issue revision, so a
 * changed task starts a new bounded budget while an unchanged task can only
 * move upward through the three canonical tiers.
 */
export function planOfficialSymphonyRoute({
  issue,
  state = null,
  availableModels = MODEL_BY_ID,
  capacity = undefined,
  minimumTier: requiredMinimumTier = undefined,
  now = Date.now(),
}) {
  const classification = classifySymphonyIssue(issue);
  const issueRevision = fingerprint(issue, classification);
  const prior =
    state?.schema === OFFICIAL_ROUTING_STATE_SCHEMA &&
    state.issue === issue.identifier &&
    state.issueRevision === issueRevision
      ? state
      : null;

  if (
    prior?.current?.phase === 'prepared' &&
    prior.current.terminalOutcome == null
  ) {
    if (prior.execution?.attemptId === prior.current.attemptId) {
      return {
        status: 'blocked',
        reason: 'attempt-awaiting-finalize',
        receipt: prior.current,
        state: prior,
      };
    }
    return { status: 'reused', receipt: prior.current, state: prior };
  }
  if (prior?.terminal === true) {
    return {
      status: 'blocked',
      reason: prior.lastOutcome?.kind || 'routing-terminal',
      receipt: prior.current || null,
      state: prior,
    };
  }

  const availabilityReason = availabilityBlockReason(prior?.lastOutcome?.kind);
  if (availabilityReason && Number(prior?.cooldownUntil || 0) > Number(now)) {
    return {
      status: 'blocked',
      reason: availabilityReason,
      retryAt: isoTimestamp(prior.cooldownUntil),
      receipt: prior.current || null,
      state: prior,
    };
  }

  const attemptCount = Number(prior?.attemptCount || 0) + 1;
  if (attemptCount > OFFICIAL_MAX_MODEL_ATTEMPTS) {
    const lastOutcome = {
      kind: 'attempt-budget-exhausted',
      observedAt: isoTimestamp(now),
    };
    const exhausted = {
      ...(prior || {}),
      schema: OFFICIAL_ROUTING_STATE_SCHEMA,
      issue: issue.identifier,
      issueRevision,
      attemptCount: OFFICIAL_MAX_MODEL_ATTEMPTS,
      terminal: true,
      lastOutcome,
      current: prior?.current
        ? {
            ...prior.current,
            phase: 'settled',
            terminalOutcome: lastOutcome.kind,
            settledAt: lastOutcome.observedAt,
          }
        : null,
      updatedAt: lastOutcome.observedAt,
    };
    return {
      status: 'blocked',
      reason: lastOutcome.kind,
      receipt: exhausted.current,
      state: exhausted,
    };
  }

  const baseIndex = TIER_ORDER.indexOf(classification.baseTier);
  const priorIndex = TIER_ORDER.indexOf(prior?.modelTier);
  let selectedIndex = Math.max(baseIndex, priorIndex, 0);
  let transitionCount = Number(prior?.transitionCount || 0);
  const shouldEscalate = escalationOutcome(prior?.lastOutcome?.kind);
  const fromTier = priorIndex >= 0 ? TIER_ORDER[priorIndex] : null;
  if (
    shouldEscalate &&
    selectedIndex < TIER_ORDER.length - 1 &&
    transitionCount < OFFICIAL_MAX_TIER_TRANSITIONS
  ) {
    selectedIndex += 1;
    transitionCount += 1;
  }
  const requiredIndex = TIER_ORDER.indexOf(requiredMinimumTier);
  const minimumIndex = Math.max(selectedIndex, requiredIndex, 0);
  const selectedMinimumTier = TIER_ORDER[minimumIndex];
  const decision = selectSymphonyRoute({
    issue,
    availableModels,
    capacity,
    now,
    minimumTier: selectedMinimumTier,
  });
  if (decision.status !== 'selected') {
    const blocked = {
      schema: OFFICIAL_ROUTING_STATE_SCHEMA,
      issue: issue.identifier,
      issueRevision,
      attemptCount: Number(prior?.attemptCount || 0),
      transitionCount,
      modelTier: prior?.modelTier || selectedMinimumTier,
      terminal: true,
      lastOutcome: {
        kind: 'no-compatible-model-available',
        observedAt: isoTimestamp(now),
      },
      current: prior?.current || null,
      updatedAt: isoTimestamp(now),
    };
    return {
      status: 'blocked',
      reason: 'no-compatible-model-available',
      receipt: blocked.current,
      state: blocked,
    };
  }

  const route = decision.route;
  const toTier = route.modelTier;
  const escalated =
    fromTier !== null && TIER_ORDER.indexOf(toTier) > priorIndex;
  const receipt = {
    schema: OFFICIAL_ROUTING_RECEIPT_SCHEMA,
    phase: 'prepared',
    issue: issue.identifier,
    issueRevision,
    attemptId: officialAttemptId(issueRevision, attemptCount),
    attemptCount,
    maxAttempts: OFFICIAL_MAX_MODEL_ATTEMPTS,
    modelId: route.modelId,
    model: route.model,
    modelTier: route.modelTier,
    reasoningEffort: route.reasoningEffort,
    reason: shouldEscalate
      ? `${route.reason}:after-${prior.lastOutcome.kind}`
      : route.reason,
    quality: route.quality,
    qualityThreshold: route.qualityThreshold,
    usageClass: route.usageClass,
    costClass: route.costClass,
    escalation: {
      status: escalated ? 'escalated' : 'none',
      fromTier,
      toTier,
      transitionCount,
      maxTransitions: OFFICIAL_MAX_TIER_TRANSITIONS,
    },
    terminalOutcome: null,
    preparedAt: isoTimestamp(now),
  };
  const nextState = {
    schema: OFFICIAL_ROUTING_STATE_SCHEMA,
    issue: issue.identifier,
    issueRevision,
    attemptCount,
    transitionCount,
    modelTier: route.modelTier,
    terminal: false,
    cooldownUntil: null,
    lastOutcome: prior?.lastOutcome || null,
    current: receipt,
    updatedAt: receipt.preparedAt,
  };
  return { status: 'selected', receipt, state: nextState };
}

/** Settle one prepared attempt using only typed process and tracker outcomes. */
export function settleOfficialSymphonyRoute({
  state,
  issueState,
  processOutcome,
  now = Date.now(),
}) {
  if (
    state?.schema !== OFFICIAL_ROUTING_STATE_SCHEMA ||
    state?.current?.schema !== OFFICIAL_ROUTING_RECEIPT_SCHEMA ||
    state.current.phase !== 'prepared'
  ) {
    throw new Error('official-routing-prepared-state-required');
  }
  const trackerState = normalizedState(issueState);
  let kind;
  let terminal = false;
  if (TERMINAL_STATES.has(trackerState)) {
    kind = 'completed';
    terminal = true;
  } else if (HANDOFF_STATES.has(trackerState)) {
    kind = 'review_handoff';
    terminal = true;
  } else if (
    processOutcome?.kind &&
    processOutcome.kind !== 'process_completed'
  ) {
    kind = processOutcome.kind;
  } else if (ACTIVE_STATES.has(trackerState)) {
    kind = 'continuation';
  } else {
    kind = 'process_outcome_missing';
  }
  const observedAt = isoTimestamp(now);
  const lastOutcome = { kind, observedAt };
  const cooldownUntil =
    kind === 'account_unavailable' || kind === 'rate_limited'
      ? Number(now) + AVAILABILITY_COOLDOWN_MS
      : null;
  const settledReceipt = {
    ...state.current,
    phase: 'settled',
    terminalOutcome: kind,
    settledAt: observedAt,
  };
  const nextState = {
    ...state,
    terminal,
    cooldownUntil,
    lastOutcome,
    current: settledReceipt,
    updatedAt: observedAt,
  };
  return { receipt: settledReceipt, state: nextState };
}

/**
 * Reduce app-server output to a non-secret failure class. Raw output is never
 * returned or persisted.
 */
export function classifyAppServerObservation({
  exitCode,
  signal = null,
  output = '',
}) {
  const text = String(output || '').toLowerCase();
  if (/\b(429|rate.?limit|quota|usage limit|too many requests)\b/.test(text))
    return { kind: 'rate_limited' };
  if (
    /\b(not logged in|login required|authentication required|unauthorized|account unavailable|invalid api key)\b/.test(
      text
    )
  )
    return { kind: 'account_unavailable' };
  if (
    /\bmodel\b.{0,80}\b(unavailable|not found|not supported|no access|access denied)\b/.test(
      text
    )
  )
    return { kind: 'model_unavailable' };
  if (
    /\b(vitest|pytest|unittest|pnpm\s+(?:run\s+)?test|npm\s+(?:run\s+)?test|xcodebuild\b.{0,40}\btest)\b/.test(
      text
    ) &&
    /\b(exit(?:code| code)?|status|returncode)["':=\s]+[1-9]\d*\b/.test(text)
  )
    return { kind: 'test_failure' };
  if (Number(exitCode) === 0 && !signal) return { kind: 'process_completed' };
  return { kind: 'process_failure' };
}

const EXIT_CONFIG = 78;

async function runLauncher(argv) {
  const flag = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const workspace =
    flag('--workspace') || process.env.SYMPHONY_WORKSPACE || process.cwd();
  const issueArg =
    flag('--issue') ||
    process.env.SYMPHONY_ISSUE_IDENTIFIER ||
    basename(workspace);
  const fail = message => {
    const reason = String(message || 'launcher configuration failure').replace(
      /\s+/g,
      ' '
    );
    console.error(
      `SYMPHONY_LAUNCHER_FAILURE schema=symphony-launcher-failure/v1 class=deterministic-launcher retryable=false maxAttempts=1 reason=${JSON.stringify(reason)}`
    );
    process.exit(EXIT_CONFIG);
  };
  let issue;
  if (process.env.SYMPHONY_ROUTING_ISSUE_FILE) {
    issue = JSON.parse(
      readFileSync(process.env.SYMPHONY_ROUTING_ISSUE_FILE, 'utf8')
    );
  } else {
    const { fetchIssue } = await import('./linear-client.mjs');
    issue = await fetchIssue(issueArg).catch(error => fail(error.message));
  }
  if (!issue) fail(`issue not found: ${issueArg}`);
  const capacity = readCodexRotateCapacity();
  if (!capacity || capacity.accounts === 0 || capacity.ready === 0)
    fail('codex-rotate capacity is unavailable; refusing to route');
  const materialized = materializeRoutingReceipt(issue, workspace, {
    requireCapacityEvidence: true,
  });
  if (!materialized)
    fail(`no valid symphony-routing/v1 receipt for ${issue.identifier}`);
  process.stdout.write(`${materialized.receipt.model}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`, 'file:').href
) {
  const argv = process.argv.slice(2);
  let exitCode = 0;
  try {
    if (argv[0] === 'launch') await runLauncher(argv);
    else {
      exitCode = EXIT_CONFIG;
    }
  } catch (error) {
    const reason = String(error?.message || error || 'routing failure').replace(
      /\s+/g,
      ' '
    );
    process.stderr.write(
      `SYMPHONY_ROUTING_FAILURE schema=symphony-routing-failure/v1 reason=${JSON.stringify(reason)}\n`
    );
    exitCode = EXIT_CONFIG;
  }
  process.exitCode = exitCode;
}
