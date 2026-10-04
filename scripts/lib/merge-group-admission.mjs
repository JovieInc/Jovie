import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUEUE_HEAD_PR_PATTERN =
  /^refs\/heads\/gh-readonly-queue\/main\/pr-([1-9][0-9]*)-[0-9a-f]+$/;
const REQUIRED_CHECKS = Object.freeze(['Fork PR Gate', 'PR Size Guard']);
const QUEUE_STATE_AWAITING_CHECKS = 'AWAITING_CHECKS';
const LIVE_QUEUE_ENTRY_STATES = new Set([
  'QUEUED',
  QUEUE_STATE_AWAITING_CHECKS,
  'MERGEABLE',
  'UNMERGEABLE',
  'LOCKED',
]);
const LIVE_QUEUE_PAGE_SIZE = 100;
const MAX_LIVE_QUEUE_PAGES = 10;
const NONTERMINAL_CHECK_STATUSES = new Set([
  'in_progress',
  'pending',
  'queued',
  'requested',
  'waiting',
]);
const TERMINAL_CHECK_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'neutral',
  'skipped',
  'stale',
  'startup_failure',
  'success',
  'timed_out',
]);
// Required external checks can sit queued/in_progress on a busy runner pool for
// well over a minute (PR Size Guard observed in_progress at attempt 20 of a
// 90s budget). Poll for most of the job budget instead of failing a healthy
// queue entry; concluded failures still fail immediately. Keep this below the
// ci.yml `Merge Group Admission` job timeout with room for setup/checkout.
export const MERGE_GROUP_ADMISSION_WAIT_MS = 360_000;
const MAX_WAIT_MS = MERGE_GROUP_ADMISSION_WAIT_MS;
// Every iteration spends one GraphQL and three REST calls from the
// repository's shared GITHUB_TOKEN quota. A 3 s cadence across ten queue
// groups drained it within minutes on 2026-10-03 (JOV-7744).
const POLL_INTERVAL_MS = 15_000;
// Pending polls back off exponentially with ±20% jitter, so a dozen concurrent
// groups stop polling in lockstep (2026-10-04 quota storms, JOV-7743).
const MAX_POLL_INTERVAL_MS = 60_000;
const POLL_JITTER = 0.2;
const RATE_LIMIT_PATTERN = /\b(?:secondary )?rate limit\b/i;
const MAX_API_REQUEST_MS = 10_000;
const LIVE_QUEUE_QUERY = `query MergeGroupAdmissionLiveQueue(
  $owner:String!,
  $name:String!,
  $branch:String!,
  $cursor:String,
  $pageSize:Int!
){
  repository(owner:$owner,name:$name){
    mergeQueue(branch:$branch){
      entries(first:$pageSize,after:$cursor){
        nodes{
          id
          enqueuedAt
          enqueuer{__typename login}
          position
          state
          headCommit{oid}
          baseCommit{oid}
          pullRequest{number headRefOid baseRefName}
        }
        pageInfo{hasNextPage endCursor}
      }
    }
  }
}`;
const REQUIRED_ENV_MESSAGE =
  'GITHUB_EVENT_PATH, GH_TOKEN, GITHUB_SHA, and GITHUB_REPOSITORY are required';
export const ADMISSION_CONTRACT_VERSION = 'jovie-merge-group-live-admission/v2';

export class MergeGroupAdmissionError extends Error {
  /**
   * @param {string} message
   * @param {{ path?: string | null, status?: number | null, rateLimit?: boolean }} [options]
   */
  constructor(message, { path = null, status = null, rateLimit } = {}) {
    super(message);
    this.name = 'MergeGroupAdmissionError';
    this.path = path;
    this.status = status;
    this.rateLimit = rateLimit;
    /** @type {number | undefined} */
    this.retryAtMs = undefined;
  }
}

function fail(message) {
  throw new MergeGroupAdmissionError(message);
}

function isGraphqlQuotaError(error) {
  return (
    error?.type === 'RATE_LIMITED' ||
    (error?.type === undefined &&
      typeof error?.message === 'string' &&
      /^API rate limit already exceeded for (?:site ID installation|installation ID [0-9]+)\.?$/i.test(
        error.message
      ))
  );
}

