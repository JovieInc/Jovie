#!/usr/bin/env node
/** Bounded changed-surface receipt (JOV-5418). */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCoverageVia,
  resolveCoverageViaPath,
} from './component-ship-policy.mjs';
import {
  AUTHORITATIVE_WEB_UNIT_COMMAND,
  AUTHORITATIVE_WEB_UNIT_CONFIG,
  AUTHORITATIVE_WEB_UNIT_TURBO_TASK,
  buildAuthoritativeTestCommand,
  classifyTypecheckDiagnostics,
  ensureMinHeapMb,
  normalizeRepoPath,
  selectChangedSurfaceTests,
  WEB_TEST_SURFACE_RECEIPT_SCHEMA,
  WEB_TEST_TYPECHECK_HEAP_MB,
} from './lib/web-test-selectors.mjs';
import { parseTscOutput, totalErrors } from './typecheck-scripts.mjs';

export const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return fallback;
  }
}

export function collectChangedFiles(base, gitFn = git) {
  return [
    ...new Set(
      [
        ['diff', '--name-only', `${base}...HEAD`],
        ['diff', '--name-only'],
        ['diff', '--cached', '--name-only'],
        ['ls-files', '--others', '--exclude-standard'],
      ]
        .flatMap(cmd => gitFn(cmd).split('\n'))
        .map(file => normalizeRepoPath(file))
        .filter(Boolean)
    ),
  ].sort();
}

function readCoverageVia(file) {
  const abs = resolve(REPO_ROOT, file);
  if (!existsSync(abs) || !file.endsWith('.tsx')) return null;
  try {
    return resolveCoverageViaPath(
      parseCoverageVia(readFileSync(abs, 'utf8')),
      file,
      REPO_ROOT
    );
  } catch {
    return null;
  }
}

export function boundedTypecheckInclude(changedFiles, selectedTests) {
  return [
    ...new Set(
      [...changedFiles, ...selectedTests]
        .map(file => normalizeRepoPath(file))
        .filter(
          file => file.startsWith('apps/web/') && /\.[cm]?[jt]sx?$/.test(file)
        )
    ),
  ].sort();
}

