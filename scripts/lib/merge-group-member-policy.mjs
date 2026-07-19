import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { evaluatePrSizePolicy } from './pr-size-guard-policy.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const GENERATED_PR_TRAILER_PATTERN = /\(#(\d+)\)$/;
const ACTIVE_GROUP_STATES = new Set(['AWAITING_CHECKS', 'LOCKED', 'MERGEABLE']);
const SIZE_BYPASS_LABELS = new Set(['big-pr', 'codemod']);
const COLLABORATOR_ASSOCIATIONS = new Set(['COLLABORATOR', 'MEMBER', 'OWNER']);
const OPINIONATED_REVIEW_STATES = new Set([
  'APPROVED',
  'CHANGES_REQUESTED',
  'DISMISSED',
]);
const SIZE_EXCLUSION_PATTERN =
  /pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.lock$|\/generated\/|\.gen\.|__snapshots__\/|\.snap$|\.svg$|\.po$|\/dist\/|\/build\/|\.min\.|drizzle\/migrations\/meta\//;

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
 * SHAs. For an ALLGREEN/SQUASH queue, the exact base..head first-parent range
 * contains one GitHub-generated squash commit per member. We cross-prove each
 * generated commit's final (#PR) trailer against the live GraphQL merge queue
 * entry with the same generated head commit. Nothing is inferred from the
 * single-PR-looking gh-readonly-queue ref.
 */
