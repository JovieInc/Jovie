import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const baselinePath =
  'apps/web/eslint-rules/canonical-ui-label-casing.baseline.json';
const repoRoot = resolve(import.meta.dirname, '../../..');

export function assertShrinkOnly(current, previous) {
  for (const [file, entries] of Object.entries(current)) {
    for (const [key, count] of Object.entries(entries)) {
      if (
        !Number.isInteger(count) ||
        count <= 0 ||
        count > (previous[file]?.[key] ?? 0)
      ) {
        throw new Error(`UI casing baseline may only shrink: ${file}: ${key}`);
      }
    }
  }
}

export function checkBaseline(baseRef = 'origin/main', root = repoRoot) {
  const base = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  // The introducing PR has no baseline at its merge base. Subsequent PRs must
  // retain a subset of that base's exact strings and occurrence counts.
  const files = execFileSync(
    'git',
    ['ls-tree', '--name-only', base, '--', baselinePath],
    { cwd: root, encoding: 'utf8' }
  );
  if (!files.trim()) return;
  const previous = JSON.parse(
    execFileSync('git', ['show', `${base}:${baselinePath}`], {
      cwd: root,
      encoding: 'utf8',
    })
  );
  const current = JSON.parse(readFileSync(resolve(root, baselinePath), 'utf8'));
  assertShrinkOnly(current, previous);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  checkBaseline(process.argv[2]);
}
