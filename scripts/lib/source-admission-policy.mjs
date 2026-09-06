import { pathToFileURL } from 'node:url';
import {
  evaluateForkMemberPolicy,
  githubRequest,
  latestOpinionatedReviewsByReviewer,
} from './merge-group-member-policy.mjs';
import { evaluatePreLandChangelogAdmission } from './pre-land-changelog.mjs';

export const SOURCE_ADMISSION_SCHEMA = 'jovie-source-admission/v1';
const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HOLDS = new Set([
  'hold',
  'gated',
  'incident',
  'queue-deferred',
  'needs-conflict-resolution',
  'fast',
]);
const TOMBSTONES = new Set([
  'jovie-queue-product-failure/v1',
  'jovie-native-unmergeable/v1',
]);

/** Complete, exact-head REST evidence only. Fleet health and production binding
 * intentionally have no authority over source admission. Native required checks
 * remain independently enforced by GitHub; this policy never substitutes for them. */
export function evaluateSourceAdmission({
  repository,
  expectedHead,
  pr,
  files,
  reviews,
  statuses,
  complete = false,
} = {}) {
  const blockers = [];
  const result = () => ({
    schema: SOURCE_ADMISSION_SCHEMA,
    allowed: blockers.length === 0,
    blockers,
    headSha: expectedHead ?? null,
    prNumber: pr?.number ?? null,
  });
  if (
    !complete ||
    !REPOSITORY.test(repository ?? '') ||
    !SHA.test(expectedHead ?? '') ||
    !Number.isInteger(pr?.number) ||
    pr.number < 1 ||
    typeof pr?.draft !== 'boolean' ||
    !['open', 'closed'].includes(pr?.state) ||
    !Array.isArray(pr?.labels) ||
    pr.labels.some(label => typeof label?.name !== 'string') ||
    typeof pr?.head?.ref !== 'string' ||
    typeof pr?.head?.repo?.fork !== 'boolean' ||
    !SHA.test(pr?.head?.sha ?? '') ||
    typeof pr?.base?.ref !== 'string' ||
    !Array.isArray(files) ||
    files.some(file => typeof file?.filename !== 'string') ||
    !Number.isInteger(pr?.changed_files) ||
    pr.changed_files !== files.length ||
    !Array.isArray(reviews) ||
    !Array.isArray(statuses)
  ) {
    blockers.push('incomplete-evidence');
    return result();
  }
  if (pr.head.sha !== expectedHead) blockers.push('stale-head');
  if (pr.state !== 'open') blockers.push('closed');
  if (pr.draft) blockers.push('draft');
  if (pr.base.ref !== 'main') blockers.push('wrong-base');
  if (pr.mergeable === false) blockers.push('conflict');
  for (const label of pr.labels)
    if (HOLDS.has(label.name)) blockers.push(`hold:${label.name}`);
  try {
    for (const review of latestOpinionatedReviewsByReviewer(reviews).values()) {
      if (
        review.state === 'CHANGES_REQUESTED' &&
        review.commit_id === expectedHead
      )
        blockers.push(`changes-requested:${review.user.login}`);
    }
    const fork = evaluateForkMemberPolicy({ pr, reviews });
    if (!fork.passed) blockers.push('fork-approval-required');
  } catch {
    blockers.push('invalid-review-evidence');
  }
  const changelog = evaluatePreLandChangelogAdmission({
    changedFiles: files.map(file => file.filename),
    branch: pr.head.ref,
  });
  if (changelog.action !== 'allow') blockers.push(changelog.reason);
  // A durable failure cannot be erased by a later unrelated status or spoofed
  // context. Only the canonical bot, exact commit endpoint, and repository run
  // URL establish this receipt's authority. Missing provenance fails closed.
  for (const status of statuses) {
    if (!status || typeof status.context !== 'string') {
      blockers.push('invalid-status-evidence');
      continue;
    }
    if (!TOMBSTONES.has(status.context)) continue;
    const description =
      status.context === 'jovie-queue-product-failure/v1'
        ? status.description === 'blocked:merge-group-product-failure'
        : typeof status.description === 'string' &&
          status.description.startsWith('ejected:');
    if (status.state !== 'success' || !description) continue;
    const prefix = `https://github.com/${repository}/actions/runs/`;
    if (!status.creator || typeof status.creator.login !== 'string') {
      blockers.push('tombstone-provenance-unavailable');
      continue;
    }
    if (
      status.creator.type !== 'Bot' ||
      status.creator.login !== 'jovie-bot[bot]'
    )
      continue;
    if (
      typeof status.target_url !== 'string' ||
      !status.target_url.startsWith(prefix) ||
      !/^[1-9][0-9]*$/.test(status.target_url.slice(prefix.length))
    ) {
      blockers.push('tombstone-provenance-unavailable');
      continue;
    }
    blockers.push(`tombstone:${status.context}`);
  }
  return result();
}

async function pages(path, options, request) {
  const rows = [];
  for (let page = 1; page <= 30; page++) {
    const response = await request(
      `${path}?per_page=100&page=${page}`,
      options
    );
    if (!Array.isArray(response.data))
      throw new Error('incomplete paginated evidence');
    rows.push(...response.data);
    if (!/rel="next"/.test(response.link ?? '')) {
      if (page === 30 && response.data.length === 100)
        throw new Error('possibly truncated evidence');
      return rows;
    }
  }
  throw new Error('pagination limit exceeded');
}

export async function runSourceAdmission({
  repository,
  prNumber,
  expectedHead,
  token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
  request = githubRequest,
  now = Date.now,
  deadlineMs = now() + 45_000,
} = {}) {
  if (
    !REPOSITORY.test(repository ?? '') ||
    !Number.isInteger(prNumber) ||
    prNumber < 1 ||
    !SHA.test(expectedHead ?? '') ||
    !token
  )
    throw new Error('repository, PR, exact head and token required');
  const options = { token, deadlineMs };
  const path = `/repos/${repository}/pulls/${prNumber}`;
  const [prResponse, files, reviews, statuses] = await Promise.all([
    request(path, options),
    pages(`${path}/files`, options, request),
    pages(`${path}/reviews`, options, request),
    pages(
      `/repos/${repository}/commits/${expectedHead}/statuses`,
      options,
      request
    ),
  ]);
  // Re-read mutable metadata after all pages; a concurrent push cannot inherit
  // an older commit's files, reviews, or status evidence.
  const finalPr = (await request(path, options)).data;
  if (prResponse.data?.number !== prNumber || finalPr?.number !== prNumber)
    throw new Error('PR identity changed during evidence read');
  if (prResponse.data?.head?.sha !== finalPr?.head?.sha)
    throw new Error('head changed during evidence read');
  return evaluateSourceAdmission({
    repository,
    expectedHead,
    pr: finalPr,
    files,
    reviews,
    statuses,
    complete: true,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    const value = name =>
      args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1) ??
      args[args.indexOf(name) + 1];
    const receipt = await runSourceAdmission({
      repository: value('--repo'),
      prNumber: Number(value('--pr')),
      expectedHead: value('--head'),
    });
    console.log(JSON.stringify(receipt));
    process.exitCode = receipt.allowed ? 0 : 1;
  } catch (error) {
    console.log(
      JSON.stringify({
        schema: SOURCE_ADMISSION_SCHEMA,
        allowed: false,
        blockers: ['evidence-unavailable'],
        error: error.message,
      })
    );
    process.exitCode = 1;
  }
}
