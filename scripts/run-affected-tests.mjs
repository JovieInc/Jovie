#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GLOBAL_TEST_INPUTS = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'turbo.json',
  'apps/web/package.json',
  'apps/web/vitest.config.mjs',
  'apps/web/tests/setup.ts',
]);
const TESTABLE_FILE = /\.(?:[cm]?[jt]sx?|json)$/;
const INVESTOR_NOTE_INGESTION_TESTS = [
  'apps/web/tests/unit/investors/note-ingestion.test.ts',
  'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
];
const CI_CANCELLATION_HEALER_TESTS = [
  'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
];
const CI_CANCELLATION_HEALER_PRIMARY_INPUTS = new Set([
  '.github/workflows/ci-cancellation-healer.yml',
  'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
  'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
  'scripts/lib/ci-cancellation-classifier.mjs',
]);
const CI_CANCELLATION_HEALER_COMPANION = 'scripts/ci-fast-lanes.mjs';

function isInvestorNoteIngestionInput(file) {
  return (
    file === 'apps/web/lib/investors/note-ingestion.ts' ||
    file === 'apps/web/scripts/ingest-investor-note.ts' ||
    /^apps\/web\/tests\/fixtures\/investors\/note-[^/]+\.json$/.test(file)
  );
}

function isCiCancellationHealerInput(file) {
  return (
    CI_CANCELLATION_HEALER_PRIMARY_INPUTS.has(file) ||
    file === CI_CANCELLATION_HEALER_COMPANION
  );
}

function unique(values) {
  return [...new Set(values)];
}