function unsignedHeader(value, multiplier = 1) {
  if (value === null) return null;
  if (!/^[0-9]+$/.test(value)) return Number.NaN;
  const parsed = Number(value) * multiplier;
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

function httpDateHeader(value) {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toUTCString() === value
    ? parsed
    : Number.NaN;
}

function quotaRetryAt(headers, receivedAtMs) {
  const remaining = unsignedHeader(headers.get('x-ratelimit-remaining'));
  const reset = unsignedHeader(headers.get('x-ratelimit-reset'), 1_000);
  const date = httpDateHeader(headers.get('date'));
  const rawRetry = headers.get('retry-after');
  const seconds = rawRetry !== null && /^[0-9]+$/.test(rawRetry);
  const retry = seconds
    ? unsignedHeader(rawRetry, 1_000)
    : httpDateHeader(rawRetry);
  if ([remaining, reset, date, retry].some(Number.isNaN)) {
    fail('GitHub rate-limit response has malformed retry metadata');
  }
  // Translate absolute server times using Date from this same response; start
  // at body receipt so response latency cannot make us retry before the bound.
  const serverNow = date ?? receivedAtMs;
  const bounds = [];
  if (remaining === 0 && reset !== null) {
    bounds.push(receivedAtMs + reset - serverNow);
  }
  if (retry !== null) {
    bounds.push(
      seconds ? receivedAtMs + retry : receivedAtMs + retry - serverNow
    );
  }
  if (bounds.length === 0) return null; // Preserve legacy 15s recovery.
  const retryAt = Math.max(receivedAtMs, ...bounds) + 1_000;
  if (!Number.isSafeInteger(retryAt)) {
    fail('GitHub rate-limit retry bound is outside the supported range');
  }
  return retryAt;
}

function requireSha(value, field) {
  if (!SHA_PATTERN.test(String(value ?? ''))) {
    fail(`${field} is not a full SHA`);
  }
  return value;
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    fail(`${field} is not a positive integer`);
  }
  return value;
}

function splitRepository(repository) {
  const parts = String(repository ?? '').split('/');
  if (parts.length !== 2 || parts.some(part => !part)) {
    fail('merge_group repository is malformed');
  }
  return parts;
}

export function parseQueueHeadPullRequestNumber(headRef) {
  const match = QUEUE_HEAD_PR_PATTERN.exec(String(headRef ?? ''));
  if (!match) {
    fail('merge_group head_ref does not expose a queue PR number');
  }
  return requirePositiveInteger(
    Number.parseInt(match[1], 10),
    'merge_group queue PR number'
  );
}

/**
 * @param {any} event
 * @param {{ expectedHeadSha?: string, expectedRepository?: string }} [options]
 */
export function validateMergeGroupAdmissionEvent(
  event,
  { expectedHeadSha, expectedRepository } = {}
) {
  if (event?.action !== 'checks_requested') {
    fail('unexpected merge_group action');
  }

  const repository = event?.repository?.full_name;
  splitRepository(repository);
  if (expectedRepository && repository !== expectedRepository) {
    fail('merge_group repository does not match GITHUB_REPOSITORY');
  }

  const group = event?.merge_group;
  if (!group || group.base_ref !== 'refs/heads/main') {
    fail('merge_group does not target main');
  }
  const baseSha = requireSha(group.base_sha, 'merge_group.base_sha');
  const headSha = requireSha(group.head_sha, 'merge_group.head_sha');
  if (baseSha === headSha) {
    fail('merge_group base and head must differ');
  }
  if (expectedHeadSha && headSha !== expectedHeadSha) {
    fail('merge_group head_sha does not match GITHUB_SHA');
  }
  const prNumber = parseQueueHeadPullRequestNumber(group.head_ref);
  if (group.head_commit?.id && group.head_commit.id !== headSha) {
    fail('merge_group head_commit does not match head_sha');
  }
  return {
    baseSha,
    headRef: group.head_ref,
    headSha,
    prNumber,
    repository,
  };
}

function linkHasNext(link) {
  return typeof link === 'string' && /<[^>]+>;\s*rel="next"/.test(link);
}