export function resolveMergeGroupMembers({ event, comparison, queue }) {
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

  const configuration = queue?.configuration;
  if (
    configuration?.mergeMethod !== 'SQUASH' ||
    configuration?.mergingStrategy !== 'ALLGREEN'
  ) {
    fail('live merge queue is not ALLGREEN/SQUASH');
  }

  const connection = queue?.entries;
  if (
    !connection ||
    connection.pageInfo?.hasNextPage !== false ||
    !Array.isArray(connection.nodes) ||
    connection.totalCount !== connection.nodes.length
  ) {
    fail('merge queue entry discovery is incomplete or malformed');
  }
  if (
    !Number.isInteger(configuration.maximumEntriesToMerge) ||
    comparison.commits.length > configuration.maximumEntriesToMerge
  ) {
    fail('merge group exceeds the live maximumEntriesToMerge policy');
  }

  const entriesByPullRequest = new Map();
  for (const entry of connection.nodes) {
    const number = requireInteger(
      entry?.pullRequest?.number,
      'merge queue pull request number'
    );
    if (entriesByPullRequest.has(number)) {
      fail(`merge queue contains duplicate PR #${number}`);
    }
    entriesByPullRequest.set(number, entry);
  }

  let parentSha = baseSha;
  let previousPosition = 0;
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

    const number = generatedPullRequestNumber(commit);
    if (seenNumbers.has(number)) fail(`merge group repeats PR #${number}`);
    seenNumbers.add(number);

    const entry = entriesByPullRequest.get(number);
    if (!entry) fail(`PR #${number} is absent from the live merge queue`);
    const position = requireInteger(
      entry.position,
      `PR #${number} queue position`
    );
    if (
      position <= previousPosition ||
      (previousPosition > 0 && position !== previousPosition + 1)
    ) {
      fail(`PR #${number} is out of merge queue order`);
    }
    if (!ACTIVE_GROUP_STATES.has(entry.state)) {
      fail(
        `PR #${number} has non-buildable queue state ${entry.state ?? 'missing'}`
      );
    }
    if (
      entry.baseCommit?.oid !== parentSha ||
      entry.headCommit?.oid !== commitSha
    ) {
      fail(
        `PR #${number} queue commit evidence does not match the synthetic chain`
      );
    }
    if (
      entry.pullRequest.baseRefName !== 'main' ||
      !SHA_PATTERN.test(String(entry.pullRequest.headRefOid ?? ''))
    ) {
      fail(`PR #${number} has malformed live head metadata`);
    }

    parentSha = commitSha;
    previousPosition = position;
    return {
      number,
      position,
      queueState: entry.state,
      syntheticHeadSha: commitSha,
      sourceHeadSha: entry.pullRequest.headRefOid,
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
    pr?.head?.sha !== member.sourceHeadSha ||
    typeof pr?.head?.repo?.fork !== 'boolean'
  ) {
    fail(`PR #${member.number} changed after merge queue discovery`);
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

function splitRepository(fullName) {
  const parts = fullName.split('/');
  if (parts.length !== 2 || parts.some(part => !part))
    fail('invalid repository name');
  return { owner: parts[0], name: parts[1] };
}

function linkHasNext(link) {
  return typeof link === 'string' && /<[^>]+>;\s*rel="next"/.test(link);
}

async function githubRequest(path, { token, method = 'GET', body } = {}) {
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  const url = path.startsWith('http') ? path : `${apiUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
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

async function githubPages(path, { token, maxPages = 30 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await githubRequest(
      `${path}${separator}per_page=100&page=${page}`,
      {
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

async function fetchQueue({ owner, name, branch, token }) {
  const query = `
    query QueueMembers($owner: String!, $name: String!, $branch: String!) {
      repository(owner: $owner, name: $name) {
        mergeQueue(branch: $branch) {
          configuration {
            maximumEntriesToMerge
            mergeMethod
            mergingStrategy
          }
          entries(first: 100) {
            totalCount
            pageInfo { hasNextPage }
            nodes {
              position
              state
              baseCommit { oid }
              headCommit { oid }
              pullRequest {
                number
                baseRefName
                headRefOid
              }
            }
          }
        }
      }
    }
  `;
  const result = await githubRequest('/graphql', {
    token,
    method: 'POST',
    body: { query, variables: { owner, name, branch } },
  });
  if (result.data?.errors?.length) {
    fail(
      `GitHub GraphQL error: ${result.data.errors[0]?.message ?? 'unknown error'}`
    );
  }
  const queue = result.data?.data?.repository?.mergeQueue;
  if (!queue) fail('GitHub GraphQL returned no merge queue');
  return queue;
}

async function fetchPullRequest(repository, number, token) {
  const result = await githubRequest(`/repos/${repository}/pulls/${number}`, {
    token,
  });
  return result.data;
}

async function fetchComparison(repository, baseSha, headSha, token) {
  const result = await githubRequest(
    `/repos/${repository}/compare/${baseSha}...${headSha}`,
    { token }
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

async function runPolicy() {
  const policy = parsePolicy(process.argv.slice(2));
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !eventPath) fail('GH_TOKEN and GITHUB_EVENT_PATH are required');

  const event = JSON.parse(await readFile(eventPath, 'utf8'));
  const { baseSha, branch, headSha, name, owner, repository } =
    validateMergeGroupEvent(event);

  const [comparison, queue] = await Promise.all([
    fetchComparison(repository, baseSha, headSha, token),
    fetchQueue({ owner, name, branch, token }),
  ]);
  const members = resolveMergeGroupMembers({ event, comparison, queue });
  const pullRequests = await Promise.all(
    members.map(member => fetchPullRequest(repository, member.number, token))
  );
  pullRequests.forEach((pr, index) =>
    assertCurrentPullRequest(members[index], pr)
  );

  let results;
  if (policy === 'fork') {
    const reviews = await Promise.all(
      pullRequests.map(pr =>
        pr.head.repo.fork
          ? githubPages(`/repos/${repository}/pulls/${pr.number}/reviews`, {
              token,
            })
          : []
      )
    );
    results = pullRequests.map((pr, index) =>
      evaluateForkMemberPolicy({ pr, reviews: reviews[index] })
    );
  } else {
    const maxLines = Number(process.env.MAX_LINES ?? '800');
    const maxFiles = Number(process.env.MAX_FILES ?? '40');
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
    console.log(
      `PR #${members[index].number}: ${result.passed ? 'PASS' : 'FAIL'} — ${result.reason}`
    );
  }
  const failed = results.findIndex(result => !result.passed);
  if (failed >= 0) {
    fail(`PR #${members[failed].number} failed ${policy} merge-group policy`);
  }
  console.log(
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
