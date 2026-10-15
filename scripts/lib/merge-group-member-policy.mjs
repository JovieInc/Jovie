import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluatePrSizePolicy } from './pr-size-guard-policy.mjs';
import {
  HYGIENE_LIMITS,
  trackedBytesBudgetWarning,
} from './repo-hygiene-limits.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const GENERATED_PR_TRAILER_PATTERN = /\(#(\d+)\)$/;
// Fail closed at the checked-in native queue's max_entries_to_merge ceiling.
const MAX_GROUP_MEMBERS = 1;
const SIZE_BYPASS_LABELS = new Set(['big-pr', 'codemod']);
// Mirrors scripts/lanes/pr_events.py HOLD_LABELS. Native auto-merge checks
// labels only when it is armed, so a hold added later is enforced here, on the
// merge group every landing passes through (JOV-6843).
export const HOLD_LABELS = new Set([
  'hold',
  'gated',
  'incident',
  'do-not-merge',
  'tim-hold',
  'tim:hold',
  'hold:tim',
  'queue-deferred',
]);
const COLLABORATOR_ASSOCIATIONS = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);
const OPINIONATED_REVIEW_STATES = new Set([
  'APPROVED',
  'CHANGES_REQUESTED',
  'DISMISSED',
]);
const SIZE_EXCLUSION_PATTERN =
  /pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.lock$|\/generated\/|\.gen\.|__snapshots__\/|\.snap$|\.svg$|\.po$|\/dist\/|\/build\/|\.min\.|drizzle\/migrations\/meta\//;
const REGULAR_FILE_MODES = new Set(['100644', '100755']);
const MAX_API_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_API_REQUEST_MS = 10_000;
// Short requests still give up inside a minute. Rate-limit holds and 5xx
// backoff use MERGE_GROUP_JOB_BUDGET_MS so a reset inside the Size Guard job
// can finish as a pass. The job clock includes provisioning (69s observed);
// 100s of in-script hold still ends before the 3-minute killer. A cancelled
// required check ejects the group the same way a red one does.
export const MERGE_GROUP_POLICY_DEADLINE_MS = 45_000;
export const MERGE_GROUP_JOB_BUDGET_MS = 100_000;

export class MergeGroupPolicyEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeGroupPolicyEvidenceError';
  }
}

// The installation bucket is empty and the reset is outside this job. A red
// required check would eject the member, so callers may pass only when the
// checkout already proves the size decision. Permission 403s stay final.
export class MergeGroupQuotaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeGroupQuotaError';
  }
}

function fail(message) {
  throw new MergeGroupPolicyEvidenceError(message);
}

function requireSha(value, field) {
  if (!SHA_PATTERN.test(String(value ?? '')))
    fail(`${field} is not a full SHA`);
  return value;
}

function requireInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    fail(`${field} is not a positive integer`);
  }
  return value;
}

function generatedPullRequestNumber(commit) {
  const subject = String(commit?.commit?.message ?? '')
    .split('\n', 1)[0]
    .trim();
  const match = subject.match(GENERATED_PR_TRAILER_PATTERN);
  if (!match)
    fail(
      `synthetic commit ${commit?.sha ?? 'unknown'} has no final (#PR) trailer`
    );
  return requireInteger(Number(match[1]), 'synthetic pull request number');
}

function requireGitHubGeneratedCommit(commit) {
  const committer = commit?.commit?.committer;
  const verification = commit?.commit?.verification;
  if (
    committer?.name !== 'GitHub' ||
    committer?.email !== 'noreply@github.com' ||
    verification?.verified !== true ||
    verification?.reason !== 'valid'
  ) {
    fail(
      `synthetic commit ${commit?.sha ?? 'unknown'} is not verified GitHub-generated evidence`
    );
  }
}

export function validateMergeGroupEvent(event) {
  if (event?.action !== 'checks_requested')
    fail('unexpected merge_group action');

  const group = event?.merge_group;
  const repository = event?.repository?.full_name;
  if (!group || typeof repository !== 'string') {
    fail('merge_group payload is missing repository evidence');
  }
  const { owner, name } = splitRepository(repository);
  const baseSha = requireSha(group.base_sha, 'merge_group.base_sha');
  const headSha = requireSha(group.head_sha, 'merge_group.head_sha');
  if (baseSha === headSha) fail('merge_group base and head must differ');
  if (group.base_ref !== 'refs/heads/main') {
    fail(
      `merge_group targets unexpected base ref: ${group.base_ref ?? 'missing'}`
    );
  }
  if (
    typeof group.head_ref !== 'string' ||
    !group.head_ref.startsWith('refs/heads/gh-readonly-queue/main/')
  ) {
    fail('merge_group head_ref is not a main merge-queue ref');
  }
  if (group.head_commit?.id && group.head_commit.id !== headSha) {
    fail('merge_group head commit does not match head_sha');
  }
  return { baseSha, branch: 'main', headSha, name, owner, repository };
}

/**
 * Resolve every PR represented by one exact merge_group head.
 *
 * GitHub's merge_group payload deliberately exposes only base/head refs and
 * SHAs. The exact base..head first-parent range contains one GitHub-generated
 * commit per member, whose final (#PR) trailer identifies that member. Current
 * PR metadata is fetched through the REST API after discovery; the unprivileged
 * merge_group token cannot read the live mergeQueue GraphQL field, and this
 * combined-head workflow must never receive a privileged App secret.
 */
