/**
 * Golden Path step scope (JOV-14402).
 *
 * A Golden Path certification belongs to the release it passed on and carries
 * forward to later releases that do not touch the step. This module says what
 * "touch" means. A step's scope is:
 *
 * - the import closure of its pages: each cert screen's page
 *   (docs/design-system/cert-screens.json) and the extra pages in
 *   docs/pen-stills/golden-path/step-scope.json, with the layouts, templates
 *   and route files (loading, error, not-found, opengraph-image, ...) above
 *   each page;
 * - every file under the step's routes (its API routes and route folders),
 *   and the import closure of the code there;
 * - a global set that every step depends on: package manifests and the
 *   lockfile, Next and build config, proxy and instrumentation, the env
 *   schema, database migrations, non-UI workspace packages and the
 *   certification producer itself.
 *
 * touchedSteps fails closed. A path it cannot place, an unresolved import, a
 * missing page or a diff it did not see in full touches every step, so an
 * unknown never carries a certification forward.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { importClosure, routeEntries } from './component-import-closure.mjs';
import { producerFiles } from './golden-path-cert-reuse.mjs';
import { SURFACE_IDS } from './prod-cert.mjs';

export const STEP_SCOPE_FILE = 'docs/pen-stills/golden-path/step-scope.json';
export const STEP_SCOPE_SCHEMA = 'jovie.golden-path-step-scope/v1';
const CERT_SCREENS_FILE = 'docs/design-system/cert-screens.json';
/** A diff this large is not read path by path: it touches every step. */
export const MAX_CHANGED_PATHS = 5_000;

const ROUTE_FILES = [
  'layout',
  'template',
  'loading',
  'error',
  'not-found',
  'default',
  'opengraph-image',
  'twitter-image',
  'icon',
  'apple-icon',
];
const CODE = /\.(?:tsx?|jsx?|mjs|cjs)$/u;
const TEST = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//u;

const TEST_DIR =
  /(?:^|\/)(?:__tests__|__mocks__|tests?|e2e|fixtures|stories)\//u;

/** Paths every step depends on, beyond the config's global files. */
const GLOBAL_PATTERNS = [
  /(?:^|\/)package\.json$/u,
  // packages/ui is reached by name through the import closure; any other
  // workspace package is not followed, so its source touches every step.
  /^packages\/(?!ui\/)(?!.*\.mdx?$)(?!.*\.(?:test|spec|stories)\.[cm]?[jt]sx?$)(?!(?:.*\/)?(?:__tests__|__mocks__|tests?|fixtures)\/)/iu,
];

/**
 * Paths that cannot change what a step serves once they sit outside every
 * scope: docs, tests, CI and scripts that are not the producer, other apps,
 * and web source modules (the static import closure decides those). Anything
 * else outside every scope is unknown and touches every step.
 */
const OUTSIDE = [
  /\.mdx?$/iu,
  /^docs\//u,
  /^LICENSE/u,
  TEST_DIR,
  TEST,
  /^scripts\//u,
  /^\.github\//u,
  /^\.[^/]+(?:\/|$)/u,
  /^(?:Gemfile(?:\.lock)?|LESSONS\.guards\.json|biome\.json|codecov\.yml|knip\.json|repository-docs\.json|skills-lock\.json|sonar-project\.properties|test-performance-config\.json|vitest\.config\.mts|warden\.toml)$/u,
  /^apps\/(?!web\/)[^/]+\//u,
  /^apps\/web\/[^/]+$/u,
  /^apps\/web\/(?!public\/|drizzle\/)[^/]+\/.+\.(?:tsx?|jsx?|mjs|cjs|css)$/u,
  /^packages\/ui\/.+\.(?:tsx?|jsx?|mjs|cjs|css)$/u,
];

const isPath = (/** @type {unknown} */ path) =>
  typeof path === 'string' &&
  path.length > 0 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  !/[\x00-\x1f\x7f]/u.test(path) &&
  path.split('/').every(part => part && part !== '.' && part !== '..');

const readJson = (/** @type {string} */ file) =>
  JSON.parse(readFileSync(file, 'utf8'));

/** Repo paths; a prefix may end in `/`. */
const strings = (/** @type {unknown} */ value) =>
  Array.isArray(value) &&
  value.every(path => isPath(String(path).replace(/\/$/u, '')));

/**
 * Read and check the step scope config and the cert screens it names.
 * @param {string} root
 */