export function validateQueueRef(response, { headRef, headSha }) {
  if (
    !response ||
    response.ref !== headRef ||
    response.object?.type !== 'commit' ||
    response.object?.sha !== headSha
  ) {
    fail('merge queue ref is missing, malformed, or no longer at head_sha');
  }
}

function requireNullableSha(value, field) {
  if (value === null || value === undefined) return null;
  return requireSha(String(value).toLowerCase(), field);
}

export function normalizeLiveQueueEntriesPage(
  payload,
  { branch = 'main' } = {}
) {
  if (payload?.errors !== undefined && !Array.isArray(payload.errors)) {
    fail('live merge queue GraphQL errors must be an array when present');
  }
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new MergeGroupAdmissionError(
      `live merge queue GraphQL returned errors: ${payload.errors
        .map(error => error?.message ?? String(error))
        .join('; ')}`,
      { rateLimit: payload.errors.every(isGraphqlQuotaError) }
    );
  }

  const repository = payload?.data?.repository;
  if (!repository) {
    fail(`live merge queue inventory omitted repository for ${branch}`);
  }
  if (repository.mergeQueue === null) {
    fail(`live merge queue is not configured for ${branch}`);
  }

  const connection = repository.mergeQueue?.entries;
  if (
    !Array.isArray(connection?.nodes) ||
    typeof connection?.pageInfo?.hasNextPage !== 'boolean'
  ) {
    fail(`live merge queue inventory is incomplete for ${branch}`);
  }
  if (
    connection.pageInfo.hasNextPage &&
    typeof connection.pageInfo.endCursor !== 'string'
  ) {
    fail(`live merge queue inventory omitted its cursor for ${branch}`);
  }

  const entries = connection.nodes.map(node => {
    const prNumber = requirePositiveInteger(
      node?.pullRequest?.number,
      'live merge queue PR number'
    );
    const position = requirePositiveInteger(
      node?.position,
      `live merge queue position for PR #${prNumber}`
    );
    const state = node?.state;
    if (!LIVE_QUEUE_ENTRY_STATES.has(state)) {
      fail(`live merge queue state for PR #${prNumber} is unrecognized`);
    }
    if (node?.pullRequest?.baseRefName !== branch) {
      fail(`live merge queue base for PR #${prNumber} is not ${branch}`);
    }
    const headCommitOid = requireNullableSha(
      node?.headCommit?.oid,
      `live merge queue headCommit for PR #${prNumber}`
    );
    if (state === QUEUE_STATE_AWAITING_CHECKS && headCommitOid === null) {
      fail(
        [
          `live merge queue AWAITING_CHECKS entry for PR #${prNumber}`,
          'has no headCommit',
        ].join(' ')
      );
    }
    return {
      id: node.id,
      enqueuedAt: node.enqueuedAt,
      enqueuer: node.enqueuer,
      baseCommitOid: requireNullableSha(
        node?.baseCommit?.oid,
        `live merge queue baseCommit for PR #${prNumber}`
      ),
      headCommitOid,
      position,
      prNumber,
      sourceHeadSha: requireNullableSha(
        node?.pullRequest?.headRefOid,
        `live merge queue source head for PR #${prNumber}`
      ),
      state,
    };
  });

  return {
    entries,
    endCursor: connection.pageInfo.endCursor ?? null,
    hasNextPage: connection.pageInfo.hasNextPage,
  };
}

function queueSnapshot(entries) {
  return entries
    .filter(entry => entry.state === QUEUE_STATE_AWAITING_CHECKS)
    .map(entry => ({
      baseSha: entry.baseCommitOid,
      position: entry.position,
      pr: entry.prNumber,
      syntheticSha: entry.headCommitOid,
    }));
}

function entryForReceipt(entry) {
  return entry
    ? {
        id: entry.id,
        enqueuedAt: entry.enqueuedAt,
        enqueuer: entry.enqueuer,
        baseSha: entry.baseCommitOid,
        position: entry.position,
        pr: entry.prNumber,
        sourceHeadSha: entry.sourceHeadSha,
        state: entry.state,
        syntheticSha: entry.headCommitOid,
      }
    : null;
}

/**
 * @param {{
 *   runAttempt?: string | null,
 *   runId?: string | null,
 *   runUrl?: string | null,
 * } | null | undefined} runContext
 */
