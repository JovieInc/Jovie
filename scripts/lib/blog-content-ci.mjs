import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BLOG_CONTENT_CI_SCHEMA = 'jovie-blog-content-ci/v1';

export const BLOG_POST_PATTERN =
  /^apps\/web\/content\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const BLOG_ASSET_PREFIX = 'apps/web/public/images/blog/';
export const SAFE_BLOG_ASSET_PATTERN =
  /^apps\/web\/public\/images\/blog\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.(?:avif|jpe?g|png|webp)$/;
const PLAIN_CHANGE_STATUSES = new Set(['A', 'D', 'M']);

export const BLOG_CONTENT_CHECKS = Object.freeze([
  'blog-publication-contract',
  'blog-agent-certification',
  'blog-candidate-build',
]);

export const BLOG_AFFECTED_OUTPUTS = Object.freeze([
  'article',
  'listing',
  'category',
  'author',
  'related',
  'feed',
  'sitemap',
  'share',
]);

export const BLOG_CERTIFICATION_PROOFS = Object.freeze([
  'apps/web/tests/unit/lib/blog/publication.test.ts',
  'apps/web/scripts/marketing-factory/blog-adapter.test.ts',
]);

export const isBlogContentCandidatePath = path => {
  const normalized = normalizePath(path);
  return (
    BLOG_POST_PATTERN.test(normalized) ||
    normalized.startsWith(BLOG_ASSET_PREFIX)
  );
};

const normalizePath = value =>
  String(value ?? '')
    .trim()
    .replace(/^\.\//, '');

function normalizedChange(change) {
  const rawStatus = String(change?.status ?? '')
    .trim()
    .toUpperCase();
  return {
    status: rawStatus.slice(0, 1),
    similarity: /^[RC][0-9]+$/.test(rawStatus)
      ? Number.parseInt(rawStatus.slice(1), 10)
      : null,
    path: normalizePath(change?.path),
    oldPath: normalizePath(change?.oldPath),
  };
}

function rejectionFor(change) {
  if (change.status === 'R') return 'renamed-path';
  if (change.status === 'C') return 'copied-path';
  if (!PLAIN_CHANGE_STATUSES.has(change.status)) return 'unsupported-status';
  if (!change.path) return 'malformed-change';
  if (/\.mdx?$/i.test(change.path) && !BLOG_POST_PATTERN.test(change.path)) {
    return change.path.toLowerCase().endsWith('.mdx')
      ? 'executable-markdown'
      : 'unapproved-markdown';
  }
  if (change.path.startsWith(BLOG_ASSET_PREFIX)) {
    return SAFE_BLOG_ASSET_PATTERN.test(change.path)
      ? null
      : 'unsafe-blog-asset';
  }
  return BLOG_POST_PATTERN.test(change.path) ? null : 'unapproved-path';
}

/**
 * Positively identifies the only diff shape allowed onto the blog content
 * qualification profile. Everything else keeps the normal broader path.
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {{ prerequisitesAvailable?: boolean }} [options]
 */
export function classifyBlogContentChanges(
  changes,
  { prerequisitesAvailable = true } = {}
) {
  const normalized = Array.isArray(changes)
    ? changes.map(normalizedChange)
    : [];
  const rejections = normalized
    .map(change => ({ change, reason: rejectionFor(change) }))
    .filter(item => item.reason !== null);

  if (normalized.length === 0) {
    rejections.push({
      change: { status: '', path: '', oldPath: '', similarity: null },
      reason: 'empty-diff',
    });
  }
  if (!prerequisitesAvailable) {
    rejections.push({
      change: { status: '', path: '', oldPath: '', similarity: null },
      reason: 'certification-prerequisites-unavailable',
    });
  }

  const contentOnly = rejections.length === 0;
  const changedPaths = [...new Set(normalized.map(change => change.path))]
    .filter(Boolean)
    .sort();
  const postChanges = normalized.filter(change =>
    BLOG_POST_PATTERN.test(change.path)
  );
  const assetChanges = normalized.filter(change =>
    SAFE_BLOG_ASSET_PATTERN.test(change.path)
  );

  return {
    schema: BLOG_CONTENT_CI_SCHEMA,
    profile: contentOnly ? 'content-only' : 'full',
    contentOnly,
    changedPaths,
    changes: normalized,
    changedPostSlugs: postChanges
      .filter(change => change.status !== 'D')
      .map(change => BLOG_POST_PATTERN.exec(change.path)?.[1])
      .filter(Boolean)
      .sort(),
    removedPostSlugs: postChanges
      .filter(change => change.status === 'D')
      .map(change => BLOG_POST_PATTERN.exec(change.path)?.[1])
      .filter(Boolean)
      .sort(),
    changedAssets: assetChanges.map(change => change.path).sort(),
    affectedOutputs: contentOnly ? [...BLOG_AFFECTED_OUTPUTS] : [],
    selectedChecks: contentOnly
      ? [...BLOG_CONTENT_CHECKS]
      : ['applicable-broader-qualification'],
    rejections: rejections.map(({ change, reason }) => ({
      status: change.status || null,
      path: change.path || null,
      oldPath: change.oldPath || null,
      reason,
    })),
  };
}

/** Parse `git diff --name-status -z` without losing rename/copy evidence. */
export function parseNameStatusZ(buffer) {
  const fields = Buffer.isBuffer(buffer)
    ? buffer.toString('utf8').split('\0')
    : String(buffer ?? '').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++];
    if (!status) throw new Error('changed-file status is empty');
    const kind = status.slice(0, 1).toUpperCase();
    if (kind === 'R' || kind === 'C') {
      const oldPath = fields[index++];
      const path = fields[index++];
      if (!oldPath || !path)
        throw new Error(`changed-file ${kind} record is incomplete`);
      changes.push({ status, oldPath, path });
      continue;
    }
    const path = fields[index++];
    if (!path) throw new Error(`changed-file ${kind} record is incomplete`);
    changes.push({ status, path });
  }
  return changes;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined)
      throw new Error(`invalid argument near ${flag ?? '<end>'}`);
    args[flag.slice(2)] = value;
  }
  return args;
}

