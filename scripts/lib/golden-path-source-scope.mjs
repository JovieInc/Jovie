import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SHA = /^[0-9a-f]{40}$/;
const UNRELATED_FILES = new Set([
  // Pure CI measurement only; unknown neighbors and authority/tooling remain full.
  'scripts/lib/ci-metrics-compute.mjs',
  'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
  'scripts/lib/ci-rounds.mjs',
  'scripts/lib/__tests__/ci-rounds.test.mjs',
  'apps/web/app/(marketing)/about/page.tsx',
  'apps/web/app/(marketing)/about/page.structured-data.test.tsx',
  'apps/web/app/(marketing)/support/page.tsx',
  'apps/web/app/(marketing)/support/loading.tsx',
  'apps/web/app/(marketing)/support/SupportContent.tsx',
]);

/** Narrow source exclusions, not permission to omit their owning lane's checks. @param {unknown} path */
export function unrelatedToGoldenPath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    /[\x00-\x1f\x7f]/.test(path) ||
    path.split('/').some(part => !part || part === '.' || part === '..')
  )
    return false;
  // Toolchains, test selection, config, shared code and unknown inputs run all tests.
  if (
    /(?:^|\/)(?:[^/]*config[^/]*|[^/]*lock[^/]*|package\.json|requirements[^/]*|Dockerfile[^/]*|Makefile)$/.test(
      path
    )
  )
    return false;
  if (UNRELATED_FILES.has(path)) return true;
  if (/^docs\/(?:company|fundraising)\/.+\.md$/.test(path)) return true;
  if (/^content\/investors\/.+\.(?:md|mdx|txt)$/.test(path)) return true;
  return false;
}

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    cwd,
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0)
    throw new Error('Git source evidence unavailable');
  return result.stdout;
}

/**
 * Compute absence proof ourselves. A caller's path list cannot authorize omission.
 * Two-tree unions conservatively include base drift and all earlier queue entries;
 * no merge-base or full-history fetch is needed. Any uncertainty runs the full gate.
 */
export function resolveGoldenPathSourceScope(
  env = process.env,
  cwd = process.cwd()
) {
  const runGit = args => git(args, cwd);
  try {
    if (!env.GITHUB_EVENT_PATH) throw new Error('Missing source event');
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const mergeGroup = env.GITHUB_EVENT_NAME === 'merge_group';
    if (!mergeGroup && env.GITHUB_EVENT_NAME !== 'pull_request')
      throw new Error('Unsupported source event');
    const base = mergeGroup
      ? event.merge_group?.base_sha
      : event.pull_request?.base?.sha;
    const sourceHead = mergeGroup
      ? event.merge_group?.head_sha
      : event.pull_request?.head?.sha;
    const baseRef = mergeGroup
      ? event.merge_group?.base_ref?.replace(/^refs\/heads\//, '')
      : event.pull_request?.base?.ref;
    if (
      ![base, sourceHead].every(
        value =>
          typeof value === 'string' && SHA.test(value) && !/^0+$/.test(value)
      )
    )
      throw new Error('Invalid source identity');
    if (typeof baseRef !== 'string' || !baseRef)
      throw new Error('Missing base ref');
    runGit(['check-ref-format', `refs/heads/${baseRef}`]);
    const head = runGit(['rev-parse', '--verify', 'HEAD']).trim();
    if (runGit(['status', '--porcelain', '-z', '--untracked-files=no']))
      throw new Error('Tracked source is dirty');
    if (head !== sourceHead) {
      // PR CI may check out GitHub's synthetic merge; Source Validation uses raw head.
      const parents = runGit(['show', '-s', '--format=%P', head])
        .trim()
        .split(' ');
      if (
        mergeGroup ||
        head !== env.GITHUB_SHA ||
        parents.length !== 2 ||
        !parents.includes(sourceHead) ||
        !parents.includes(base)
      )
        throw new Error('Checkout does not match source event');
    }
    const readCurrentBase = () => {
      const remote = runGit([
        'ls-remote',
        '--exit-code',
        'origin',
        `refs/heads/${baseRef}`,
      ])
        .trim()
        .split(/\s+/);
      if (
        remote.length !== 2 ||
        !SHA.test(remote[0]) ||
        remote[1] !== `refs/heads/${baseRef}`
      )
        throw new Error('Current base unavailable');
      return remote[0];
    };
    const currentBase = readCurrentBase();
    const bases = [...new Set([base, currentBase])];
    const files = new Set();
    for (const sha of bases) {
      try {
        runGit(['cat-file', '-e', `${sha}^{tree}`]);
      } catch {
        runGit(['fetch', '--no-tags', '--depth=1', 'origin', sha]);
      }
      const output = runGit([
        'diff',
        '--no-ext-diff',
        '--no-renames',
        '--ignore-submodules=none',
        '--name-only',
        '-z',
        sha,
        head,
        '--',
      ]);
      if (output && !output.endsWith('\0'))
        throw new Error('Incomplete source diff');
      for (const path of output ? output.slice(0, -1).split('\0') : [])
        files.add(path);
    }
    if (readCurrentBase() !== currentBase)
      throw new Error('Base moved during source verification');
    const changed = [...files].sort();
    return {
      verified: true,
      event: env.GITHUB_EVENT_NAME,
      head,
      bases,
      files: changed,
      runProduct: changed.length === 0 || !changed.every(unrelatedToGoldenPath),
      reason:
        changed.length === 0
          ? 'Empty source delta retains full coverage'
          : 'Verified event and current-base tree differences',
    };
  } catch {
    return {
      verified: false,
      files: [],
      runProduct: true,
      reason:
        'Source evidence unavailable or ambiguous; full product tests required',
    };
  }
}
