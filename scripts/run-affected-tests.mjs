#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
// Full-suite shards are deliberately independent so one Vitest process cannot
// retain the entire suite in memory. They still need a finite wall-clock
// budget: an otherwise silent shard used to leave the pre-push gate running
// indefinitely. Thirty minutes accommodates the slowest observed shard while
// failing closed on a genuinely stuck process.
const DEFAULT_SHARD_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_PROGRESS_INTERVAL_MS = 60 * 1000;
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
// Homepage System B style guards read the homepage surface (page/component
// sources and app/(home)/home.css) from disk, so Vitest's module graph never
// connects them to those inputs. A source/CSS change that breaks a guard
// otherwise sails through affected-test selection and only fails on the
// merge-group full suite (PR #15566 looped enroll→group-red 3× on 2026-08-06).
const HOMEPAGE_SYSTEM_B_STYLE_GUARD_TESTS = [
  'apps/web/tests/unit/home/bento-feature-grid-system-b-style-guard.test.tsx',
  'apps/web/tests/unit/home/claim-handle-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/dead-home-actions-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/home-profile-showcase-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-artist-outcomes-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-closed-loop-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-command-center-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-faq-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-footer-cta-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-grid-spine-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-hero-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-pricing-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-product-statement-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-trust-strip-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/mounted-home-workspace-system-b-style-guard.test.ts',
  'apps/web/tests/unit/home/release-mode-mock-card-system-b-style-guard.test.tsx',
  'apps/web/tests/unit/home/release-operating-system-showcase-system-b-style-guard.test.tsx',
];
const HOMEPAGE_SYSTEM_B_GUARD_EXACT_INPUTS = new Set([
  'apps/web/components/marketing/ClientFaqAccordion.tsx',
  'apps/web/components/marketing/FaqSection.tsx',
]);
const isHomepageSystemBGuardInput = file =>
  file.startsWith('apps/web/app/(home)/') ||
  file.startsWith('apps/web/components/homepage/') ||
  file.startsWith('apps/web/components/features/home/') ||
  file.startsWith('apps/web/components/marketing/homepage-v2/') ||
  HOMEPAGE_SYSTEM_B_GUARD_EXACT_INPUTS.has(file);
