/**
 * Per-repo CI lane classifier (JOV-5288).
 *
 * JovieInc/Jovie required checks stay this repo's aggregates. Changed files
 * select Jovie product, Symphony/control-plane, or Summer/ops suites so one
 * system's green path does not wait on another system's app or controller
 * suites. Unknown non-doc files fail closed onto the Jovie product lane.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CI_REPO_LANES_SCHEMA = 'jovie-ci-repo-lanes/v1';

export const CI_LANES = Object.freeze({
  JOVIE_PRODUCT: 'jovie-product',
  SYMPHONY_CONTROL: 'symphony-control-plane',
  SUMMER_OPS: 'summer-ops',
});

/** JovieInc/Jovie branch-protection aggregates — never pin foreign-repo checks. */
export const JOVIE_REQUIRED_CHECK_CONTEXTS = Object.freeze([
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
]);

/** Check names that belong to other repos and must never gate Jovie merge. */
export const FOREIGN_REQUIRED_CHECK_CONTEXTS = Object.freeze([
  'Symphony CI',
  'Symphony / PR Ready',
  'Symphony / Migration Guard',
  'summer-config validation',
  'JovieInc/summer-config validation',
  'Ops review',
  'JovieInc/Ops review',
]);

const DOC_FILE = /\.(md|mdx|txt)$/i;

/**
 * Longest-prefix wins. Shared prefixes return every owning lane so CI
 * workflow edits keep both product and control-plane suites.
 *
 * @type {ReadonlyArray<{ prefix: string, lanes: readonly string[] }>}
 */