function normalizeRunContext(runContext) {
  return {
    runAttempt: runContext?.runAttempt ?? null,
    runId: runContext?.runId ?? null,
    runUrl: runContext?.runUrl ?? null,
  };
}

export function buildLiveQueueAdmissionReceipt({
  entries,
  evidence,
  runContext = undefined,
}) {
  if (!Array.isArray(entries)) {
    fail('live merge queue entries are malformed');
  }
  const exactMatches = entries.filter(
    entry => entry.headCommitOid === evidence.headSha
  );
  if (exactMatches.length > 1) {
    fail(`live merge queue repeats synthetic head ${evidence.headSha}`);
  }
  const matchingPrEntries = entries.filter(
    entry => entry.prNumber === evidence.prNumber
  );
  if (matchingPrEntries.length > 1) {
    fail(`live merge queue repeats PR #${evidence.prNumber}`);
  }

  const exact = exactMatches[0] ?? null;
  if (exact && exact.prNumber !== evidence.prNumber) {
    fail(
      [
        `live merge queue synthetic head ${evidence.headSha} belongs to`,
        `PR #${exact.prNumber}, not PR #${evidence.prNumber}`,
      ].join(' ')
    );
  }

  const replacement =
    matchingPrEntries.find(
      entry =>
        typeof entry.headCommitOid === 'string' &&
        entry.headCommitOid !== evidence.headSha
    ) ?? null;
  const current = exact ?? matchingPrEntries[0] ?? null;
  // Queue state advances while required checks are running. The synthetic head
  // is current whenever the live queue still binds this PR to the exact SHA;
  // only absence or a different SHA proves that this event is obsolete.
  const admitted = Boolean(exact);
  const replacementCombinedHead = admitted
    ? null
    : (replacement?.headCommitOid ?? null);
  const normalizedRunContext = normalizeRunContext(runContext);

  return {
    admitted,
    currentQueueState: current?.state ?? 'ABSENT',
    headRef: evidence.headRef,
    liveEntry: entryForReceipt(exact),
    liveQueueAwaitingChecks: queueSnapshot(entries),
    obsoleteSyntheticSha: admitted ? null : evidence.headSha,
    outcome: admitted ? 'admitted' : 'obsolete',
    pr: evidence.prNumber,
    replacementCombinedHead,
    repository: evidence.repository,
    runAttempt: normalizedRunContext.runAttempt,
    runId: normalizedRunContext.runId,
    runUrl: normalizedRunContext.runUrl,
    schema: ADMISSION_CONTRACT_VERSION,
    syntheticSha: evidence.headSha,
  };
}

export function classifyRequiredCheckPage(page, { checkName, headSha }) {
  const { data, link } = page ?? {};
  if (
    !data ||
    !Number.isInteger(data.total_count) ||
    data.total_count < 0 ||
    !Array.isArray(data.check_runs) ||
    data.total_count !== data.check_runs.length ||
    linkHasNext(link)
  ) {
    fail(`${checkName} check-run discovery is incomplete or malformed`);
  }
  if (data.check_runs.length === 0) {
    return { state: 'pending', detail: 'not created yet' };
  }
  if (data.check_runs.length !== 1) {
    fail(`${checkName} check-run discovery is ambiguous`);
  }

  const run = data.check_runs[0];
  if (
    !Number.isInteger(run?.id) ||
    run.id < 1 ||
    run.name !== checkName ||
    run.head_sha !== headSha ||
    run.app?.slug !== 'github-actions' ||
    typeof run.status !== 'string'
  ) {
    fail(`${checkName} check-run evidence is malformed`);
  }

  if (run.status === 'completed') {
    if (!TERMINAL_CHECK_CONCLUSIONS.has(run.conclusion)) {
      fail(`${checkName} has an unknown terminal conclusion`);
    }
    return run.conclusion === 'success'
      ? { state: 'success', detail: 'success' }
      : { state: 'terminal-failure', detail: run.conclusion };
  }

  if (!NONTERMINAL_CHECK_STATUSES.has(run.status) || run.conclusion !== null) {
    fail(`${checkName} has malformed nonterminal state`);
  }
  return { state: 'pending', detail: run.status };
}