export function resolveMergeGroupMembers({ event, comparison }) {
  const { baseSha, headSha } = validateMergeGroupEvent(event);

  if (
    comparison?.status !== 'ahead' ||
    comparison?.behind_by !== 0 ||
    comparison?.base_commit?.sha !== baseSha ||
    comparison?.merge_base_commit?.sha !== baseSha ||
    !Array.isArray(comparison?.commits) ||
    comparison.commits.length === 0 ||
    comparison.total_commits !== comparison.commits.length ||
    comparison.ahead_by !== comparison.commits.length
  ) {
    fail('compare API did not return the exact base..head range');
  }
  if (comparison.commits.length > MAX_GROUP_MEMBERS) {
    fail(`merge group exceeds trusted ${MAX_GROUP_MEMBERS}-member bound`);
  }

  let parentSha = baseSha;
  const seenNumbers = new Set();
  const members = comparison.commits.map(commit => {
    const commitSha = requireSha(commit?.sha, 'synthetic commit sha');
    const parents = commit?.parents;
    if (
      !Array.isArray(parents) ||
      parents.length !== 1 ||
      parents[0]?.sha !== parentSha
    ) {
      fail(
        `synthetic commit ${commitSha} is not the expected first-parent link`
      );
    }
    requireGitHubGeneratedCommit(commit);

    const number = generatedPullRequestNumber(commit);
    if (seenNumbers.has(number)) fail(`merge group repeats PR #${number}`);
    seenNumbers.add(number);

    parentSha = commitSha;
    return {
      number,
      syntheticHeadSha: commitSha,
    };
  });

  if (parentSha !== headSha)
    fail('synthetic commit range does not end at head_sha');
  return members;
}

function labelsFor(pr) {
  if (!Array.isArray(pr?.labels))
    fail(`PR #${pr?.number ?? 'unknown'} labels are malformed`);
  const labels = pr.labels.map(label => label?.name);
  if (labels.some(label => typeof label !== 'string' || label.length === 0)) {
    fail(`PR #${pr?.number ?? 'unknown'} contains a malformed label`);
  }
  return labels;
}

export function assertCurrentPullRequest(member, pr) {
  if (
    pr?.number !== member.number ||
    pr?.state !== 'open' ||
    pr?.base?.ref !== 'main' ||
    !SHA_PATTERN.test(String(pr?.head?.sha ?? '')) ||
    typeof pr?.head?.repo?.fork !== 'boolean'
  ) {
    fail(`PR #${member.number} changed or is malformed after group discovery`);
  }
  labelsFor(pr);
}

export function latestOpinionatedReviewsByReviewer(reviews) {
  if (!Array.isArray(reviews)) fail('pull request reviews are malformed');
  const latest = new Map();
  for (const review of reviews) {
    if (!OPINIONATED_REVIEW_STATES.has(review?.state)) continue;
    const login = review?.user?.login;
    if (
      !Number.isInteger(review?.id) ||
      typeof login !== 'string' ||
      typeof review?.submitted_at !== 'string' ||
      Number.isNaN(Date.parse(review.submitted_at))
    ) {
      fail('opinionated pull request review is malformed');
    }
    const previous = latest.get(login);
    if (
      !previous ||
      review.submitted_at > previous.submitted_at ||
      (review.submitted_at === previous.submitted_at && review.id > previous.id)
    ) {
      latest.set(login, review);
    }
  }
  return latest;
}

export function evaluateForkMemberPolicy({ pr, reviews }) {
  if (
    typeof pr?.head?.repo?.fork !== 'boolean' ||
    !SHA_PATTERN.test(pr?.head?.sha)
  ) {
    fail(`PR #${pr?.number ?? 'unknown'} fork metadata is malformed`);
  }
  if (!pr.head.repo.fork) {
    return { passed: true, policy: 'internal', reason: 'internal PR' };
  }

  const latest = latestOpinionatedReviewsByReviewer(reviews);
  const approvers = [...latest.values()]
    .filter(
      review =>
        review.state === 'APPROVED' &&
        review.commit_id === pr.head.sha &&
        review.user?.type !== 'Bot' &&
        COLLABORATOR_ASSOCIATIONS.has(review.author_association)
    )
    .map(review => review.user.login)
    .sort();

  return approvers.length > 0
    ? {
        passed: true,
        policy: 'fork-approved',
        reason: `current-head approval from ${approvers.join(', ')}`,
      }
    : {
        passed: false,
        policy: 'fork-approved',
        reason: "no current-head approval in each reviewer's latest state",
      };
}

export function countSizeGuardFiles(files) {
  if (!Array.isArray(files)) fail('pull request files are malformed');
  let lines = 0;
  let count = 0;
  for (const file of files) {
    if (
      typeof file?.filename !== 'string' ||
      !Number.isInteger(file.additions) ||
      file.additions < 0 ||
      !Number.isInteger(file.deletions) ||
      file.deletions < 0
    ) {
      fail('pull request file metadata is malformed');
    }
    if (SIZE_EXCLUSION_PATTERN.test(file.filename)) continue;
    lines += file.additions + file.deletions;
    count += 1;
  }
  return { lines, files: count };
}

/** A held member fails every merge-group policy, whatever else it passes. */
export function evaluateHoldMemberPolicy(pr) {
  const held = labelsFor(pr).find(label =>
    HOLD_LABELS.has(label.toLowerCase())
  );
  return held
    ? { passed: false, policy: 'hold', reason: `carries the ${held} label` }
    : null;
}