export function loadStepScopeConfig(root) {
  const config = readJson(join(root, STEP_SCOPE_FILE));
  const screens = readJson(join(root, CERT_SCREENS_FILE)).screens ?? {};
  if (config?.schema !== STEP_SCOPE_SCHEMA)
    throw new Error(`${STEP_SCOPE_FILE} has an unexpected schema`);
  const steps = config.steps ?? {};
  for (const surface of SURFACE_IDS) {
    const step = steps[surface];
    if (!step) throw new Error(`${STEP_SCOPE_FILE} has no step ${surface}`);
    if (
      !Array.isArray(step.screens) ||
      !step.screens.every(id => typeof screens[id]?.page === 'string') ||
      !strings(step.pages) ||
      !strings(step.routes)
    )
      throw new Error(`${STEP_SCOPE_FILE} step ${surface} is invalid`);
  }
  const global = config.global ?? {};
  const producers = config.producers ?? {};
  if (
    !strings(global.entries) ||
    !strings(global.files) ||
    !strings(global.prefixes) ||
    !strings(producers.entries)
  )
    throw new Error(`${STEP_SCOPE_FILE} global set is invalid`);
  return { steps, global, producers, screens };
}

/** Code files under a route folder, tests left out. */
function routeCode(root, prefix) {
  const dir = join(root, prefix);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map(rel => `${prefix.replace(/\/$/u, '')}/${rel}`)
    .filter(rel => CODE.test(rel) && !TEST.test(rel))
    .sort();
}

/** A page's entries plus the route files (loading, error, og image) above it. */
function pageEntries(root, page) {
  const entries = new Set(routeEntries(root, page));
  let dir = dirname(page);
  while (dir.startsWith('apps/web/app')) {
    for (const name of ROUTE_FILES)
      for (const ext of ['.tsx', '.ts', '.jsx', '.js'])
        if (existsSync(join(root, dir, name + ext)))
          entries.add(join(dir, name + ext));
    if (dir === 'apps/web/app') break;
    dir = dirname(dir);
  }
  return [...entries];
}

/**
 * The files and path prefixes one step depends on in the tree at `root`,
 * global set excluded. `unresolved` lists imports or pages that could not be
 * found; a scope with any is not trusted.
 * @param {string} root tree to read the pages and imports from
 * @param {string} surface
 * @param {{ config?: ReturnType<typeof loadStepScopeConfig> }} [options]
 */
export function stepScope(root, surface, { config } = {}) {
  const { steps, screens } = config ?? loadStepScopeConfig(root);
  const step = steps[surface];
  if (!step) throw new Error(`unknown Golden Path step ${surface}`);
  const pages = [...step.screens.map(id => screens[id].page), ...step.pages];
  const entries = [
    ...pages.flatMap(page =>
      existsSync(join(root, page)) ? pageEntries(root, page) : [page]
    ),
    ...step.routes.flatMap(prefix => routeCode(root, prefix)),
  ];
  const closure = importClosure(root, [...new Set(entries)]);
  return {
    surface,
    files: closure.files,
    prefixes: [...step.routes],
    unresolved: closure.unresolved,
  };
}

/**
 * The certification producer, from the checkout that runs it: the scripts
 * (producerFiles), the browser specs that write step evidence and their
 * imports, and this scope config. A change to any of them re-certifies
 * every step.
 * @param {string} root
 * @param {{ config?: ReturnType<typeof loadStepScopeConfig> }} [options]
 */
export function producerScope(root, { config } = {}) {
  const { producers } = config ?? loadStepScopeConfig(root);
  const present = producers.entries.filter(entry =>
    existsSync(join(root, entry))
  );
  return [
    ...new Set([
      ...producerFiles(root),
      ...importClosure(root, present).files,
      STEP_SCOPE_FILE,
      CERT_SCREENS_FILE,
    ]),
  ].sort();
}

/**
 * Files and prefixes every step depends on in the tree at `root`: the
 * config's global files and prefixes, the import closure of its entries
 * (proxy, instrumentation, build scripts), and the producer from
 * `producerRoot`.
 * @param {string} root
 * @param {{ config?: ReturnType<typeof loadStepScopeConfig>, producerRoot?: string }} [options]
 */
export function globalScope(root, { config, producerRoot = root } = {}) {
  const loaded = config ?? loadStepScopeConfig(producerRoot);
  const { global } = loaded;
  const present = global.entries.filter(entry => existsSync(join(root, entry)));
  return {
    files: [
      ...new Set([
        ...global.files,
        ...importClosure(root, present).files,
        ...producerScope(producerRoot, { config: loaded }),
      ]),
    ].sort(),
    prefixes: [...global.prefixes],
  };
}

/** @param {{ files: readonly string[], prefixes: readonly string[] }} scope */
const indexed = scope => ({
  files: new Set(scope.files),
  prefixes: scope.prefixes,
});
const within = (path, scope) =>
  scope.files.has(path) ||
  scope.prefixes.some(prefix => path.startsWith(prefix));