function requireTimingBound(value, field, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    fail(`${field} must be between 1 and ${maximum}`);
  }
}

// Quota exhaustion, a per-request timeout or a GitHub 5xx says nothing about
// the combined head, so it waits within the admission budget instead of
// failing a valid group.
export function isTransientApiError(error) {
  if (!(error instanceof MergeGroupAdmissionError)) return false;
  if (error.rateLimit !== undefined) return error.rateLimit === true;
  if (error.status === 403 || error.status === 429) {
    return RATE_LIMIT_PATTERN.test(error.message);
  }
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return true;
  }
  return (
    error.status === null && isTransientAdmissionFailureMessage(error.message)
  );
}

const TRANSIENT_ADMISSION_MESSAGES = [
  /^live merge queue GraphQL returned errors: API rate limit already exceeded for (?:site ID installation|installation ID [0-9]+)\.?$/i,
  /^GitHub API request failed for \S+: The operation was aborted due to timeout$/,
];
const TRANSIENT_ADMISSION_HTTP_MESSAGE =
  /^GitHub API (?:(?:403|429) for \S+: .*\b(?:secondary )?rate limit\b|(?:502|503|504) for \S+: )/i;

// The admission step's printed error when it gave up on a quota or gateway
// failure, not on the combined head. The merge-group failure hold reads it from
// the job's annotations so infrastructure never spends a source revision (JOV-7780).
/** @param {unknown} message */
export function isTransientAdmissionFailureMessage(message) {
  const text = String(message ?? '').trim();
  return (
    TRANSIENT_ADMISSION_MESSAGES.some(pattern => pattern.test(text)) ||
    TRANSIENT_ADMISSION_HTTP_MESSAGE.test(text)
  );
}

function defaultSleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

