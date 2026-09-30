// Run the full web ESLint config (custom Jovie rules: label casing, banned
// marketing copy, raw motion values, hardcoded theme colors, icon usage, …)
// over every web source file a PR changes. Until this ran in CI, those rules
// were enforced only by the pre-commit hook, so bypassed commits shipped
// violations (e.g. /card label casing, #18036).
//
// Whole files are linted, matching lint-staged: touching a file means
// leaving it clean.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const webRoot = resolve(import.meta.dirname, '..');

export function changedWebFiles(diffStdout, { exists = existsSync } = {}) {
  return diffStdout
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^apps\/web\/.+\.(ts|tsx)$/.test(line))
    .map(line => resolve(repoRoot, line))
    .filter(file => exists(file))
    .map(file => relative(webRoot, file));
}

export function run({
  baseRef = process.env.ESLINT_CHANGED_BASE ?? 'origin/main',
  spawn = spawnSync,
  exists = existsSync,
  log = console.log,
  error = console.error,
} = {}) {
  const diff = spawn(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (diff.status !== 0) {
    process.stderr.write(diff.stderr ?? '');
    error(`[lint:eslint:changed] could not diff against ${baseRef}`);
    return 1;
  }

  const files = changedWebFiles(diff.stdout, { exists });

  if (files.length === 0) {
    log('[lint:eslint:changed] no changed web TypeScript files');
    return 0;
  }

  log(`[lint:eslint:changed] linting ${files.length} changed file(s)`);
  const result = spawn(
    'pnpm',
    ['exec', 'eslint', '--max-warnings=0', '--no-warn-ignored', ...files],
    { cwd: webRoot, stdio: 'inherit' }
  );
  return result.status ?? 1;
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  process.exit(run());
}