export function evaluateSizeMemberPolicy({ pr, files, maxLines, maxFiles }) {
  const labels = labelsFor(pr);
  if (pr?.user?.login === 'dependabot[bot]') {
    return {
      passed: true,
      policy: 'dependabot',
      reason: 'Dependabot exemption',
    };
  }
  if (pr?.head?.ref === 'screenshots/auto-update') {
    return {
      passed: true,
      policy: 'screenshots',
      reason: 'screenshot automation exemption',
    };
  }
  const bypass = labels.find(label => SIZE_BYPASS_LABELS.has(label));
  if (bypass) {
    return {
      passed: true,
      policy: bypass,
      reason: `current ${bypass} label bypass`,
    };
  }

  const counted = countSizeGuardFiles(files);
  return evaluatePrSizePolicy({
    labels,
    body: pr?.body,
    lines: counted.lines,
    files: counted.files,
    maxLines,
    maxFiles,
  });
}

export function parseTrackedRegularTree(payload) {
  if (
    !payload ||
    payload.truncated !== false ||
    !SHA_PATTERN.test(String(payload.sha ?? '')) ||
    !Array.isArray(payload.tree)
  ) {
    fail('combined tree listing is missing, truncated, or malformed');
  }
  const seenPaths = new Set();
  let bytes = 0;
  let files = 0;
  for (const entry of payload.tree) {
    const { mode, path, sha, size, type } = entry ?? {};
    if (
      !/^[0-7]{6}$/.test(String(mode ?? '')) ||
      typeof path !== 'string' ||
      path.length === 0 ||
      !SHA_PATTERN.test(String(sha ?? '')) ||
      !['blob', 'commit', 'tree'].includes(type)
    ) {
      fail('combined tree listing contains malformed evidence');
    }
    if (seenPaths.has(path))
      fail(`combined tree repeats tracked path: ${path}`);
    seenPaths.add(path);

    if (REGULAR_FILE_MODES.has(mode)) {
      if (type !== 'blob' || !Number.isSafeInteger(size) || size < 0) {
        fail(`combined tree has invalid regular-file evidence: ${path}`);
      }
      bytes += size;
      if (!Number.isSafeInteger(bytes)) {
        fail('combined tree byte total is unsafe');
      }
      files += 1;
      continue;
    }

    const supportedNonRegular =
      (mode === '040000' && type === 'tree' && size === undefined) ||
      (mode === '120000' &&
        type === 'blob' &&
        Number.isSafeInteger(size) &&
        size >= 0) ||
      (mode === '160000' && type === 'commit' && size === undefined);
    if (!supportedNonRegular) {
      fail(`combined tree has unsupported tracked mode ${mode}: ${path}`);
    }
  }
  return { bytes, files };
}

export async function enforceCombinedTreePayload({
  deadlineMs = undefined,
  headSha,
  maxTrackedBytes = HYGIENE_LIMITS.maxTrackedBytes,
  now = Date.now,
  repository,
  request = githubRequest,
  token,
  treeSha: provenTreeSha = undefined,
}) {
  requireSha(headSha, 'merge_group.head_sha');
  splitRepository(repository);
  if (!token) fail('combined tree token is required');
  requireDeadline(deadlineMs, now);
  if (!Number.isSafeInteger(maxTrackedBytes) || maxTrackedBytes < 1) {
    fail('combined tree byte budget is invalid');
  }

  const encodedRepository = repository
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  // The compare read already proved the head commit and names its tree.
  let treeSha = provenTreeSha;
  if (treeSha === undefined) {
    const commit = await request(
      `/repos/${encodedRepository}/git/commits/${headSha}`,
      { deadlineMs, token }
    );
    treeSha = commit.data?.tree?.sha;
    if (commit.data?.sha !== headSha) treeSha = undefined;
  }
  if (!SHA_PATTERN.test(String(treeSha ?? ''))) {
    fail('combined head commit evidence is missing or malformed');
  }

  const tree = await request(
    `/repos/${encodedRepository}/git/trees/${treeSha}?recursive=1`,
    { deadlineMs, token }
  );
  if (tree.data?.sha !== treeSha) {
    fail('combined tree does not match the exact head commit');
  }
  const result = parseTrackedRegularTree(tree.data);
  if (result.bytes > maxTrackedBytes) {
    fail(
      `${result.bytes} bytes of tracked regular files exceeds the ${maxTrackedBytes}-byte combined-tree budget`
    );
  }
  return result;
}

function splitRepository(fullName) {
  const parts = fullName.split('/');
  if (parts.length !== 2 || parts.some(part => !part))
    fail('invalid repository name');
  return { owner: parts[0], name: parts[1] };
}

function linkHasNext(link) {
  return typeof link === 'string' && /<[^>]+>;\s*rel="next"/.test(link);
}

function requireDeadline(deadlineMs, now = Date.now) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= now()) {
    fail('merge-group policy API deadline is missing or expired');
  }
  return deadlineMs;
}