export async function waitForMergeGroupAdmission({
  event,
  loadCheckRuns,
  loadLiveQueueEntries,
  loadQueueRef,
  maxWaitMs = MAX_WAIT_MS,
  now = Date.now,
  onStatus = message => console.log(message),
  pollIntervalMs = POLL_INTERVAL_MS,
  random = Math.random,
  runContext = undefined,
  sleep = defaultSleep,
}) {
  const evidence = validateMergeGroupAdmissionEvent(event);
  if (
    typeof loadCheckRuns !== 'function' ||
    typeof loadLiveQueueEntries !== 'function' ||
    typeof loadQueueRef !== 'function'
  ) {
    fail('merge_group admission loaders are required');
  }
  requireTimingBound(maxWaitMs, 'maxWaitMs', MAX_WAIT_MS);
  requireTimingBound(pollIntervalMs, 'pollIntervalMs', maxWaitMs);

  const deadlineMs = now() + maxWaitMs;
  let attempt = 0;
  let lastGateStatus = null;
  let observedSourceHeadSha = null;
  let recoverySourceHeadSha = null;
  // Live membership and the exact queue ref are proved on the first poll and
  // re-proved before admitting; pending polls only read the two check pages.
  let provenQueue = null;
  let pendingPolls = 0;
  const pendingDelayMs = () => {
    if (pendingPolls <= 1) return pollIntervalMs;
    const backoff = Math.min(
      Math.max(pollIntervalMs, MAX_POLL_INTERVAL_MS),
      pollIntervalMs * 2 ** Math.min(pendingPolls - 1, 16)
    );
    return Math.round(backoff * (1 - POLL_JITTER + 2 * POLL_JITTER * random()));
  };
  const failStillPending = () => {
    fail(
      `required merge-group checks did not pass within ${maxWaitMs}ms${
        lastGateStatus ? ` (still pending: ${lastGateStatus})` : ''
      }`
    );
  };
  const readLiveReceipt = async () => {
    const liveEntries = await loadLiveQueueEntries({ ...evidence, deadlineMs });
    const receipt = buildLiveQueueAdmissionReceipt({
      entries: liveEntries,
      evidence,
      runContext,
    });
    const sourceHeadSha = receipt.liveEntry?.sourceHeadSha;
    if (receipt.admitted && SHA_PATTERN.test(String(sourceHeadSha ?? ''))) {
      if (recoverySourceHeadSha && sourceHeadSha !== recoverySourceHeadSha) {
        fail('live merge queue source head changed during API recovery');
      }
      observedSourceHeadSha = sourceHeadSha;
    }
    if (!receipt.admitted) {
      onStatus(
        `Merge-group admission neutralized obsolete synthetic head ${
          receipt.syntheticSha
        }: PR #${receipt.pr} queueState=${
          receipt.currentQueueState
        } replacement=${receipt.replacementCombinedHead ?? 'none'}`
      );
    }
    return receipt;
  };

  // GitHub deletes the exact gh-readonly-queue ref when the merge-group entry
  // leaves the queue (merged, superseded, or removed). A ref that vanishes
  // mid-run means this synthetic head can never merge, so the stale entry is
  // neutralized as obsolete instead of failing the run closed.
  const neutralizeVanishedQueueRef = liveReceipt => {
    onStatus(
      `Merge-group admission neutralized vanished queue ref ${evidence.headRef}: GitHub deleted the synthetic ref mid-run; the stale queue entry is not an admission defect`
    );
    return {
      ...evidence,
      admitted: false,
      receipt: {
        ...liveReceipt,
        admitted: false,
        currentQueueState: 'VANISHED_QUEUE_REF',
        liveEntry: null,
        obsoleteSyntheticSha: evidence.headSha,
        outcome: 'obsolete',
        replacementCombinedHead: null,
      },
    };
  };

  const proveQueue = async () => {
    const liveReceipt = await readLiveReceipt();
    if (!liveReceipt.admitted) {
      return { ...evidence, admitted: false, receipt: liveReceipt };
    }

    const queueRef = await loadQueueRef({ ...evidence, deadlineMs });
    if (queueRef === null) {
      return neutralizeVanishedQueueRef(liveReceipt);
    }
    validateQueueRef(queueRef, evidence);

    const sourceHeadSha = liveReceipt.liveEntry?.sourceHeadSha;
    if (!SHA_PATTERN.test(String(sourceHeadSha ?? ''))) {
      fail('live merge queue entry omitted its exact source head');
    }
    return { liveReceipt, sourceHeadSha };
  };

  const poll = async () => {
    if (!provenQueue) {
      const proven = await proveQueue();
      if (!('sourceHeadSha' in proven)) return proven;
      provenQueue = proven;
    }
    const { liveReceipt, sourceHeadSha } = provenQueue;
    const pages = await Promise.all(
      REQUIRED_CHECKS.map(checkName =>
        loadCheckRuns({ ...evidence, checkName, deadlineMs })
      )
    );
    const states = pages.map((page, index) =>
      classifyRequiredCheckPage(page, {
        checkName: REQUIRED_CHECKS[index],
        headSha: evidence.headSha,
      })
    );

    const terminalFailure = states.findIndex(
      state => state.state === 'terminal-failure'
    );
    if (terminalFailure >= 0) {
      fail(
        `${REQUIRED_CHECKS[terminalFailure]} completed with ${
          states[terminalFailure].detail
        }`
      );
    }

    if (states.every(state => state.state === 'success')) {
      const finalQueueRef = await loadQueueRef({ ...evidence, deadlineMs });
      if (finalQueueRef === null) {
        return neutralizeVanishedQueueRef(liveReceipt);
      }
      validateQueueRef(finalQueueRef, evidence);
      const finalLiveReceipt = await readLiveReceipt();
      if (!finalLiveReceipt.admitted) {
        return { ...evidence, admitted: false, receipt: finalLiveReceipt };
      }
      const finalSourceHeadSha = finalLiveReceipt.liveEntry?.sourceHeadSha;
      if (finalSourceHeadSha !== sourceHeadSha) {
        fail('live merge queue source head changed during admission');
      }
      onStatus(
        `Merge-group admission passed for ${
          evidence.headSha
        }: ${REQUIRED_CHECKS.join(', ')}`
      );
      return {
        ...evidence,
        admitted: true,
        receipt: finalLiveReceipt,
      };
    }

    return REQUIRED_CHECKS.map(
      (name, index) => `${name}=${states[index].detail}`
    ).join(', ');
  };

  while (true) {
    attempt += 1;
    if (attempt > 1 && now() >= deadlineMs) {
      failStillPending();
    }

    let outcome;
    let delayMs;
    try {
      outcome = await poll();
      pendingPolls += 1;
      delayMs = pendingDelayMs();
    } catch (error) {
      delayMs = pollIntervalMs;
      if (!isTransientApiError(error)) throw error;
      // Every proof repeats after an API recovery.
      provenQueue = null;
      recoverySourceHeadSha ??= observedSourceHeadSha;
      if (error.retryAtMs !== undefined && error.retryAtMs !== null) {
        delayMs = Math.max(pollIntervalMs, error.retryAtMs - now());
        if (delayMs + MAX_API_REQUEST_MS > deadlineMs - now()) {
          fail(
            'GitHub rate-limit recovery does not fit within the admission budget'
          );
        }
      }
      outcome = `GitHub API unavailable (${
        error instanceof Error ? error.message : String(error)
      })`;
    }
    if (typeof outcome !== 'string') return outcome;
    const gateStatus = outcome;
    lastGateStatus = gateStatus;
    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) {
      failStillPending();
    }
    onStatus(
      `Merge-group admission pending (attempt ${attempt}): ${gateStatus}`
    );
    await sleep(Math.min(delayMs, remainingMs));
  }
}

