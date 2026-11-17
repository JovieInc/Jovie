// Exact input receipts complement the existing source/test blob identity.
// They never change component-certificate state keys or the moduleKey contract.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { readTestSources } from './mutation-diff.mjs';
import { shouldPark, strongerHighWater } from './mutation-evidence.mjs';

/** Hash names and actual bytes, including missing files, in stable order. */
export function inputDigest(paths, read) {
  const hash = createHash('sha256');
  for (const path of [...new Set(paths)].sort()) {
    const text = read(path);
    hash.update(JSON.stringify([path, text]));
  }
  return hash.digest('hex');
}

const ACTIVE_CONFIGS = {
  'apps/web': [
    'vitest.config.fast.mts',
    'vitest.config.mutation.mjs',
    'stryker.diff.config.mjs',
    'tests/setup-optimized.ts',
  ],
  'packages/ui': [
    'vitest.config.mts',
    'stryker.mutation.config.mjs',
    'vitest.setup.ts',
  ],
};
const WORKSPACE_IMPORTS = [
  'scripts/lib/vitest-retry-reporter.mjs',
  'scripts/lib/ci-web-vitest-fast-args.mjs',
];
const computedExpression = path =>
  `pathToFileURL(path.resolve(workspaceRoot,'${path}')).href`;
function unresolvedInputs(selector, source, tests, configSources) {
  return [
    ...new Set(
      [source, ...configSources].flatMap(path =>
        selector
          .unresolvedDetails(path, path === source ? tests : [])
          .filter(
            detail =>
              detail.path !== 'vitest.config.fast.mts' ||
              detail.expressions.some(
                expression =>
                  !WORKSPACE_IMPORTS.some(
                    input =>
                      expression.replace(/\s+/gu, '') ===
                      computedExpression(input)
                  )
              )
          )
          .map(detail => detail.path)
      )
    ),
  ];
}

/** Configuration and shared runtime boundaries conservatively invalidate scores. */
export function configurationPaths(tracked, root) {
  const active = (ACTIVE_CONFIGS[root] ?? []).map(path => `${root}/${path}`);
  const extra =
    root === 'apps/web'
      ? [
          ...WORKSPACE_IMPORTS,
          `${root}/tests/node-environment-files.json`,
          `${root}/.env.test`,
        ]
      : [];
  return [
    ...new Set([
      ...tracked.filter(
        path =>
          [
            '.nvmrc',
            'package.json',
            'pnpm-lock.yaml',
            'pnpm-workspace.yaml',
            'tsconfig.json',
            'scripts/mutation-equivalents.json',
          ].includes(path) ||
          /^scripts\/(?:mutation[^/]*\.mjs|lib\/mutation[^/]*\.mjs)$/u.test(
            path
          ) ||
          /(?:^|\/)package\.json$/u.test(path) ||
          (path.startsWith(`${root}/`) &&
            /(?:^|\/)tsconfig[^/]*\.json$/u.test(path))
      ),
      ...active,
      ...extra,
    ]),
  ];
}

