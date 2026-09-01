import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUEUE_HEAD_PR_PATTERN =
  /^refs\/heads\/gh-readonly-queue\/main\/pr-([1-9][0-9]*)-[0-9a-f]+$/;
const REQUIRED_CHECKS = Object.freeze(['Fork PR Gate', 'PR Size Guard']);
const LIVE_QUEUE_REQUIRED_STATE = 'AWAITING_CHECKS';
const LIVE_QUEUE_ENTRY_STATES = new Set([
  'QUEUED',
  'AWAITING_CHECKS',
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
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;
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

export class MergeGroupAdmissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeGroupAdmissionError';
  }
}

function fail(message) {
  throw new MergeGroupAdmissionError(message);
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
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    fail(
      `live merge queue GraphQL returned errors: ${payload.errors
        .map(error => error?.message ?? String(error))
        .join('; ')}`
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
    const headCommitOid = requireNullableSha(
      node?.headCommit?.oid,
      `live merge queue headCommit for PR #${prNumber}`
    );
    if (state === LIVE_QUEUE_REQUIRED_STATE && headCommitOid === null) {
      fail(
        [
          `live merge queue AWAITING_CHECKS entry for PR #${prNumber}`,
          'has no headCommit',
        ].join(' ')
      );
    }
    return {
      baseCommitOid: requireNullableSha(
        node?.baseCommit?.oid,
        `live merge queue baseCommit for PR #${prNumber}`
      ),
      baseRefName:
        typeof node?.pullRequest?.baseRefName === 'string'
          ? node.pullRequest.baseRefName
          : null,
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
    .filter(entry => entry.state === LIVE_QUEUE_REQUIRED_STATE)
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
  const matchingPrEntries = entries
    .filter(entry => entry.prNumber === evidence.prNumber)
    .sort((left, right) => left.position - right.position);
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
  const admitted = Boolean(exact?.state === LIVE_QUEUE_REQUIRED_STATE);
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
    schema: 'jovie-merge-group-live-admission/v1',
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
  const readLiveReceipt = async () => {
    const liveEntries = await loadLiveQueueEntries({ ...evidence, deadlineMs });
    const receipt = buildLiveQueueAdmissionReceipt({
      entries: liveEntries,
      evidence,
      runContext,
    });
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

  while (true) {
    attempt += 1;
    if (attempt > 1 && now() >= deadlineMs) {
      fail(`required merge-group checks did not pass within ${maxWaitMs}ms`);
    }

    const liveReceipt = await readLiveReceipt();
    if (!liveReceipt.admitted) {
      return { ...evidence, admitted: false, receipt: liveReceipt };
    }

    const queueRef = await loadQueueRef({ ...evidence, deadlineMs });
    validateQueueRef(queueRef, evidence);

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
      validateQueueRef(finalQueueRef, evidence);
      const finalLiveReceipt = await readLiveReceipt();
      if (!finalLiveReceipt.admitted) {
        return { ...evidence, admitted: false, receipt: finalLiveReceipt };
      }
      onStatus(
        `Merge-group admission passed for ${
          evidence.headSha
        }: ${REQUIRED_CHECKS.join(', ')}`
      );
      return { ...evidence, admitted: true, receipt: finalLiveReceipt };
    }

    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) {
      fail(`required merge-group checks did not pass within ${maxWaitMs}ms`);
    }
    const gateStatus = REQUIRED_CHECKS.map(
      (name, index) => `${name}=${states[index].detail}`
    ).join(', ');
    onStatus(
      `Merge-group admission pending (attempt ${attempt}): ${gateStatus}`
    );
    await sleep(Math.min(pollIntervalMs, remainingMs));
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
  if (!response.ok) {
    const message = data?.message ?? 'unknown error';
    fail(`GitHub API ${response.status} for ${path}: ${message}`);
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
          { deadlineMs, env, fetchImpl, token }
        );
        const parsed = normalizeLiveQueueEntriesPage(payload);
        entries.push(...parsed.entries);
        if (!parsed.hasNextPage) return entries;
        cursor = parsed.endCursor;
      }
      fail(`live merge queue inventory exceeded ${MAX_LIVE_QUEUE_PAGES} pages`);
    },
    async loadQueueRef({ deadlineMs }) {
      const result = await githubRequest(
        `/repos/${encodedRepository}/git/ref/${encodedHeadRef}`,
        { deadlineMs, env, fetchImpl, token }
      );
      return result.data;
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
        { deadlineMs, env, fetchImpl, token }
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
  const receiptB64 = Buffer.from(JSON.stringify(receipt)).toString('base64');
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
        `receipt_b64=${receiptB64}`,
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

export async function runAdmissionFromEnv(
  env = process.env,
  { fetchImpl = fetch } = {}
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
    token,
  });
  const result = await waitForMergeGroupAdmission({
    event,
    ...api,
    runContext: createRunContextFromEnv(env),
  });
  await writeAdmissionOutputs(result.receipt, env);
  console.log(JSON.stringify(result.receipt));
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runAdmissionFromEnv().catch(error => {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
