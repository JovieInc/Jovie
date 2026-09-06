import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluatePrSizePolicy } from './pr-size-guard-policy.mjs';
import { HYGIENE_LIMITS } from './repo-hygiene-limits.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const GENERATED_PR_TRAILER_PATTERN = /\(#(\d+)\)$/;
// Fail closed at the checked-in native queue's max_entries_to_merge ceiling.
const MAX_GROUP_MEMBERS = 5;
const SIZE_BYPASS_LABELS = new Set(['big-pr', 'codemod']);
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
export const MERGE_GROUP_POLICY_DEADLINE_MS = 45_000;

export class MergeGroupPolicyEvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MergeGroupPolicyEvidenceError';
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
  const commit = await request(
    `/repos/${encodedRepository}/git/commits/${headSha}`,
    { deadlineMs, token }
  );
  const treeSha = commit.data?.tree?.sha;
  if (
    commit.data?.sha !== headSha ||
    !SHA_PATTERN.test(String(treeSha ?? ''))
  ) {
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

/**
 * @param {string} path
 * @param {{ token?: string, method?: string, body?: unknown, deadlineMs?: number,
 * env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, now?: () => number,
 * timeoutSignal?: (milliseconds: number) => AbortSignal }} [options]
 * @returns {Promise<{data: any, link?: string | null}>}
 */
export async function githubRequest(
  path,
  {
    token,
    method = 'GET',
    body,
    deadlineMs,
    env = process.env,
    fetchImpl = fetch,
    now = Date.now,
    timeoutSignal = AbortSignal.timeout,
  } = {}
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
    fail(
      `GitHub API request failed for ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const text = await readBoundedResponseText(response, path);
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

function parsePolicy(argv) {
  const argument = argv.find(value => value.startsWith('--policy='));
  const policy = argument?.slice('--policy='.length);
  if (policy !== 'fork' && policy !== 'size') {
    fail('expected --policy=fork or --policy=size');
  }
  return policy;
}

export async function runPolicy({
  argv = process.argv.slice(2),
  env = process.env,
  event: providedEvent = undefined,
  log = console.log,
  now = Date.now,
  request = githubRequest,
} = {}) {
  const policy = parsePolicy(argv);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!token || (!eventPath && !providedEvent)) {
    fail('GH_TOKEN and GITHUB_EVENT_PATH are required');
  }

  const event = providedEvent ?? JSON.parse(await readFile(eventPath, 'utf8'));
  const { baseSha, headSha, repository } = validateMergeGroupEvent(event);
  const deadlineMs = now() + MERGE_GROUP_POLICY_DEADLINE_MS;

  if (policy === 'size') {
    const payload = await enforceCombinedTreePayload({
      deadlineMs,
      headSha,
      now,
      repository,
      request,
      token,
    });
    log(
      `Combined tree: PASS — ${payload.bytes} tracked regular-file bytes across ${payload.files} files.`
    );
  }

  const comparison = await fetchComparison(
    repository,
    baseSha,
    headSha,
    token,
    deadlineMs,
    request
  );
  const members = resolveMergeGroupMembers({ event, comparison });
  const pullRequests = await Promise.all(
    members.map(member =>
      fetchPullRequest(repository, member.number, token, deadlineMs, request)
    )
  );
  pullRequests.forEach((pr, index) =>
    assertCurrentPullRequest(members[index], pr)
  );

  let results;
  if (policy === 'fork') {
    // The required fork context also carries repository-specific source holds.
    // Dynamic import avoids a cycle with the shared fork-review evaluator.
    const { runSourceAdmission } = await import(
      './source-admission-policy.mjs'
    );
    results = await Promise.all(
      pullRequests.map(async pr => {
        const result = await runSourceAdmission({
          repository,
          prNumber: pr.number,
          expectedHead: pr.head.sha,
          token,
          request,
          deadlineMs,
        });
        return {
          passed: result.allowed,
          reason: result.blockers.join(', ') || 'source policy passed',
        };
      })
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
        return exempt
          ? []
          : githubPages(`/repos/${repository}/pulls/${pr.number}/files`, {
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