export async function readBoundedResponseText(
  response,
  path,
  maxBytes = MAX_API_RESPONSE_BYTES
) {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      fail(`GitHub API response has an invalid content length for ${path}`);
    }
    if (Number(contentLength) > maxBytes) {
      fail(`GitHub API response exceeded the bounded size for ${path}`);
    }
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      fail(`GitHub API response exceeded the bounded size for ${path}`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

// GitHub answers that say nothing about the merge group are retried instead of
// turning this required check red. On 2026-10-13 01:53-01:55Z 19 PR Size Guard
// merge groups failed on the repo's exhausted GITHUB_TOKEN. On 2026-10-15
// 12:54-13:00Z every merge-group Size Guard run failed on installation 403s,
// and each ejection re-queued the group and spent more of the same quota.
// Run 38741244554 then ejected #21846 on a transient 502 for pulls/21846.
// 5xx and network errors use bounded exponential backoff with jitter. A
// rate-limit 403 or 429 holds until x-ratelimit-reset or retry-after when that
// instant is inside the job budget. Permission 403s and other real answers
// stay final. Kept self-contained (same rules as scripts/lib/github-rate-limit.mjs):
// this file runs from sparse checkouts, including a pinned bootstrap base.
export const MAX_API_ATTEMPTS = 6;
const RETRY_MARGIN_MS = 2_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 15_000;
const JITTER_RATIO = 0.2;
const PRIMARY = 'primary-rate-limit';
const NONE = 'none';
const memoryCache = new Map();

export function clearCachedGitHubResponses() {
  memoryCache.clear();
}

function headerNumber(headers, name) {
  const value = headers?.get?.(name);
  return value != null && /^[0-9]+$/.test(String(value).trim())
    ? Number(value)
    : null;
}

function retryAfterMs(headers, now) {
  const raw = headers?.get?.('retry-after');
  if (raw == null) return null;
  const text = String(raw).trim();
  if (/^[0-9]+$/.test(text)) return now + Number(text) * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyGitHubFailure({ status, message, headers, now }) {
  const remaining = headerNumber(headers, 'x-ratelimit-remaining');
  const reset = headerNumber(headers, 'x-ratelimit-reset');
  const retryAfter = retryAfterMs(headers, now);
  const bounds = [];
  if (remaining === 0 && reset !== null) bounds.push(reset * 1000);
  if (retryAfter !== null) bounds.push(retryAfter);
  const retryAtMs = bounds.length ? Math.max(now, ...bounds) + 1000 : null;
  const text = String(message ?? '');
  if (
    /\bAPI rate limit (?:already )?exceeded for\b/i.test(text) ||
    ((status === 403 || status === 429) && remaining === 0)
  ) {
    return { kind: PRIMARY, retryAtMs };
  }
  if (
    status === 429 ||
    /\bsecondary rate limit\b|\babuse (?:detection|rate limit)\b/i.test(text) ||
    (status === 403 && retryAfter !== null)
  ) {
    return { kind: 'secondary-rate-limit', retryAtMs };
  }
  if (
    status === 0 ||
    [500, 502, 503, 504].includes(Number(status)) ||
    /\bGitHub API request failed for\b/.test(text) ||
    /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket hang up)\b/i.test(
      text
    )
  ) {
    return { kind: 'transient-server', retryAtMs };
  }
  return { kind: NONE, retryAtMs: null };
}

function backoffMs(attempt, random = () => 0.5) {
  const raw = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1));
  const roll = Number(random());
  const unit = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
  return Math.max(
    0,
    Math.round(raw * (1 - JITTER_RATIO + 2 * JITTER_RATIO * unit))
  );
}

/** Wait before the next attempt, or null when the answer is final or the wait misses the deadline. */
export function apiRetryDelay({
  status,
  message,
  headers,
  attempt,
  nowMs,
  deadlineMs,
  random = () => 0.5,
}) {
  if (attempt >= MAX_API_ATTEMPTS) return null;
  const failure = classifyGitHubFailure({
    status,
    message,
    headers,
    now: nowMs,
  });
  if (failure.kind === NONE) return null;
  const waitMs =
    failure.retryAtMs !== null
      ? Math.max(0, failure.retryAtMs - nowMs)
      : backoffMs(attempt, random);
  if (nowMs + waitMs > deadlineMs - RETRY_MARGIN_MS) return null;
  return waitMs;
}

function cacheKey(scope, path) {
  return `${scope}\n${path}`;
}

function pullCacheScopes(path) {
  const match = String(path).match(/\/pulls\/([1-9][0-9]{0,9})$/);
  return match ? [`pr-${match[1]}`] : [];
}

function isQuotaKind(kind) {
  return kind === PRIMARY || kind === 'secondary-rate-limit';
}

const CACHE_SCOPE_PATTERN = /^(?:[0-9a-f]{40}|pr-[1-9][0-9]{0,9})$/;

function diskCachePath(dir, scope, path) {
  if (typeof dir !== 'string' || dir.length === 0) return null;
  if (!CACHE_SCOPE_PATTERN.test(String(scope ?? ''))) return null;
  const name = createHash('sha256').update(String(path)).digest('hex');
  return join(dir, scope, `${name}.json`);
}

async function readDiskCache(dir, scope, path) {
  const file = diskCachePath(dir, scope, path);
  if (!file) return null;
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed?.path !== path || !Object.hasOwn(parsed, 'data')) return null;
    return { data: parsed.data, link: parsed.link ?? null };
  } catch {
    return null;
  }
}

async function writeDiskCache(dir, scope, path, value) {
  const file = diskCachePath(dir, scope, path);
  if (!file) return;
  try {
    await mkdir(join(dir, scope), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({ path, data: value.data, link: value.link ?? null })
    );
  } catch {
    // The live response still stands. The next run refetches.
  }
}