export function buildAffectedTestPlan(changedFiles) {
  const files = unique(changedFiles.filter(Boolean)).sort();
  if (files.some(file => GLOBAL_TEST_INPUTS.has(file))) {
    return { mode: 'full', relatedFiles: [], mandatoryTests: [] };
  }

  const relatedFiles = files.filter(
    file =>
      TESTABLE_FILE.test(file) &&
      (file.startsWith('apps/web/') || file.startsWith('packages/'))
  );
  const directTests = relatedFiles.filter(file =>
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
  const mandatoryTests = [];
  const hasSeedConfirmationChange = files.some(
    file =>
      file === 'apps/web/tests/seed-test-data.ts' ||
      file === 'apps/web/lib/events/confirmation-status.ts'
  );
  if (hasSeedConfirmationChange) {
    mandatoryTests.push(
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts'
    );
  }
  if (
    files.some(
      file =>
        file.startsWith('apps/web/components/features/profile/') ||
        file.startsWith('apps/web/app/[username]/')
    )
  ) {
    mandatoryTests.push(
      'apps/web/tests/unit/profile/profile-layout-shift.test.tsx',
      'apps/web/tests/unit/profile/profile-card-layout.test.tsx',
      'apps/web/tests/unit/profile/profile-compact-surface-hero-layout.test.ts'
    );
  }
  if (
    files.some(
      file =>
        file.startsWith('apps/web/components/') ||
        file.startsWith('apps/web/app/') ||
        file.startsWith('packages/ui/')
    )
  ) {
    mandatoryTests.push(
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts'
    );
  }
  if (
    files.some(file =>
      file.startsWith('apps/web/eslint-rules/canonical-ui-label-casing')
    )
  ) {
    mandatoryTests.push(
      'apps/web/eslint-rules/canonical-ui-label-casing.test.ts'
    );
  }
  if (files.some(file => file.startsWith('apps/web/tests/eval/promptfoo/'))) {
    mandatoryTests.push(
      'apps/web/lib/agents/registry.test.ts',
      'apps/web/scripts/sync-skills-catalog.test.ts'
    );
  }
  if (files.some(isInvestorNoteIngestionInput)) {
    mandatoryTests.push(...INVESTOR_NOTE_INGESTION_TESTS);
  }
  const hasCiCancellationHealerChange = files.some(file =>
    CI_CANCELLATION_HEALER_PRIMARY_INPUTS.has(file)
  );
  if (hasCiCancellationHealerChange) {
    mandatoryTests.push(...CI_CANCELLATION_HEALER_TESTS);
  }

  const selectedTests = unique([...directTests, ...mandatoryTests]);
  const isCoveredSource = file => {
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return true;
    if (file.startsWith('apps/web/components/features/profile/')) return true;
    if (file.startsWith('apps/web/app/[username]/')) return true;
    if (file.startsWith('apps/web/components/')) return true;
    if (file.startsWith('apps/web/app/')) return true;
    if (file.startsWith('packages/ui/')) return true;
    if (file.startsWith('apps/web/tests/eval/promptfoo/')) return true;
    if (isInvestorNoteIngestionInput(file)) return true;
    if (isCiCancellationHealerInput(file)) return true;
    if (
      hasSeedConfirmationChange &&
      (file === 'apps/web/tests/seed-test-data.ts' ||
        file === 'apps/web/lib/events/confirmation-status.ts' ||
        file === 'apps/web/lib/events/insert.ts')
    )
      return true;
    if (file.startsWith('apps/web/eslint-rules/canonical-ui-label-casing'))
      return true;
    return (
      file ===
      'apps/web/tests/unit/design-system/arbitrary-values.baseline.json'
    );
  };
  const hasUnknownCiCancellationHealerPeer =
    hasCiCancellationHealerChange &&
    files.some(
      file =>
        (file.startsWith('scripts/') || file.startsWith('.github/')) &&
        !isCiCancellationHealerInput(file)
    );
  const hasStandaloneCiFastLanesChange =
    files.includes(CI_CANCELLATION_HEALER_COMPANION) &&
    !hasCiCancellationHealerChange;
  const hasUncoveredSource =
    relatedFiles.some(file => !isCoveredSource(file)) ||
    hasUnknownCiCancellationHealerPeer ||
    hasStandaloneCiFastLanesChange;
  return {
    mode: hasUncoveredSource
      ? 'full'
      : selectedTests.length > 0 &&
          (relatedFiles.length > 0 || hasCiCancellationHealerChange)
        ? 'selected'
        : relatedFiles.length === 0
          ? 'none'
          : 'full',
    relatedFiles,
    mandatoryTests: unique(mandatoryTests),
    selectedTests,
  };
}

function argValue(args, flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

function changedFiles(base) {
  return execFileSync(
    'git',
    ['diff', '--diff-filter=ACDMR', '--name-only', `${base}...HEAD`],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  )
    .trim()
    .split('\n')
    .filter(Boolean);
}

export async function runCommand(command, args) {
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  });
  const terminate = signal => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  };
  const onInterrupt = () => terminate('SIGINT');
  const onTerminate = () => terminate('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const status = await new Promise(resolveStatus => {
    child.once('exit', (code, signal) =>
      resolveStatus(code ?? (signal ? 128 : 1))
    );
    child.once('error', () => resolveStatus(1));
  });
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  process.exit(status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const base = argValue(args, '--base', 'origin/main');
  const maxWorkers = argValue(args, '--max-workers', '2');
  const plan = buildAffectedTestPlan(changedFiles(base));
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }
  console.log(
    `[affected-tests] mode=${plan.mode} related=${plan.relatedFiles.length} mandatory=${plan.mandatoryTests.length}`
  );

  if (plan.mode === 'none') process.exit(0);
  if (plan.mode === 'full') {
    await runCommand('pnpm', ['--filter', '@jovie/web', 'run', 'test']);
  }

  await runCommand('pnpm', [
    '--filter',
    '@jovie/web',
    'exec',
    'vitest',
    'run',
    ...plan.selectedTests.map(file => file.replace(/^apps\/web\//, '')),
    '--passWithNoTests',
    '--maxWorkers',
    maxWorkers,
  ]);
}