const AFFECTED_TEST_SELECTOR_MANIFEST = new Set([
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
]);
const AFFECTED_TEST_SELECTOR_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const EVENT_DRIVEN_SHIPPER_PRIMARY_MANIFEST = new Set([
  '.github/workflows/fleet-gate-refresh.yml',
  'scripts/hermes/launchd/README.md',
  'scripts/hermes/launchd/co.jovie.hermes.cron-codex-issue-shipper.plist.template',
  'scripts/hermes/shipper-gated-entrypoint.py',
  'scripts/hermes/tests/gem-priority-gate.test.py',
  'scripts/lib/__tests__/hermes-launchd.test.mjs',
]);
const EVENT_DRIVEN_SHIPPER_MANIFEST = new Set([
  ...EVENT_DRIVEN_SHIPPER_PRIMARY_MANIFEST,
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
]);
const CI_CONTROL_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/lib/__tests__/ci-harness.test.mjs',
  'scripts/lib/__tests__/ci-duration-ratchet.test.mjs',
  'scripts/lib/__tests__/ci-branching-guard.test.mjs',
  'scripts/lib/__tests__/merge-queue-guard.test.mjs',
  'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
  'scripts/lib/__tests__/auto-ready-agent-drafts.test.mjs',
  'scripts/lib/__tests__/eval-main-health-action.test.mjs',
  'scripts/lib/__tests__/pr-check-failures.test.mjs',
  'scripts/lib/__tests__/pr-conflict-handler.test.mjs',
  'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs',
  'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
  'scripts/lib/__tests__/lockfile-specifier-preflight.test.mjs',
  'scripts/lib/__tests__/sentry-autofix-workflow-contract.test.mjs',
  'scripts/lib/__tests__/golden-path-lock.test.mjs',
  'scripts/lib/__tests__/golden-path-prod-autofix-workflow-contract.test.mjs',
  'scripts/lib/__tests__/queue-deferral-receipt.test.mjs',
  'scripts/lib/__tests__/queue-deferred-release.test.mjs',
  'scripts/lib/__tests__/queue-deferred-release-admission.test.mjs',
  'scripts/lib/__tests__/setup-worktree-health.test.mjs',
];
const MERGE_QUEUE_CONTROLLER_INPUTS = new Set([
  '.github/workflows/merge-queue-autoenroll.yml',
  'scripts/ci-merge-queue-check.mjs',
  'scripts/drain-pr-queue.sh',
  'scripts/lib/merge-queue-guard.mjs',
  'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs',
  'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
  'scripts/lib/__tests__/merge-queue-backend.test.mjs',
  'scripts/lib/__tests__/merge-queue-guard.test.mjs',
  'scripts/lib/__tests__/pr-check-failures.test.mjs',
  'scripts/merge-queue-backend.mjs',
  'scripts/tests/test_gh_retry.py',
]);
const MERGE_QUEUE_CONTROLLER_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs',
  'scripts/lib/__tests__/merge-group-workflow-contract.test.mjs',
  'scripts/lib/__tests__/merge-queue-backend.test.mjs',
  'scripts/lib/__tests__/merge-queue-guard.test.mjs',
  'scripts/lib/__tests__/pr-check-failures.test.mjs',
];
const MERGE_QUEUE_CONTROLLER_PYTHON_TESTS = ['scripts/tests/test_gh_retry.py'];
const EVENT_DRIVEN_SHIPPER_SCRIPT_TESTS = [
  ...CI_CONTROL_SCRIPT_TESTS,
  'scripts/lib/__tests__/hermes-launchd.test.mjs',
];
const EVENT_DRIVEN_SHIPPER_PYTHON_TESTS = [
  'scripts/hermes/tests/gem-priority-gate.test.py',
];
const DELIVERY_LIVENESS_LANE = new Set([
  'scripts/hermes/jobs/codex-issue-shipper.ts',
  'scripts/hermes/jobs/delivery-liveness-watchdog.ts',
  'scripts/hermes/launchd/README.md',
  'scripts/hermes/launchd/co.jovie.hermes.delivery-liveness-watchdog.plist.template',
  'scripts/hermes/lib/__tests__/codex-issue-shipper-routing.test.ts',
  'scripts/hermes/lib/__tests__/delivery-liveness.test.ts',
  'scripts/hermes/lib/codex-issue-shipper.ts',
  'scripts/hermes/lib/delivery-liveness.ts',
  'scripts/lib/__tests__/codex-issue-shipper.test.mjs',
]);
const DELIVERY_LIVENESS_TESTS = [
  'scripts/hermes/lib/__tests__/codex-issue-shipper-routing.test.ts',
  'scripts/hermes/lib/__tests__/delivery-liveness.test.ts',
  'scripts/lib/__tests__/codex-issue-shipper.test.mjs',
  'scripts/lib/__tests__/hermes-launchd.test.mjs',
];
const SYMPHONY_THROUGHPUT_CONTROL_MANIFEST = new Set([
  '.husky/pre-push',
  'scripts/automation-verify.sh',
  'scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs',
  'scripts/backlog-orchestrator/__tests__/deterministic-gates.test.mjs',
  'scripts/backlog-orchestrator/admitter.mjs',
  'scripts/backlog-orchestrator/backlog-orchestrator.mjs',
  'scripts/backlog-orchestrator/deterministic-gates.mjs',
  'scripts/hermes/codex-rotate',
  'scripts/hermes/tests/codex-rotate.test.py',
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/lib/__tests__/pre-push-gate.test.mjs',
  'scripts/run-affected-tests.mjs',
]);
const SYMPHONY_THROUGHPUT_NODE_TESTS = [
  'scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs',
  'scripts/backlog-orchestrator/__tests__/deterministic-gates.test.mjs',
];
const SYMPHONY_THROUGHPUT_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/lib/__tests__/pre-push-gate.test.mjs',
];
const SYMPHONY_THROUGHPUT_PYTHON_TESTS = [
  'scripts/hermes/tests/codex-rotate.test.py',
];
const FLEET_PROMOTION_GATE_INPUTS = new Set([
  'scripts/hermes/gem-priority-gate.py',
  'scripts/hermes/tests/gem-priority-gate.test.py',
]);
const FLEET_PROMOTION_GATE_LANE = new Set([
  ...FLEET_PROMOTION_GATE_INPUTS,
  'apps/web/tests/unit/api/health/deploy.critical.test.ts',
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/run-affected-tests.mjs',
]);
const FLEET_PROMOTION_GATE_PYTHON_TESTS = [
  'scripts/hermes/tests/gem-priority-gate.test.py',
];
const AUTHENTICATED_A11Y_REPAIR_CORE = new Set([
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
]);
const PR_SIZE_GUARD_MANIFEST = new Set([
  '.github/workflows/pr-size-guard.yml',
  'scripts/lib/pr-size-guard-policy.mjs',
  'scripts/lib/__tests__/pr-size-guard-policy.test.mjs',
]);
const PR_SIZE_GUARD_TESTS = [
  'scripts/lib/__tests__/pr-size-guard-policy.test.mjs',
];
const GOLDEN_PATH_SMOKE_CONTRACT_CORE = new Set([
  'apps/web/tests/e2e/golden-path.spec.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
]);
const NEON_ATTEMPT_ARTIFACT_MANIFEST = new Set([
  '.github/workflows/ci.yml',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
]);
const NEON_ATTEMPT_ARTIFACT_TESTS = [
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
];
const NEON_ATTEMPT_ARTIFACT_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST = new Set([
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
]);
const GOLDEN_PATH_SMOKE_CONTRACT_TESTS = [
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
];
const GOLDEN_PATH_SMOKE_CONTRACT_SCRIPT_TESTS = [
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const PERFORMANCE_PROFILER_REPAIR_ANCHORS = new Set([
  'apps/web/scripts/test-performance-guard.ts',
  'apps/web/scripts/test-performance-profiler.test.ts',
  'apps/web/scripts/test-performance-profiler.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
]);
const PERFORMANCE_PROFILER_REPAIR_MANIFEST = new Set([
  ...PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST,
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
]);
const SCANNER_LOAD_REPAIR_PRIMARY_MANIFEST = new Set([
  '.github/workflows/agent-pipeline.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/merge-queue-autoenroll.yml',
  'apps/web/tests/unit/analytics-metrics-layer-guard.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
  'apps/web/tests/unit/design-system/destructive-confirm-dialog-audit.test.ts',
  'apps/web/tests/unit/metrics-layer-guard-logic.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/lib/__tests__/merge-queue-backend.test.mjs',
]);
const SCANNER_LOAD_REPAIR_MANIFEST = new Set([
  ...SCANNER_LOAD_REPAIR_PRIMARY_MANIFEST,
  ...AFFECTED_TEST_SELECTOR_MANIFEST,
]);
const SCANNER_LOAD_REPAIR_WEB_TESTS = [
  'apps/web/tests/unit/analytics-metrics-layer-guard.test.ts',
  'apps/web/tests/unit/ci/deploy-workflow.test.ts',
  'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
  'apps/web/tests/unit/design-system/destructive-confirm-dialog-audit.test.ts',
];
const SCANNER_LOAD_REPAIR_SCRIPT_TESTS = [
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/lib/__tests__/merge-queue-backend.test.mjs',
];
const PERFORMANCE_PROFILER_REPAIR_WEB_TESTS = [
  'apps/web/scripts/test-performance-profiler.test.ts',
];
const PERFORMANCE_PROFILER_REPAIR_SCRIPT_TESTS = [
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const PERSISTED_AUTH_FIXTURE_REPAIR_CORE = new Set([
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
]);
const PERSISTED_AUTH_FIXTURE_SCRIPT_TESTS = [
  'scripts/hermes/lib/__tests__/ci-failure-classifier.test.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const VISUAL_QA_DIFF_ARTIFACTS_SOURCE =
  'apps/web/lib/agent-os/visual-qa/diff-artifacts.ts';
const VISUAL_QA_DIFF_ARTIFACTS_TEST =
  'apps/web/tests/unit/agent-os/visual-qa/diff-artifacts.test.ts';
const VISUAL_QA_DIFF_ARTIFACTS_MANIFEST = new Set([
  VISUAL_QA_DIFF_ARTIFACTS_SOURCE,
  VISUAL_QA_DIFF_ARTIFACTS_TEST,
]);
const MOBILE_OVERFLOW_NAVIGATION_RACE_MANIFEST = new Set([
  'apps/web/tests/e2e/mobile-overflow.spec.ts',
  'apps/web/tests/e2e/utils/mobile-overflow.ts',
  'apps/web/tests/unit/e2e/mobile-overflow-navigation.test.ts',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
]);
const MOBILE_OVERFLOW_NAVIGATION_RACE_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
];
const RUNNER_IO_PRESSURE_MANIFEST = new Set([
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
]);
const RUNNER_IO_PRESSURE_V2_MANIFEST = new Set([
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
]);
const RUNNER_IO_PRESSURE_SCRIPT_TESTS = [
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/lib/__tests__/automation-verify.test.mjs',
];
const RUNNER_PREREQUISITE_CONTRACT_TESTS = [
  'apps/web/tests/unit/ci/runner-setup-action.test.ts',
];
const RUNNER_PREREQUISITE_CONTROL_TESTS = [
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/lib/__tests__/ci-harness.test.mjs',
  'scripts/lib/__tests__/ci-duration-ratchet.test.mjs',
  'scripts/lib/__tests__/ci-branching-guard.test.mjs',
  'scripts/lib/__tests__/merge-queue-guard.test.mjs',
  'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
];
const RUNNER_PREREQUISITE_CONTRACT_MANIFEST = new Set([
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
  ...RUNNER_PREREQUISITE_CONTRACT_TESTS,
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
]);
const RUNNER_PREREQUISITE_VISUAL_QA_REPAIR_MANIFEST = new Set([
  ...RUNNER_PREREQUISITE_CONTRACT_MANIFEST,
  ...VISUAL_QA_DIFF_ARTIFACTS_MANIFEST,
]);
const LAYOUT_GUARD_CONTRACT_MANIFEST = new Set([
  '.github/scripts/layout-guard-manifest.mjs',
  '.github/scripts/layout-guard-manifest.test.mjs',
  '.github/workflows/ci.yml',
  'scripts/hermes/jobs/ci-failure-diagnosis.ts',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/__tests__/automation-verify.test.mjs',
]);
const LAYOUT_GUARD_CONTRACT_ROOT_TESTS = [
  '.github/scripts/layout-guard-manifest.test.mjs',
];
const LAYOUT_GUARD_CONTRACT_SCRIPT_TESTS = [
  'scripts/lib/__tests__/automation-verify.test.mjs',
  'scripts/hermes/lib/__tests__/ci-failure-diagnosis.test.ts',
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

export function buildAffectedTestPlan(
  changedFiles,
  { isFileAvailable = file => existsSync(resolve(REPO_ROOT, file)) } = {}
) {
  const files = unique(changedFiles.filter(Boolean)).sort();
  if (files.some(file => GLOBAL_TEST_INPUTS.has(file))) {
    return { mode: 'full', relatedFiles: [], mandatoryTests: [] };
  }
  const isExactSymphonyThroughputControl =
    files.length === SYMPHONY_THROUGHPUT_CONTROL_MANIFEST.size &&
    files.every(file => SYMPHONY_THROUGHPUT_CONTROL_MANIFEST.has(file));
  if (isExactSymphonyThroughputControl) {
    return {
      mode: 'selected',
      relatedFiles: [],
      mandatoryTests: [],
      selectedTests: [],
      rootVitestTests: [],
      pythonTests: [],
      pythonUnittestTests: SYMPHONY_THROUGHPUT_PYTHON_TESTS,
      scriptVitestTests: SYMPHONY_THROUGHPUT_SCRIPT_TESTS,
      nodeTests: SYMPHONY_THROUGHPUT_NODE_TESTS,
    };
  }
  const deliveryLivenessInputCount = files.filter(file =>
    DELIVERY_LIVENESS_LANE.has(file)
  ).length;
  const earlySelectorInputCount = files.filter(file =>
    AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
  ).length;
  const mergeQueueControllerInputCount = files.filter(file =>
    MERGE_QUEUE_CONTROLLER_INPUTS.has(file)
  ).length;
  const isBoundedMergeQueueControllerChange =
    mergeQueueControllerInputCount > 0 &&
    files.every(
      file =>
        MERGE_QUEUE_CONTROLLER_INPUTS.has(file) ||
        AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
    ) &&
    (earlySelectorInputCount === 0 ||
      earlySelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size);
  if (isBoundedMergeQueueControllerChange) {
    return {
      mode: 'selected',
      relatedFiles: [],
      mandatoryTests: [],
      selectedTests: [],
      rootVitestTests: [],
      pythonTests: MERGE_QUEUE_CONTROLLER_PYTHON_TESTS,
      pythonUnittestTests: [],
      scriptVitestTests: MERGE_QUEUE_CONTROLLER_SCRIPT_TESTS,
      nodeTests: [],
    };
  }
  const isBoundedDeliveryLivenessChange =
    deliveryLivenessInputCount > 0 &&
    files.every(
      file =>
        DELIVERY_LIVENESS_LANE.has(file) ||
        AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
    ) &&
    (earlySelectorInputCount === 0 ||
      earlySelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size);
  if (isBoundedDeliveryLivenessChange) {
    return {
      mode: 'selected',
      relatedFiles: [],
      mandatoryTests: [],
      selectedTests: [],
      rootVitestTests: [],
      pythonTests: [],
      pythonUnittestTests: [],
      scriptVitestTests: unique([
        ...DELIVERY_LIVENESS_TESTS,
        ...(earlySelectorInputCount > 0 ? AFFECTED_TEST_SELECTOR_TESTS : []),
      ]),
      nodeTests: [],
    };
  }
  const isExactEventDrivenShipperPrimary =
    files.length === EVENT_DRIVEN_SHIPPER_PRIMARY_MANIFEST.size &&
    files.every(file => EVENT_DRIVEN_SHIPPER_PRIMARY_MANIFEST.has(file));
  const isExactEventDrivenShipperWithSelector =
    files.length === EVENT_DRIVEN_SHIPPER_MANIFEST.size &&
    files.every(file => EVENT_DRIVEN_SHIPPER_MANIFEST.has(file));
  const isExactEventDrivenShipper =
    isExactEventDrivenShipperPrimary || isExactEventDrivenShipperWithSelector;
  const isBoundedFleetPromotionGateChange =
    files.some(file => FLEET_PROMOTION_GATE_INPUTS.has(file)) &&
    files.every(file => FLEET_PROMOTION_GATE_LANE.has(file));
  const hasUnboundedFleetPromotionGateChange =
    files.some(file => FLEET_PROMOTION_GATE_INPUTS.has(file)) &&
    !isBoundedFleetPromotionGateChange &&
    !isExactEventDrivenShipper;
  if (isBoundedFleetPromotionGateChange) {
    return {
      mode: 'selected',
      relatedFiles: [],
      mandatoryTests: [],
      selectedTests: ['apps/web/tests/unit/api/health/deploy.critical.test.ts'],
      rootVitestTests: [],
      pythonTests: [],
      pythonUnittestTests: FLEET_PROMOTION_GATE_PYTHON_TESTS,
      scriptVitestTests: ['scripts/lib/__tests__/automation-verify.test.mjs'],
      nodeTests: [],
    };
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
  const authenticatedA11yRepairInputCount = files.filter(file =>
    AUTHENTICATED_A11Y_REPAIR_CORE.has(file)
  ).length;
  const isExactAuthenticatedA11yRepair =
    authenticatedA11yRepairInputCount === AUTHENTICATED_A11Y_REPAIR_CORE.size &&
    files.every(
      file =>
        AUTHENTICATED_A11Y_REPAIR_CORE.has(file) ||
        AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
    ) &&
    (affectedTestSelectorInputCount === 0 ||
      affectedTestSelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size);
  const prSizeGuardInputCount = files.filter(file =>
    PR_SIZE_GUARD_MANIFEST.has(file)
  ).length;
  const isExactPrSizeGuard =
    prSizeGuardInputCount === PR_SIZE_GUARD_MANIFEST.size &&
    files.length === PR_SIZE_GUARD_MANIFEST.size;
  const isExactPrSizeGuardWithSelector =
    prSizeGuardInputCount === PR_SIZE_GUARD_MANIFEST.size &&
    affectedTestSelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size &&
    files.length ===
      PR_SIZE_GUARD_MANIFEST.size + AFFECTED_TEST_SELECTOR_MANIFEST.size;
  const goldenPathSmokeContractInputCount = files.filter(file =>
    GOLDEN_PATH_SMOKE_CONTRACT_CORE.has(file)
  ).length;
  const isExactGoldenPathSmokeContractRepair =
    goldenPathSmokeContractInputCount ===
      GOLDEN_PATH_SMOKE_CONTRACT_CORE.size &&
    files.every(
      file =>
        GOLDEN_PATH_SMOKE_CONTRACT_CORE.has(file) ||
        AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
    ) &&
    affectedTestSelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size;
  const neonAttemptArtifactInputCount = files.filter(file =>
    NEON_ATTEMPT_ARTIFACT_MANIFEST.has(file)
  ).length;
  const isExactNeonAttemptArtifactRepair =
    neonAttemptArtifactInputCount === NEON_ATTEMPT_ARTIFACT_MANIFEST.size &&
    files.length === NEON_ATTEMPT_ARTIFACT_MANIFEST.size;
  const isExactPerformanceProfilerRepairPrimary =
    files.length === PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST.size &&
    files.every(file => PERFORMANCE_PROFILER_REPAIR_PRIMARY_MANIFEST.has(file));
  const isExactPerformanceProfilerRepairWithSelectorLegacy =
    files.length === PERFORMANCE_PROFILER_REPAIR_MANIFEST.size &&
    files.every(file => PERFORMANCE_PROFILER_REPAIR_MANIFEST.has(file));
  const isExactScannerLoadRepairPrimary =
    files.length === SCANNER_LOAD_REPAIR_PRIMARY_MANIFEST.size &&
    files.every(file => SCANNER_LOAD_REPAIR_PRIMARY_MANIFEST.has(file));
  const isExactScannerLoadRepairWithSelector =
    files.length === SCANNER_LOAD_REPAIR_MANIFEST.size &&
    files.every(file => SCANNER_LOAD_REPAIR_MANIFEST.has(file));
  const isExactPerformanceProfilerRepairWithSelector =
    isExactPerformanceProfilerRepairWithSelectorLegacy ||
    isExactScannerLoadRepairWithSelector;
  const isExactPerformanceProfilerRepair =
    isExactPerformanceProfilerRepairPrimary ||
    isExactPerformanceProfilerRepairWithSelectorLegacy ||
    isExactScannerLoadRepairPrimary ||
    isExactScannerLoadRepairWithSelector;
  const persistedAuthFixtureInputCount = files.filter(file =>
    PERSISTED_AUTH_FIXTURE_REPAIR_CORE.has(file)
  ).length;
  const isExactPersistedAuthFixtureRepair =
    persistedAuthFixtureInputCount ===
      PERSISTED_AUTH_FIXTURE_REPAIR_CORE.size &&
    files.every(
      file =>
        PERSISTED_AUTH_FIXTURE_REPAIR_CORE.has(file) ||
        AFFECTED_TEST_SELECTOR_MANIFEST.has(file)
    ) &&
    (affectedTestSelectorInputCount === 0 ||
      affectedTestSelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size);
  const visualQaDiffArtifactsInputCount = files.filter(file =>
    VISUAL_QA_DIFF_ARTIFACTS_MANIFEST.has(file)
  ).length;
  const isExactVisualQaSelectorRepair =
    affectedTestSelectorInputCount === AFFECTED_TEST_SELECTOR_MANIFEST.size &&
    visualQaDiffArtifactsInputCount ===
      VISUAL_QA_DIFF_ARTIFACTS_MANIFEST.size &&
    files.length ===
      AFFECTED_TEST_SELECTOR_MANIFEST.size +
        VISUAL_QA_DIFF_ARTIFACTS_MANIFEST.size;
  const mobileOverflowNavigationRaceInputCount = files.filter(file =>
    MOBILE_OVERFLOW_NAVIGATION_RACE_MANIFEST.has(file)
  ).length;
  const isExactMobileOverflowNavigationRace =
    mobileOverflowNavigationRaceInputCount ===
      MOBILE_OVERFLOW_NAVIGATION_RACE_MANIFEST.size &&
    files.length === MOBILE_OVERFLOW_NAVIGATION_RACE_MANIFEST.size;
  const runnerIoPressureInputCount = files.filter(file =>
    RUNNER_IO_PRESSURE_MANIFEST.has(file)
  ).length;
  const isExactRunnerIoPressure =
    (runnerIoPressureInputCount === RUNNER_IO_PRESSURE_MANIFEST.size &&
      files.length === RUNNER_IO_PRESSURE_MANIFEST.size) ||
    (files.length === RUNNER_IO_PRESSURE_V2_MANIFEST.size &&
      files.every(file => RUNNER_IO_PRESSURE_V2_MANIFEST.has(file)));
  const runnerPrerequisiteContractInputCount = files.filter(file =>
    RUNNER_PREREQUISITE_CONTRACT_MANIFEST.has(file)
  ).length;
  const isExactRunnerPrerequisiteContract =
    runnerPrerequisiteContractInputCount ===
      RUNNER_PREREQUISITE_CONTRACT_MANIFEST.size &&
    files.length === RUNNER_PREREQUISITE_CONTRACT_MANIFEST.size;
  const isExactRunnerPrerequisiteVisualQaRepair =
    files.length === RUNNER_PREREQUISITE_VISUAL_QA_REPAIR_MANIFEST.size &&
    files.every(file =>
      RUNNER_PREREQUISITE_VISUAL_QA_REPAIR_MANIFEST.has(file)
    );
  const isExactRunnerPrerequisiteRepair =
    isExactRunnerPrerequisiteContract ||
    isExactRunnerPrerequisiteVisualQaRepair;
  const layoutGuardContractInputCount = files.filter(file =>
    LAYOUT_GUARD_CONTRACT_MANIFEST.has(file)
  ).length;
  const isExactLayoutGuardContract =
    layoutGuardContractInputCount === LAYOUT_GUARD_CONTRACT_MANIFEST.size &&
    files.length === LAYOUT_GUARD_CONTRACT_MANIFEST.size;
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
      ) &&
      !(
        isExactAuthenticatedA11yRepair &&
        (file.startsWith('apps/web/tests/e2e/') ||
          file.startsWith('apps/web/tests/performance/'))
      ) &&
      !(
        isExactGoldenPathSmokeContractRepair &&
        file === 'apps/web/tests/e2e/golden-path.spec.ts'
      ) &&
      // Per docs/PR_FLOW.md, Playwright remains in hosted manual/deep lanes.
      !(isExactMobileOverflowNavigationRace && file.endsWith('.spec.ts'))
  );
  const directlyRunnableTestFiles = new Set(
    directTests.filter(
      file =>
        isFileAvailable(file) &&
        !file.startsWith('apps/web/tests/e2e/') &&
        !file.startsWith('apps/web/tests/performance/')
    )
  );
  const isExactProductionReleaseContract =
    files.length === 2 &&
    files.includes('.github/workflows/production-release.yml') &&
    directlyRunnableTestFiles.has(
      'apps/web/tests/unit/ci/deploy-workflow.test.ts'
    );
  const hasUnsupportedAutomationPeer =
    files.some(
      file => file.startsWith('.github/') || file.startsWith('scripts/')
    ) && !isExactProductionReleaseContract;
  const hasManifestInputBeyondDirectTests = manifest =>
    files.some(
      file =>
        manifest.has(file) &&
        (hasUnsupportedAutomationPeer || !directlyRunnableTestFiles.has(file))
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
  const hasHomepageSystemBGuardInput = files.some(isHomepageSystemBGuardInput);
  if (hasHomepageSystemBGuardInput) {
    mandatoryTests.push(...HOMEPAGE_SYSTEM_B_STYLE_GUARD_TESTS);
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
  if (files.includes(VISUAL_QA_DIFF_ARTIFACTS_SOURCE)) {
    mandatoryTests.push(VISUAL_QA_DIFF_ARTIFACTS_TEST);
  }
  if (isExactPrerequisiteTrain) {
    mandatoryTests.push(...PREREQUISITE_TRAIN_TESTS);
  }
  if (isExactGoldenPathSmokeContractRepair) {
    mandatoryTests.push(...GOLDEN_PATH_SMOKE_CONTRACT_TESTS);
  }
  if (isExactNeonAttemptArtifactRepair) {
    mandatoryTests.push(...NEON_ATTEMPT_ARTIFACT_TESTS);
  }
  if (
    isExactPerformanceProfilerRepairPrimary ||
    isExactPerformanceProfilerRepairWithSelectorLegacy
  ) {
    mandatoryTests.push(...PERFORMANCE_PROFILER_REPAIR_WEB_TESTS);
  }
  if (isExactScannerLoadRepairPrimary || isExactScannerLoadRepairWithSelector) {
    mandatoryTests.push(...SCANNER_LOAD_REPAIR_WEB_TESTS);
  }
  if (isExactRunnerPrerequisiteRepair) {
    mandatoryTests.push(...RUNNER_PREREQUISITE_CONTRACT_TESTS);
  }

  const selectedTests = unique([...directTests, ...mandatoryTests]);
  const rootVitestTests = unique([
    ...(isExactVercelCongestionControl
      ? VERCEL_CONGESTION_CONTROL_ROOT_VITEST_TESTS
      : []),
    ...(isExactLayoutGuardContract ? LAYOUT_GUARD_CONTRACT_ROOT_TESTS : []),
  ]);
  const pythonTests = unique([
    ...(isExactVercelCongestionControl
      ? VERCEL_CONGESTION_CONTROL_PYTHON_TESTS
      : []),
  ]);
  const pythonUnittestTests = unique([
    ...(isExactEventDrivenShipper ? EVENT_DRIVEN_SHIPPER_PYTHON_TESTS : []),
  ]);
  const scriptVitestTests = unique([
    ...(isExactEventDrivenShipper ? EVENT_DRIVEN_SHIPPER_SCRIPT_TESTS : []),
    ...(isExactPerformanceProfilerRepairPrimary ||
    isExactPerformanceProfilerRepairWithSelectorLegacy
      ? PERFORMANCE_PROFILER_REPAIR_SCRIPT_TESTS
      : []),
    ...(isExactScannerLoadRepairPrimary || isExactScannerLoadRepairWithSelector
      ? SCANNER_LOAD_REPAIR_SCRIPT_TESTS
      : []),
    ...(isExactAffectedTestSelector ||
    (isExactAuthenticatedA11yRepair && affectedTestSelectorInputCount > 0) ||
    isExactPrSizeGuardWithSelector ||
    isExactGoldenPathSmokeContractRepair ||
    isExactNeonAttemptArtifactRepair ||
    isExactPerformanceProfilerRepairWithSelector ||
    isExactVisualQaSelectorRepair ||
    isExactRunnerPrerequisiteVisualQaRepair ||
    (isExactPersistedAuthFixtureRepair && affectedTestSelectorInputCount > 0)
      ? AFFECTED_TEST_SELECTOR_TESTS
      : []),
    ...(isExactPrSizeGuard || isExactPrSizeGuardWithSelector
      ? PR_SIZE_GUARD_TESTS
      : []),
    ...(isExactGoldenPathSmokeContractRepair
      ? GOLDEN_PATH_SMOKE_CONTRACT_SCRIPT_TESTS
      : []),
    ...(isExactNeonAttemptArtifactRepair
      ? NEON_ATTEMPT_ARTIFACT_SCRIPT_TESTS
      : []),
    ...(isExactPersistedAuthFixtureRepair
      ? PERSISTED_AUTH_FIXTURE_SCRIPT_TESTS
      : []),
    ...(isExactMobileOverflowNavigationRace
      ? MOBILE_OVERFLOW_NAVIGATION_RACE_SCRIPT_TESTS
      : []),
    ...(isExactRunnerIoPressure ? RUNNER_IO_PRESSURE_SCRIPT_TESTS : []),
    ...(isExactRunnerPrerequisiteRepair
      ? RUNNER_PREREQUISITE_CONTROL_TESTS
      : []),
    ...(isExactLayoutGuardContract ? LAYOUT_GUARD_CONTRACT_SCRIPT_TESTS : []),
  ]);
  const isCoveredSource = file => {
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return true;
    if (file.startsWith('apps/web/components/features/profile/')) return true;
    if (file.startsWith('apps/web/app/[username]/')) return true;
    if (file.startsWith('apps/web/components/')) return true;
    if (file.startsWith('apps/web/app/')) return true;
    if (file.startsWith('packages/ui/')) return true;
    // The route matrix is test infrastructure: it is imported by the
    // targeted route-coverage tests and is not product source that warrants
    // escalating every ordinary route-contract change to a full web suite.
    // Keep this deliberately narrow; arbitrary Playwright utilities remain
    // fail-closed until they have an explicit deterministic lane.
    if (file === 'apps/web/tests/e2e/utils/dashboard-route-matrix.ts')
      return true;
    if (file.startsWith('apps/web/tests/eval/promptfoo/')) return true;
    if (isInvestorNoteIngestionInput(file)) return true;
    if (isCiCancellationHealerInput(file)) return true;
    if (isExactEventDrivenShipper && EVENT_DRIVEN_SHIPPER_MANIFEST.has(file))
      return true;
    if (
      isExactAuthenticatedA11yRepair &&
      AUTHENTICATED_A11Y_REPAIR_CORE.has(file)
    )
      return true;
    if (
      isExactGoldenPathSmokeContractRepair &&
      GOLDEN_PATH_SMOKE_CONTRACT_CORE.has(file)
    )
      return true;
    if (
      isExactNeonAttemptArtifactRepair &&
      NEON_ATTEMPT_ARTIFACT_MANIFEST.has(file)
    )
      return true;
    if (
      isExactPersistedAuthFixtureRepair &&
      PERSISTED_AUTH_FIXTURE_REPAIR_CORE.has(file)
    )
      return true;
    if (
      isExactMobileOverflowNavigationRace &&
      MOBILE_OVERFLOW_NAVIGATION_RACE_MANIFEST.has(file)
    )
      return true;
    if (isExactRunnerIoPressure && RUNNER_IO_PRESSURE_MANIFEST.has(file))
      return true;
    if (file === VISUAL_QA_DIFF_ARTIFACTS_SOURCE) return true;
    if (isExactPrerequisiteTrain && PREREQUISITE_TRAIN_MANIFEST.has(file))
      return true;
    if (
      isExactPerformanceProfilerRepair &&
      (PERFORMANCE_PROFILER_REPAIR_MANIFEST.has(file) ||
        SCANNER_LOAD_REPAIR_MANIFEST.has(file))
    )
      return true;
    if (
      isExactRunnerPrerequisiteRepair &&
      RUNNER_PREREQUISITE_CONTRACT_MANIFEST.has(file)
    )
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
    prerequisiteTrainCornerCount > 0 &&
    !hasPrerequisiteTrainCorners &&
    !isExactAuthenticatedA11yRepair;
  const hasStandalonePrerequisiteGlobal =
    files.length === 1 && PREREQUISITE_TRAIN_STANDALONE_GLOBALS.has(files[0]);
  const hasUnknownPrerequisiteTrainPeer =
    hasPrerequisiteTrainCorners && !isExactPrerequisiteTrain;
  const hasIncompleteVercelCongestionControl =
    hasManifestInputBeyondDirectTests(VERCEL_CONGESTION_CONTROL_MANIFEST) &&
    !isExactVercelCongestionControl;
  const hasIncompleteAffectedTestSelector =
    hasManifestInputBeyondDirectTests(AFFECTED_TEST_SELECTOR_MANIFEST) &&
    !isExactAffectedTestSelector &&
    !isExactAuthenticatedA11yRepair &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPerformanceProfilerRepairWithSelector &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactVisualQaSelectorRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerIoPressure &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactLayoutGuardContract &&
    !isExactEventDrivenShipper &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompleteEventDrivenShipper =
    hasManifestInputBeyondDirectTests(EVENT_DRIVEN_SHIPPER_PRIMARY_MANIFEST) &&
    !isExactEventDrivenShipper &&
    !isBoundedFleetPromotionGateChange;
  const hasIncompletePrSizeGuard =
    hasManifestInputBeyondDirectTests(PR_SIZE_GUARD_MANIFEST) &&
    !isExactPrSizeGuard &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompletePerformanceProfilerRepair =
    hasManifestInputBeyondDirectTests(PERFORMANCE_PROFILER_REPAIR_ANCHORS) &&
    !isExactPerformanceProfilerRepair &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerIoPressure &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactLayoutGuardContract;
  const hasIncompleteScannerLoadRepair =
    hasManifestInputBeyondDirectTests(SCANNER_LOAD_REPAIR_MANIFEST) &&
    !isExactScannerLoadRepairPrimary &&
    !isExactScannerLoadRepairWithSelector &&
    !isExactAffectedTestSelector &&
    !isExactAuthenticatedA11yRepair &&
    !isExactPrerequisiteTrain &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPerformanceProfilerRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactVisualQaSelectorRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerIoPressure &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactLayoutGuardContract &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompleteMobileOverflowNavigationRace =
    hasManifestInputBeyondDirectTests(
      MOBILE_OVERFLOW_NAVIGATION_RACE_MANIFEST
    ) &&
    !isExactMobileOverflowNavigationRace &&
    !isExactAuthenticatedA11yRepair &&
    !isExactAffectedTestSelector &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPerformanceProfilerRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactVisualQaSelectorRepair &&
    !isExactRunnerIoPressure &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactLayoutGuardContract &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompleteRunnerIoPressure =
    hasManifestInputBeyondDirectTests(RUNNER_IO_PRESSURE_MANIFEST) &&
    !isExactRunnerIoPressure &&
    !isExactAuthenticatedA11yRepair &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactAffectedTestSelector &&
    !isExactVisualQaSelectorRepair &&
    !isExactPerformanceProfilerRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactLayoutGuardContract &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompleteRunnerPrerequisiteContract =
    hasManifestInputBeyondDirectTests(RUNNER_PREREQUISITE_CONTRACT_MANIFEST) &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactAuthenticatedA11yRepair &&
    !isExactAffectedTestSelector &&
    !isExactVisualQaSelectorRepair &&
    !isExactPrerequisiteTrain &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactLayoutGuardContract &&
    !isExactPerformanceProfilerRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerIoPressure &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompleteLayoutGuardContract =
    hasManifestInputBeyondDirectTests(LAYOUT_GUARD_CONTRACT_MANIFEST) &&
    !isExactLayoutGuardContract &&
    !isExactAuthenticatedA11yRepair &&
    !isExactPrerequisiteTrain &&
    !isExactAffectedTestSelector &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactVisualQaSelectorRepair &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactPerformanceProfilerRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerIoPressure &&
    !isExactPrSizeGuardWithSelector;
  const hasIncompleteNeonAttemptArtifactRepair =
    hasManifestInputBeyondDirectTests(NEON_ATTEMPT_ARTIFACT_MANIFEST) &&
    !isExactNeonAttemptArtifactRepair &&
    !isExactAuthenticatedA11yRepair &&
    !isExactPrerequisiteTrain &&
    !isExactVercelCongestionControl &&
    !isExactAffectedTestSelector &&
    !isExactGoldenPathSmokeContractRepair &&
    !isExactPerformanceProfilerRepair &&
    !isExactPersistedAuthFixtureRepair &&
    !isExactVisualQaSelectorRepair &&
    !isExactMobileOverflowNavigationRace &&
    !isExactRunnerIoPressure &&
    !isExactRunnerPrerequisiteRepair &&
    !isExactLayoutGuardContract &&
    !isExactPrSizeGuardWithSelector;
  const hasUncoveredSource =
    !isExactEventDrivenShipper &&
    (relatedFiles.some(file => !isCoveredSource(file)) ||
      (mergeQueueControllerInputCount > 0 &&
        !isBoundedMergeQueueControllerChange &&
        !isExactScannerLoadRepairPrimary &&
        !isExactScannerLoadRepairWithSelector) ||
      hasUnboundedFleetPromotionGateChange ||
      hasUnknownCiCancellationHealerPeer ||
      hasStandaloneCiFastLanesChange ||
      hasIncompletePrerequisiteTrain ||
      hasStandalonePrerequisiteGlobal ||
      hasUnknownPrerequisiteTrainPeer ||
      hasIncompleteVercelCongestionControl ||
      hasIncompleteAffectedTestSelector ||
      hasIncompletePrSizeGuard ||
      hasIncompletePerformanceProfilerRepair ||
      hasIncompleteScannerLoadRepair ||
      hasIncompleteMobileOverflowNavigationRace ||
      hasIncompleteRunnerIoPressure ||
      hasIncompleteRunnerPrerequisiteContract ||
      hasIncompleteLayoutGuardContract ||
      hasIncompleteEventDrivenShipper ||
      hasIncompleteNeonAttemptArtifactRepair);
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
            hasHomepageSystemBGuardInput ||
            isExactPrerequisiteTrain ||
            isExactVercelCongestionControl ||
            isExactAffectedTestSelector ||
            isExactAuthenticatedA11yRepair ||
            isExactPrSizeGuard ||
            isExactPrSizeGuardWithSelector ||
            isExactGoldenPathSmokeContractRepair ||
            isExactNeonAttemptArtifactRepair ||
            isExactPerformanceProfilerRepair ||
            isExactPersistedAuthFixtureRepair ||
            isExactVisualQaSelectorRepair ||
            isExactMobileOverflowNavigationRace ||
            isExactRunnerIoPressure ||
            isExactRunnerPrerequisiteRepair ||
            isExactLayoutGuardContract ||
            isExactEventDrivenShipper)
        ? 'selected'
        : relatedFiles.length === 0
          ? 'none'
          : 'full',
    relatedFiles,
    mandatoryTests: unique(mandatoryTests),
    selectedTests,
    rootVitestTests,
    pythonTests,
    pythonUnittestTests,
    scriptVitestTests,
  };
}

function argValue(args, flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

function positiveDurationMs(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatCommand(command, args) {
  return [command, ...args]
    .map(part => (/[\s]/.test(part) ? JSON.stringify(part) : part))
    .join(' ');
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

export async function runCommandStatus(
  command,
  args,
  {
    timeoutMs = DEFAULT_SHARD_TIMEOUT_MS,
    progressIntervalMs = DEFAULT_PROGRESS_INTERVAL_MS,
    label = 'command',
    logger = message => console.log(message),
  } = {}
) {
  const commandText = formatCommand(command, args);
  const child = spawn(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
    detached: process.platform !== 'win32',
  });
  const startedAt = Date.now();
  let timedOut = false;
  let timedOutPid;
  const terminate = signal => {
    if (child.exitCode !== null) return;
    if (process.platform === 'win32') child.kill(signal);
    else if (child.pid) process.kill(-child.pid, signal);
  };
  logger(
    `[affected-tests] start ${label} pid=${child.pid ?? 'unknown'} timeoutMs=${timeoutMs} command=${commandText}`
  );
  const onInterrupt = () => terminate('SIGINT');
  const onTerminate = () => terminate('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const progressTimer = setInterval(() => {
    logger(
      `[affected-tests] progress ${label} elapsedMs=${Date.now() - startedAt} pid=${child.pid ?? 'unknown'} command=${commandText}`
    );
  }, progressIntervalMs);
  progressTimer.unref?.();
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    timedOutPid = child.pid;
    logger(
      `[affected-tests] timeout ${label} elapsedMs=${Date.now() - startedAt} pid=${child.pid ?? 'unknown'} timeoutMs=${timeoutMs} command=${commandText}`
    );
    terminate('SIGTERM');
  }, timeoutMs);
  timeoutTimer.unref?.();
  const killTimer = setTimeout(() => {
    if (!timedOut || child.exitCode !== null) return;
    logger(
      `[affected-tests] timeout-escalation ${label} pid=${timedOutPid ?? 'unknown'} command=${commandText}`
    );
    terminate('SIGKILL');
  }, timeoutMs + 5000);
  killTimer.unref?.();
  const status = await new Promise(resolveStatus => {
    child.once('exit', (code, signal) =>
      resolveStatus(timedOut ? 124 : (code ?? (signal ? 128 : 1)))
    );
    child.once('error', () => resolveStatus(1));
  });
  clearInterval(progressTimer);
  clearTimeout(timeoutTimer);
  clearTimeout(killTimer);
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  logger(
    `[affected-tests] complete ${label} status=${status} elapsedMs=${Date.now() - startedAt} pid=${child.pid ?? 'unknown'} command=${commandText}`
  );
  return status;
}

export async function runCommand(command, args) {
  process.exit(await runCommandStatus(command, args));
}

async function runCommands(commands, concurrency = 1, options = {}) {
  const workerCount = Math.max(
    1,
    Math.min(commands.length, Number.parseInt(String(concurrency), 10) || 1)
  );
  let cursor = 0;
  let failureStatus = 0;

  async function worker() {
    while (failureStatus === 0) {
      const index = cursor;
      cursor += 1;
      if (index >= commands.length) return;
      const [command, args] = commands[index];
      const status = await runCommandStatus(command, args, {
        ...options,
        label: `${options.labelPrefix || 'command'} ${index + 1}/${commands.length}`,
      });
      if (status !== 0) failureStatus = status;
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  process.exit(failureStatus);
}

export function buildSelectedTestCommands(plan, maxWorkers) {
  const commands = [];
  if ((plan.nodeTests || []).length > 0) {
    commands.push(['node', ['--test', ...plan.nodeTests]]);
  }
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
  for (const test of plan.pythonUnittestTests || []) {
    commands.push(['python3', [test]]);
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

export function buildFullSuiteCommands(maxWorkers, shardCount = 8) {
  return Array.from({ length: shardCount }, (_, index) => [
    'pnpm',
    [
      '--filter',
      '@jovie/web',
      'exec',
      'vitest',
      'run',
      // Keep successful full-suite output compact for automation sessions.
      // Vitest's dot reporter still prints complete failure diagnostics while
      // avoiding thousands of passing file names in the agent transcript.
      '--reporter=dot',
      '--shard',
      `${index + 1}/${shardCount}`,
      '--maxWorkers',
      maxWorkers,
    ],
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const base = argValue(args, '--base', 'origin/main');
  const maxWorkers = argValue(args, '--max-workers', '2');
  const shardConcurrency = argValue(args, '--shard-concurrency', '2');
  const shardTimeoutMs = positiveDurationMs(
    argValue(
      args,
      '--shard-timeout-ms',
      process.env.AFFECTED_TEST_SHARD_TIMEOUT_MS || DEFAULT_SHARD_TIMEOUT_MS
    ),
    DEFAULT_SHARD_TIMEOUT_MS
  );
  const progressIntervalMs = positiveDurationMs(
    argValue(
      args,
      '--progress-interval-ms',
      process.env.AFFECTED_TEST_PROGRESS_INTERVAL_MS ||
        DEFAULT_PROGRESS_INTERVAL_MS
    ),
    DEFAULT_PROGRESS_INTERVAL_MS
  );
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
    // A single Vitest process retains enough module/reporting state across the
    // 2k-file web suite to trigger host memory pressure near teardown. Keep
    // deterministic, bounded-memory shards, but schedule a small bounded set
    // concurrently so a complete fail-closed suite does not serialize all 8.
    await runCommands(buildFullSuiteCommands(maxWorkers), shardConcurrency, {
      timeoutMs: shardTimeoutMs,
      progressIntervalMs,
      labelPrefix: 'shard',
    });
  }

  await runCommands(buildSelectedTestCommands(plan, maxWorkers), 1, {
    timeoutMs: shardTimeoutMs,
    progressIntervalMs,
    labelPrefix: 'selected',
  });
}
