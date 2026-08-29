#!/usr/bin/env node
/** Authoritative web unit selector: CI merge-group `test:fast` (JOV-5418). */

export const AUTHORITATIVE_WEB_UNIT_TURBO_TASK = 'test:fast';
export const AUTHORITATIVE_WEB_UNIT_PACKAGE = '@jovie/web';
export const AUTHORITATIVE_WEB_UNIT_CONFIG = 'vitest.config.mts';
export const AUTHORITATIVE_WEB_UNIT_COMMAND =
  'pnpm --filter=@jovie/web run test:fast';
export const WEB_TEST_CI_VITEST_FLAGS = Object.freeze([
  '--pool=forks',
  '--maxWorkers=2',
]);
export const WEB_TEST_TYPECHECK_HEAP_MB = 8192;
export const WEB_TEST_SURFACE_RECEIPT_SCHEMA = 'web-test-surface-receipt/v1';

/** Excludes mirrored from vitest.config.fast.mts. */
export const WEB_UNIT_EXCLUDE_PREFIXES = Object.freeze([
  'apps/web/tests/e2e/',
  'apps/web/tests/eval/',
  'apps/web/tests/audit/',
  'apps/web/tests/performance/',
  'apps/web/tests/integration/',
  'apps/web/tests/product-screenshots/',
  'apps/web/tests/visual-qa/',
]);

export const WEB_UNIT_EXCLUDE_GLOBS = Object.freeze([
  'tests/e2e/**',
  'tests/eval/**',
  'tests/audit/**',
  'tests/performance/**',
  'tests/integration/**',
  'tests/product-screenshots/**',
  'tests/visual-qa/**',
  'tests/**/*.nightly.test.ts',
  '.artifact-comparison-*/**',
  'node_modules/**',
  '.next/**',
  '.stryker-tmp/**',
]);

const UNIT_TEST_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TS_SOURCE_RE = /\.[cm]?[jt]sx?$/;
const NIGHTLY_TEST_RE = /\.nightly\.test\.[cm]?[jt]sx?$/;

export function normalizeRepoPath(filePath) {
  return String(filePath || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
}

export function isAuthoritativeUnitTest(filePath) {
  const file = normalizeRepoPath(filePath);
  if (!UNIT_TEST_RE.test(file) || NIGHTLY_TEST_RE.test(file)) return false;
  if (WEB_UNIT_EXCLUDE_PREFIXES.some(prefix => file.startsWith(prefix))) {
    return false;
  }
  return file.startsWith('apps/web/') || file.startsWith('packages/ui/');
}

export function colocatedTestCandidates(filePath) {
  const file = normalizeRepoPath(filePath);
  if (isAuthoritativeUnitTest(file)) return [file];
  if (!TS_SOURCE_RE.test(file) || file.includes('/node_modules/')) return [];
  const stem = file.replace(/\.[cm]?[jt]sx?$/, '');
  const slash = stem.lastIndexOf('/');
  const dir = slash === -1 ? '' : stem.slice(0, slash + 1);
  const base = slash === -1 ? stem : stem.slice(slash + 1);
  return [
    `${stem}.test.ts`,
    `${stem}.test.tsx`,
    `${stem}.spec.ts`,
    `${stem}.spec.tsx`,
    `${dir}__tests__/${base}.test.ts`,
    `${dir}__tests__/${base}.test.tsx`,
    `${dir}__tests__/${base}.spec.ts`,
    `${dir}__tests__/${base}.spec.tsx`,
  ];
}

export function selectChangedSurfaceTests(changedFiles, options = {}) {
  const existsSync = options.existsSync ?? (() => false);
  const readCoverageVia = options.readCoverageVia ?? (() => null);
  const selected = new Set();

  for (const raw of changedFiles ?? []) {
    const file = normalizeRepoPath(raw);
    if (!file) continue;
    if (isAuthoritativeUnitTest(file) && existsSync(file)) {
      selected.add(file);
    }
    for (const candidate of colocatedTestCandidates(file)) {
      if (isAuthoritativeUnitTest(candidate) && existsSync(candidate)) {
        selected.add(candidate);
      }
    }
    const via = readCoverageVia(file);
    if (via && isAuthoritativeUnitTest(via) && existsSync(via)) {
      selected.add(via);
    }
  }

  return [...selected].sort();
}

export function toPackageTestPath(repoRelativeFile) {
  const file = normalizeRepoPath(repoRelativeFile);
  if (file.startsWith('apps/web/')) return file.slice('apps/web/'.length);
  if (file.startsWith('packages/ui/')) {
    return file.slice('packages/ui/'.length);
  }
  return file;
}

export function buildAuthoritativeTestCommand(selectedTests) {
  const webTests = selectedTests.filter(file => file.startsWith('apps/web/'));
  const uiTests = selectedTests.filter(file => file.startsWith('packages/ui/'));
  const commands = [];
  if (webTests.length > 0) {
    commands.push(
      `${AUTHORITATIVE_WEB_UNIT_COMMAND} -- ${webTests.map(toPackageTestPath).join(' ')}`
    );
  }
  if (uiTests.length > 0) {
    commands.push(
      `pnpm --filter=@jovie/ui run test -- ${uiTests.map(toPackageTestPath).join(' ')}`
    );
  }
  return commands;
}

export function ensureMinHeapMb(env, mb) {
  const current = env.NODE_OPTIONS ?? '';
  const match = current.match(/--max-old-space-size=(\d+)/);
  if (match && Number(match[1]) >= mb) return { ...env };
  if (match) {
    return {
      ...env,
      NODE_OPTIONS: current.replace(
        /--max-old-space-size=\d+/,
        `--max-old-space-size=${mb}`
      ),
    };
  }
  return {
    ...env,
    NODE_OPTIONS: `${current} --max-old-space-size=${mb}`.trim(),
  };
}

export function classifyTypecheckDiagnostics(
  counts,
  changedFiles,
  baseline = { files: {} }
) {
  const changed = new Set(
    (changedFiles ?? []).map(file => normalizeRepoPath(file))
  );
  const changedSurface = [];
  const fleetDebt = [];
  const baselineFiles = baseline.files ?? {};

  for (const [file, byCode] of counts ?? []) {
    const onChangedSurface = changed.has(file);
    for (const [code, count] of byCode) {
      const baselineCount = baselineFiles[file]?.[code] ?? 0;
      const entry = {
        file,
        code,
        count,
        baseline: baselineCount,
        exceedsBaseline: count > baselineCount,
      };
      if (onChangedSurface) changedSurface.push(entry);
      else fleetDebt.push(entry);
    }
  }

  return {
    changedSurface,
    fleetDebt,
    changedSurfaceRegressions: changedSurface.filter(
      entry => entry.exceedsBaseline
    ),
    fleetRegressions: fleetDebt.filter(entry => entry.exceedsBaseline),
  };
}
