import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const QUEUE_HEAD_PREFIX = 'refs/heads/gh-readonly-queue/main/';
const REQUIRED_CHECKS = Object.freeze(['Fork PR Gate', 'PR Size Guard']);
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

function splitRepository(repository) {
  const parts = String(repository ?? '').split('/');
  if (parts.length !== 2 || parts.some(part => !part)) {
    fail('merge_group repository is malformed');
  }
  return parts;
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
  if (
    typeof group.head_ref !== 'string' ||
    !group.head_ref.startsWith(QUEUE_HEAD_PREFIX)
  ) {
    fail('merge_group head_ref is not a main queue ref');
  }
  if (group.head_commit?.id && group.head_commit.id !== headSha) {
    fail('merge_group head_commit does not match head_sha');
  }

  return { headRef: group.head_ref, headSha, repository };
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
  loadQueueRef,
  maxWaitMs = MAX_WAIT_MS,
  now = Date.now,
  onStatus = message => console.log(message),
  pollIntervalMs = POLL_INTERVAL_MS,
  sleep = defaultSleep,
}) {
  const evidence = validateMergeGroupAdmissionEvent(event);
  if (
    typeof loadCheckRuns !== 'function' ||
    typeof loadQueueRef !== 'function'
  ) {
    fail('merge_group admission loaders are required');
  }
  requireTimingBound(maxWaitMs, 'maxWaitMs', MAX_WAIT_MS);
  requireTimingBound(pollIntervalMs, 'pollIntervalMs', maxWaitMs);

  const deadlineMs = now() + maxWaitMs;
  let attempt = 0;
  while (true) {
    attempt += 1;
    if (attempt > 1 && now() >= deadlineMs) {
      fail(`required merge-group checks did not pass within ${maxWaitMs}ms`);
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
        `${REQUIRED_CHECKS[terminalFailure]} completed with ${states[terminalFailure].detail}`
      );
    }

    if (states.every(state => state.state === 'success')) {
      const finalQueueRef = await loadQueueRef({ ...evidence, deadlineMs });
      validateQueueRef(finalQueueRef, evidence);
      onStatus(
        `Merge-group admission passed for ${evidence.headSha}: ${REQUIRED_CHECKS.join(', ')}`
      );
      return evidence;
    }

    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) {
      fail(`required merge-group checks did not pass within ${maxWaitMs}ms`);
    }
    onStatus(
      `Merge-group admission pending (attempt ${attempt}): ${REQUIRED_CHECKS.map(
        (name, index) => `${name}=${states[index].detail}`
      ).join(', ')}`
    );
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

function encodePathParts(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

async function githubRequest(
  path,
  { deadlineMs, fetchImpl = fetch, now = Date.now, token }
) {
  const remainingMs = deadlineMs - now();
  if (remainingMs <= 0) {
    fail('merge-group admission API deadline expired');
  }

  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  let response;
  try {
    response = await fetchImpl(`${apiUrl}${path}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(MAX_API_REQUEST_MS, remainingMs))
      ),
    });
  } catch (error) {
    fail(
      `GitHub API request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`
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
    fail(
      `GitHub API ${response.status} for ${path}: ${data?.message ?? 'unknown error'}`
    );
  }
  return { data, link: response.headers.get('link') };
}

function createGitHubAdmissionApi({ headRef, repository, token }) {
  const encodedRepository = encodePathParts(repository);
  const encodedHeadRef = encodePathParts(headRef.slice('refs/'.length));
  return {
    async loadQueueRef({ deadlineMs }) {
      const result = await githubRequest(
        `/repos/${encodedRepository}/git/ref/${encodedHeadRef}`,
        { deadlineMs, token }
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
        { deadlineMs, token }
      );
    },
  };
}

async function run() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const expectedHeadSha = process.env.GITHUB_SHA;
  const expectedRepository = process.env.GITHUB_REPOSITORY;
  if (!eventPath || !token || !expectedHeadSha || !expectedRepository) {
    fail(
      'GITHUB_EVENT_PATH, GH_TOKEN, GITHUB_SHA, and GITHUB_REPOSITORY are required'
    );
  }

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const evidence = validateMergeGroupAdmissionEvent(event, {
    expectedHeadSha,
    expectedRepository,
  });
  const api = createGitHubAdmissionApi({ ...evidence, token });
  await waitForMergeGroupAdmission({ event, ...api });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch(error => {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