function exactCommit(ref, cwd) {
  const sha = execFileSync(
    'git',
    ['rev-parse', '--verify', `${ref}^{commit}`],
    {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  ).trim();
  if (!/^[a-f0-9]{40}$/.test(sha))
    throw new Error(`could not resolve exact commit for ${ref}`);
  return sha;
}

export function certificationProofsExistAtRef(ref, cwd = process.cwd()) {
  return BLOG_CERTIFICATION_PROOFS.every(proof => {
    try {
      execFileSync('git', ['cat-file', '-e', `${ref}:${proof}`], {
        cwd,
        stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  });
}

export function classifyBlogContentDiff(
  baseRef,
  headRef,
  { cwd = process.cwd(), prerequisitesAvailable = true } = {}
) {
  const baseSha = exactCommit(baseRef, cwd);
  const headSha = exactCommit(headRef, cwd);
  const raw = execFileSync(
    'git',
    [
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      '--find-copies',
      baseSha,
      headSha,
    ],
    { cwd, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return {
    ...classifyBlogContentChanges(parseNameStatusZ(raw), {
      prerequisitesAvailable,
    }),
    baseSha,
    headSha,
  };
}

export function runBlogContentClassifier(
  argv = process.argv.slice(2),
  { cwd = process.cwd() } = {}
) {
  const args = parseArgs(argv);
  if (!args.base || !args.head)
    throw new Error('--base and --head are required');
  const receipt = classifyBlogContentDiff(args.base, args.head, {
    cwd,
    prerequisitesAvailable: args['policy-ref']
      ? certificationProofsExistAtRef(args['policy-ref'], cwd)
      : args['prerequisites-available'] !== 'false',
  });
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  if (args['json-out']) writeFileSync(args['json-out'], json);
  if (args['github-output']) {
    writeFileSync(
      args['github-output'],
      [
        `blog_content_only=${receipt.contentOnly}`,
        `blog_qualification_profile=${receipt.profile}`,
        `blog_changed_posts_json=${JSON.stringify(receipt.changedPostSlugs)}`,
        `blog_selected_checks_json=${JSON.stringify(receipt.selectedChecks)}`,
      ].join('\n') + '\n',
      { flag: 'a' }
    );
  }
  if (!args['json-out']) process.stdout.write(json);
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runBlogContentClassifier();
  } catch (error) {
    console.error(
      `::error::Blog content classification failed: ${error.message}`
    );
    process.exitCode = 1;
  }
}
