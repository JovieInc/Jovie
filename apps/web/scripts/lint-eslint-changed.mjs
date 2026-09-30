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

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const webRoot = resolve(import.meta.dirname, '..');
const baseRef = process.env.ESLINT_CHANGED_BASE ?? 'origin/main';

const diff = spawnSync(
  'git',
  ['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`],
  { cwd: repoRoot, encoding: 'utf8' }
);
if (diff.status !== 0) {
  process.stderr.write(diff.stderr);
  console.error(`[lint:eslint:changed] could not diff against ${baseRef}`);
  process.exit(1);
}

const files = diff.stdout
  .split('\n')
  .map(line => line.trim())
  .filter(line => /^apps\/web\/.+\.(ts|tsx)$/.test(line))
  .map(line => resolve(repoRoot, line))
  .filter(file => existsSync(file))
  .map(file => relative(webRoot, file));

if (files.length === 0) {
  console.log('[lint:eslint:changed] no changed web TypeScript files');
  process.exit(0);
}

console.log(`[lint:eslint:changed] linting ${files.length} changed file(s)`);
const result = spawnSync(
  'pnpm',
  ['exec', 'eslint', '--max-warnings=0', '--no-warn-ignored', ...files],
  { cwd: webRoot, stdio: 'inherit' }
);
process.exit(result.status ?? 1);
