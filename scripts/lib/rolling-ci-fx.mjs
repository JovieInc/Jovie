#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseRollingCiState, runDispatch } from './rolling-ci-dispatch.mjs';
import {
  FX_ADAPTER_NAME,
  FX_HANDOFF_FAILURE,
  fxConfigurationIncident,
  parseHandoffReceipt,
  resolveFxAdapter,
  resolveRemediationRoute,
} from './rolling-ci-handoff.mjs';

export const CURSOR_AGENTS_URL = 'https://api.cursor.com/v1/agents';
export const FX_NAMED_OUTCOMES = Object.freeze([
  'launched',
  'repaired',
  'skipped_stale',
  'writer_missing',
  'no_key',
  'needs_human',
]);
export const RUNNER_FAILURE_CLASSES = Object.freeze([
  'checkout',
  'infra',
  'flake',
]);
export const FX_RUNNER_IDEMPOTENCY_KEY = 'jov-fx-ci-runners-20260822';

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
    producerEvent,
    runnerClass = null,
  } = input;
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
    action === 'reject_competing_writer';
  const allowRunnerClassFx = Boolean(runnerClass);

  /**
   * @param {Record<string, any>} result
   * @returns {Record<string, any>}
   */
  const withOutcome = result => ({
    ...result,
    runnerClass,
    outcome: resolveFxNamedOutcome({
      launch: result.launch,
      dispatch,
    }),
  });

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
  return body;
}

async function readInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main() {
  const input = await readInput();
  const receipt =
    input.receipt ??
    parseHandoffReceipt(input.handoffCommentBody ?? '') ??
    null;
  const cursorApiKey = input.cursorApiKey ?? process.env.CURSOR_API_KEY ?? '';
  let cursorAgents = Array.isArray(input.cursorAgents)
    ? input.cursorAgents
    : [];
  if (
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
      authConfigured: Boolean(String(cursorApiKey).trim()),
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