/** @returns {Promise<{ data: any, link?: string | null }>} */
export async function githubRequest(
  path,
  {
    token = undefined,
    method = 'GET',
    body = undefined,
    deadlineMs = undefined,
    env = process.env,
    fetchImpl = fetch,
    now = Date.now,
    timeoutSignal = AbortSignal.timeout,
    sleep = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
    random = Math.random,
    cacheScope = undefined,
    cacheDir = undefined,
    quotaFallbackScopes = undefined,
  } = {}
) {
  const cacheable =
    method === 'GET' &&
    body === undefined &&
    typeof cacheScope === 'string' &&
    path !== '/rate_limit';
  const key = cacheable ? cacheKey(cacheScope, path) : null;
  if (key && memoryCache.has(key)) return memoryCache.get(key);
  if (key) {
    const cached = await readDiskCache(cacheDir, cacheScope, path);
    if (cached) {
      memoryCache.set(key, cached);
      return cached;
    }
  }
  for (let attempt = 1; ; attempt += 1) {
    const answer = await requestOnce(path, {
      token,
      method,
      body,
      deadlineMs,
      env,
      fetchImpl,
      now,
      timeoutSignal,
    });
    if (answer.ok) {
      const result = { data: answer.data, link: answer.link };
      if (key) {
        memoryCache.set(key, result);
        await writeDiskCache(cacheDir, cacheScope, path, result);
      }
      for (const scope of quotaFallbackScopes ?? []) {
        await writeDiskCache(cacheDir, scope, path, result);
      }
      return result;
    }
    const nowMs = now();
    const delayMs = apiRetryDelay({
      status: answer.status,
      message: answer.message,
      headers: answer.headers,
      attempt,
      nowMs,
      deadlineMs,
      random,
    });
    if (delayMs === null) {
      const failure = classifyGitHubFailure({
        status: answer.status,
        message: answer.message,
        headers: answer.headers,
        now: nowMs,
      });
      if (isQuotaKind(failure.kind)) {
        const remaining = headerNumber(answer.headers, 'x-ratelimit-remaining');
        const reset = headerNumber(answer.headers, 'x-ratelimit-reset');
        console.error(
          `::warning::GitHub quota exhausted for ${path} remaining=${remaining ?? 'unknown'} reset=${reset ?? 'unknown'}`
        );
        // Reset is outside this job. Failing the check ejects the group.
        // runPolicy may reuse a cached pull record or the local checkout.
        throw new MergeGroupQuotaError(answer.message);
      }
      fail(answer.message);
    }
    console.error(
      `::notice::GitHub API hold ${delayMs}ms after ${answer.message}`
    );
    await sleep(delayMs);
  }
}