export function runBoundedWebTestTypecheck({
  include,
  spawn = spawnSync,
  env = process.env,
}) {
  if (include.length === 0) return { status: 0, output: '', skipped: true };
  const tsconfigPath = resolve(
    REPO_ROOT,
    'apps/web/.cache/tsconfig.test.surface.json'
  );
  mkdirSync(dirname(tsconfigPath), { recursive: true });
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify({
      extends: '../tsconfig.test.json',
      compilerOptions: {
        incremental: false,
        tsBuildInfoFile: './tsbuildinfo-tests-surface',
      },
      include: include.map(
        file =>
          `../${file.startsWith('apps/web/') ? file.slice('apps/web/'.length) : file}`
      ),
    })}\n`
  );
  const result = spawn(
    process.execPath,
    [
      resolve(REPO_ROOT, 'node_modules/typescript/bin/tsc'),
      '-p',
      tsconfigPath,
      '--pretty',
      'false',
      '--noEmit',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: ensureMinHeapMb(env, WEB_TEST_TYPECHECK_HEAP_MB),
      maxBuffer: 20 * 1024 * 1024,
    }
  );
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    skipped: false,
  };
}

export function buildReceipt(input) {
  const tests = input.tests ?? { skipped: true, results: [] };
  const typecheck = input.typecheck ?? {
    mode: 'skipped',
    changedSurfaceRegressions: [],
    fleetDebt: [],
  };
  const failedTests = (tests.results ?? []).filter(
    result => result.status === 'failed'
  );
  return {
    schema: WEB_TEST_SURFACE_RECEIPT_SCHEMA,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    base: input.base,
    headSha: input.headSha,
    selector: {
      turboTask: AUTHORITATIVE_WEB_UNIT_TURBO_TASK,
      config: AUTHORITATIVE_WEB_UNIT_CONFIG,
      command: AUTHORITATIVE_WEB_UNIT_COMMAND,
      typecheck: 'pnpm --filter=@jovie/web run typecheck:tests',
    },
    changedFiles: input.changedFiles,
    selectedTests: input.selectedTests ?? [],
    typecheck,
    tests,
    fleetDebtNote:
      'Fleet typecheck errors that are not on the changed surface are baseline debt, not this PR.',
    verdict:
      typecheck.changedSurfaceRegressions?.length > 0
        ? 'fail-changed-surface'
        : failedTests.length > 0
          ? 'fail-tests'
          : 'pass',
  };
}

function loadFleetBaseline() {
  const path = resolve(REPO_ROOT, 'apps/web/typecheck-tests-baseline.json');
  try {
    return existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8'))
      : { files: {} };
  } catch {
    return { files: {} };
  }
}

function main() {
  const flags = {
    diffBase: process.env.WEB_TEST_SURFACE_DIFF_BASE ?? 'origin/main',
    skipTests: false,
    skipTypecheck: false,
    json: false,
    out: null,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--diff-base=')) flags.diffBase = arg.slice(12);
    else if (arg === '--skip-tests') flags.skipTests = true;
    else if (arg === '--skip-typecheck') flags.skipTypecheck = true;
    else if (arg === '--json') flags.json = true;
    else if (arg.startsWith('--out=')) flags.out = arg.slice(6);
  }
  const changedFiles = collectChangedFiles(flags.diffBase);
  const selectedTests = selectChangedSurfaceTests(changedFiles, {
    existsSync: file => existsSync(resolve(REPO_ROOT, file)),
    readCoverageVia,
  });
  let typecheck = {
    mode: 'skipped',
    changedSurfaceRegressions: [],
    fleetDebt: [],
  };
  if (!flags.skipTypecheck) {
    const include = boundedTypecheckInclude(changedFiles, selectedTests);
    const result = runBoundedWebTestTypecheck({ include });
    const parsed = parseTscOutput(result.output ?? '');
    typecheck = {
      mode: result.skipped ? 'skipped' : 'bounded',
      heapMb: WEB_TEST_TYPECHECK_HEAP_MB,
      include,
      totalErrors: totalErrors(parsed.counts),
      ...classifyTypecheckDiagnostics(
        parsed.counts,
        [...changedFiles, ...selectedTests],
        loadFleetBaseline()
      ),
    };
  }
  const commands = flags.skipTests
    ? []
    : buildAuthoritativeTestCommand(selectedTests);
  const tests = {
    skipped: flags.skipTests || commands.length === 0,
    results: commands.map(command => {
      const result = spawnSync(command, {
        cwd: REPO_ROOT,
        env: process.env,
        encoding: 'utf8',
        shell: true,
      });
      return {
        command,
        status: result.status === 0 ? 'passed' : 'failed',
        exitCode: result.status ?? 1,
      };
    }),
  };
  const receipt = buildReceipt({
    base: flags.diffBase,
    headSha: git(['rev-parse', 'HEAD']) || 'unknown',
    changedFiles,
    selectedTests,
    typecheck,
    tests,
  });
  if (flags.out) {
    const outPath = resolve(REPO_ROOT, flags.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`[web-test-surface] wrote ${relative(REPO_ROOT, outPath)}`);
  }
  if (flags.json) console.log(JSON.stringify(receipt, null, 2));
  else {
    console.log(`[web-test-surface] selector=${receipt.selector.command}`);
    console.log(
      `[web-test-surface] selected tests: ${receipt.selectedTests.length}`
    );
    for (const test of receipt.selectedTests) console.log(`  ${test}`);
    console.log(
      `[web-test-surface] typecheck: ${typecheck.mode} regressions=${typecheck.changedSurfaceRegressions.length}`
    );
    for (const entry of typecheck.changedSurfaceRegressions ?? []) {
      console.error(`  REGRESSION ${entry.file}: ${entry.code}`);
    }
    console.log(`[web-test-surface] verdict: ${receipt.verdict}`);
  }
  process.exit(receipt.verdict === 'pass' ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
