/**
 * Files a script test depends on, derived from its source rather than listed by
 * hand: relative imports (followed through JS modules) and every string literal
 * that names an existing repo file, from the test or its own directory
 * (`readFileSync(new URL('../../apps/web/lib/leads/constants.ts', import.meta.url))`,
 * `join(ROOT, 'apps/web/...')`).
 *
 * #20922 changed apps/web/lib/leads/constants.ts, a web-lane path, and turned
 * main red: scripts/funnel-judge/rubric.test.mjs reads that file but only runs
 * with the operations lane, which the web-only diff never selected.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const MODULE = /\.(?:mjs|cjs|js)$/u;
const IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]+)\1/gu;
const PATH_LITERAL =
  /(['"`])((?:\.{1,2}\/)*[\w@.-]+(?:\/[\w@.[\]-]+)+\.\w+)\1/gu;

const toRepo = (root, absolute) =>
  relative(root, absolute).split(sep).join('/');

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Repo-relative files one source file names directly. */
export function directDependencies(file, root) {
  const absolute = join(root, file);
  const source = readFileSync(absolute, 'utf8');
  const here = dirname(absolute);
  const found = new Set();
  for (const match of source.matchAll(IMPORT)) {
    const target = normalize(join(here, match[2]));
    if (isFile(target)) found.add(toRepo(root, target));
  }
  for (const match of source.matchAll(PATH_LITERAL)) {
    const literal = match[2];
    for (const candidate of [join(here, literal), join(root, literal)]) {
      const target = normalize(candidate);
      if (target.startsWith(root + sep) && isFile(target)) {
        found.add(toRepo(root, target));
        break;
      }
    }
  }
  found.delete(file);
  return found;
}

const dependencyCache = new Map();

/**
 * The test file plus everything it imports (transitively, through JS) or reads.
 * Cached per (root, test) for the process: runStructural is called many times
 * by its own contract suite, and rescanning ~100 tests per call timed that
 * suite out at 30 s in a loaded merge group (#21471, 2026-10-13).
 */
export function testDependencies(testFile, root) {
  const key = `${root}\0${testFile}`;
  const cached = dependencyCache.get(key);
  if (cached) return cached;
  const result = scanTestDependencies(testFile, root);
  dependencyCache.set(key, result);
  return result;
}

function scanTestDependencies(testFile, root) {
  const seen = new Set([testFile]);
  const pending = [testFile];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!MODULE.test(file) || !existsSync(join(root, file))) continue;
    for (const dependency of directDependencies(file, root)) {
      if (dependency.includes('node_modules/') || seen.has(dependency))
        continue;
      seen.add(dependency);
      pending.push(dependency);
    }
  }
  return seen;
}

/** Tests, in input order, whose dependency set intersects the changed files. */
export function testsAffectedBy(tests, changed, root) {
  const changes = new Set(changed);
  if (changes.size === 0) return [];
  return tests.filter(test =>
    [...testDependencies(test, root)].some(file => changes.has(file))
  );
}