async function requestOnce(
  path,
  { token, method, body, deadlineMs, env, fetchImpl, now, timeoutSignal }
) {
  requireDeadline(deadlineMs, now);
  const remainingMs = deadlineMs - now();
  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  const url = path.startsWith('http') ? path : `${apiUrl}${path}`;
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutSignal(
        Math.max(1, Math.min(MAX_API_REQUEST_MS, remainingMs))
      ),
    });
  } catch (error) {
    if (error instanceof MergeGroupPolicyEvidenceError) throw error;
    return {
      ok: false,
      status: 0,
      headers: null,
      message: `GitHub API request failed for ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  const text = await readBoundedResponseText(response, path);
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A 5xx gateway page is HTML; it is still a retryable answer.
    if (response.ok) fail(`GitHub API returned non-JSON for ${path}`);
    data = null;
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      headers: response.headers,
      message: `GitHub API ${response.status} for ${path}: ${data?.message ?? 'unknown error'}`,
    };
  }
  return { ok: true, data, link: response.headers.get('link') };
}

async function githubPages(
  path,
  {
    token = undefined,
    maxPages = 30,
    deadlineMs = undefined,
    request = githubRequest,
  } = {}
) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await request(
      `${path}${separator}per_page=100&page=${page}`,
      {
        deadlineMs,
        token,
      }
    );
    if (!Array.isArray(result.data))
      fail(`GitHub API pagination is malformed for ${path}`);
    rows.push(...result.data);
    if (!linkHasNext(result.link)) {
      // GitHub caps some PR list endpoints at 3,000 rows. A completely full
      // final page at our matching bound is indistinguishable from truncation.
      if (page === maxPages && result.data.length === 100) {
        fail(`GitHub API pagination may be truncated for ${path}`);
      }
      return rows;
    }
  }
  fail(`GitHub API pagination exceeded ${maxPages} pages for ${path}`);
}

async function fetchPullRequest(
  repository,
  number,
  token,
  deadlineMs,
  request = githubRequest
) {
  const result = await request(`/repos/${repository}/pulls/${number}`, {
    deadlineMs,
    token,
  });
  return result.data;
}

async function fetchComparison(
  repository,
  baseSha,
  headSha,
  token,
  deadlineMs,
  request = githubRequest
) {
  const result = await request(
    `/repos/${repository}/compare/${baseSha}...${headSha}`,
    { deadlineMs, token }
  );
  return result.data;
}

export function localCheckoutFromEvidence(evidence, baseSha, headSha) {
  if (
    !evidence ||
    evidence.baseSha !== baseSha ||
    evidence.headSha !== headSha ||
    evidence.parentSha !== baseSha ||
    evidence.committerName !== 'GitHub' ||
    evidence.committerEmail !== 'noreply@github.com' ||
    !SHA_PATTERN.test(String(evidence.treeSha ?? '')) ||
    typeof evidence.subject !== 'string' ||
    evidence.subject.length === 0
  ) {
    return null;
  }
  const files = evidence.files;
  if (files != null && !Array.isArray(files)) return null;
  const trackedBytes = evidence.trackedBytes ?? null;
  const trackedFiles = evidence.trackedFiles ?? null;
  const treePresent = trackedBytes !== null || trackedFiles !== null;
  if (
    treePresent &&
    (!Number.isSafeInteger(trackedBytes) ||
      trackedBytes < 0 ||
      !Number.isSafeInteger(trackedFiles) ||
      trackedFiles < 0)
  ) {
    return null;
  }
  const commit = {
    sha: headSha,
    parents: [{ sha: baseSha }],
    commit: {
      message: evidence.subject,
      committer: {
        name: evidence.committerName,
        email: evidence.committerEmail,
      },
      // The event head SHA is this commit's object id, so the committer,
      // parent, and subject are the bytes GitHub stored. No compare read.
      verification: { verified: true, reason: 'valid' },
      tree: { sha: evidence.treeSha },
    },
  };
  return {
    comparison: {
      status: 'ahead',
      ahead_by: 1,
      behind_by: 0,
      total_commits: 1,
      base_commit: { sha: baseSha },
      merge_base_commit: { sha: baseSha },
      commits: [commit],
    },
    files: Array.isArray(files) ? files : null,
    treeSha: evidence.treeSha,
    trackedBytes: treePresent ? trackedBytes : null,
    trackedFiles: treePresent ? trackedFiles : null,
  };
}

function localTreeEvidence(local) {
  const bytes = local?.trackedBytes;
  const files = local?.trackedFiles;
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isSafeInteger(files) ||
    files < 0
  ) {
    return null;
  }
  return { bytes, files };
}

function localSizeEvidence(local) {
  return Array.isArray(local?.files) && localTreeEvidence(local) !== null;
}

function assertTrackedBudget(payload, maxTrackedBytes) {
  if (payload.bytes > maxTrackedBytes) {
    fail(
      `${payload.bytes} bytes of tracked regular files exceeds the ${maxTrackedBytes}-byte combined-tree budget`
    );
  }
}

async function installationQuotaResetOutsideBudget(request, token, deadlineMs) {
  // GET /rate_limit does not spend the bucket it reports. A remaining of 0
  // whose reset is past this job would 403 every counted read and eject the
  // group, so the caller skips those reads.
  try {
    const result = await request('/rate_limit', { deadlineMs, token });
    const core = result.data?.resources?.core;
    if (
      !core ||
      core.remaining !== 0 ||
      !Number.isInteger(core.reset) ||
      core.reset * 1000 <= deadlineMs
    ) {
      return null;
    }
    return {
      limit: Number.isInteger(core.limit) ? core.limit : null,
      remaining: 0,
      reset: core.reset,
    };
  } catch (error) {
    if (error instanceof MergeGroupQuotaError) {
      return { limit: null, remaining: 0, reset: null };
    }
    return null;
  }
}

async function recoverCachedPullRequests(env, repository, members) {
  const recovered = [];
  for (const member of members) {
    const cached = await readDiskCache(
      env.MERGE_GROUP_POLICY_CACHE_DIR,
      `pr-${member.number}`,
      `/repos/${repository}/pulls/${member.number}`
    );
    if (!cached?.data) return null;
    try {
      assertCurrentPullRequest(member, cached.data);
    } catch {
      return null;
    }
    recovered.push(cached.data);
  }
  return recovered;
}

async function passQuotaFromLocalCheckout({
  also,
  emit,
  env,
  local,
  log,
  members,
  policy,
  quotaError,
}) {
  const files = Array.isArray(local?.files) ? local.files : null;
  const tree = localTreeEvidence(local);
  // No diff or no tree: the size decision is unknown. Do not pass.
  if (policy !== 'size' || !files || !tree) throw quotaError;

  const maxLines = Number(env.MAX_LINES ?? '800');
  const maxFiles = Number(env.MAX_FILES ?? '40');
  const counted = countSizeGuardFiles(files);
  // Empty labels fail closed on an over-cap diff: big-pr and codemod cannot
  // be confirmed while the pull record is unreachable.
  const size = evaluatePrSizePolicy({
    labels: [],
    body: '',
    lines: counted.lines,
    files: counted.files,
    maxLines,
    maxFiles,
  });
  const numbers = members.map(member => `#${member.number}`).join(', ');
  log(
    `::warning::GitHub installation quota is exhausted and the reset is outside this job. PR ${numbers} size used the local checkout only. Live fork metadata and hold labels were not re-read.`
  );
  if (also) {
    for (const member of members) {
      log(
        `${also} policy PR #${member.number}: PASS — local checkout only; live fork metadata unavailable`
      );
    }
    await emit(`${also}_verdict=pass`);
  }
  assertTrackedBudget(tree, HYGIENE_LIMITS.maxTrackedBytes);
  if (!size.passed) {
    for (const member of members) {
      log(`PR #${member.number}: FAIL — ${size.reason}`);
    }
    fail(`PR #${members[0].number} failed ${policy} merge-group policy`);
  }
  const warning = trackedBytesBudgetWarning(tree.bytes);
  if (warning) log(`::warning::Combined tree: ${warning}`);
  log(
    `Combined tree: PASS — ${tree.bytes} tracked regular-file bytes across ${tree.files} files (local checkout).`
  );
  for (const member of members) {
    log(
      `PR #${member.number}: PASS — ${size.reason} (local checkout; quota exhausted)`
    );
  }
  log(
    `Validated ${members.length} merge-group member(s) for ${policy} policy.`
  );
}

async function readEvidenceFile(file, baseSha, headSha) {
  if (typeof file !== 'string' || file.length === 0) return null;
  try {
    return localCheckoutFromEvidence(
      JSON.parse(await readFile(file, 'utf8')),
      baseSha,
      headSha
    );
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   baseSha?: string,
 *   headSha?: string,
 *   env?: NodeJS.ProcessEnv,
 *   cwd?: string,
 * }} [options]
 */
export async function readLocalMergeGroupCheckout({
  baseSha,
  headSha,
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const fromFile = await readEvidenceFile(
    env.MERGE_GROUP_LOCAL_EVIDENCE,
    baseSha,
    headSha
  );
  if (fromFile) return fromFile;
  try {
    const { readLocalMergeGroupEvidence } = await import(
      './merge-group-local-evidence.mjs'
    );
    return localCheckoutFromEvidence(
      readLocalMergeGroupEvidence({ baseSha, headSha, cwd }),
      baseSha,
      headSha
    );
  } catch {
    return null;
  }
}

function parsePolicy(argv) {
  const argument = argv.find(value => value.startsWith('--policy='));
  const policy = argument?.slice('--policy='.length);
  if (policy !== 'fork' && policy !== 'size') {
    fail('expected --policy=fork or --policy=size');
  }
  const also = argv
    .find(value => value.startsWith('--also='))
    ?.slice('--also='.length);
  // One combined-head producer evaluates both member policies from a single
  // compare + pull read, and hands the fork verdict to the dependent
  // `Fork PR Gate` job, which then spends no API calls (JOV-7744 quota).
  if (also !== undefined && (also !== 'fork' || policy !== 'size')) {
    fail('expected --also=fork only with --policy=size');
  }
  return { policy, also };
}

async function evaluateMembers({
  deadlineMs,
  env,
  policy,
  pullRequests,
  rangeFiles = null,
  repository,
  request,
  token,
}) {
  let results;
  if (policy === 'fork') {
    const reviews = await Promise.all(
      pullRequests.map(pr =>
        pr.head.repo.fork
          ? githubPages(`/repos/${repository}/pulls/${pr.number}/reviews`, {
              token,
              deadlineMs,
              request,
            })
          : []
      )
    );
    results = pullRequests.map((pr, index) =>
      evaluateForkMemberPolicy({ pr, reviews: reviews[index] })
    );
  } else {
    const maxLines = Number(env.MAX_LINES ?? '800');
    const maxFiles = Number(env.MAX_FILES ?? '40');
    const files = await Promise.all(
      pullRequests.map(pr => {
        const labels = labelsFor(pr);
        const exempt =
          pr.user?.login === 'dependabot[bot]' ||
          pr.head?.ref === 'screenshots/auto-update' ||
          labels.some(label => SIZE_BYPASS_LABELS.has(label));
        if (exempt) return [];
        // A one-member group's compare diff is that PR's squash: its file
        // list is already in hand, so the per-member files read is spent
        // only for multi-member groups or a compare capped at 300 files.
        if (rangeFiles) return rangeFiles;
        return githubPages(`/repos/${repository}/pulls/${pr.number}/files`, {
          token,
          deadlineMs,
          request,
        });
      })
    );
    results = pullRequests.map((pr, index) =>
      evaluateSizeMemberPolicy({
        pr,
        files: files[index],
        maxLines,
        maxFiles,
      })
    );
  }
  return results.map(
    (result, index) => evaluateHoldMemberPolicy(pullRequests[index]) ?? result
  );
}

export async function runPolicy({
  argv = process.argv.slice(2),
  env = process.env,
  event: providedEvent = undefined,
  log = console.log,
  now = Date.now,
  readLocal = readLocalMergeGroupCheckout,
  request: providedRequest = undefined,
  writeOutput = undefined,
} = {}) {
  const { policy, also } = parsePolicy(argv);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!token || (!eventPath && !providedEvent)) {
    fail('GH_TOKEN and GITHUB_EVENT_PATH are required');
  }
  const emit =
    writeOutput ??
    (env.GITHUB_OUTPUT
      ? line => appendFile(env.GITHUB_OUTPUT, `${line}\n`)
      : undefined);
  if (also && !emit) {
    fail('GITHUB_OUTPUT is required to hand off the --also verdict');
  }

  const event = providedEvent ?? JSON.parse(await readFile(eventPath, 'utf8'));
  const { baseSha, headSha, repository } = validateMergeGroupEvent(event);
  const deadlineMs = now() + MERGE_GROUP_JOB_BUDGET_MS;
  const request =
    providedRequest ??
    ((path, options = {}) =>
      githubRequest(path, {
        ...options,
        cacheDir: env.MERGE_GROUP_POLICY_CACHE_DIR,
        cacheScope: headSha,
        quotaFallbackScopes: pullCacheScopes(path),
      }));

  let local = null;
  try {
    local = await readLocal({ baseSha, headSha, env });
  } catch {
    local = null;
  }
  let comparison = null;
  if (local?.comparison) {
    try {
      resolveMergeGroupMembers({ event, comparison: local.comparison });
      comparison = local.comparison;
      log(
        `Local merge-group checkout: member range for ${headSha} (skipped compare).`
      );
    } catch {
      comparison = null;
      local = null;
    }
  }
  if (!comparison) {
    comparison = await fetchComparison(
      repository,
      baseSha,
      headSha,
      token,
      deadlineMs,
      request
    );
  }
  const members = resolveMergeGroupMembers({ event, comparison });
  const quotaBlock = await installationQuotaResetOutsideBudget(
    request,
    token,
    deadlineMs
  );
  let pullRequests;
  if (quotaBlock) {
    const resetText =
      quotaBlock.reset === null
        ? 'unknown'
        : new Date(quotaBlock.reset * 1000).toISOString();
    log(
      `::warning::GitHub installation REST quota remaining=${quotaBlock.remaining} limit=${quotaBlock.limit ?? 'unknown'} reset=${resetText}, outside this job. Live pull metadata was not requested.`
    );
    const cached = await recoverCachedPullRequests(env, repository, members);
    if (cached && localSizeEvidence(local)) {
      pullRequests = cached;
      log(
        `::warning::Reused the cached pull record for ${cached.map(pr => `#${pr.number}`).join(', ')}.`
      );
    } else if (cached) {
      throw new MergeGroupQuotaError(
        'GitHub installation quota is exhausted and the reset is outside this job'
      );
    } else {
      await passQuotaFromLocalCheckout({
        also,
        emit,
        env,
        local,
        log,
        members,
        policy,
        quotaError: new MergeGroupQuotaError(
          'GitHub installation quota is exhausted and the reset is outside this job'
        ),
      });
      return;
    }
  } else {
    try {
      pullRequests = await Promise.all(
        members.map(member =>
          fetchPullRequest(
            repository,
            member.number,
            token,
            deadlineMs,
            request
          )
        )
      );
      pullRequests.forEach((pr, index) =>
        assertCurrentPullRequest(members[index], pr)
      );
    } catch (error) {
      if (!(error instanceof MergeGroupQuotaError)) throw error;
      const cached = await recoverCachedPullRequests(env, repository, members);
      if (!cached || !localSizeEvidence(local)) {
        await passQuotaFromLocalCheckout({
          also,
          emit,
          env,
          local,
          log,
          members,
          policy,
          quotaError: error,
        });
        return;
      }
      pullRequests = cached;
      log(
        `::warning::Live pull metadata hit the GitHub installation quota. Reused the cached pull record for ${cached.map(pr => `#${pr.number}`).join(', ')}.`
      );
    }
  }
  // GitHub's compare returns at most 300 files; a full page may be truncated.
  const COMPARE_FILE_CAP = 300;
  const rangeFiles = Array.isArray(local?.files)
    ? local.files
    : members.length === 1 &&
        Array.isArray(comparison.files) &&
        comparison.files.length < COMPARE_FILE_CAP
      ? comparison.files
      : null;
  const headCommit = comparison.commits.at(-1);
  const provenTreeSha =
    headCommit?.sha === headSha &&
    SHA_PATTERN.test(String(headCommit?.commit?.tree?.sha ?? ''))
      ? headCommit.commit.tree.sha
      : undefined;
  const shared = {
    deadlineMs,
    env,
    pullRequests,
    rangeFiles,
    repository,
    request,
    token,
  };

  if (also) {
    // Publish the secondary verdict before any primary-only evidence (the
    // combined tree) can fail this job, so the dependent gate judges the
    // members it was asked about instead of an absent output.
    const alsoResults = await evaluateMembers({ ...shared, policy: also });
    alsoResults.forEach((result, index) =>
      log(
        `${also} policy PR #${members[index].number}: ${result.passed ? 'PASS' : 'FAIL'} — ${result.reason}`
      )
    );
    const passed = alsoResults.every(result => result.passed);
    await emit(`${also}_verdict=${passed ? 'pass' : 'fail'}`);
  }

  if (policy === 'size') {
    const localTree = localTreeEvidence(local);
    const payload =
      localTree ??
      (await enforceCombinedTreePayload({
        deadlineMs,
        headSha,
        now,
        repository,
        request,
        token,
        treeSha: provenTreeSha,
      }));
    if (localTree) {
      assertTrackedBudget(localTree, HYGIENE_LIMITS.maxTrackedBytes);
    }
    const warning = trackedBytesBudgetWarning(payload.bytes);
    if (warning) log(`::warning::Combined tree: ${warning}`);
    log(
      `Combined tree: PASS — ${payload.bytes} tracked regular-file bytes across ${payload.files} files${localTree ? ' (local checkout)' : ''}.`
    );
  }

  const results = await evaluateMembers({ ...shared, policy });
  for (let index = 0; index < members.length; index += 1) {
    const result = results[index];
    log(
      `PR #${members[index].number}: ${result.passed ? 'PASS' : 'FAIL'} — ${result.reason}`
    );
  }
  const failed = results.findIndex(result => !result.passed);
  if (failed >= 0) {
    fail(`PR #${members[failed].number} failed ${policy} merge-group policy`);
  }
  log(
    `Validated ${members.length} merge-group member(s) for ${policy} policy.`
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runPolicy().catch(error => {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