function encodePathParts(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function githubRequest(
  path,
  {
    body = undefined,
    deadlineMs,
    env = process.env,
    fetchImpl = fetch,
    method = 'GET',
    now = Date.now,
    token,
  }
) {
  const remainingMs = deadlineMs - now();
  if (remainingMs <= 0) {
    fail('merge-group admission API deadline expired');
  }

  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  let response;
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      cache: 'no-store',
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(MAX_API_REQUEST_MS, remainingMs))
      ),
    });
  } catch (error) {
    fail(
      `GitHub API request failed for ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    fail(`GitHub API returned non-JSON for ${path}`);
  }
  if (
    path === '/graphql' &&
    [200, 403, 429, 502, 503, 504].includes(response.status) &&
    data?.errors !== undefined &&
    (!Array.isArray(data.errors) || data.errors.length > 0)
  ) {
    // Classify the structured error array before its messages are flattened.
    // Mixed permission/quota responses never enter the retry path.
    try {
      normalizeLiveQueueEntriesPage(data);
    } catch (error) {
      if (isTransientApiError(error)) {
        error.retryAtMs = quotaRetryAt(response.headers, now());
      }
      throw error;
    }
  }
  if (!response.ok) {
    const message = data?.message ?? 'unknown error';
    const error = new MergeGroupAdmissionError(
      `GitHub API ${response.status} for ${path}: ${message}`,
      { path, status: response.status }
    );
    if (
      (response.status === 403 || response.status === 429) &&
      isTransientApiError(error)
    ) {
      error.retryAtMs = quotaRetryAt(response.headers, now());
    }
    throw error;
  }
  return { data, link: response.headers.get('link') };
}

async function githubGraphqlRequest(query, variables, options) {
  const result = await githubRequest('/graphql', {
    ...options,
    body: { query, variables },
    method: 'POST',
  });
  return result.data;
}

function createGitHubAdmissionApi({
  env,
  fetchImpl,
  headRef,
  now,
  repository,
  token,
}) {
  const [owner, name] = splitRepository(repository);
  const encodedRepository = encodePathParts(repository);
  const encodedHeadRef = encodePathParts(headRef.slice('refs/'.length));
  return {
    async loadLiveQueueEntries({ deadlineMs }) {
      const entries = [];
      let cursor = null;
      for (let page = 1; page <= MAX_LIVE_QUEUE_PAGES; page += 1) {
        const payload = await githubGraphqlRequest(
          LIVE_QUEUE_QUERY,
          {
            branch: 'main',
            cursor,
            name,
            owner,
            pageSize: LIVE_QUEUE_PAGE_SIZE,
          },
          { deadlineMs, env, fetchImpl, now, token }
        );
        const parsed = normalizeLiveQueueEntriesPage(payload);
        entries.push(...parsed.entries);
        if (!parsed.hasNextPage) return entries;
        cursor = parsed.endCursor;
      }
      fail(`live merge queue inventory exceeded ${MAX_LIVE_QUEUE_PAGES} pages`);
    },
    async loadQueueRef({ deadlineMs }) {
      try {
        const result = await githubRequest(
          `/repos/${encodedRepository}/git/ref/${encodedHeadRef}`,
          { deadlineMs, env, fetchImpl, now, token }
        );
        return result.data;
      } catch (error) {
        // GitHub deletes the exact queue ref when the entry leaves the merge
        // queue. A 404 here marks this run's synthetic head as stale, which is
        // not an admission defect; every other status stays fail-closed.
        if (error instanceof MergeGroupAdmissionError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    loadCheckRuns({ checkName, deadlineMs, headSha }) {
      const query = new URLSearchParams({
        check_name: checkName,
        filter: 'latest',
        page: '1',
        per_page: '100',
      });
      return githubRequest(
        `/repos/${encodedRepository}/commits/${headSha}/check-runs?${query}`,
        { deadlineMs, env, fetchImpl, now, token }
      );
    },
  };
}

function nullableEnv(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function createRunContextFromEnv(env = process.env) {
  const runId = nullableEnv(env.GITHUB_RUN_ID);
  return {
    runAttempt: nullableEnv(env.GITHUB_RUN_ATTEMPT),
    runId,
    runUrl:
      runId && nullableEnv(env.GITHUB_REPOSITORY)
        ? `${
            nullableEnv(env.GITHUB_SERVER_URL) ?? 'https://github.com'
          }/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`
        : null,
  };
}

async function writeAdmissionOutputs(receipt, env = process.env) {
  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      [
        `admitted=${receipt.admitted ? 'true' : 'false'}`,
        `obsolete=${receipt.outcome === 'obsolete' ? 'true' : 'false'}`,
        `pr_number=${receipt.pr}`,
        `synthetic_head_sha=${receipt.syntheticSha}`,
        `current_queue_state=${receipt.currentQueueState}`,
        `replacement_combined_head=${receipt.replacementCombinedHead ?? ''}`,
        '',
      ].join('\n'),
      'utf8'
    );
  }
  if (env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      [
        '### Merge-group live queue admission',
        '',
        `Receipt schema: \`${receipt.schema}\``,
        '',
        '| Field | Value |',
        '| --- | --- |',
        `| Outcome | \`${receipt.outcome}\` |`,
        `| PR | #${receipt.pr} |`,
        `| Synthetic head | \`${receipt.syntheticSha}\` |`,
        `| Current queue state | \`${receipt.currentQueueState}\` |`,
        `| Replacement combined head | \`${
          receipt.replacementCombinedHead ?? 'none'
        }\` |`,
        `| Run id | \`${receipt.runId ?? 'unknown'}\` |`,
        '',
      ].join('\n'),
      'utf8'
    );
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   sleep?: (delayMs: number) => Promise<any>,
 *   onStatus?: (message: string) => void,
 * }} [options]
 */