/**
 * Which steps a set of changed paths touches. Pass every tree the paths were
 * diffed between (the old and the new release): a step's scope is the union
 * across them, so a delete or rename counts against the tree that had the
 * file. Fails closed: no path list, a truncated diff, an unknown path, an
 * unresolved import or a missing page touches every step.
 * @param {readonly string[] | null | undefined} changedPaths
 * @param {string | readonly string[]} roots trees to read scopes from
 * @param {{ configRoot?: string, truncated?: boolean }} [options]
 * @returns {{ all: boolean, steps: string[], why: Record<string, string>, reason: string | null }}
 */
export function touchedSteps(changedPaths, roots, options = {}) {
  const trees = typeof roots === 'string' ? [roots] : [...roots];
  const everyStep = reason => ({
    all: true,
    steps: [...SURFACE_IDS],
    why: Object.fromEntries(SURFACE_IDS.map(id => [id, reason])),
    reason,
  });
  if (!Array.isArray(changedPaths)) return everyStep('no changed-path list');
  if (options.truncated) return everyStep('the diff was truncated');
  if (changedPaths.length > MAX_CHANGED_PATHS)
    return everyStep(`more than ${MAX_CHANGED_PATHS} changed paths`);
  if (trees.length === 0) return everyStep('no tree to read scopes from');
  const configRoot = String(options.configRoot ?? trees.at(-1));
  const config = loadStepScopeConfig(configRoot);
  const globals = trees.map(tree =>
    globalScope(tree, { config, producerRoot: configRoot })
  );
  const global = {
    files: new Set(globals.flatMap(scope => scope.files)),
    prefixes: globals[0].prefixes,
  };
  const scopes = [];
  for (const surface of SURFACE_IDS) {
    const perTree = trees.map(tree => stepScope(tree, surface, { config }));
    const unresolved = perTree.flatMap(scope => scope.unresolved);
    if (unresolved.length)
      return everyStep(`${surface} scope is unresolved: ${unresolved[0]}`);
    scopes.push({ surface, perTree: perTree.map(indexed) });
  }
  const touched = new Map();
  for (const path of changedPaths) {
    if (!isPath(path)) return everyStep('a changed path is malformed');
    if (within(path, global) || GLOBAL_PATTERNS.some(re => re.test(path)))
      return everyStep(`${path} is in every step's scope`);
    let placed = false;
    for (const { surface, perTree } of scopes) {
      if (!perTree.some(scope => within(path, scope))) continue;
      placed = true;
      if (!touched.has(surface)) touched.set(surface, path);
    }
    if (!placed && !OUTSIDE.some(re => re.test(path)))
      return everyStep(`${path} is not placed in any step`);
  }
  const steps = SURFACE_IDS.filter(id => touched.has(id));
  return {
    all: false,
    steps,
    why: Object.fromEntries(
      steps.map(id => [id, `changes ${touched.get(id)}`])
    ),
    reason: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Git trees                                                          */
/* ------------------------------------------------------------------ */

const SHA = /^[0-9a-f]{40}$/u;

/** @param {string} root @param {string[]} args */
function git(root, args, { input = undefined } = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  if (result.error || result.status !== 0)
    throw new Error(`git ${args[0]} failed`);
  return result.stdout;
}

/**
 * Every path that differs between two commits, both sides of a rename
 * included (renames are reported as a delete and an add).
 * @param {string} root git checkout holding both commits
 * @param {string} from @param {string} to
 */
export function changedPathsBetween(root, from, to) {
  if (!SHA.test(from) || !SHA.test(to))
    throw new Error('changed paths need two 40-hex SHAs');
  if (from === to) return [];
  return git(root, ['diff', '--name-only', '--no-renames', '-z', from, to])
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

/**
 * Write one commit's tree to a temporary directory, run `fn` on it and
 * remove it. The whole tree: web modules import data from anywhere in the
 * repo, and a partial tree would read as unresolved imports.
 * @template T
 * @param {string} root @param {string} sha @param {(dir: string) => T} fn
 * @returns {T}
 */
export function withTree(root, sha, fn) {
  if (!SHA.test(sha)) throw new Error('a tree needs a 40-hex SHA');
  const dir = mkdtempSync(join(tmpdir(), 'golden-path-tree-'));
  try {
    const untar = spawnSync(
      'bash',
      [
        '-c',
        'set -o pipefail; git -C "$1" archive --format=tar "$2" | tar -x -C "$3"',
        'bash',
        root,
        sha,
        dir,
      ],
      {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        timeout: 120_000,
      }
    );
    if (untar.error || untar.status !== 0)
      throw new Error('tree extract failed');
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
