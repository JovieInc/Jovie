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
const PREREQUISITE_TRAIN_TESTS = [
  'apps/web/tests/unit/api/chat/onboarding-handler.test.ts',
  'apps/web/tests/unit/chat/chat-composer-system-b-style-guard.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'apps/web/tests/unit/ci/neon-endpoint-admission.test.ts',
  'apps/web/tests/unit/ci/visual-a11y-workflow.test.ts',
  'apps/web/tests/unit/e2e/auth-helper.test.ts',
  'apps/web/tests/unit/e2e/noauth-config.test.ts',
  'apps/web/tests/unit/e2e/seed-test-data.test.ts',
  'apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts',
  'apps/web/tests/unit/onboarding/OnboardingChat.turnstile.test.tsx',
];
const PREREQUISITE_TRAIN_CORNERS = [
  'scripts/ci/neon-orphan-reaper.mjs',
  'apps/web/lib/testing/e2e-prebuilt-claim.ts',
  'apps/web/app/api/chat/onboarding-handler.ts',
  'apps/web/styles/design-system.css',
];
const PREREQUISITE_TRAIN_PLAYWRIGHT_SPECS = new Set([
  'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts',
  'apps/web/tests/e2e/golden-path.spec.ts',
]);
const PREREQUISITE_TRAIN_STANDALONE_GLOBALS = new Set([
  '.github/workflows/ci.yml',
  'apps/web/tests/seed-test-data.ts',
  'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts',
  'apps/web/tests/e2e/golden-path.spec.ts',
]);
const PREREQUISITE_TRAIN_MANIFEST = new Set([
  '.github/actions/neon-branch-cleanup/action.yml',
  '.github/actions/neon-create-branch-with-retry/action.yml',
  '.github/actions/neon-create-branch-with-retry/create-branch-with-capacity-retry.sh',
  '.github/actions/neon-create-branch-with-retry/create-branch.sh',
  '.github/workflows/ci.yml',
  '.github/workflows/e2e-full-matrix.yml',
  '.github/workflows/nightly-tests.yml',
  '.github/workflows/visual-regression.yml',
  'apps/web/app/api/chat/onboarding-handler.ts',
  'apps/web/app/api/dev/test-auth/session/route.ts',
  'apps/web/components/features/onboarding/OnboardingChat.tsx',
  'apps/web/components/jovie/components/ChatInput.tsx',
  'apps/web/components/organisms/SharedCommandPalette.tsx',
  'apps/web/lib/auth/dev-test-auth.server.ts',
  'apps/web/lib/testing/e2e-prebuilt-claim.ts',
  'apps/web/playwright.config.noauth.ts',
  'apps/web/styles/design-system.css',
  'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts',
  'apps/web/tests/e2e/golden-path.spec.ts',
  'apps/web/tests/helpers/auth.ts',
  'apps/web/tests/seed-test-data.ts',
  ...PREREQUISITE_TRAIN_TESTS,
  'scripts/ci/neon-orphan-reaper.mjs',
]);
const VERCEL_CONGESTION_CONTROL_MANIFEST = new Set([
  '.github/scripts/cancel-stale-vercel-previews.mjs',
  '.github/scripts/cancel-stale-vercel-previews.test.mjs',
  '.github/scripts/vercel-prebuilt-deploy.sh',
  'scripts/tests/test_vercel_prebuilt_deploy.py',
]);
const VERCEL_CONGESTION_CONTROL_ROOT_VITEST_TESTS = [
  '.github/scripts/cancel-stale-vercel-previews.test.mjs',
];
const VERCEL_CONGESTION_CONTROL_PYTHON_TESTS = [
  'scripts/tests/test_vercel_prebuilt_deploy.py',
];
const AFFECTED_TEST_SELECTOR_MANIFEST = new Set([
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
]);
const AFFECTED_TEST_SELECTOR_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const GTMQ_SOURCE_GATE_REAPER_MANIFEST = new Set([
  '.github/actions/setup-node-pnpm/action.yml',
  '.github/workflows/gtmq-source-authorization.yml',
  '.github/workflows/merge-queue-autoenroll.yml',
  'apps/web/tests/unit/ci/runner-setup-action.test.ts',
  'scripts/drain-pr-queue.sh',
  'scripts/guard-gtmq-source-authorization.sh',
  'scripts/tests/test_gh_retry.py',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
]);
const GTMQ_SOURCE_GATE_REAPER_PYTHON_TESTS = ['scripts/tests/test_gh_retry.py'];
const GTMQ_SOURCE_GATE_REAPER_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
];

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

  const prerequisiteTrainCornerCount = PREREQUISITE_TRAIN_CORNERS.filter(file =>
    files.includes(file)
  ).length;
  const hasPrerequisiteTrainCorners =
    prerequisiteTrainCornerCount === PREREQUISITE_TRAIN_CORNERS.length;
  const isExactPrerequisiteTrain =
    hasPrerequisiteTrainCorners &&
    files.every(file => PREREQUISITE_TRAIN_MANIFEST.has(file));
  const vercelCongestionControlInputCount = files.filter(file =>
    VERCEL_CONGESTION_CONTROL_MANIFEST.has(file)
  ).length;
  const isExactVercelCongestionControl =
    vercelCongestionControlInputCount ===
      VERCEL_CONGESTION_CONTROL_MANIFEST.size &&
    files.length === VERCEL_CONGESTION_CONTROL_MANIFEST.size;
  const affectedTestSelectorInputCount = files.filter(file =>
    AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
  ).length;
  const isExactAffectedTestSelector =
    affectedTestSelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size &&
    files.length === AFFECTED_TEST_SELECTOR_MANIFEST.size;
  const gtmqSourceGateReaperInputCount = files.filter(file =>
    GTMQ_SOURCE_GATE_REAPER_MANIFEST.has(file)
  ).length;
  const isExactGtmqSourceGateReaper =
    gtmqSourceGateReaperInputCount === GTMQ_SOURCE_GATE_REAPER_MANIFEST.size &&
    files.length === GTMQ_SOURCE_GATE_REAPER_MANIFEST.size;
  const relatedFiles = files.filter(
    file =>
      TESTABLE_FILE.test(file) &&
      (file.startsWith('apps/web/') || file.startsWith('packages/'))
  );
  const directTests = relatedFiles.filter(
    file =>
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) &&
      !(
        isExactPrerequisiteTrain &&
        PREREQUISITE_TRAIN_PLAYWRIGHT_SPECS.has(file)
      )
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
  if (isExactPrerequisiteTrain) {
    mandatoryTests.push(...PREREQUISITE_TRAIN_TESTS);
  }

  const selectedTests = unique([...directTests, ...mandatoryTests]);
  const rootVitestTests = isExactVercelCongestionControl
    ? VERCEL_CONGESTION_CONTROL_ROOT_VITEST_TESTS
    : [];
  const pythonTests = unique([
    ...(isExactVercelCongestionControl
      ? VERCEL_CONGESTION_CONTROL_PYTHON_TESTS
      : []),
    ...(isExactGtmqSourceGateReaper
      ? GTMQ_SOURCE_GATE_REAPER_PYTHON_TESTS
      : []),
  ]);
  const scriptVitestTests = unique([
    ...(isExactAffectedTestSelector ? AFFECTED_TEST_SELECTOR_TESTS : []),
    ...(isExactGtmqSourceGateReaper
      ? GTMQ_SOURCE_GATE_REAPER_SCRIPT_TESTS
      : []),
  ]);
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
    if (isExactPrerequisiteTrain && PREREQUISITE_TRAIN_MANIFEST.has(file))
      return true;
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
  const hasIncompletePrerequisiteTrain =
    prerequisiteTrainCornerCount > 0 && !hasPrerequisiteTrainCorners;
  const hasStandalonePrerequisiteGlobal =
    files.length === 1 && PREREQUISITE_TRAIN_STANDALONE_GLOBALS.has(files[0]);
  const hasUnknownPrerequisiteTrainPeer =
    hasPrerequisiteTrainCorners && !isExactPrerequisiteTrain;
  const hasIncompleteVercelCongestionControl =
    vercelCongestionControlInputCount > 0 && !isExactVercelCongestionControl;
  const hasIncompleteAffectedTestSelector =
    affectedTestSelectorInputCount > 0 &&
    !isExactAffectedTestSelector &&
    !isExactGtmqSourceGateReaper;
  const hasIncompleteGtmqSourceGateReaper =
    gtmqSourceGateReaperInputCount > 0 &&
    !isExactGtmqSourceGateReaper &&
    !isExactAffectedTestSelector;
  const hasUncoveredSource =
    relatedFiles.some(file => !isCoveredSource(file)) ||
    hasUnknownCiCancellationHealerPeer ||
    hasStandaloneCiFastLanesChange ||
    hasIncompletePrerequisiteTrain ||
    hasStandalonePrerequisiteGlobal ||
    hasUnknownPrerequisiteTrainPeer ||
    hasIncompleteVercelCongestionControl ||
    hasIncompleteAffectedTestSelector ||
    hasIncompleteGtmqSourceGateReaper;
  const hasSelectedTests =
    selectedTests.length > 0 ||
    rootVitestTests.length > 0 ||
    pythonTests.length > 0 ||
    scriptVitestTests.length > 0;
  return {
    mode: hasUncoveredSource
      ? 'full'
      : hasSelectedTests &&
          (relatedFiles.length > 0 ||
            hasCiCancellationHealerChange ||
            isExactPrerequisiteTrain ||
            isExactVercelCongestionControl ||
            isExactAffectedTestSelector ||
            isExactGtmqSourceGateReaper)
        ? 'selected'
        : relatedFiles.length === 0
          ? 'none'
          : 'full',
    relatedFiles,
    mandatoryTests: unique(mandatoryTests),
    selectedTests,
    rootVitestTests,
    pythonTests,
    scriptVitestTests,
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

async function runCommandStatus(command, args) {
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
  return status;
}

export async function runCommand(command, args) {
  process.exit(await runCommandStatus(command, args));
}

async function runCommands(commands) {
  for (const [command, args] of commands) {
    const status = await runCommandStatus(command, args);
    if (status !== 0) process.exit(status);
  }
  process.exit(0);
}

export function buildSelectedTestCommands(plan, maxWorkers) {
  const commands = [];
  if (plan.scriptVitestTests.length > 0) {
    commands.push([
      'pnpm',
      [
        'exec',
        'vitest',
        '--root',
        'scripts',
        '--config',
        'vitest.config.mts',
        'run',
        ...plan.scriptVitestTests.map(file => file.replace(/^scripts\//, '')),
        '--maxWorkers',
        maxWorkers,
      ],
    ]);
  }
  if (plan.rootVitestTests.length > 0) {
    commands.push([
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--root',
        '.',
        '--config',
        'apps/web/vitest.config.mts',
        ...plan.rootVitestTests,
        '--maxWorkers',
        maxWorkers,
      ],
    ]);
  }
  if (plan.pythonTests.length > 0) {
    commands.push(['python3', ['-m', 'pytest', ...plan.pythonTests, '-q']]);
  }
  if (plan.selectedTests.length > 0) {
    commands.push([
      'pnpm',
      [
        '--filter',
        '@jovie/web',
        'exec',
        'vitest',
        'run',
        ...plan.selectedTests.map(file => file.replace(/^apps\/web\//, '')),
        '--passWithNoTests',
        '--maxWorkers',
        maxWorkers,
      ],
    ]);
  }
  return commands;
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

  await runCommands(buildSelectedTestCommands(plan, maxWorkers));
}