export async function runAdmissionFromEnv(
  env = process.env,
  { fetchImpl = fetch, now = Date.now, sleep = defaultSleep, onStatus } = {}
) {
  const eventPath = env.GITHUB_EVENT_PATH;
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const expectedHeadSha = env.GITHUB_SHA;
  const expectedRepository = env.GITHUB_REPOSITORY;
  if (!eventPath || !token || !expectedHeadSha || !expectedRepository) {
    fail(REQUIRED_ENV_MESSAGE);
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const evidence = validateMergeGroupAdmissionEvent(event, {
    expectedHeadSha,
    expectedRepository,
  });
  const api = createGitHubAdmissionApi({
    ...evidence,
    env,
    fetchImpl,
    now,
    token,
  });
  const result = await waitForMergeGroupAdmission({
    event,
    ...api,
    now,
    sleep,
    onStatus,
    runContext: createRunContextFromEnv(env),
  });
  await writeAdmissionOutputs(result.receipt, env);
  console.log(JSON.stringify(result.receipt));
  return result.receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes('--print-contract-version')) {
    console.log(ADMISSION_CONTRACT_VERSION);
  } else {
    runAdmissionFromEnv().catch(error => {
      console.error(
        `::error::${error instanceof Error ? error.message : String(error)}`
      );
      process.exitCode = 1;
    });
  }
}