const LANE_PREFIXES = Object.freeze([
  {
    prefix: 'scripts/symphony/',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/backlog-orchestrator/',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/verification/',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/ci-',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/merge-queue',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/merge-group',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/__tests__/ci-',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/__tests__/merge-queue',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/__tests__/merge-group',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/ci-',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/ci-fast-lanes.mjs',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/run-affected-tests.mjs',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/tests/test_symphony',
    lanes: [CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/lib/__tests__/component-',
    lanes: [CI_LANES.JOVIE_PRODUCT, CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'scripts/component-',
    lanes: [CI_LANES.JOVIE_PRODUCT, CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'docs/company/',
    lanes: [CI_LANES.SUMMER_OPS],
  },
  {
    prefix: 'docs/fundraising/',
    lanes: [CI_LANES.SUMMER_OPS],
  },
  {
    prefix: 'content/investors/',
    lanes: [CI_LANES.SUMMER_OPS],
  },
  {
    prefix: 'canon/FLEET.md',
    lanes: [CI_LANES.SUMMER_OPS],
  },
  {
    prefix: 'STRATEGY.md',
    lanes: [CI_LANES.SUMMER_OPS],
  },
  {
    prefix: '.github/',
    lanes: [CI_LANES.JOVIE_PRODUCT, CI_LANES.SYMPHONY_CONTROL],
  },
  {
    prefix: 'apps/',
    lanes: [CI_LANES.JOVIE_PRODUCT],
  },
  {
    prefix: 'packages/',
    lanes: [CI_LANES.JOVIE_PRODUCT],
  },
  {
    prefix: 'lib/',
    lanes: [CI_LANES.JOVIE_PRODUCT],
  },
]);

const SHARED_ROOT_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'tsconfig.json',
]);

const TYPECHECK_ROOT_FILES = new Set([
  // Route projection changes the generated TypeScript graph before compilation.
  'apps/ovie/scripts/routes.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
]);

/** Exact graph inputs mirrored by the source-PR guard in ci-fast-lanes.mjs. */
export function affectsJovieTypecheck(file) {
  const normalized = normalizeFile(file);
  if (!normalized) return false;
  if (TYPECHECK_ROOT_FILES.has(normalized)) return true;
  if (normalized.endsWith('/package.json')) return true;
  if (/(?:^|\/)tsconfig[^/]*\.json$/i.test(normalized)) return true;
  return /\.(?:ts|tsx|mts|cts)$/i.test(normalized);
}

function normalizeFile(file) {
  return String(file || '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

function uniqueFiles(files) {
  return [
    ...new Set(
      (Array.isArray(files) ? files : [])
        .map(normalizeFile)
        .filter(file => file.length > 0)
    ),
  ];
}

function matchPrefixes(file) {
  let winner = null;
  for (const rule of LANE_PREFIXES) {
    if (
      (file === rule.prefix || file.startsWith(rule.prefix)) &&
      (!winner || rule.prefix.length > winner.prefix.length)
    ) {
      winner = rule;
    }
  }
  return winner?.lanes ? [...winner.lanes] : [];
}

export function classifyChangedFile(file) {
  const normalized = normalizeFile(file);
  if (!normalized) return [];
  if (SHARED_ROOT_FILES.has(normalized)) {
    return [CI_LANES.JOVIE_PRODUCT, CI_LANES.SYMPHONY_CONTROL];
  }
  const matched = matchPrefixes(normalized);
  if (matched.length > 0) return matched;
  if (DOC_FILE.test(normalized) && !normalized.startsWith('.github/')) {
    return [];
  }
  return [CI_LANES.JOVIE_PRODUCT];
}

export function classifyCiRepoLanes(files) {
  const changed = uniqueFiles(files);
  const lanes = new Set();
  for (const file of changed) {
    for (const lane of classifyChangedFile(file)) lanes.add(lane);
  }
  return {
    schema: CI_REPO_LANES_SCHEMA,
    files: changed,
    lanes: [...lanes].sort(),
    runJovieProduct: lanes.has(CI_LANES.JOVIE_PRODUCT),
    runJovieTypecheck:
      lanes.has(CI_LANES.JOVIE_PRODUCT) &&
      changed.some(file => affectsJovieTypecheck(file)),
    runSymphonyControl: lanes.has(CI_LANES.SYMPHONY_CONTROL),
    runSummerOps: lanes.has(CI_LANES.SUMMER_OPS),
  };
}

export function jovieRequiredChecksAreLocal(contexts) {
  const names = (Array.isArray(contexts) ? contexts : []).map(context =>
    String(context || '').trim()
  );
  const foreign = names.filter(name => {
    const bare = name.replace(/^CI \/ /, '');
    return (
      FOREIGN_REQUIRED_CHECK_CONTEXTS.includes(name) ||
      FOREIGN_REQUIRED_CHECK_CONTEXTS.includes(bare) ||
      /^(?:CI \/ )?Symphony\b/i.test(name) ||
      /summer-config/i.test(name) ||
      /\bOps review\b/i.test(name)
    );
  });
  return { ok: foreign.length === 0, foreign, contexts: names };
}

function githubBoolean(value) {
  return value ? 'true' : 'false';
}

export function githubLaneOutputs(
  plan,
  { forceAll = false, forceNone = false } = {}
) {
  const runJovieProduct = forceAll || (!forceNone && plan.runJovieProduct);
  const runJovieTypecheck = forceAll || (!forceNone && plan.runJovieTypecheck);
  const runSymphonyControl =
    forceAll || (!forceNone && plan.runSymphonyControl);
  const runSummerOps = forceAll || (!forceNone && plan.runSummerOps);
  return [
    `run_jovie_product=${githubBoolean(runJovieProduct)}`,
    `run_jovie_typecheck=${githubBoolean(runJovieTypecheck)}`,
    `run_symphony_control=${githubBoolean(runSymphonyControl)}`,
    `run_summer_ops=${githubBoolean(runSummerOps)}`,
  ];
}

function readStdinFiles() {
  try {
    return uniqueFiles(readFileSync(0, 'utf8').split(/\r?\n/));
  } catch {
    return [];
  }
}

export function main(argv = process.argv.slice(2)) {
  const forceAll = argv.includes('--all');
  const forceNone = argv.includes('--none');
  const emitGithub = argv.includes('--emit-github-output');
  const plan = classifyCiRepoLanes(
    forceAll || forceNone ? [] : readStdinFiles()
  );
  const lines = githubLaneOutputs(plan, { forceAll, forceNone });
  if (emitGithub) {
    const body = `${lines.join('\n')}\n`;
    const outputPath = process.env.GITHUB_OUTPUT;
    if (outputPath) appendFileSync(outputPath, body);
    else process.stdout.write(body);
    return 0;
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