/** A reader confined to the repository; missing inputs remain explicit. */
export function repositoryReader(repoRoot) {
  return path => {
    const absolute = resolve(repoRoot, path);
    if (relative(repoRoot, absolute).startsWith('..'))
      throw new Error(`Mutation input leaves repository: ${path}`);
    try {
      return readFileSync(absolute, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
}

/** A score is fresh only for the exact configuration and selected input bytes. */
export function evidenceIsCurrent(
  entry,
  configDigest,
  read,
  selectionDigest = undefined
) {
  const evidence = entry?.evidence;
  return (
    evidence?.schemaVersion === 1 &&
    evidence.configDigest === configDigest &&
    (selectionDigest === undefined ||
      evidence.selectionDigest === selectionDigest) &&
    Array.isArray(evidence.inputs) &&
    evidence.inputs.length > 0 &&
    evidence.inputDigest === inputDigest(evidence.inputs, read)
  );
}

/** Capture the exact selected runtime closure and configuration before execution. */
export function mutationInputReceipt({
  root,
  source,
  tests,
  selector,
  tracked,
  read,
}) {
  const configs = configurationPaths(tracked, root);
  const configDigest = inputDigest(configs, read);
  const selectionDigest = inputDigest(['selection'], () =>
    JSON.stringify(selector.inventory())
  );
  // Cross-workspace runtime imports use package resolution; bind that boundary conservatively.
  const shared = tracked.filter(
    path =>
      path.startsWith('packages/') &&
      !path.startsWith(`${root}/`) &&
      /\.[cm]?[jt]sx?$/u.test(path) &&
      !/\.(?:test|stories|spec)\./u.test(path)
  );
  const configSources = (ACTIVE_CONFIGS[root] ?? []).filter(
    path => read(`${root}/${path}`) !== null
  );
  const inputs = [
    ...new Set([
      ...configs,
      ...shared,
      ...configSources.flatMap(path =>
        selector.inputs(path, []).map(path => `${root}/${path}`)
      ),
      ...selector.inputs(source, tests).map(path => `${root}/${path}`),
    ]),
  ].sort();
  return {
    schemaVersion: 1,
    configDigest,
    selectionDigest,
    unresolvedInputs: unresolvedInputs(selector, source, tests, configSources),
    selectionSnapshot: inputDigest(
      selector.inventory().modules.map(({ path }) => `${root}/${path}`),
      read
    ),
    testInventoryDigest: inputDigest(
      selector.inventory().testPaths,
      () => null
    ),
    inputs,
    inputDigest: inputDigest(inputs, read),
  };
}

/** Check actual bytes again; cached import edges alone cannot prove no concurrent edits. */
export function mutationInputsUnchanged(
  receipt,
  { root, rootDir, selector, read }
) {
  return (
    receipt.unresolvedInputs.length === 0 &&
    inputDigest(receipt.inputs, read) === receipt.inputDigest &&
    inputDigest(
      selector.inventory().modules.map(({ path }) => `${root}/${path}`),
      read
    ) === receipt.selectionSnapshot &&
    inputDigest([...readTestSources(rootDir).keys()], () => null) ===
      receipt.testInventoryDigest
  );
}

/** Apply freshness/cooldown without changing the existing source/test identity.
 * @template {{file:string, blob:string, testCount:number, touch?:number}} T
 * @param {T[]} candidates
 */
export function sweepEvidenceCandidates(
  candidates,
  state,
  configDigest,
  selectionDigest,
  read,
  runId
) {
  const selectionState = { ...state, modules: { ...state.modules } };
  const deferred = new Set();
  const released = new Set();
  for (const candidate of candidates) {
    const known = state.modules[candidate.file];
    if (!known) continue;
    const current = evidenceIsCurrent(
      known,
      configDigest,
      read,
      selectionDigest
    );
    if (
      known.status === 'unknown' &&
      known.evidence?.verdict === 'unknown' &&
      known.evidence.reason ===
        'configuration changed; reviewed control evidence required'
    ) {
      const anchor = strongerHighWater(
        state.highWater?.[candidate.file],
        known.highWater
      );
      // Identical evidence cannot clear a config review. Keep it unknown
      // without spending another mutant budget; changed inputs may run again.
      if (current && anchor?.configDigest !== configDigest)
        deferred.add(candidate.file);
      else released.add(candidate.file);
    }
    if (!current) {
      known.status = 'stale';
      known.score = null;
    }
    if (released.has(candidate.file))
      selectionState.modules[candidate.file] = {
        ...known,
        status: 'stale',
        blob: 'unknown',
      };
    else if (!shouldPark(known, runId) && known.status === 'stale')
      selectionState.modules[candidate.file] = { ...known, blob: 'unknown' };
    else if (known.status === 'unknown')
      // Preserve pickBatch's existing one-day error backoff after N-run parking.
      selectionState.modules[candidate.file] = { ...known, status: 'error' };
  }
  return {
    selectionState,
    eligible: candidates.filter(
      c =>
        !deferred.has(c.file) &&
        (released.has(c.file) || !shouldPark(state.modules[c.file], runId))
    ),
  };
}

/** A testless scope stays unknown until its source, configuration or import graph changes. */
export function untestedMutationEntry(
  blob,
  source,
  configDigest,
  selectionDigest,
  read
) {
  return {
    blob,
    sha: null,
    at: new Date().toISOString(),
    status: 'untested',
    score: null,
    valid: 0,
    killed: 0,
    survived: 0,
    durationMs: 0,
    evidence: {
      schemaVersion: 1,
      configDigest,
      selectionDigest,
      inputs: [source],
      inputDigest: inputDigest([source], read),
    },
  };
}
