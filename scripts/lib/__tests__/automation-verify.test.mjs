import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildAffectedTestPlan,
  buildFullSuiteCommands,
  buildSelectedTestCommands,
} from '../../run-affected-tests.mjs';

const runner = readFileSync(
  resolve(import.meta.dirname, '../../run-affected-tests.mjs'),
  'utf8'
);

const script = readFileSync(
  resolve(import.meta.dirname, '../../automation-verify.sh'),
  'utf8'
);

const PREREQUISITE_TRAIN_CORNERS = [
  'scripts/ci/neon-orphan-reaper.mjs',
  'apps/web/lib/testing/e2e-prebuilt-claim.ts',
  'apps/web/app/api/chat/onboarding-handler.ts',
  'apps/web/styles/design-system.css',
];
const PREREQUISITE_TRAIN_MANIFEST = [
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
  'scripts/ci/neon-orphan-reaper.mjs',
];
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
const VERCEL_CONGESTION_CONTROL_MANIFEST = [
  '.github/scripts/cancel-stale-vercel-previews.mjs',
  '.github/scripts/cancel-stale-vercel-previews.test.mjs',
  '.github/scripts/vercel-prebuilt-deploy.sh',
  'scripts/tests/test_vercel_prebuilt_deploy.py',
];
const AFFECTED_TEST_SELECTOR_MANIFEST = [
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST = [
  '.github/workflows/ci.yml',
  'apps/web/scripts/test-performance-guard.ts',
  'apps/web/scripts/test-performance-profiler.test.ts',
  'apps/web/scripts/test-performance-profiler.ts',
  'apps/web/tests/unit/app/exp-drift-lint-guard.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
  'apps/web/tests/unit/lib/feature-flags-registry.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const PERFORMANCE_PROFILER_REPAIR_ANCHORS = [
  'apps/web/scripts/test-performance-guard.ts',
  'apps/web/scripts/test-performance-profiler.test.ts',
  'apps/web/scripts/test-performance-profiler.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const PERFORMANCE_PROFILER_REPAIR_MANIFEST = [
  ...PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST,
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
];
const AUTHENTICATED_A11Y_REPAIR_CORE = [
  'apps/web/app/app/(shell)/chat/loading.tsx',
  'apps/web/app/exp/shell-v1/page.tsx',
  'apps/web/components/jovie/components/ChatInput.tsx',
  'apps/web/components/organisms/SharedCommandPalette.tsx',
  'apps/web/components/shell/SidebarNavItem.tsx',
  'apps/web/styles/design-system.css',
  'apps/web/tests/e2e/chat-axe.spec.ts',
  'apps/web/tests/e2e/chat-composer.spec.ts',
  'apps/web/tests/e2e/chat-first-golden-path-handoff.spec.ts',
  'apps/web/tests/e2e/chat-rail-composer-interaction.spec.ts',
  'apps/web/tests/e2e/chat-timeline-regression.spec.ts',
  'apps/web/tests/e2e/chat-visual.spec.ts',
  'apps/web/tests/e2e/golden-path-waitlist-local.spec.ts',
  'apps/web/tests/e2e/homepage-intent.spec.ts',
  'apps/web/tests/e2e/onboarding-david-guetta-demo.spec.ts',
  'apps/web/tests/e2e/synthetic-legacy-otp.spec.ts',
  'apps/web/tests/e2e/yc-demo.spec.ts',
  'apps/web/tests/performance/onboarding-performance.spec.ts',
  'apps/web/scripts/performance-interaction-manifest.ts',
  'apps/web/tests/unit/chat/ChatInput.aria.test.tsx',
  'apps/web/tests/unit/chat/ChatLoading.test.tsx',
  'apps/web/tests/unit/chat/chat-composer-system-b-style-guard.test.ts',
  'apps/web/tests/unit/dashboard/DashboardNav.test.tsx',
  'apps/web/tests/unit/onboarding/OnboardingChat.turnstile.test.tsx',
  'apps/web/tests/unit/sidebar-row-alignment.test.tsx',
];
const CASE_SENSITIVE_LOWERCASE_CHAT_INPUT_PATTERNS = [
  /aria-label=(['"])Chat message input\1/,
  /getByLabel(?:Text)?\((['"])Chat message input\1\)/,
];
const GOLDEN_PATH_SMOKE_CONTRACT_REPAIR_DIFF = [
  'apps/web/tests/e2e/golden-path.spec.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
];
const PERSISTED_AUTH_FIXTURE_REPAIR_CORE = [
  'apps/web/app/api/dev/test-auth/session/route.ts',
  'apps/web/lib/auth/dev-test-auth-identity.ts',
  'apps/web/lib/auth/dev-test-auth.server.ts',
  'apps/web/lib/auth/test-mode.ts',
  'apps/web/lib/testing/test-user-provision.server.ts',
  'apps/web/tests/helpers/auth.ts',
  'apps/web/tests/unit/api/dev/test-auth-routes.test.ts',
  'apps/web/tests/unit/app/hud-page.test.ts',
  'apps/web/tests/unit/e2e/auth-helper.test.ts',
  'apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts',
  'apps/web/tests/unit/lib/auth/test-mode.test.ts',
  'apps/web/tests/unit/lib/testing/test-user-provision.server.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/jobs/ci-failure-monitor.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/hermes/lib/ci-failure-classifier.ts',
  'scripts/hermes/lib/__tests__/ci-failure-classifier.test.ts',
];
const PERSISTED_AUTH_FIXTURE_REPAIR_DIFF = [
  ...PERSISTED_AUTH_FIXTURE_REPAIR_CORE,
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
];
const GTMQ_SOURCE_GATE_REAPER_MANIFEST = [
  '.github/actions/setup-node-pnpm/action.yml',
  '.github/workflows/gtmq-source-authorization.yml',
  '.github/workflows/merge-queue-autoenroll.yml',
  'apps/web/tests/unit/ci/runner-setup-action.test.ts',
  'scripts/drain-pr-queue.sh',
  'scripts/guard-gtmq-source-authorization.sh',
  'scripts/tests/test_gh_retry.py',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const RUNNER_IO_PRESSURE_MANIFEST = [
  '.github/runner-host/README.md',
  '.github/runner-host/autoscaler/controller-io-pressure.patch',
  '.github/runner-host/autoscaler/controller-io-pressure-v1-to-v2.patch',
  '.github/runner-host/autoscaler/io-pressure.ts',
  '.github/runner-host/ci-runner-autoscaler.service.snapshot',
  '.github/runner-host/install-io-pressure-guard.sh',
  'apps/web/tests/unit/ci/runner-io-pressure.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const RUNNER_IO_PRESSURE_V2_MANIFEST = [
  '.github/runner-host/README.md',
  '.github/runner-host/autoscaler/controller-io-pressure.patch',
  '.github/runner-host/autoscaler/controller-io-pressure-v1-to-v2.patch',
  '.github/runner-host/autoscaler/io-pressure.ts',
  '.github/runner-host/install-io-pressure-guard.sh',
  '.github/workflows/runner-autoscaler-canary.yml',
  'apps/web/tests/unit/ci/runner-autoscaler-canary-workflow.test.ts',
  'apps/web/tests/unit/ci/runner-io-pressure.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const RUNNER_PREREQUISITE_CONTRACT_MANIFEST = [
  '.github/actions/setup-node-pnpm/action.yml',
  '.github/actions/setup-playwright/action.yml',
  '.github/runner-image/Dockerfile',
  '.github/runner-image/Dockerfile.dockerignore',
  '.github/runner-image/build-context.sh',
  '.github/runner-image/create-installed-tree.mjs',
  '.github/runner-image/README.md',
  '.github/runner-image/prerequisites.json',
  '.github/runner-image/restore-installed-tree.sh',
  '.github/runner-image/verify-build-cache.mjs',
  '.github/runner-image/verify-prerequisites.mjs',
  '.github/workflows/ci.yml',
  'apps/web/tests/unit/ci/runner-setup-action.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const RUNNER_PREREQUISITE_VISUAL_QA_REPAIR_MANIFEST = [
  ...RUNNER_PREREQUISITE_CONTRACT_MANIFEST,
  'apps/web/lib/agent-os/visual-qa/diff-artifacts.ts',
  'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
];
const LAYOUT_GUARD_CONTRACT_MANIFEST = [
  '.github/scripts/layout-guard-manifest.mjs',
  '.github/scripts/layout-guard-manifest.test.mjs',
  '.github/workflows/ci.yml',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const NEON_ATTEMPT_ARTIFACT_MANIFEST = [
  '.github/workflows/ci.yml',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];

describe('automation-verify affected scope', () => {
  it('keeps runner I/O admission on focused controller regressions', () => {
    const plan = buildAffectedTestPlan(RUNNER_IO_PRESSURE_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/runner-io-pressure.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
      'scripts/lib/__tests__/automation-verify.test.mjs',
    ]);
  });

  it('keeps the autoscaler canary and v2 admission repair on focused regressions', () => {
    const plan = buildAffectedTestPlan(RUNNER_IO_PRESSURE_V2_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/runner-autoscaler-canary-workflow.test.ts',
      'apps/web/tests/unit/ci/runner-io-pressure.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
      'scripts/lib/__tests__/automation-verify.test.mjs',
    ]);
  });

  it('fails closed when runner I/O admission includes an unknown peer', () => {
    expect(
      buildAffectedTestPlan([
        ...RUNNER_IO_PRESSURE_MANIFEST,
        '.github/runner-host/autoscaler/unknown-controller.ts',
      ]).mode
    ).toBe('full');
  });

  it('selects related tests instead of the whole affected workspace package', () => {
    expect(script).toContain('node scripts/run-affected-tests.mjs');
    expect(script).not.toContain('turbo-local.mjs test --affected');
  });

  it('fails closed on an unresolved base and retains mandatory risk policy', () => {
    expect(script).toContain(
      'git rev-parse --verify --quiet "${BASE_REF}^{commit}"'
    );
    expect(script).toContain('pnpm ci:harness:check');
  });

  it('bounds local test fanout', () => {
    expect(script).toContain(
      '--max-workers "${AUTOMATION_VERIFY_MAX_WORKERS:-2}"'
    );
  });

  it('keeps a #14044-like typography change bounded with required layout lanes', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/components/features/profile/ProfileHeroCard.tsx',
      'apps/web/components/jovie/components/ErrorDisplay.tsx',
      'apps/web/eslint-rules/canonical-ui-label-casing.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values.baseline.json',
      'CHANGELOG.md',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(4);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/profile/profile-layout-shift.test.tsx',
      'apps/web/tests/unit/profile/profile-card-layout.test.tsx',
      'apps/web/tests/unit/profile/profile-compact-surface-hero-layout.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
      'apps/web/eslint-rules/canonical-ui-label-casing.test.ts',
    ]);
    expect(plan.selectedTests).toHaveLength(5);
  });

  it('maps the seed confirmation boundary diff to focused behavior tests', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/lib/events/confirmation-status.ts',
      'apps/web/lib/events/insert.ts',
      'apps/web/tests/seed-test-data.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(6);
    expect(plan.selectedTests).toEqual([
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
    ]);
  });

  it('maps Visual QA diff-artifact changes to the focused TOCTOU regression', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/lib/agent-os/visual-qa/diff-artifacts.ts',
      'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(2);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
    ]);
  });

  it('keeps the selector plus Visual QA repair manifest on focused suites', () => {
    const plan = buildAffectedTestPlan([
      'scripts/run-affected-tests.mjs',
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'apps/web/lib/agent-os/visual-qa/diff-artifacts.ts',
      'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
    ]);
  });

  it('maps deterministic Promptfoo changes to their contract tests', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/scripts/run-deterministic-promptfoo-evals.sh',
      'apps/web/tests/eval/promptfoo/jovie-chat-provider.ts',
      'apps/web/tests/eval/promptfoo/promptfooconfig.yaml',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toEqual([
      'apps/web/tests/eval/promptfoo/jovie-chat-provider.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/lib/agents/registry.test.ts',
      'apps/web/scripts/sync-skills-catalog.test.ts',
    ]);
  });

  it('keeps the #14010 investor note ingestion diff on its focused suites', () => {
    const plan = buildAffectedTestPlan([
      'apps/web/lib/investors/note-ingestion.ts',
      'apps/web/scripts/ingest-investor-note.ts',
      'apps/web/tests/fixtures/investors/note-a.json',
      'apps/web/tests/fixtures/investors/note-b.json',
      'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
      'apps/web/tests/unit/investors/note-ingestion.test.ts',
      'docs/fundraising/investor-note-ingestion.md',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(6);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/investors/note-ingestion.test.ts',
      'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/investors/note-ingestion-cli.test.ts',
      'apps/web/tests/unit/investors/note-ingestion.test.ts',
    ]);
  });

  it('fails closed when the investor ingestion lane is mixed with unknown source', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/lib/investors/note-ingestion.ts',
        'apps/web/lib/investors/deleted-unknown.ts',
      ]).mode
    ).toBe('full');
  });

  it('fails closed for an unrelated investor fixture', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/tests/fixtures/investors/portfolio-summary.json',
      ]).mode
    ).toBe('full');
  });

  it('keeps the cancellation healer diff on its focused contract suites', () => {
    const plan = buildAffectedTestPlan([
      '.github/workflows/ci-cancellation-healer.yml',
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
      'scripts/ci-fast-lanes.mjs',
      'scripts/lib/ci-cancellation-classifier.mjs',
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
    ]);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
  });

  it.each([
    '.github/workflows/ci-cancellation-healer.yml',
    'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
    'apps/web/tests/unit/ci/fixtures/fixed-runner-setup-cancellation.json',
    'scripts/lib/ci-cancellation-classifier.mjs',
  ])('maps the cancellation healer input %s independently', input => {
    const plan = buildAffectedTestPlan([input]);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/ci-cancellation-classifier.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
  });

  it('keeps the global ci-fast orchestrator on the full suite standalone', () => {
    expect(buildAffectedTestPlan(['scripts/ci-fast-lanes.mjs']).mode).toBe(
      'full'
    );
  });

  it('fails closed when the cancellation healer lane includes unknown automation', () => {
    expect(
      buildAffectedTestPlan([
        'scripts/lib/ci-cancellation-classifier.mjs',
        'scripts/lib/unknown-ci-repair.mjs',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when the cancellation healer lane includes an unknown action', () => {
    expect(
      buildAffectedTestPlan([
        '.github/workflows/ci-cancellation-healer.yml',
        '.github/actions/unknown-runner-repair/action.yml',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when the cancellation healer lane is mixed with unknown source', () => {
    expect(
      buildAffectedTestPlan([
        '.github/workflows/ci-cancellation-healer.yml',
        'apps/web/lib/unknown.ts',
      ]).mode
    ).toBe('full');
  });

  it('keeps the four-commit prerequisite train on its focused contracts', () => {
    const plan = buildAffectedTestPlan(PREREQUISITE_TRAIN_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toHaveLength(22);
    expect(plan.mandatoryTests).toEqual([
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
      ...PREREQUISITE_TRAIN_TESTS,
    ]);
    expect(plan.selectedTests).toEqual([
      ...PREREQUISITE_TRAIN_TESTS,
      'apps/web/lib/events/confirmation-status.test.ts',
      'apps/web/tests/unit/events/insert.test.ts',
      'apps/web/tests/unit/testing/seed-test-data-import-boundary.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
    ]);
    expect(plan.selectedTests).not.toContain(
      'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts'
    );
    expect(plan.selectedTests).not.toContain(
      'apps/web/tests/e2e/golden-path.spec.ts'
    );
  });

  it.each(
    PREREQUISITE_TRAIN_CORNERS
  )('fails closed when the prerequisite train cornerstone %s is standalone', cornerstone => {
    expect(buildAffectedTestPlan([cornerstone]).mode).toBe('full');
  });

  it.each([
    '.github/workflows/ci.yml',
    'apps/web/tests/seed-test-data.ts',
    'apps/web/tests/e2e/claim-prebuilt.smoke.spec.ts',
    'apps/web/tests/e2e/golden-path.spec.ts',
  ])('fails closed when the prerequisite train global input %s is standalone', input => {
    expect(buildAffectedTestPlan([input]).mode).toBe('full');
  });

  it.each(
    PREREQUISITE_TRAIN_CORNERS
  )('fails closed when the prerequisite train is missing %s', missingCornerstone => {
    expect(
      buildAffectedTestPlan(
        PREREQUISITE_TRAIN_MANIFEST.filter(file => file !== missingCornerstone)
      ).mode
    ).toBe('full');
  });

  it.each([
    'apps/web/lib/unknown-prerequisite.ts',
    '.github/actions/unknown-prerequisite/action.yml',
  ])('fails closed when the prerequisite train includes unknown peer %s', peer => {
    expect(
      buildAffectedTestPlan([...PREREQUISITE_TRAIN_MANIFEST, peer]).mode
    ).toBe('full');
  });

  it('splits the full web suite into sequential bounded-memory shards', () => {
    const commands = buildFullSuiteCommands('2', 2);

    expect(commands).toEqual([
      [
        'pnpm',
        [
          '--filter',
          '@jovie/web',
          'exec',
          'vitest',
          'run',
          '--shard',
          '1/2',
          '--maxWorkers',
          '2',
        ],
      ],
      [
        'pnpm',
        [
          '--filter',
          '@jovie/web',
          'exec',
          'vitest',
          'run',
          '--shard',
          '2/2',
          '--maxWorkers',
          '2',
        ],
      ],
    ]);
  });

  it('keeps the Vercel congestion-control diff on its focused cross-runtime suites', () => {
    const plan = buildAffectedTestPlan(VERCEL_CONGESTION_CONTROL_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.relatedFiles).toEqual([]);
    expect(plan.selectedTests).toEqual([]);
    expect(plan.rootVitestTests).toEqual([
      '.github/scripts/cancel-stale-vercel-previews.test.mjs',
    ]);
    expect(plan.pythonTests).toEqual([
      'scripts/tests/test_vercel_prebuilt_deploy.py',
    ]);
    expect(buildSelectedTestCommands(plan, '2')).toEqual([
      [
        'pnpm',
        [
          'exec',
          'vitest',
          'run',
          '--root',
          '.',
          '--config',
          'apps/web/vitest.config.mts',
          '.github/scripts/cancel-stale-vercel-previews.test.mjs',
          '--maxWorkers',
          '2',
        ],
      ],
      [
        'python3',
        ['-m', 'pytest', 'scripts/tests/test_vercel_prebuilt_deploy.py', '-q'],
      ],
    ]);
  });

  it.each(
    VERCEL_CONGESTION_CONTROL_MANIFEST
  )('fails closed when the Vercel congestion-control input %s is standalone', input => {
    expect(buildAffectedTestPlan([input]).mode).toBe('full');
  });

  it.each(
    VERCEL_CONGESTION_CONTROL_MANIFEST
  )('fails closed when the Vercel congestion-control diff is missing %s', missingInput => {
    expect(
      buildAffectedTestPlan(
        VERCEL_CONGESTION_CONTROL_MANIFEST.filter(file => file !== missingInput)
      ).mode
    ).toBe('full');
  });

  it.each([
    '.github/scripts/unknown-vercel-control.mjs',
    'scripts/tests/test_unknown_vercel_control.py',
  ])('fails closed when the Vercel congestion-control diff includes unknown peer %s', peer => {
    expect(
      buildAffectedTestPlan([...VERCEL_CONGESTION_CONTROL_MANIFEST, peer]).mode
    ).toBe('full');
  });

  it('selects the selector regression for the exact selector implementation pair', () => {
    const plan = buildAffectedTestPlan(AFFECTED_TEST_SELECTOR_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
    ]);
    expect(buildSelectedTestCommands(plan, '2')).toEqual([
      [
        'pnpm',
        [
          'exec',
          'vitest',
          '--root',
          'scripts',
          '--config',
          'vitest.config.mts',
          'run',
          'lib/__tests__/automation-verify.test.mjs',
          '--maxWorkers',
          '2',
        ],
      ],
    ]);
  });

  it('keeps the golden-path smoke contract repair on focused coverage', () => {
    const plan = buildAffectedTestPlan(GOLDEN_PATH_SMOKE_CONTRACT_REPAIR_DIFF);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
    ]);
    expect(plan.selectedTests).not.toContain(
      'apps/web/tests/e2e/golden-path.spec.ts'
    );
  });

  it('keeps the authenticated accessibility repair on focused unit coverage', () => {
    const plan = buildAffectedTestPlan([
      ...AUTHENTICATED_A11Y_REPAIR_CORE,
      ...AFFECTED_TEST_SELECTOR_MANIFEST,
    ]);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/chat/ChatInput.aria.test.tsx',
      'apps/web/tests/unit/chat/ChatLoading.test.tsx',
      'apps/web/tests/unit/chat/chat-composer-system-b-style-guard.test.ts',
      'apps/web/tests/unit/dashboard/DashboardNav.test.tsx',
      'apps/web/tests/unit/onboarding/OnboardingChat.turnstile.test.tsx',
      'apps/web/tests/unit/sidebar-row-alignment.test.tsx',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
    ]);
  });

  it('rejects case-sensitive lowercase chat input contracts in the repair surface', () => {
    const repoRoot = resolve(import.meta.dirname, '../../..');

    for (const file of AUTHENTICATED_A11Y_REPAIR_CORE) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      for (const pattern of CASE_SENSITIVE_LOWERCASE_CHAT_INPUT_PATTERNS) {
        expect(source, `${file} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it.each(
    AUTHENTICATED_A11Y_REPAIR_CORE
  )('fails closed when the authenticated accessibility repair is missing %s', missingInput => {
    expect(
      buildAffectedTestPlan([
        ...AUTHENTICATED_A11Y_REPAIR_CORE.filter(file => file !== missingInput),
        ...AFFECTED_TEST_SELECTOR_MANIFEST,
      ]).mode
    ).toBe('full');
  });

  it('keeps persisted auth fixture repairs on focused non-retryable coverage', () => {
    const plan = buildAffectedTestPlan(PERSISTED_AUTH_FIXTURE_REPAIR_DIFF);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/tests/unit/api/dev/test-auth-routes.test.ts',
      'apps/web/tests/unit/app/hud-page.test.ts',
      'apps/web/tests/unit/e2e/auth-helper.test.ts',
      'apps/web/tests/unit/lib/auth/dev-test-auth.server.test.ts',
      'apps/web/tests/unit/lib/auth/test-mode.test.ts',
      'apps/web/tests/unit/lib/testing/test-user-provision.server.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/hermes/lib/__tests__/ci-failure-classifier.test.ts',
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
    ]);
  });

  it.each(
    AFFECTED_TEST_SELECTOR_MANIFEST
  )('fails closed when the affected-test selector input %s is standalone', input => {
    expect(buildAffectedTestPlan([input]).mode).toBe('full');
  });

  it('fails closed when the affected-test selector diff includes an unknown peer', () => {
    expect(
      buildAffectedTestPlan([
        ...AFFECTED_TEST_SELECTOR_MANIFEST,
        'scripts/lib/unknown-selector-helper.mjs',
      ]).mode
    ).toBe('full');
  });

  it('selects the Graphite source-gate regression and selector self-test for the exact repair signature', () => {
    const plan = buildAffectedTestPlan(GTMQ_SOURCE_GATE_REAPER_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.pythonTests).toEqual(['scripts/tests/test_gh_retry.py']);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
    ]);
    expect(buildSelectedTestCommands(plan, '2')).toEqual([
      [
        'pnpm',
        [
          'exec',
          'vitest',
          '--root',
          'scripts',
          '--config',
          'vitest.config.mts',
          'run',
          'lib/__tests__/automation-verify.test.mjs',
          '--maxWorkers',
          '2',
        ],
      ],
      ['python3', ['-m', 'pytest', 'scripts/tests/test_gh_retry.py', '-q']],
      [
        'pnpm',
        [
          '--filter',
          '@jovie/web',
          'exec',
          'vitest',
          'run',
          'tests/unit/ci/runner-setup-action.test.ts',
          '--passWithNoTests',
          '--maxWorkers',
          '2',
        ],
      ],
    ]);
  });

  it.each([
    { manifest: PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST },
    { manifest: PERFORMANCE_PROFILER_REPAIR_MANIFEST },
  ])('selects bounded profiler and Gem regressions for an exact repair signature', ({
    manifest,
  }) => {
    const plan = buildAffectedTestPlan(manifest);

    expect(plan.mode).toBe('selected');
    expect(plan.selectedTests).toEqual([
      'apps/web/scripts/test-performance-profiler.test.ts',
      'apps/web/tests/unit/app/exp-drift-lint-guard.test.ts',
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
      'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
      'apps/web/tests/unit/lib/feature-flags-registry.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
      ...(manifest.length === PERFORMANCE_PROFILER_REPAIR_MANIFEST.length
        ? ['scripts/lib/__tests__/automation-verify.test.mjs']
        : []),
    ]);
  });

  it('keeps the Layout Guard contract repair on its focused cross-runtime regressions', () => {
    const plan = buildAffectedTestPlan(LAYOUT_GUARD_CONTRACT_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.rootVitestTests).toEqual([
      '.github/scripts/layout-guard-manifest.test.mjs',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
    ]);
  });

  it('keeps the Neon rerun artifact repair on focused workflow and Gem regressions', () => {
    const plan = buildAffectedTestPlan(NEON_ATTEMPT_ARTIFACT_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/ci/deploy-workflow.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
    ]);
  });

  it.each(
    NEON_ATTEMPT_ARTIFACT_MANIFEST
  )('fails closed when the Neon rerun artifact repair is missing %s', missingInput => {
    expect(
      buildAffectedTestPlan(
        NEON_ATTEMPT_ARTIFACT_MANIFEST.filter(file => file !== missingInput)
      ).mode
    ).toBe('full');
  });

  it('fails closed when the Neon rerun artifact repair includes an unknown peer', () => {
    expect(
      buildAffectedTestPlan([
        ...NEON_ATTEMPT_ARTIFACT_MANIFEST,
        'scripts/hermes/lib/unknown-neon-artifact-helper.ts',
      ]).mode
    ).toBe('full');
  });

  it.each(
    LAYOUT_GUARD_CONTRACT_MANIFEST
  )('fails closed when the Layout Guard contract repair is missing %s', missingInput => {
    expect(
      buildAffectedTestPlan(
        LAYOUT_GUARD_CONTRACT_MANIFEST.filter(file => file !== missingInput)
      ).mode
    ).toBe('full');
  });

  it.each(
    GTMQ_SOURCE_GATE_REAPER_MANIFEST
  )('fails closed when the Graphite source-gate repair is missing %s', missingInput => {
    expect(
      buildAffectedTestPlan(
        GTMQ_SOURCE_GATE_REAPER_MANIFEST.filter(file => file !== missingInput)
      ).mode
    ).toBe('full');
  });

  it.each(
    PERFORMANCE_PROFILER_REPAIR_ANCHORS
  )('fails closed when the profiler repair input %s is standalone', input => {
    expect(buildAffectedTestPlan([input]).mode).toBe('full');
  });

  it('fails closed when the profiler repair plus selector signature is partial', () => {
    expect(
      buildAffectedTestPlan(
        PERFORMANCE_PROFILER_REPAIR_MANIFEST.filter(
          file => file !== 'scripts/lib/__tests__/automation-verify.test.mjs'
        )
      ).mode
    ).toBe('full');
  });

  it('fails closed when the profiler repair signature includes an unknown peer', () => {
    expect(
      buildAffectedTestPlan([
        ...PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST,
        'scripts/hermes/lib/unknown-profiler-helper.ts',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when the Graphite source-gate repair includes an unknown peer', () => {
    expect(
      buildAffectedTestPlan([
        ...GTMQ_SOURCE_GATE_REAPER_MANIFEST,
        'scripts/unknown-graphite-controller.sh',
      ]).mode
    ).toBe('full');
  });

  it('selects runner setup and CI controls for the exact prerequisite contract', () => {
    const plan = buildAffectedTestPlan(RUNNER_PREREQUISITE_CONTRACT_MANIFEST);

    expect(plan.mode).toBe('selected');
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/ci/runner-setup-action.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/lib/__tests__/ci-harness.test.mjs',
      'scripts/lib/__tests__/ci-duration-ratchet.test.mjs',
      'scripts/lib/__tests__/ci-branching-guard.test.mjs',
      'scripts/lib/__tests__/merge-queue-guard.test.mjs',
      'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
    ]);
  });

  it('composes the runner prerequisite and Visual QA race repairs on focused suites', () => {
    const plan = buildAffectedTestPlan(
      RUNNER_PREREQUISITE_VISUAL_QA_REPAIR_MANIFEST
    );

    expect(plan.mode).toBe('selected');
    expect(plan.mandatoryTests).toEqual([
      'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts',
      'apps/web/tests/unit/ci/runner-setup-action.test.ts',
    ]);
    expect(plan.scriptVitestTests).toEqual([
      'scripts/lib/__tests__/automation-verify.test.mjs',
      'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
      'scripts/lib/__tests__/ci-harness.test.mjs',
      'scripts/lib/__tests__/ci-duration-ratchet.test.mjs',
      'scripts/lib/__tests__/ci-branching-guard.test.mjs',
      'scripts/lib/__tests__/merge-queue-guard.test.mjs',
      'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
    ]);
  });

  it.each(
    RUNNER_PREREQUISITE_CONTRACT_MANIFEST
  )('fails closed when the runner prerequisite contract is missing %s', missingInput => {
    expect(
      buildAffectedTestPlan(
        RUNNER_PREREQUISITE_CONTRACT_MANIFEST.filter(
          file => file !== missingInput
        )
      ).mode
    ).toBe('full');
  });

  it('fails closed when the runner prerequisite contract includes an unknown peer', () => {
    expect(
      buildAffectedTestPlan([
        ...RUNNER_PREREQUISITE_CONTRACT_MANIFEST,
        '.github/runner-image/unknown-bootstrap.sh',
      ]).mode
    ).toBe('full');
  });

  it('fails closed to the full suite for global test inputs', () => {
    expect(buildAffectedTestPlan(['apps/web/tests/setup.ts']).mode).toBe(
      'full'
    );
  });

  it('fails closed when a web source has no test lane', () => {
    expect(buildAffectedTestPlan(['apps/web/lib/unknown.ts']).mode).toBe(
      'full'
    );
  });

  it('fails closed when an unknown source is mixed with a direct test', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/lib/unknown.ts',
        'apps/web/tests/unit/known.test.ts',
      ]).mode
    ).toBe('full');
  });

  it('fails closed when an unknown source is mixed with a known profile surface', () => {
    expect(
      buildAffectedTestPlan([
        'apps/web/lib/unknown.ts',
        'apps/web/components/features/profile/ProfileHeroCard.tsx',
      ]).mode
    ).toBe('full');
  });

  it('classifies a deleted unknown source as full-suite work', () => {
    expect(buildAffectedTestPlan(['apps/web/lib/deleted.ts']).mode).toBe(
      'full'
    );
    expect(runner).toContain('--diff-filter=ACDMR');
  });

  it.each([
    'SIGINT',
    'SIGTERM',
  ])('terminates the owned child process group on %s', async signal => {
    if (process.platform === 'win32') return;
    const dir = mkdtempSync(resolve(tmpdir(), 'affected-process-group-'));
    const pidFile = resolve(dir, 'grandchild.pid');
    const childCode = `
        const { spawn } = require('node:child_process');
        const { writeFileSync } = require('node:fs');
        const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
        setInterval(() => {}, 1000);
      `;
    const wrapperCode = `
        import { runCommand } from ${JSON.stringify(
          new URL('../../run-affected-tests.mjs', import.meta.url).href
        )};
        await runCommand(process.execPath, ['-e', ${JSON.stringify(childCode)}]);
      `;
    const wrapper = spawn(
      process.execPath,
      ['--input-type=module', '-e', wrapperCode],
      { stdio: 'ignore' }
    );
    let grandchildPid;
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          const candidatePid = Number(readFileSync(pidFile, 'utf8'));
          if (Number.isInteger(candidatePid) && candidatePid > 0) {
            grandchildPid = candidatePid;
            break;
          }
          await new Promise(resolveWait => setTimeout(resolveWait, 25));
        } catch {
          await new Promise(resolveWait => setTimeout(resolveWait, 25));
        }
      }
      expect(grandchildPid).toBeGreaterThan(0);
      wrapper.kill(signal);
      await Promise.race([
        new Promise(resolveExit => wrapper.once('exit', resolveExit)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('wrapper did not exit')), 5000)
        ),
      ]);
      const exitDeadline = Date.now() + 5000;
      let alive = true;
      while (alive && Date.now() < exitDeadline) {
        try {
          process.kill(grandchildPid, 0);
          await new Promise(resolveWait => setTimeout(resolveWait, 25));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
      if (wrapper.exitCode === null) wrapper.kill('SIGKILL');
      if (grandchildPid) {
        try {
          process.kill(grandchildPid, 'SIGKILL');
        } catch {}
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
