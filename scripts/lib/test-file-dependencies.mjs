/**
 * Files a script test depends on, derived from its source rather than listed by
 * hand: relative imports (followed through JS modules) and every string literal
 * that names an existing repo file, from the test or its own directory
 * (`readFileSync(new URL('../../apps/web/lib/leads/constants.ts', import.meta.url))`,
 * `join(ROOT, 'apps/web/...')`, `resolve(root, 'DESIGN.md')`,
 * `new URL('./design-sections.json', import.meta.url)`).
 * A slashless `*.mjs` / `*.js` basename stays with the import walker. Treating
 * that mention as a read pulled unrelated module graphs into the selector.
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
  /(['"`])((?:\.{1,2}\/)*[\w@.-]+(?:\/[\w@.[\]-]+)*\.\w+)\1/gu;
const BARE_MODULE = /^[\w@.-]+\.(?:mjs|cjs|js|ts|mts|tsx|jsx)$/u;

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
    if (BARE_MODULE.test(literal)) continue;
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

/**
 * The test file plus everything it imports (transitively, through JS) or reads.
 * The file graph belongs to this invocation: callers can edit a checkout
 * between selections, so a process-wide result must not outlive its inputs.
 */
export function testDependencies(testFile, root) {
  return scanTestDependencies(testFile, root, new Map());
}

function scanTestDependencies(testFile, root, directCache) {
  const seen = new Set([testFile]);
  const pending = [testFile];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!MODULE.test(file) || !existsSync(join(root, file))) continue;
    if (!directCache.has(file))
      directCache.set(file, directDependencies(file, root));
    for (const dependency of directCache.get(file)) {
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
  // A shared hub can be reached by hundreds of tests. Parse its direct
  // imports/reads once for this immutable selection, retaining every test's
  // complete transitive closure and the catalog's original order/grouping.
  const directCache = new Map();
  const testCache = new Map();
  const dependencies = test => {
    if (!testCache.has(test))
      testCache.set(test, scanTestDependencies(test, root, directCache));
    return testCache.get(test);
  };
  return tests.filter(test =>
    test
      .split(' ')
      .some(part => [...dependencies(part)].some(file => changes.has(file)))
  );
}
