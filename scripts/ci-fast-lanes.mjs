#!/usr/bin/env node
/**
 * Run the cheap CI cluster as labeled lanes.
 *
 * Used by the dedicated `ci-fast-typecheck` and `ci-fast-remaining` jobs in
 * `.github/workflows/ci.yml` (JOV-4477). Each hosted job checks out and installs
 * once, invokes one value from LANE_GROUPS, and publishes an isolated lane
 * artifact; the aggregate `ci-fast` job also requires the dedicated profile
 * browser admission job.
 *
 * Fail-fast: the first failed lane skips the expensive structural lane so
 * biome/typecheck red does not pay for structural Playwright. Cheap lanes
 * always run so one CI cycle reports every cheap failure instead of hiding
 * later lanes behind the first red one. Skipped lanes still emit a receipt.
 * Set CI_FAST_FAIL_FAST=false to run structural even after a failure. Local callers may omit the selector to
 * retain the all-lanes default.
 *
 * Usage:
 *   node scripts/ci-fast-lanes.mjs [with CI_FAST_LANE_GROUP=<group>]
 *
 * Env:
 *   GITHUB_EVENT_NAME, GITHUB_BASE_REF, GITHUB_REF, GITHUB_STEP_SUMMARY
 *   CI_FAST_LANE_GROUP — hosted group selector; omitted locally runs all lanes
 *   CI_FAST_LANES_OUT  — optional path for JSON lane results
 *   TURBO_SCM_BASE     — for typecheck --affected
 *   CI_FAST_SKIP_STRUCTURAL — "true" to skip the remaining group's structural lane
 *   CI_FAST_ONLY_STRUCTURAL — "true" to run only the structural lane
 *   CI_FAST_FAIL_FAST — "false" to run every selected lane even after a failure
 *   CI_FAST_STRUCTURAL_CONCURRENCY — structural commands run at once (default 3)
 *   CI_FAST_STRUCTURAL_ABORT_STATUS_FILE — background cheap-lane exit status;
 *     non-zero stops starting structural commands (fail-fast)
 */

import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectDesignConformanceChecks } from './design-conformance-paths.mjs';
import { isInvariantScannedPath } from './invariants/scanned-paths.mjs';
import {
  affectsJovieTypecheck,
  affectsWebTestTypecheck,
  classifyCiRepoLanes,
} from './lib/ci-repo-lanes.mjs';

export { affectsWebTestTypecheck };

export const WEB_TESTS_TYPECHECK_COMMAND =
  'pnpm --filter=@jovie/web run typecheck:tests';

export const DELIVERY_CONTROLLER_COVERAGE_ARGS = Object.freeze([
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include=scripts/backlog-orchestrator/delivery-state-machine.mjs',
  '--test-coverage-include=scripts/backlog-orchestrator/no-unattended-red.mjs',
  '--test-coverage-lines=89',
  '--test-coverage-branches=78',
  '--test-coverage-functions=95',
  'scripts/backlog-orchestrator/__tests__/delivery-state-machine.test.mjs',
  'scripts/backlog-orchestrator/__tests__/no-unattended-red.test.mjs',
]);
export const DELIVERY_CONTROLLER_COVERAGE_COMMAND = `node ${DELIVERY_CONTROLLER_COVERAGE_ARGS.join(' ')}`;

export const OFFLINE_FAILURE_COVERAGE_COMMAND =
  'pnpm exec vitest run --config scripts/vitest.config.mts lib/__tests__/rolling-ci-failure-disposition.test.mjs --maxWorkers=1 --coverage --coverage.include="$PWD/scripts/lib/rolling-ci-failure-disposition.mjs" --coverage.reporter=text --coverage.reporter=json --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-offline-failure-coverage" --coverage.thresholds.perFile=true --coverage.thresholds.lines=100 --coverage.thresholds.statements=100 --coverage.thresholds.functions=100 --coverage.thresholds.branches=95';
export const MARKETING_CERTIFICATION_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts "app/(marketing)/youtube-thumbnails/YoutubeThumbnailsLanding.test.tsx" components/homepage/HomepageNoScriptContent.test.tsx components/marketing/MarketingHero.test.tsx tests/unit/home/HomepageCertifiedSections.test.tsx tests/unit/home/HomepageEditorialHero.test.tsx tests/unit/marketing/component-registry.test.ts tests/unit/marketing/recipe-manifest.test.ts tests/unit/marketing/route-health-contract.test.ts components/site/PublicPageShell.test.tsx --coverage.enabled --coverage.provider=v8 --coverage.include=data/marketing/componentRegistry.ts --coverage.include=data/marketing/routeManifest.ts --coverage.include=data/marketing/sections.ts --coverage.include=components/marketing/MarketingHero.tsx --coverage.thresholds.perFile=true --coverage.thresholds.lines=80 --coverage.thresholds.statements=80 --coverage.thresholds.branches=75 --coverage.thresholds.functions=75';
export const CERTIFICATION_KERNEL_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/agent-os/certification.test.ts --coverage.enabled --coverage.provider=v8 --coverage.include=lib/agent-os/certification.ts --coverage.thresholds.lines=94 --coverage.thresholds.statements=93 --coverage.thresholds.branches=84 --coverage.thresholds.functions=96';
export const ACQUISITION_CERTIFICATION_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts --pool=forks --maxWorkers=1 lib/acquisition/certification-store.test.ts lib/agent-os/certification-adapter.test.ts --coverage.enabled --coverage.provider=v8 --coverage.include=lib/acquisition/certification-store.ts --coverage.include=lib/agent-os/certification-cas.ts --coverage.include=lib/agent-os/certification-adapter.ts --coverage.thresholds.perFile=true --coverage.thresholds.lines=90 --coverage.thresholds.statements=85 --coverage.thresholds.branches=80 --coverage.thresholds.functions=90 --coverage.reportsDirectory=coverage/jov-5603-acquisition';
export const BILLING_PROVENANCE_COVERAGE_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/lib/entitlements/creator-plan.test.ts tests/unit/lib/entitlements.server.test.ts tests/unit/lib/stripe/customer-sync.billing-info.test.ts tests/unit/lib/stripe/customer-sync.queries.test.ts lib/stripe/test-price-contract.test.ts --coverage.enabled --coverage.provider=v8 --coverage.include=lib/entitlements/creator-plan.ts --coverage.include=lib/entitlements/server.ts --coverage.include=lib/stripe/customer-sync/billing-info.ts --coverage.include=lib/stripe/test-price-contract.ts --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-billing-provenance-coverage" --coverage.reporter=text --coverage.reporter=json --coverage.reporter=lcov --coverage.thresholds.perFile=true --coverage.thresholds.lines=90 --coverage.thresholds.statements=90 --coverage.thresholds.branches=70 --coverage.thresholds.functions=80';
export const FAN_SEND_SAFETY_COVERAGE_COMMAND =
  'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts --hookTimeout=30000 tests/lib/notifications/service.test.ts tests/lib/notifications/trial-fan-quota.test.ts tests/unit/api/cron/send-release-notifications.test.ts tests/unit/api/cron/schedule-release-notifications.test.ts tests/unit/lib/entitlements-state-transitions.test.ts tests/unit/lib/entitlements.server.test.ts tests/unit/lib/entitlements/creator-plan.test.ts tests/unit/lib/stripe/customer-sync.billing-info.test.ts tests/unit/lib/stripe/customer-sync.queries.test.ts --coverage.enabled --coverage.provider=v8 --coverage.include=app/api/cron/send-release-notifications/route.ts --coverage.include=lib/entitlements/creator-plan.ts --coverage.include=lib/entitlements/server.ts --coverage.include=lib/notifications/quota.ts --coverage.include=lib/notifications/service.ts --coverage.include=lib/stripe/customer-sync/billing-info.ts --coverage.include=lib/stripe/customer-sync/types.ts --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-fan-send-safety-coverage" --coverage.reporter=text --coverage.reporter=json --coverage.reporter=lcov --coverage.thresholds.lines=70 --coverage.thresholds.statements=70 --coverage.thresholds.branches=60 --coverage.thresholds.functions=70';
/** Customer-facing copy surfaces gated by @jovie/copy (policy: canon/VOICE.md). */
export const COPY_GATE_PATHS = Object.freeze([
  'apps/web/content/**',
  'apps/web/data/*Copy.ts',
  'apps/web/lib/email/templates/**',
  'apps/web/lib/chat/onboarding-script/**',
]);
export const COPY_GATE_COMMAND =
  'pnpm copy:check --diff-base origin/main $(git diff --name-only origin/main...HEAD)';

export const BILLING_COVERAGE_COMMAND = Object.freeze(
  `${BILLING_PROVENANCE_COVERAGE_COMMAND} && ${FAN_SEND_SAFETY_COVERAGE_COMMAND}`
);
export const DESKTOP_RELEASE_COVERAGE_COMMAND =
  'node --test --experimental-test-coverage --test-coverage-include=scripts/desktop-release-assets.mjs --test-coverage-lines=75 --test-coverage-branches=88 --test-coverage-functions=65 scripts/desktop-release-guard.test.mjs scripts/desktop-release-publisher.test.mjs && node --test --experimental-test-coverage --test-coverage-include=apps/desktop/scripts/notarize-release-dmg.cjs --test-coverage-lines=75 --test-coverage-branches=100 --test-coverage-functions=50 scripts/desktop-release-guard.test.mjs';
// apps/web/tests/unit/ci reads .github/**, scripts/**, and other non-web
// contract inputs. Those paths select only the operations lane, which skips
// the web Unit Tests shards, so run the whole directory here (#18222 landed a
// workflow-only diff that turned main red because only Unit Tests ran it).
// Excluded here because another job or command owns them, so nothing runs
// twice: the browser-heavy Playwright artifact receipt (web Unit Tests), the
// production-marker-state coverage gate (operations structural command), and
// every unit test in the quarantine ledger (Unit Tests reruns those with
// retries under continue-on-error).
const PLAYWRIGHT_RECEIPT_CI_TEST =
  'tests/unit/ci/playwright-artifact-secrets.test.ts';
const WEB_CI_CONTRACT_ALWAYS_EXCLUDED = Object.freeze([
  PLAYWRIGHT_RECEIPT_CI_TEST,
  'tests/unit/ci/production-marker-state.test.ts',
]);
// Run by name in the web structural parts so it executes even while it sits in
// the quarantine ledger.
const DEPLOY_WORKFLOW_CI_TEST = 'tests/unit/ci/deploy-workflow.test.ts';
// Web Unit Tests run the Playwright receipt only for web merge groups/pushes
// (never PRs), so #18718 broke it unseen. Run it here when they will not.
const PLAYWRIGHT_RECEIPT_INPUTS =
  /^(\.github\/|scripts\/lib\/playwright-png\.mjs$|apps\/web\/(playwright[^/]*\.config[^/]*\.ts|tests\/unit\/ci\/playwright-artifact-secrets\.test\.ts)$)/u;
export function selectPlaywrightReceipt(event, selected, changed) {
  if (event === 'pull_request') {
    return (
      !changed?.length || changed.some(f => PLAYWRIGHT_RECEIPT_INPUTS.test(f))
    );
  }
  return event !== 'workflow_dispatch' && !selected.has('web');
}
export function webCiContractTestsCommand(
  ledgerPath = resolve(process.cwd(), 'apps/web/tests/quarantine.json'),
  runElsewhere = []
) {
  // An unreadable ledger fails closed onto running every contract test, but
  // files another command in the same plan names explicitly (`runElsewhere`)
  // stay excluded so they never execute twice.
  let quarantined = [];
  try {
    const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    quarantined = (Array.isArray(ledger?.entries) ? ledger.entries : [])
      .filter(
        entry =>
          entry?.kind === 'unit' &&
          typeof entry.path === 'string' &&
          entry.path.startsWith('tests/unit/ci/')
      )
      .map(entry => entry.path);
  } catch (error) {
    process.stderr.write(
      `::warning::Quarantine ledger ${ledgerPath} is unreadable (${error?.message ?? error}); running every tests/unit/ci contract.\n`
    );
    quarantined = [];
  }
  const excludes = [
    ...new Set([
      ...WEB_CI_CONTRACT_ALWAYS_EXCLUDED,
      ...quarantined,
      ...runElsewhere,
    ]),
  ]
    .sort()
    .map(path => ` --exclude=${path}`)
    .join('');
  return `pnpm --filter @jovie/web exec vitest run --config=vitest.config.ci-contracts.mts tests/unit/ci${excludes}`;
}
export const ROUTE_PREP_COVERAGE_COMMAND =
  'python3 scripts/symphony/tests/run-route-prep-coverage-gate.py';
const STRUCTURAL_RUNNER_COVERAGE_COMMAND =
  'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/ci-fast-lanes.test.mjs --coverage --coverage.include=ci-fast-lanes.mjs --coverage.reporter=text --coverage.reporter=json --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-ci-fast-structural-coverage" --coverage.thresholds.statements=30 --coverage.thresholds.lines=32 --coverage.thresholds.branches=24 --coverage.thresholds.functions=27';

/**
 * Script contracts that no other CI command ran (orphan sweep). The
 * scripts/lib/ci-script-test-inventory guard fails when a scripts/ test file
 * is not run by any CI entry point; add new node:test files to the first list
 * and new scripts-root Vitest files to the second (or to a narrower command).
 */
/**
 * Hosted structural Python regressions share one dependency policy: CI must
 * have pytest + coverage.py (installed from .github/requirements/pytest.txt);
 * a local checkout without them skips with a notice.
 * @param {string} body
 */
const structuralPythonRegression = body =>
  `if python3 -c "import coverage, pytest, xdist" 2>/dev/null; then ${body}; elif [ "\${CI:-}" = "true" ]; then echo "::error::pytest/coverage/xdist missing from hosted structural lane" >&2; exit 1; else echo "pytest/coverage/xdist not installed — skip local structural regressions"; fi`;

/** Files of the structural pytest suite (one collection, sharded below). */
export const STRUCTURAL_PYTEST_FILES = Object.freeze([
  'scripts/tests/test_gh_retry.py',
  'scripts/tests/test_vercel_prebuilt_deploy.py',
  'scripts/tests/test_brand_scrub.py',
  'scripts/tests/test_agent_workflow_hygiene.py',
  'scripts/tests/test_runner_routing.py',
  'scripts/tests/test_symphony_ui_pilot_runtime.py',
  'scripts/tests/test_symphony_reconciler_runtime.py',
]);

/**
 * The structural pytest suite (420 tests, 132s of one hosted run) was the
 * lane's longest single command, so the bounded pool could not shorten it.
 * Two shards over the identical file list select `-k EXPR` and
 * `-k "not (EXPR)"`: every collected test matches exactly one of them, so the
 * pair runs precisely the original suite. EXPR names the heaviest
 * test_gh_retry.py classes (~half the measured suite time); a rename that
 * empties the first shard fails it (pytest exit 5) instead of dropping tests.
 * Each shard owns its basetemp and skips the shared repo-root .pytest_cache.
 */
export const STRUCTURAL_PYTEST_SHARD_EXPRESSION =
  'TestDrainPrQueueWiring or TestNativeAdmissionReceiptReconciliation';

/** @param {string} shard @param {string} expression */
// The suite spawns thousands of short-lived jq/gh/node processes, so it is
// CPU-bound on process startup: pytest-xdist spreads each shard over two
// workers. Two, not auto: both shards run concurrently on the 4 vCPU
// structural python job; more workers measured slower (JovieInc/Jovie#18657).
const structuralPytestShard = (shard, expression) =>
  `python3 -m pytest -n 2 --durations=20 -v -p no:cacheprovider --basetemp="\${RUNNER_TEMP:-/tmp}/jovie-structural-pytest-${shard}" -k "${expression}" ${STRUCTURAL_PYTEST_FILES.join(' ')}`;

export const STRUCTURAL_PYTEST_SHARD_COMMANDS = Object.freeze([
  structuralPytestShard('a', STRUCTURAL_PYTEST_SHARD_EXPRESSION),
  structuralPytestShard('b', `not (${STRUCTURAL_PYTEST_SHARD_EXPRESSION})`),
]);
const STRUCTURAL_PYTEST_PARTS = STRUCTURAL_PYTEST_SHARD_COMMANDS.map(
  structuralPythonRegression
);
/**
 * Commands ci-fast (structural python) runs instead of remaining: the pytest
 * shards plus the two longest node-only suites (55s + 46s wall of remaining's
 * CPU-bound pool, which the python job finished ~145s ahead of).
 */
const STRUCTURAL_PYTHON_JOB_PARTS = new Set([
  ...STRUCTURAL_PYTEST_PARTS,
  'pnpm invariants:check',
  'pnpm ci:control:test',
]);

/**
 * Structural Python regressions, split so the pool can overlap them. Each
 * command keeps its original `&&` dependencies (coverage run → report).
 */
export const STRUCTURAL_PYTHON_REGRESSION_COMMANDS = Object.freeze([
  structuralPythonRegression(
    [
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.coverage" python3 -m coverage run --branch scripts/symphony/tests/symphony-codex-auth-fallback.test.py OfficialServiceOwnershipContract',
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.coverage" python3 -m coverage json -o "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json"',
      'python3 scripts/symphony/tests/symphony-codex-auth-fallback.test.py --verify-ownership-coverage "${RUNNER_TEMP:-/tmp}/jovie-symphony-recovery.json"',
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-rehabilitation.coverage" python3 -m coverage run --branch scripts/symphony/tests/gem-rehabilitation-policy.test.py',
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-rehabilitation.coverage" python3 -m coverage report --include="*/scripts/symphony/gem_rehabilitation_policy.py" --fail-under=90',
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-lanes.coverage" python3 -m coverage run --branch -m pytest scripts/tests/test_lane_runner.py -q',
      'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-lanes.coverage" python3 -m coverage report --include="*/scripts/lanes/lane_runner.py" --fail-under=85',
    ].join(' && ')
  ),
  ...STRUCTURAL_PYTEST_PARTS,
]);

export const SCRIPT_CONTRACT_NODE_TESTS = Object.freeze([
  '.claude/hooks/post-task-validate.test.mjs',
  'scripts/agent-context/check.test.mjs',
  'scripts/agent/pen-native-semantic-manifest-contract.test.mjs',
  'scripts/agent/pen-registry-audit.test.mjs',
  'scripts/backlog-orchestrator/__tests__/admission-disposition.test.mjs',
  'scripts/backlog-orchestrator/__tests__/admission-receipt.test.mjs',
  'scripts/backlog-orchestrator/__tests__/backlog-hygiene.test.mjs',
  'scripts/backlog-orchestrator/__tests__/backlog-remediation.test.mjs',
  'scripts/backlog-orchestrator/__tests__/deterministic-gates.test.mjs',
  'scripts/backlog-orchestrator/__tests__/intake-readiness.test.mjs',
  'scripts/backlog-orchestrator/__tests__/lane-capacity.test.mjs',
  'scripts/backlog-orchestrator/__tests__/plan-gate.test.mjs',
  'scripts/backlog-orchestrator/__tests__/runtime-state.test.mjs',
  'scripts/backlog-orchestrator/__tests__/shipping-observability.test.mjs',
  'scripts/backlog-orchestrator/__tests__/summer-live-state.test.mjs',
  'scripts/ci-cache-policy.test.mjs',
  'scripts/ci-release-incident-contract.test.mjs',
  'scripts/deprecation-intake.test.mjs',
  'scripts/design-authority-guard.test.mjs',
  'scripts/evals/release-task-cluster.test.mjs',
  'scripts/gate-ladder/gate-ladder.test.mjs',
  'scripts/homepage-screenshot-output.test.mjs',
  'scripts/hooks/pre-push-gate.test.mjs',
  'scripts/invariants/model-audit-contract.test.mjs',
  'scripts/invariants/pr-lifecycle-contract.test.mjs',
  'scripts/invariants/writing-surfaces.test.mjs',
  'scripts/ios-ci-cache-contract.test.mjs',
  'scripts/lib/__tests__/dependabot-workflow-run-adapter.test.mjs',
  'scripts/lib/__tests__/policy-gate-liveness.test.mjs',
  'scripts/lib/observability-fingerprint.test.mjs',
  'scripts/logo-asset-normalization.test.mjs',
  'scripts/observability-issue-github.test.mjs',
  'scripts/observability-issue-sync.test.mjs',
  'scripts/performance-artifact-retention.test.mjs',
  'scripts/security/audit-workflow-execution.test.mjs',
  'scripts/summer-commissioning/canonical-registry.test.mjs',
  'scripts/summer-commissioning/commissioning.test.mjs',
  'scripts/summer-commissioning/company-registry.test.mjs',
  'scripts/summer-commissioning/contracts.test.mjs',
  'scripts/summer-commissioning/product-quality-governor.test.mjs',
  'scripts/summer-commissioning/project-creation-policy.test.mjs',
  'scripts/summer-commissioning/receipt-trust.test.mjs',
  'scripts/symphony/model-harness-selection.test.mjs',
  'scripts/symphony/symphony-auto-route.test.mjs',
  'scripts/upstash-production-operator.test.mjs',
  'scripts/vercel-source-contract.test.mjs',
  'scripts/verify-workflow-references.test.mjs',
]);
export const SCRIPT_CONTRACT_NODE_COMMAND = `node --test ${SCRIPT_CONTRACT_NODE_TESTS.join(' ')}`;
export const SCRIPT_CONTRACT_VITEST_TESTS = Object.freeze([
  'scripts/lib/__tests__/actions-cache-supersede.test.mjs',
  'scripts/lib/__tests__/agent-branch-pattern.test.mjs',
  'scripts/lib/__tests__/agent-config-health.test.mjs',
  'scripts/lib/__tests__/agentcookie.test.mjs',
  'scripts/lib/__tests__/auto-ready-green-drafts.test.mjs',
  'scripts/lib/__tests__/biome-a11y-exemption-scope.test.mjs',
  'scripts/lib/__tests__/biome-no-restricted-imports.test.mjs',
  'scripts/lib/__tests__/brand-deals-skill-contract.test.mjs',
  'scripts/lib/__tests__/changelog-parser.test.mjs',
  'scripts/lib/__tests__/ci-script-test-inventory.test.mjs',
  'scripts/lib/__tests__/codex-issue-shipper.test.mjs',
  'scripts/lib/__tests__/component-comparative-quality-bar.test.mjs',
  'scripts/lib/__tests__/component-rendered-certification.test.mjs',
  'scripts/lib/__tests__/component-rendered-evaluator.test.mjs',
  'scripts/lib/__tests__/component-rendered-invariant-policy.test.mjs',
  'scripts/lib/__tests__/delivery-control-receipts-workflow.test.mjs',
  'scripts/lib/__tests__/dependabot-update-policy.test.mjs',
  'scripts/lib/__tests__/doc-freshness.test.mjs',
  'scripts/lib/__tests__/ensure-jovie-repo-cwd.test.mjs',
  'scripts/lib/__tests__/gbrain-health-summary.test.mjs',
  'scripts/lib/__tests__/gbrain-pool-env.test.mjs',
  'scripts/lib/__tests__/help-center-recertification-workflow.test.mjs',
  'scripts/lib/__tests__/hermes-launchd.test.mjs',
  'scripts/lib/__tests__/hermes-ops-import-contract.test.mjs',
  'scripts/lib/__tests__/isolated-ui-docs-policy.test.mjs',
  'scripts/lib/__tests__/lighthouse-production-collect.test.mjs',
  'scripts/lib/__tests__/lighthouse-retry.test.mjs',
  'scripts/lib/__tests__/linear-sync-on-merge.test.mjs',
  'scripts/lib/__tests__/m2-revenue-path-canary-intake.test.mjs',
  'scripts/lib/__tests__/main-release-readiness.test.mjs',
  'scripts/lib/__tests__/pipeline-scoreboard.test.mjs',
  'scripts/lib/__tests__/pr-comment-analysis.test.mjs',
  'scripts/lib/__tests__/pr-preparation-safety.test.mjs',
  'scripts/lib/__tests__/pr-size-guard-base-tip.test.mjs',
  'scripts/lib/__tests__/pr-size-guard-label-override.test.mjs',
  'scripts/lib/__tests__/pr-size-guard-policy.test.mjs',
  'scripts/lib/__tests__/pre-push-gate.test.mjs',
  'scripts/lib/__tests__/production-unbound-repair-attestation.test.mjs',
  'scripts/lib/__tests__/projected-tree-budget.test.mjs',
  'scripts/lib/__tests__/qa-swarm.test.mjs',
  'scripts/lib/__tests__/ratchet-core.test.mjs',
  'scripts/lib/__tests__/repository-docs-ratchet.test.mjs',
  'scripts/lib/__tests__/rolling-ci-hosted-writer.test.mjs',
  'scripts/lib/__tests__/rolling-ci-learning.test.mjs',
  'scripts/lib/__tests__/rolling-ci-pipeline.test.mjs',
  'scripts/lib/__tests__/rolling-ci-remediation-concurrency.test.mjs',
  'scripts/lib/__tests__/safe-pr-remediation.test.mjs',
  'scripts/lib/__tests__/scope-governor.test.mjs',
  'scripts/lib/__tests__/scripts-typecheck.test.mjs',
  'scripts/lib/__tests__/ship-ledger.test.mjs',
  'scripts/lib/__tests__/spawn-resource.test.mjs',
  'scripts/lib/__tests__/stale-pr-base-sha.test.mjs',
  'scripts/lib/__tests__/story-coverage-ratchet.test.mjs',
  'scripts/lib/__tests__/taste-classifier.test.mjs',
  'scripts/lib/__tests__/taste-label-guard.test.mjs',
  'scripts/lib/__tests__/tim-brief.test.mjs',
  'scripts/lib/__tests__/tracker-client.test.mjs',
  'scripts/lib/__tests__/tracker.test.mjs',
  'scripts/lib/__tests__/typecheck-singleflight-diagnostics.test.mjs',
  'scripts/lib/__tests__/visual-snapshot-compare.test.mjs',
  'scripts/lib/__tests__/web-test-selectors.test.mjs',
  'scripts/lib/__tests__/web-vitest-fast-runner.test.mjs',
  'scripts/symphony/lib/__tests__/backlog-orchestrator-ownership-inventory-recovery.test.ts',
  'scripts/symphony/lib/__tests__/ci-failure-classifier.test.ts',
  'scripts/symphony/lib/__tests__/ci-failure-diagnosis.test.ts',
  'scripts/symphony/lib/__tests__/codex-issue-shipper-routing.test.ts',
  'scripts/symphony/lib/__tests__/control-plane-liveness-recovery.test.ts',
  'scripts/symphony/lib/__tests__/controller-liveness.test.ts',
  'scripts/symphony/lib/__tests__/delivery-liveness-recovery.test.ts',
  'scripts/symphony/lib/__tests__/delivery-liveness.test.ts',
  'scripts/symphony/lib/__tests__/merge-queue-fleet-gate-recovery.test.ts',
  'scripts/symphony/lib/__tests__/production-controller-recovery.test.ts',
  'scripts/symphony/lib/__tests__/release-marker-recovery.test.ts',
  'scripts/symphony/lib/__tests__/summer-governor-recovery.test.ts',
]);
export const SCRIPT_CONTRACT_VITEST_COMMAND = `pnpm exec vitest --root scripts --config vitest.config.mts run ${SCRIPT_CONTRACT_VITEST_TESTS.map(
  test => test.replace(/^scripts\//u, '')
).join(' ')}`;

const REPO_ROOT = process.cwd();
const selectedProductLanes = () =>
  new Set(
    (process.env.CI_PRODUCT_LANES || 'ios,mac,web,operations,cross-product')
      .split(',')
      .filter(Boolean)
  );

/** @typedef {{ id: string, name: string, nextLocalCommand: string, status: 'success'|'failure'|'skipped', logExcerpt: string, durationMs: number }} LaneResult */

const LANES = [
  {
    id: 'biome',
    name: 'Biome (lint + format)',
    nextLocalCommand: 'pnpm run biome:check',
    run: runBiome,
  },
  {
    id: 'eslint-server-boundaries',
    name: 'ESLint server boundaries',
    nextLocalCommand: 'pnpm --filter=@jovie/web run lint:server-boundaries',
    run: runEslintServerBoundaries,
  },
  {
    id: 'shadcn-lint-contracts',
    name: 'shadcn lint contracts',
    nextLocalCommand: 'pnpm --filter=@jovie/web run lint:shadcn-contracts',
    run: runShadcnLintContracts,
  },
  {
    id: 'typecheck',
    name: 'Typecheck',
    nextLocalCommand: 'pnpm run typecheck',
    run: runTypecheck,
  },
  {
    id: 'web-tests-typecheck',
    name: 'Web Tests Typecheck (shrink-only baseline)',
    nextLocalCommand: WEB_TESTS_TYPECHECK_COMMAND,
    run: runWebTestsTypecheck,
  },
  {
    id: 'scripts-typecheck',
    name: 'Scripts Typecheck (shrink-only baseline)',
    nextLocalCommand: 'pnpm run typecheck:scripts',
    run: runScriptsTypecheck,
  },
  {
    id: 'guardrails',
    name: 'Guardrails (proxy)',
    nextLocalCommand: 'pnpm next:proxy-guard',
    run: runGuardrails,
  },
  {
    id: 'design-system-source-ratchet',
    name: 'Design-system source identity ratchet',
    nextLocalCommand: 'pnpm design:source-count-ratchet',
    run: runDesignSystemSourceRatchet,
  },
  {
    id: 'design-exception-registry',
    name: 'Design exception registry',
    nextLocalCommand: 'pnpm design:exception-registry:check',
    run: runDesignExceptionRegistry,
  },
  {
    id: 'design-governance-enforcement',
    name: 'Design governance enforcement',
    nextLocalCommand:
      'pnpm design:authority:check && pnpm design:tokens:export:check && pnpm design:governance:audit && pnpm --filter @jovie/web run lint:touch-target',
    run: runDesignGovernanceEnforcement,
  },
  {
    id: 'design-conformance',
    name: 'Design Conformance',
    nextLocalCommand: 'pnpm design:conformance:gate',
    run: runDesignConformance,
  },
  {
    id: 'ios-fast',
    name: 'iOS Fast Contract',
    nextLocalCommand: 'pnpm run ios:lint',
    run: runIosFast,
  },
  {
    id: 'profile-admission',
    name: 'Public Profile Admission',
    nextLocalCommand:
      'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts lib/profile/capture-dismissal-client.test.ts components/features/release/SmartLinkProviderButton.test.tsx tests/unit/api/profile/capture-dismissal.test.ts tests/unit/api/profile/pac-event.test.ts tests/unit/lib/rate-limit/config.test.ts tests/unit/lib/rate-limit/limiters.test.ts tests/unit/profile/ProfileHomeRail.test.tsx tests/unit/cookie-banner-fixes.test.tsx tests/unit/tracking/pac-events.test.ts components/features/profile/templates/PublicProfileLayoutShell.test.tsx components/features/profile/templates/ProfileDesktopSurface.test.tsx tests/unit/profile/profile-compact-template.test.tsx components/providers/QueryProvider.test.tsx --coverage --coverage.include="components/providers/QueryProvider.tsx" --coverage.include="components/features/profile/templates/{PublicProfileLayoutShell,ProfileDesktopSurface,ProfileCompactTemplate}.tsx" --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-profile-admission-coverage" --coverage.thresholds.lines=75 --coverage.thresholds.branches=70 --coverage.thresholds.functions=60',
    run: runProfileAdmission,
  },
  {
    id: 'billing-coverage',
    name: 'Billing and fan-send coverage',
    nextLocalCommand: BILLING_COVERAGE_COMMAND,
    run: runBillingCoverage,
  },
  {
    id: 'copy-gate',
    name: 'Copy gate (changed customer-facing lines)',
    nextLocalCommand: COPY_GATE_COMMAND,
    run: runCopyGate,
  },
  {
    id: 'structural',
    name: 'Structural Contract',
    nextLocalCommand:
      'pnpm invariants:check && pnpm ci:harness:check && pnpm ci:control:test && pnpm ci:merge-queue:check && pnpm next:proxy-guard && pnpm tailwind:check && pnpm --filter=@jovie/web run lint:no-native-dialogs && pnpm --filter=@jovie/web run lint:seo && pnpm --filter=@jovie/web run lint:contrast-ratchet && pnpm design:shared-ui-visual-arbitrary:check && pnpm component-ship-gate && pnpm screen-registration-gate && pnpm doc:freshness:check && pnpm test:reliability-detectors' +
      ' && ' +
      MARKETING_CERTIFICATION_COMMAND +
      ' && ' +
      CERTIFICATION_KERNEL_COMMAND +
      ' && ' +
      ACQUISITION_CERTIFICATION_COMMAND +
      ' && ' +
      DESKTOP_RELEASE_COVERAGE_COMMAND +
      ' && ' +
      OFFLINE_FAILURE_COVERAGE_COMMAND,
    run: runStructural,
  },
];

const LANE_IDS = Object.freeze(LANES.map(lane => lane.id));

/**
 * The hosted workflow selects exactly one of these bounded groups. Keeping the
 * manifest here makes the split auditable and lets local callers omit the
 * selector to retain the historical all-lanes behavior.
 */
export const LANE_GROUPS = Object.freeze({
  typecheck: Object.freeze(['typecheck', 'web-tests-typecheck']),
  remaining: Object.freeze([
    'biome',
    'eslint-server-boundaries',
    'shadcn-lint-contracts',
    'scripts-typecheck',
    'guardrails',
    'design-system-source-ratchet',
    'design-exception-registry',
    'design-governance-enforcement',
    'design-conformance',
    'ios-fast',
    'profile-admission',
    'billing-coverage',
    'copy-gate',
    'structural',
  ]),
});

export const LANE_COMMANDS = Object.freeze(
  Object.fromEntries(LANES.map(lane => [lane.id, lane.nextLocalCommand]))
);

export function validateLaneGroups(groups, laneIds = LANE_IDS) {
  const knownLaneIds = new Set(laneIds);
  const seenLaneIds = new Map();
  const errors = [];

  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {
    throw new Error('CI fast lane groups must be an object');
  }

  for (const [groupId, selectedLaneIds] of Object.entries(groups)) {
    if (!Array.isArray(selectedLaneIds) || selectedLaneIds.length === 0) {
      errors.push(`${groupId}: group must contain at least one lane`);
      continue;
    }
    for (const laneId of selectedLaneIds) {
      if (!knownLaneIds.has(laneId)) {
        errors.push(`${groupId}: unknown lane ${laneId}`);
        continue;
      }
      const priorGroup = seenLaneIds.get(laneId);
      if (priorGroup) {
        errors.push(`${laneId}: duplicated in ${priorGroup} and ${groupId}`);
      } else {
        seenLaneIds.set(laneId, groupId);
      }
    }
  }

  for (const laneId of knownLaneIds) {
    if (!seenLaneIds.has(laneId)) {
      errors.push(`${laneId}: missing from lane groups`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid CI fast lane groups: ${errors.join('; ')}`);
  }
  return true;
}

validateLaneGroups(LANE_GROUPS);

export function selectLanes(groupId) {
  // Local callers historically ran the complete cluster with no selector.
  if (groupId === undefined) return LANES;
  if (typeof groupId !== 'string' || groupId.trim() === '') {
    throw new Error('CI_FAST_LANE_GROUP must be a non-empty known group');
  }

  const selectedLaneIds = LANE_GROUPS[groupId];
  if (!selectedLaneIds) {
    throw new Error(
      `Unknown CI_FAST_LANE_GROUP ${JSON.stringify(groupId)}; expected one of ${Object.keys(LANE_GROUPS).join(', ')}`
    );
  }
  return selectedLaneIds.map(laneId => LANES.find(lane => lane.id === laneId));
}

function shell(command, opts = {}) {
  const result = spawnSync(command, {
    shell: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    code: result.status ?? 1,
    output: `${stdout}${stderr}`,
  };
}

/** @param {readonly string[]} patterns */
export function changedFiles(patterns = [], cwd = REPO_ROOT) {
  const event = process.env.GITHUB_EVENT_NAME || '';
  let diffBase = 'HEAD^1';
  if (event === 'pull_request') {
    const base = process.env.GITHUB_BASE_REF || 'main';
    // Prefer origin/<base> when available (fetch done by workflow).
    const probe = shell(`git rev-parse --verify origin/${base}`, { cwd });
    diffBase =
      probe.code === 0
        ? `origin/${base}`
        : process.env.TURBO_SCM_BASE || diffBase;
  } else if (process.env.TURBO_SCM_BASE) {
    diffBase = process.env.TURBO_SCM_BASE;
  }

  // A PR diff starts at its merge base; main-only updates are not PR changes.
  // Combined-head and push checks retain their exact two-tree comparison.
  const range =
    event === 'pull_request' ? `${diffBase}...HEAD` : `${diffBase} HEAD`;
  const pathspecs = patterns.map(p => `'${p}'`).join(' ');
  const result = shell(
    `git diff --diff-filter=ACDMRT --name-only ${range} -- ${pathspecs}`,
    { cwd }
  );
  if (result.code !== 0) {
    // Fall back to full set (caller decides).
    return null;
  }
  return result.output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export const BILLING_PROVENANCE_COVERAGE_PATHS = Object.freeze([
  'apps/web/lib/entitlements/**',
  'apps/web/lib/stripe/customer-sync/**',
  'apps/web/lib/stripe/test-price-contract.ts',
  'apps/web/lib/stripe/test-price-contract.test.ts',
  'apps/web/tests/unit/lib/entitlements/**',
  'apps/web/tests/unit/lib/stripe/customer-sync.billing-info.test.ts',
]);

const FAN_SEND_SAFETY_COVERAGE_PATHS = [
  'apps/web/app/api/cron/send-release-notifications/**',
  'apps/web/lib/notifications/**',
  'apps/web/tests/lib/notifications/**',
  'apps/web/tests/unit/api/cron/send-release-notifications.test.ts',
  'apps/web/tests/unit/api/cron/schedule-release-notifications.test.ts',
  'apps/web/tests/unit/lib/entitlements-state-transitions.test.ts',
];

export function selectBillingCoverageCommands({
  event,
  provenanceFiles,
  fanSendFiles,
}) {
  const commands = [];

  // An unreadable diff fails closed and runs both focused suites. On a normal
  // PR, each suite runs only when its production/test surface changed.
  if (
    event === 'workflow_dispatch' ||
    provenanceFiles === null ||
    provenanceFiles.length > 0
  ) {
    commands.push(BILLING_PROVENANCE_COVERAGE_COMMAND);
  }
  if (
    event === 'workflow_dispatch' ||
    fanSendFiles === null ||
    fanSendFiles.length > 0
  ) {
    commands.push(FAN_SEND_SAFETY_COVERAGE_COMMAND);
  }

  return commands;
}

export function runBillingCoverage() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  const provenanceFiles =
    event === 'workflow_dispatch'
      ? null
      : changedFiles(BILLING_PROVENANCE_COVERAGE_PATHS);
  const fanSendFiles =
    event === 'workflow_dispatch'
      ? null
      : changedFiles(FAN_SEND_SAFETY_COVERAGE_PATHS);
  const commands = selectBillingCoverageCommands({
    event,
    provenanceFiles,
    fanSendFiles,
  });

  if (commands.length === 0) {
    return {
      code: 0,
      output:
        'Billing coverage skipped (no billing or fan-send files changed)\n',
      skipped: true,
    };
  }

  let combined = '';
  for (const command of commands) {
    const result = shell(command);
    combined += result.output;
    if (result.code !== 0) return { code: result.code, output: combined };
  }
  return { code: 0, output: combined };
}

/**
 * Delta copy gate: only lines this change adds are judged, so legacy copy debt
 * stays advisory while new slop, harm, legal, or ToS violations cannot land.
 * An unreadable diff fails closed.
 */
export function runCopyGate() {
  const files = changedFiles(COPY_GATE_PATHS);
  if (files === null) {
    return {
      code: 1,
      output: 'Copy gate: changed-file diff unreadable; failing closed\n',
    };
  }
  if (files.length === 0) {
    return {
      code: 0,
      output: 'Copy gate skipped (no customer-facing copy changed)\n',
      skipped: true,
    };
  }
  const base = process.env.GITHUB_BASE_REF || 'main';
  const diffBase =
    shell(`git rev-parse --verify origin/${base}`).code === 0
      ? `origin/${base}`
      : process.env.TURBO_SCM_BASE || 'HEAD^1';
  return shell(
    `pnpm exec tsx packages/copy/cli.ts check --diff-base ${diffBase} ${files.map(file => `'${file}'`).join(' ')}`
  );
}

export function listAllChangedFiles(cwd = REPO_ROOT) {
  return changedFiles([], cwd);
}

let cachedRepoLanes = null;
function repoLanes() {
  if (cachedRepoLanes) return cachedRepoLanes;
  const files = listAllChangedFiles();
  // Empty or unreadable diffs fail closed onto every lane so typed no-op
  // merge groups still run ci-fast against the combined head (JOV-5288).
  cachedRepoLanes =
    files === null || files.length === 0
      ? {
          runJovieProduct: true,
          runSymphonyControl: true,
          runSummerOps: true,
        }
      : classifyCiRepoLanes(files);
  return cachedRepoLanes;
}

const GIT_FETCH_NOISE_LINE =
  /^\s*(?:\* \[new (?:branch|tag)\]|[0-9a-f]+\.\.[0-9a-f]+\s)/u;
// Lowercase `error` catches TypeScript's `file.ts(1,2): error TS2532: …` while
// the word boundary still skips summary noise such as `errors: 0`.
const DIAGNOSTIC_LINE =
  /\b(?:ERROR|\w*Error|error|FAIL|FAILED|failed|expected)\b/u;
// Passing TAP tests whose names merely contain `failed`/`error` are not causes.
const TAP_PASS_LINE = /^(?:ok \d+ - |# Subtest: )/u;
const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,
  'gu'
);

/** Drop `git fetch` ref-update noise so excerpts keep the real failure. */
export function stripGitFetchNoise(text) {
  return (text || '')
    .split('\n')
    .filter(line => !GIT_FETCH_NOISE_LINE.test(line))
    .join('\n');
}

function boundedLine(raw, width = 200) {
  const line = String(raw ?? '')
    .replace(ANSI_ESCAPE, '')
    .trim();
  return line.length > width ? `${line.slice(0, width - 1)}…` : line;
}

/** Last few bounded, de-duplicated lines that look like a failure cause. */
export function extractDiagnosticLines(text, { max = 5, width = 200 } = {}) {
  const lines = [];
  for (const raw of stripGitFetchNoise(text).split('\n')) {
    const line = boundedLine(raw, width);
    if (!line || !DIAGNOSTIC_LINE.test(line) || TAP_PASS_LINE.test(line)) {
      continue;
    }
    lines.push(line);
  }
  // Keep the LAST occurrence of a repeated line so a root cause that repeats
  // at the end of the log is not dropped by the tail slice.
  const newestFirst = [...new Set(lines.reverse())];
  return newestFirst.slice(0, max).reverse();
}

const NODE_SUBTEST_LINE = /^(\s*)# Subtest: (.+)$/u;
const NODE_NOT_OK_LINE = /^(\s*)not ok \d+ - (.+?)(?: # (?:SKIP|TODO)\b.*)?$/u;
const NODE_DETAIL_LINE = /^(\s*)(failureType|error|expected|actual): ?(.*)$/u;
const YAML_BLOCK_SCALAR = /^[|>][+-]?$/u;
const VITEST_FAIL_LINE =
  /^FAIL\s+(?:\|[^|]+\|\s+)?\S+\.(?:test|spec)\.[cm]?[jt]sx?\b/u;
const VITEST_ERROR_LINE = /^(?:[A-Z]\w*)?Error\b[^:]*:/u;
const PYTEST_NODE = String.raw`(scripts\/[\w./-]+\.py)::([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)`;
const PYTEST_SUMMARY_LINE = new RegExp(
  String.raw`^(FAILED|ERROR) ${PYTEST_NODE}(?=\[| - |$)`,
  'u'
);
// `pytest -v` progress lines still name the test when the run is killed
// before its short test summary prints.
const PYTEST_PROGRESS_LINE = new RegExp(
  String.raw`^${PYTEST_NODE}(?:\[[^\]\n]*\])? (FAILED|ERROR)\b`,
  'u'
);
const PYTEST_IDENTITY_LINE = /^(?:FAILED|ERROR) scripts\/[\w./-]+\.py::/u;
/** Header lines that name a failing test; the annotation keeps them in order. */
const TEST_IDENTITY_LINE = new RegExp(
  `${PYTEST_IDENTITY_LINE.source}|^not ok - |${VITEST_FAIL_LINE.source}`,
  'u'
);

/** node:test TAP YAML fields for the `not ok` block starting at `start`. */
function nodeFailureDetails(lines, start, indent) {
  const details = {};
  const fieldIndent = indent + 2;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].replace(ANSI_ESCAPE, '');
    const leading = line.length - line.trimStart().length;
    if (line.trim() && leading < fieldIndent) break;
    if (line.trim() === '...' && leading === fieldIndent) break;
    const field = NODE_DETAIL_LINE.exec(line);
    if (!field || field[1].length !== fieldIndent || field[2] in details) {
      continue;
    }
    let value = field[3].trim();
    if (YAML_BLOCK_SCALAR.test(value)) {
      value =
        lines
          .slice(index + 1)
          .map(next => next.replace(ANSI_ESCAPE, '').trim())
          .find(Boolean) ?? '';
    }
    details[field[2]] = value;
  }
  return details;
}

/** `not ok` leaves with their `# Subtest:` ancestry and assertion fields. */
function nodeTestFailures(lines, max, width) {
  const failures = [];
  /** @type {{ indent: number, name: string }[]} */
  const ancestry = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (failures.length === max) break;
    const line = lines[index].replace(ANSI_ESCAPE, '');
    const subtest = NODE_SUBTEST_LINE.exec(line);
    if (subtest) {
      const indent = subtest[1].length;
      while (ancestry.length > 0 && ancestry.at(-1).indent >= indent) {
        ancestry.pop();
      }
      ancestry.push({ indent, name: subtest[2].trim() });
      continue;
    }
    const notOk = NODE_NOT_OK_LINE.exec(line);
    if (!notOk) continue;
    const indent = notOk[1].length;
    const details = nodeFailureDetails(lines, index + 1, indent);
    // A suite fails when a child fails; the child already names the cause.
    if (details.failureType === "'subtestsFailed'") continue;
    const path = [
      ...ancestry.filter(entry => entry.indent < indent).map(e => e.name),
      notOk[2].trim(),
    ];
    failures.push([
      boundedLine(`not ok - ${path.join(' > ')}`, width),
      ...['error', 'expected', 'actual'].flatMap(key =>
        details[key] ? [boundedLine(`${key}: ${details[key]}`, width)] : []
      ),
    ]);
  }
  return failures;
}

/** Vitest `FAIL file > suite > test` lines with their first error line. */
function vitestFailures(lines, max, width) {
  const failures = [];
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    if (failures.length === max) break;
    const line = boundedLine(lines[index], width);
    if (!VITEST_FAIL_LINE.test(line) || seen.has(line)) continue;
    seen.add(line);
    const failure = [line];
    for (const next of lines.slice(index + 1, index + 9)) {
      const candidate = boundedLine(next, width);
      if (VITEST_FAIL_LINE.test(candidate)) break;
      if (VITEST_ERROR_LINE.test(candidate)) {
        failure.push(candidate);
        break;
      }
    }
    failures.push(failure);
  }
  return failures;
}

/**
 * Failing node:test / Vitest test identities plus their assertion message,
 * in output order. A bounded tail excerpt otherwise drops the test name
 * behind coverage tables and passing-test noise.
 */
export function extractFailureIdentities(text, { max = 3, width = 200 } = {}) {
  const lines = stripGitFetchNoise(text).split('\n');
  const failures = nodeTestFailures(lines, max, width);
  failures.push(...vitestFailures(lines, max - failures.length, width));
  return failures.flat();
}

/** Keep leading lines (the first always) while their total stays in `max`. */
function capLines(lines, max) {
  const kept = [];
  let used = 0;
  for (const line of lines) {
    if (kept.length > 0 && used + line.length + 1 > max) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept;
}

/** Escape a workflow-command message per GitHub Actions rules. */
export function escapeAnnotationMessage(text) {
  return String(text ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/** Escape a workflow-command property value (e.g. `title=`). */
export function escapeAnnotationProperty(text) {
  return escapeAnnotationMessage(text)
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

function commandLabel(command, max = 80) {
  const flat = String(command ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function excerpt(text, max = 1200) {
  if (max <= 0) return '';
  const trimmed = stripGitFetchNoise(text).trim();
  if (trimmed.length <= max) return trimmed;
  return `…${trimmed.slice(-max)}`;
}

/** Header body budget so the excerpt tail keeps some raw context. */
const HEADER_BODY_MAX = 800;

/**
 * Failure excerpt for a lane: failing test identities, then diagnostic lines,
 * then the output tail. Structural builds its own header in runStructural.
 */
export function laneFailureExcerpt(laneId, output) {
  const text = output || '';
  if (laneId === 'structural' && text.startsWith('Structural command ')) {
    return excerpt(text);
  }
  const identities = extractFailureIdentities(text);
  const named = new Set(identities);
  const diagnostics = extractDiagnosticLines(text).filter(
    line => !named.has(line)
  );
  if (identities.length + diagnostics.length === 0) return excerpt(text);
  const header = [
    'Diagnostics:',
    ...capLines([...identities, ...diagnostics], HEADER_BODY_MAX),
  ].join('\n');
  return `${header}\n\n${excerpt(text, 1200 - header.length - 3)}`;
}

/**
 * Join a header's lead line with as many body lines as fit in `max` chars.
 * Diagnostic lines are chosen from the END so earlier errors cannot crowd out
 * the final root-cause line; a header that leads with a test identity keeps
 * its order so the first failing test stays the lead identity.
 */
function budgetHeader(header, max = 400) {
  const [lead, ...rest] = header.split('\n');
  const separator = ' | ';
  const fromEnd = !TEST_IDENTITY_LINE.test(rest[0] ?? '');
  const ordered = fromEnd ? [...rest].reverse() : rest;
  const kept = [];
  let used = lead.length;
  for (const line of ordered) {
    const cost = separator.length + line.length;
    if (used + cost > max) break;
    kept.push(line);
    used += cost;
  }
  if (kept.length === 0 && ordered.length > 0) kept.push(ordered[0]);
  if (fromEnd) kept.reverse();
  return [lead, ...kept].join(separator).slice(0, max);
}

/** One-line, escaped `::error::` body (≤400 chars before escaping). */
export function failureAnnotationMessage(lane, logExcerpt) {
  if (!logExcerpt) return '';
  const useHeader =
    (lane.id === 'structural' &&
      logExcerpt.startsWith('Structural command ')) ||
    logExcerpt.startsWith('Diagnostics:\n');
  const short = useHeader
    ? budgetHeader(logExcerpt.split('\n\n')[0])
    : logExcerpt.split('\n').slice(-8).join(' | ').slice(0, 400);
  return escapeAnnotationMessage(short);
}

/** Registered pytest `FAILED`/`ERROR` identities, first three in output order. */
function registeredPytestIdentities(command, output) {
  const pytestArgs = /\bpython3 -m pytest\s+([^;&]+)/u.exec(command)?.[1] || '';
  const targets = new Set(
    pytestArgs
      .split(/\s+/u)
      .filter(path => /^scripts\/[\w./-]+\.py$/u.test(path))
  );
  const identities = new Set();
  for (const line of output.split('\n')) {
    const summary = PYTEST_SUMMARY_LINE.exec(line);
    const progress = summary ? null : PYTEST_PROGRESS_LINE.exec(line);
    const match = summary
      ? { outcome: summary[1], file: summary[2], node: summary[3] }
      : progress && {
          outcome: progress[3],
          file: progress[1],
          node: progress[2],
        };
    if (!match || !targets.has(match.file)) continue;
    const identity = `${match.outcome} ${match.file}::${match.node}`;
    if (identity.length > 200) continue;
    identities.add(identity);
    if (identities.size === 3) break;
  }
  return [...identities];
}

/**
 * Keep only registered pytest identities (assertion bodies are not diagnostic
 * labels); otherwise node:test / Vitest identities, then generic diagnostics.
 */
function structuralFailureExcerpt(command, output, index, count, code) {
  const pytest = registeredPytestIdentities(command, output);
  const tests = pytest.length > 0 ? pytest : extractFailureIdentities(output);
  // Test identities win; otherwise surface the likeliest cause (e.g. a
  // coverage-threshold ERROR) instead of only the exit code.
  const body = tests.length > 0 ? tests : extractDiagnosticLines(output);
  const header = [
    `Structural command ${index + 1}/${count} failed (exit ${code}). Command: ${commandLabel(command)}`,
    ...capLines(body, HEADER_BODY_MAX),
  ].join('\n');
  return `${header}\n\n${excerpt(output, 1200 - header.length - 3)}`;
}

/**
 * Files whose change can alter Biome's verdict on untouched files (config or
 * the pinned Biome version). Linting only the changed files would let a
 * formatter bump leave drift in every file the bump PR didn't touch (#18071).
 */
export const BIOME_TOOLCHAIN_FILES = Object.freeze([
  'biome.json',
  'biome.jsonc',
  'package.json',
  'pnpm-lock.yaml',
]);

export function biomeNeedsFullTree(changed) {
  return changed.some(file => BIOME_TOOLCHAIN_FILES.includes(file));
}

function runBiome() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  const toolchain = changedFiles([...BIOME_TOOLCHAIN_FILES]);
  if (event !== 'workflow_dispatch' && !biomeNeedsFullTree(toolchain ?? [])) {
    const files = changedFiles([
      '*.ts',
      '*.tsx',
      '*.js',
      '*.jsx',
      '*.json',
      '*.mts',
      '*.mjs',
      ':(exclude)**/package-lock.json',
      ':(exclude).claude/settings.json',
      ':(exclude).claude/skills/**',
    ]);
    if (files && files.length === 0) {
      return { code: 0, output: 'No lintable files changed\n', skipped: false };
    }
    if (files && files.length > 0) {
      const quoted = files.map(f => JSON.stringify(f)).join(' ');
      return shell(
        `pnpm biome ci --reporter=github --no-errors-on-unmatched ${quoted}`
      );
    }
  }
  return shell('pnpm biome ci --reporter=github .');
}

function runShadcnLintContracts() {
  return shell('pnpm --filter=@jovie/web run lint:shadcn-contracts');
}

function runEslintServerBoundaries() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch') {
    const files = changedFiles([
      'apps/web/*.ts',
      'apps/web/*.tsx',
      'apps/web/**/*.ts',
      'apps/web/**/*.tsx',
    ]);
    if (files && files.length === 0) {
      return {
        code: 0,
        output: 'No server-boundary TypeScript files changed\n',
        skipped: false,
      };
    }
    if (files && files.length > 0) {
      const quoted = files.map(f => JSON.stringify(f)).join(' ');
      return shell(
        `pnpm --filter=@jovie/web run lint:server-boundaries -- ${quoted}`
      );
    }
  }
  return shell('pnpm --filter=@jovie/web run lint:server-boundaries');
}

function runTypecheck() {
  // --force is mandatory (JOV-3499). Gate guard scans this file + ci.yml.
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (
    event === 'pull_request' &&
    process.env.CI_FAST_RUN_JOVIE_TYPECHECK === 'false'
  ) {
    return {
      code: 0,
      output:
        'No TypeScript graph files changed (ci-path-changes preselection)\n',
      skipped: true,
    };
  }
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output: 'Jovie product typecheck skipped (no product files changed)\n',
      skipped: true,
    };
  }
  if (event === 'pull_request') {
    const files = listAllChangedFiles();
    if (files && !files.some(file => affectsJovieTypecheck(file))) {
      return {
        code: 0,
        output: 'No TypeScript graph files changed\n',
        skipped: true,
      };
    }
  }
  return shellAsync('pnpm turbo typecheck --affected --force');
}

function runWebTestsTypecheck() {
  // The shrink-only apps/web test graph (tests/, scripts/, allowJs helpers)
  // rotted while nothing in CI ran it. Source-PR preselection
  // (run_jovie_typecheck) already counts its JS and baseline inputs via
  // affectsWebTestTypecheck, so a 'false' receipt means none changed.
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (
    event === 'pull_request' &&
    process.env.CI_FAST_RUN_JOVIE_TYPECHECK === 'false'
  ) {
    return {
      code: 0,
      output:
        'No TypeScript graph files changed (ci-path-changes preselection)\n',
      skipped: true,
    };
  }
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output: 'Web tests typecheck skipped (no product files changed)\n',
      skipped: true,
    };
  }
  if (event === 'pull_request') {
    const files = listAllChangedFiles();
    if (files && !files.some(file => affectsWebTestTypecheck(file))) {
      return {
        code: 0,
        output: 'No web test typecheck inputs changed\n',
        skipped: true,
      };
    }
  }
  // Own lock so it overlaps app tsc instead of queueing behind it.
  return shellAsync(
    `TYPECHECK_SINGLEFLIGHT_DIR=.cache/typecheck-singleflight-tests ${WEB_TESTS_TYPECHECK_COMMAND}`
  );
}

function runScriptsTypecheck() {
  // JOV-4327: run the shrink-only scripts ratchet on every hydrated remaining
  // job. The TypeScript project imports files outside scripts/, and baseline or
  // resolver changes can alter its diagnostics without touching a path filter.
  return shell('pnpm run typecheck:scripts');
}

function runGuardrails() {
  // Exclusive Symphony/Summer diffs must not wait on Jovie product guardrails
  // (JOV-5288). Product-lane selection still slices remaining work when the
  // product lane is on.
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output: 'Guardrails skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const base = process.env.GITHUB_BASE_REF || 'main';
  const originBase = `origin/${base}`;
  const selected = selectedProductLanes();
  const parts = [
    ...(selected.has('mac')
      ? [
          `node scripts/desktop-release-guard.mjs --base ${JSON.stringify(originBase)}`,
        ]
      : []),
    ...(selected.has('cross-product')
      ? [
          `node scripts/version-fanout-guard.mjs --base ${JSON.stringify(originBase)}`,
          'node scripts/version-check.mjs',
        ]
      : []),
    ...(selected.has('operations')
      ? [
          'node scripts/design-authority-guard.mjs',
          'node --test scripts/dev-loop-latency.test.mjs',
          // Exercise retention executables and subprocess coverage before other guards.
          'node --test --test-timeout=45000 --experimental-test-coverage --test-coverage-include="scripts/*retention.mjs" --test-coverage-lines=75 --test-coverage-functions=70 --test-coverage-branches=75 scripts/local-runtime-retention.test.mjs scripts/generated-artifact-retention.test.mjs scripts/cleanup-safety.test.mjs scripts/setup-cache-cleanup.test.mjs',
          'pnpm design:logo-assets:check',
          'node --test scripts/cleanup-stale-dev.test.mjs scripts/desktop-release-guard.test.mjs scripts/desktop-installed-apps-audit.test.mjs scripts/dev-web-fast.test.mjs scripts/ios-guardrail-rollout-audit.test.mjs scripts/version-fanout-guard.test.mjs scripts/version-stamp.test.mjs scripts/agent/preflight.test.mjs scripts/agent/pen-save-receipt.test.mjs scripts/agent/pen-live-canvas-persist.test.mjs scripts/agent/pen-cold-readback.test.mjs scripts/skill-governance-guard.test.mjs scripts/skill-catalog.test.mjs scripts/agent-web-contract.test.mjs scripts/dev-loop-contract.test.mjs',
        ]
      : []),
    ...(selected.has('web')
      ? ['node apps/web/scripts/next-proxy-guard.mjs']
      : []),
  ];
  if (parts.length === 0)
    return {
      code: 0,
      output: 'No guardrail product lane selected\n',
      skipped: true,
    };
  let combined = '';
  for (const cmd of parts) {
    const result = shell(cmd);
    combined += result.output;
    if (result.code !== 0) {
      return { code: result.code, output: combined };
    }
  }
  return { code: 0, output: combined };
}

function runDesignSystemSourceRatchet() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Design-system source ratchet skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const selected = selectedProductLanes();
  if (!selected.has('web')) {
    return {
      code: 0,
      output: 'No web product lane selected\n',
      skipped: true,
    };
  }
  return shell(LANE_COMMANDS['design-system-source-ratchet']);
}

function runDesignExceptionRegistry() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Design exception registry skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const selected = selectedProductLanes();
  if (!selected.has('web')) {
    return {
      code: 0,
      output: 'No web product lane selected\n',
      skipped: true,
    };
  }
  return shell(LANE_COMMANDS['design-exception-registry']);
}

function runDesignGovernanceEnforcement() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Design governance enforcement skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const selected = selectedProductLanes();
  if (!selected.has('web')) {
    return {
      code: 0,
      output: 'No web product lane selected\n',
      skipped: true,
    };
  }
  return shell(LANE_COMMANDS['design-governance-enforcement']);
}

/**
 * @typedef {object} DesignConformanceOpts
 * @property {string[] | null} [changedFileList]
 * @property {(command: string) => {code: number, output: string, skipped?: boolean}} [execute]
 */

/**
 * @param {DesignConformanceOpts} [opts]
 */
export function runDesignConformance(opts) {
  const options = opts ?? {};
  const execute = options.execute;
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event === 'workflow_dispatch') {
    return (execute ?? shell)(LANE_COMMANDS['design-conformance']);
  }

  const files =
    'changedFileList' in options
      ? options.changedFileList
      : listAllChangedFiles();
  if (files === null) {
    return {
      code: 1,
      output: 'Design conformance failed: changed files unavailable\n',
    };
  }

  if (!selectDesignConformanceChecks(files).applicable) {
    return {
      code: 0,
      output: 'Design conformance skipped (no design-domain files changed)\n',
      skipped: true,
    };
  }

  return (execute ?? shell)(LANE_COMMANDS['design-conformance']);
}

function runIosFast() {
  const files = changedFiles([
    'apps/ios/**',
    'fastlane/**',
    'Gemfile',
    'Gemfile.lock',
    'scripts/ios-best-practices-lint.sh',
    '.github/workflows/ios-ci.yml',
    '.github/workflows/ios-testflight.yml',
  ]);
  if (files && files.length === 0) {
    return {
      code: 0,
      output: 'No iOS contract files changed\n',
      skipped: true,
    };
  }
  return shell('pnpm run ios:lint');
}

function runProfileAdmission() {
  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch' && !repoLanes().runJovieProduct) {
    return {
      code: 0,
      output:
        'Public-profile admission skipped (no Jovie product files changed)\n',
      skipped: true,
    };
  }
  const files = changedFiles([
    ':(glob)apps/web/app/\\[username\\]/**',
    'apps/web/app/(marketing)/renders/profile-admission/**',
    'apps/web/app/api/profile/**',
    'apps/web/components/features/release/SmartLinkProviderButton.tsx',
    'apps/web/components/features/profile/**',
    'apps/web/components/providers/QueryProvider*',
    'apps/web/components/organisms/CookieBannerMount.tsx',
    'apps/web/components/organisms/CookieBannerSection.tsx',
    'apps/web/lib/cookies/**',
    'apps/web/lib/profile/**',
    'apps/web/lib/rate-limit/**',
    'apps/web/lib/tracking/pac-**',
    'apps/web/styles/design-system.css',
    'apps/web/tests/unit/profile/profile-compact-template.test.tsx',
    'apps/web/tests/e2e/profile-admission.spec.ts',
    'apps/web/tests/e2e/utils/public-profile-layout-invariant.ts',
    'apps/web/tests/e2e/profile/**',
    'apps/web/tests/e2e/public-profile-smoke.spec.ts',
    'apps/web/tests/e2e/utils/public-surface-**',
    'scripts/ci-fast-lanes.mjs',
  ]);
  if (files && files.length === 0) {
    return {
      code: 0,
      output: 'No public-profile admission files changed\n',
      skipped: true,
    };
  }

  return shell(LANE_COMMANDS['profile-admission']);
}

/** Async twin of shell() so structural commands can overlap. */
function shellAsync(command) {
  return new Promise(resolveResult => {
    const stdout = [];
    const stderr = [];
    const child = spawn(command, {
      shell: true,
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error =>
      resolveResult({ code: 1, output: String(error) })
    );
    child.on('close', code =>
      resolveResult({
        code: code ?? 1,
        output: `${Buffer.concat(stdout)}${Buffer.concat(stderr)}`,
      })
    );
  });
}

/** Sized for GitHub ubuntu-latest (4 vCPU / 16 GB); CI web Vitest is 1 fork. */
export const STRUCTURAL_DEFAULT_CONCURRENCY = 3;

export function structuralConcurrency(value) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : STRUCTURAL_DEFAULT_CONCURRENCY;
}

/**
 * Measured long poles (2026-09-25 local 4 vCPU: 224s, 170s, 126s of a 913s
 * serial sum). Starting them first keeps the tail from waiting on one late
 * command. A stale entry only loses the head start; output order is unchanged.
 */
const STRUCTURAL_LONG_POLES = Object.freeze([
  'python3 -m pytest ',
  'pnpm invariants:check',
  'run-governor-bounded-codex-selector.sh',
  // 2026-09-26 merge groups: 42s and 38s, the slowest web commands. List
  // order started the 42s one 16th of 22, so it set the web-only wall.
  'lib/__tests__/component-live-storybook-certification.test.mjs',
  'YoutubeThumbnailsLanding.test.tsx',
]);

const PACKAGE_DIRS = Object.freeze({ '@jovie/web': 'apps/web' });
/** Entry points whose child commands are invisible in package.json text. */
const OPAQUE_ENTRY_LOCKS = Object.freeze([
  // Runs scripts Vitest suites with the default scripts/coverage directory.
  ['scripts/run-affected-tests.mjs --control', 'coverage:scripts'],
]);

function packageScripts(dir) {
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, dir, 'package.json'), 'utf8')
    );
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/** Expand `pnpm [--filter X] [run] <script>` aliases into [dir, segment] pairs. */
function expandSegments(command, dir = '.', depth = 0) {
  const segments = [];
  for (const raw of command.split(/&&|\|\||;/u)) {
    const segment = raw.trim();
    const alias =
      /^pnpm(?:\s+--filter(?:=|\s+)(\S+))?(?:\s+run)?\s+([\w:-]+)$/u.exec(
        segment
      );
    const aliasDir = alias?.[1] ? PACKAGE_DIRS[alias[1]] : dir;
    const body = alias && aliasDir && packageScripts(aliasDir)[alias[2]];
    if (body && depth < 5) {
      segments.push(...expandSegments(body, aliasDir, depth + 1));
    } else {
      segments.push([dir, segment]);
    }
  }
  return segments;
}

function vitestRoot(dir, segment) {
  if (/--filter(?:=|\s+)@jovie\/web\b|--dir\s+apps\/web\b/u.test(segment)) {
    return 'apps/web';
  }
  if (/--root\s+scripts\b|--config\s+scripts\/vitest/u.test(segment)) {
    return 'scripts';
  }
  return dir;
}

/**
 * Shared writable state a structural command touches; commands sharing a lock
 * never overlap. Vitest cleans and rewrites its coverage reportsDirectory
 * (default `<root>/coverage`; relative dirs nest inside it), coverage.py data
 * is keyed by COVERAGE_FILE, and pytest owns the repo-root `.pytest_cache`
 * (unless `-p no:cacheprovider` turns the cache off for that invocation).
 */
export function structuralLocks(command) {
  const locks = new Set();
  for (const [dir, segment] of expandSegments(command)) {
    for (const [entry, lock] of OPAQUE_ENTRY_LOCKS) {
      if (segment.includes(entry)) locks.add(lock);
    }
    if (/\bvitest\b/u.test(segment) && /--coverage\b/u.test(segment)) {
      const reports = /--coverage\.reportsDirectory=("[^"]+"|\S+)/u
        .exec(segment)?.[1]
        ?.replaceAll('"', '');
      locks.add(
        reports && /^(?:\/|\$\{RUNNER_TEMP)/u.test(reports)
          ? `coverage:${reports}`
          : `coverage:${vitestRoot(dir, segment)}`
      );
    }
    for (const match of segment.matchAll(/COVERAGE_FILE=("[^"]+"|\S+)/gu)) {
      locks.add(`pycoverage:${match[1].replaceAll('"', '')}`);
    }
    // `python3 -m pytest` and `coverage run -m pytest` both write the shared
    // cache unless the cache plugin is disabled for that invocation.
    if (
      /(?:^|\s)-m pytest\b/u.test(segment) &&
      !/(?:^|\s)-p no:cacheprovider\b/u.test(segment)
    ) {
      locks.add('pytest-cache');
    }
  }
  return [...locks].sort();
}

/**
 * Run commands with bounded concurrency. Commands sharing a lock run one at a
 * time in list order. After the first failure no new command starts, but
 * in-flight commands finish. A synchronous executor completes before the next
 * command is considered, so it behaves exactly like the old serial loop.
 * `first` lists indexes (long poles) to start ahead of list order; they never
 * jump an earlier command that shares one of their locks. `stop` is consulted
 * before each start; once it returns true nothing new starts (in-flight
 * commands still finish) and the unstarted commands stay undefined.
 * @param {readonly string[]} commands
 * @param {{execute: (command: string) => ExecResult | Promise<ExecResult>, concurrency: number, locks?: readonly (readonly string[])[], first?: readonly number[], now?: () => number, stop?: () => boolean}} opts
 * @returns {Promise<(ExecResult & {durationMs: number} | undefined)[]>}
 * @typedef {{code: number, output: string}} ExecResult
 */
export function runCommandPool(commands, opts) {
  const { execute, concurrency } = opts;
  const locks = opts.locks ?? commands.map(() => []);
  const now = opts.now ?? Date.now;
  const results = new Array(commands.length);
  const first = new Set(opts.first ?? []);
  const pending = commands
    .map((_, index) => index)
    .sort((a, b) => Number(first.has(b)) - Number(first.has(a)) || a - b);
  const blocked = index =>
    locks[index].some(lock => held.has(lock)) ||
    pending.some(
      other => other < index && locks[other].some(l => locks[index].includes(l))
    );
  const held = new Set();
  let running = 0;
  let failed = false;
  let stopped = false;
  let pumping = false;
  let repump = false;

  return new Promise(resolveAll => {
    const finish = (index, startedAt, result) => {
      running -= 1;
      for (const lock of locks[index]) held.delete(lock);
      const code = Number.isInteger(result?.code) ? result.code : 1;
      results[index] = {
        code,
        output: String(result?.output ?? ''),
        durationMs: Math.max(0, now() - startedAt),
      };
      if (code !== 0) failed = true;
      pump();
    };
    const start = index => {
      running += 1;
      for (const lock of locks[index]) held.add(lock);
      const startedAt = now();
      const onError = error =>
        finish(index, startedAt, {
          code: 1,
          output:
            error instanceof Error
              ? error.stack || error.message
              : String(error),
        });
      let result;
      try {
        result = execute(commands[index]);
      } catch (error) {
        onError(error);
        return;
      }
      if (result instanceof Promise) {
        result.then(value => finish(index, startedAt, value), onError);
      } else {
        finish(index, startedAt, result);
      }
    };
    const pump = () => {
      if (pumping) {
        repump = true;
        return;
      }
      pumping = true;
      do {
        repump = false;
        while (!failed && !stopped && running < concurrency) {
          if (pending.length > 0 && opts.stop?.()) {
            stopped = true;
            break;
          }
          const slot = pending.findIndex(index => !blocked(index));
          if (slot === -1) break;
          start(pending.splice(slot, 1)[0]);
        }
      } while (repump);
      pumping = false;
      if (running === 0 && (failed || stopped || pending.length === 0)) {
        resolveAll(results);
      }
    };
    pump();
  });
}

/** Markdown table of structural command wall times, slowest first. */
export function formatStructuralTimings(timings, wallMs) {
  if (!timings?.length) return '';
  const total = timings.reduce((sum, t) => sum + t.durationMs, 0);
  const seconds = ms => `${(ms / 1000).toFixed(1)}s`;
  const rows = [...timings]
    .sort((a, b) => b.durationMs - a.durationMs || a.index - b.index)
    .map(t => {
      const label = commandLabel(t.command, 100)
        .replaceAll('|', '\\|')
        .replaceAll('`', "'");
      const result = t.code === 0 ? 'pass' : `exit ${t.code}`;
      return `| ${t.index + 1} | ${seconds(t.durationMs)} | ${result} | \`${label}\` |`;
    });
  const wall = Number.isFinite(wallMs) ? `wall ${seconds(wallMs)}, ` : '';
  return [
    `#### Structural command timings (${wall}sum ${seconds(total)}, ${timings.length} commands)`,
    '',
    '| # | Time | Result | Command |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/**
 * ci-fast (remaining) runs this lane while its cheap lanes still run in the
 * background; their exit status lands in CI_FAST_STRUCTURAL_ABORT_STATUS_FILE.
 * A non-zero status keeps fail-fast: no further structural command starts and
 * the lane reports skipped, as when an earlier in-process lane failed. The
 * workflow's await step still fails the job on that status. A missing file
 * (lanes still running, or a job without background lanes) never aborts.
 */
export function earlierLaneFailed(
  statusFile = process.env.CI_FAST_STRUCTURAL_ABORT_STATUS_FILE
) {
  if (!statusFile || !failFastEnabled()) return false;
  try {
    return readFileSync(statusFile, 'utf8').trim() !== '0';
  } catch {
    return false;
  }
}

/** @param {{changedFileList?: readonly string[], concurrency?: number, execute?: (command: string) => ExecResult | Promise<ExecResult>, stop?: () => boolean}} [opts] */
export async function runStructural(opts = {}) {
  const execute = opts.execute ?? shellAsync;
  if (process.env.CI_FAST_SKIP_STRUCTURAL === 'true') {
    return {
      code: 0,
      output: 'Structural Contract skipped (path-gated)\n',
      skipped: true,
    };
  }

  const event = process.env.GITHUB_EVENT_NAME || '';
  if (event !== 'workflow_dispatch') {
    const lanes =
      opts.changedFileList === undefined
        ? repoLanes()
        : classifyCiRepoLanes(opts.changedFileList);
    if (!lanes.runJovieProduct && !lanes.runSymphonyControl) {
      return {
        code: 0,
        output:
          'Structural skipped (Summer/ops only; no Jovie or Symphony suites)\n',
        skipped: true,
      };
    }
  }

  const selected = selectedProductLanes();
  // invariants:check lives in operationsParts, but invariant-scanned sources
  // such as apps/desktop/src/main.ts classify as mac/web only (#18182 reached
  // main red that way). Unreadable or empty diffs fail closed.
  const changed =
    event === 'workflow_dispatch'
      ? null
      : (opts.changedFileList ?? listAllChangedFiles());
  const invariantParts =
    !selected.has('operations') &&
    (selected.has('web') || selected.has('mac')) &&
    (!changed?.length || changed.some(file => isInvariantScannedPath(file)))
      ? ['pnpm invariants:check']
      : [];
  const operationsParts = [
    ROUTE_PREP_COVERAGE_COMMAND,
    DELIVERY_CONTROLLER_COVERAGE_COMMAND,
    OFFLINE_FAILURE_COVERAGE_COMMAND,
    'pnpm invariants:check',
    "node --experimental-test-coverage --test --test-coverage-include='scripts/verification/*.mjs' --test-coverage-exclude='scripts/verification/*.test.mjs' --test-coverage-lines=100 --test-coverage-functions=100 --test-coverage-branches=98 scripts/verification/*.test.mjs",
    'pnpm ci:harness:check',
    'pnpm ci:incident-contract:validate',
    'node --test scripts/ci-release-trigger-contract.test.mjs .github/scripts/analyze-test-flakiness.test.js',
    // Orphan sweep: script contracts no other CI command ran.
    SCRIPT_CONTRACT_NODE_COMMAND,
    SCRIPT_CONTRACT_VITEST_COMMAND,
    'pnpm ci:control:test',
    'pnpm exec vitest --config scripts/vitest.config.mts run lib/__tests__/pr-visual-review.test.mjs lib/__tests__/pr-visual-capture-path.test.mjs --maxWorkers=1 --coverage --coverage.allowExternal --coverage.include="$PWD/.github/scripts/pr-visual-evidence-gate.mjs" --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-pr-visual-policy-coverage"',
    // merge-group-workflow-contract runs in ci:control:test's Vitest run.
    'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/production-release-supersession.test.mjs lib/__tests__/vitest-retry-reporter.test.mjs lib/__tests__/codex-recovery-ci.test.mjs',
    "pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/production-marker-state.test.ts --coverage --coverage.include='**/production-marker-state.mjs' --coverage.allowExternal=true --coverage.thresholds.lines=82 --coverage.thresholds.branches=79 --coverage.thresholds.functions=97",
    'node --test --experimental-test-coverage --test-coverage-include=scripts/backlog-orchestrator/linear-client.mjs --test-coverage-lines=73 --test-coverage-branches=83 --test-coverage-functions=66 scripts/backlog-orchestrator/__tests__/linear-client.transport.test.mjs scripts/backlog-orchestrator/__tests__/linear-pagination.test.mjs',
    'pnpm ci:branching-guard:validate',
    'pnpm ci:merge-queue:check',
    "node --experimental-test-coverage --test --test-coverage-include='scripts/native-merge-intent.mjs' --test-coverage-include='scripts/lib/source-admission-policy.mjs' --test-coverage-include='scripts/source-admission-check.mjs' --test-coverage-lines=98 scripts/lib/__tests__/native-merge-intent.test.mjs scripts/lib/__tests__/source-admission-policy.test.mjs scripts/lib/__tests__/source-admission-check.test.mjs scripts/lib/__tests__/writer-owned-pr-promote.test.mjs",
    'pnpm ci:typecheck-gate-guard',
    'pnpm doc:freshness:check',
    'node .github/scripts/quarantine-ledger.mjs validate',
    'python3 .github/scripts/test-security-suppression-audit.py',
    // The Gem contract is embedded in the broader Symphony controller suite.
    "node --test --test-name-pattern='keeps the Gem drain on typed fleet admission' scripts/backlog-orchestrator/__tests__/backlog-orchestrator.test.mjs",
    'python3 scripts/symphony/tests/run-hud-proof-gate.py',
    'python3 scripts/symphony/tests/run-runtime-proof-gate.py',
    'python3 scripts/symphony/tests/run-safe-restart-gate.py',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-service-attestation.coverage" python3 -m coverage run --branch scripts/symphony/tests/gem-service-attestation.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-service-attestation.coverage" python3 -m coverage report --include="*/scripts/symphony/emit_gem_service_attestation.py" --show-missing --precision=2 --fail-under=90',
    'bash scripts/symphony/tests/run-governor-bounded-codex-selector.sh',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-upstream-burrito.coverage" python3 -m coverage run --branch scripts/symphony/tests/upstream-burrito-payload.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-upstream-burrito.coverage" python3 -m coverage report --include="*/scripts/symphony/verify_upstream_burrito_payload.py" --show-missing --precision=2 --fail-under=90',
    'python3 scripts/symphony/tests/test_gem_disk_reclaim.py',
    'python3 scripts/symphony/tests/jovie-symphony-workspace.test.py',
    'python3 scripts/symphony/tests/test_gem_workspace_migrate.py',
    'if python3 -c "import coverage" 2>/dev/null; then COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gbrain-proxy.coverage" GBRAIN_PROXY_COVERAGE=1 pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/gbrain-runtime-assets.test.mjs && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gbrain-proxy.coverage" python3 -m coverage combine "${RUNNER_TEMP:-/tmp}" && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gbrain-proxy.coverage" python3 -m coverage report --include="*/scripts/symphony/gbrain-runtime/gbrain-mcp-http-proxy.py" --show-missing --precision=2 --fail-under=78; elif [ "${CI:-}" = "true" ]; then echo "::error::coverage.py missing from hosted structural lane" >&2; exit 1; else echo "coverage.py not installed - skip local GBrain proxy coverage"; fi',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-closure-health.coverage" python3 -m coverage run --branch scripts/symphony/tests/closure-health.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-closure-health.coverage" python3 -m coverage report --include="*/scripts/symphony/closure_health.py" --show-missing --precision=2 --fail-under=85',
    'python3 scripts/symphony/tests/gem-pr-drain.test.py',
    // Two shards of one file; its ShardPartitionContractTests proves every
    // class runs in exactly one. Installer tests never import the covered cycle.
    'GEM_CONTRACT_SHARD=installer python3 scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-delivery.coverage" GEM_CONTRACT_SHARD=coverage python3 -m coverage run --branch scripts/symphony/tests/gem-pr-rehabilitation-contract.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-delivery.coverage" python3 -m coverage report --include="*/scripts/symphony/gem-repo-drain-cycle.py" --show-missing --precision=2 --fail-under=95',
    'bash scripts/symphony/tests/align-runner-source-revision.test.sh',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-priority-gate.coverage" python3 -m coverage run --branch scripts/symphony/tests/gem-priority-gate.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-gem-priority-gate.coverage" python3 -m coverage report --include="*/scripts/symphony/gem-priority-gate.py" --show-missing --precision=2 --fail-under=84',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-fleet-admission.coverage" python3 -m coverage run --branch scripts/symphony/tests/test_fleet_admission_receipt.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-fleet-admission.coverage" python3 -m coverage report --include="*/scripts/symphony/fleet_admission_receipt.py" --show-missing --precision=2 --fail-under=74',
    'python3 scripts/symphony/tests/symphony-nvme-package-cache.test.py',
    'if python3 -c "import coverage" 2>/dev/null; then COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-summer-bottleneck-producer.coverage" python3 -m coverage run --branch scripts/symphony/tests/summer-bottleneck-producer.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-summer-bottleneck-producer.coverage" python3 -m coverage report --include="*/scripts/symphony/summer_bottleneck_producer.py" --show-missing --precision=2 --fail-under=80; elif [ "${CI:-}" = "true" ]; then echo "::error::coverage.py missing from hosted structural lane" >&2; exit 1; else echo "coverage.py not installed - skip local Summer bottleneck producer coverage"; fi',
    'node --test --experimental-test-coverage --test-coverage-include=scripts/backlog-orchestrator/shipping-lead-gate.mjs --test-coverage-lines=95 --test-coverage-branches=80 --test-coverage-functions=95 scripts/backlog-orchestrator/__tests__/shipping-lead-gate.test.mjs',
    'if [ -f scripts/symphony/summer-symphony-outbox-consumer.test.mjs ]; then node --test --experimental-test-coverage --test-coverage-include=scripts/symphony/summer-symphony-outbox-consumer.mjs --test-coverage-include=scripts/symphony/summer-shipping-lead-contract.mjs --test-coverage-lines=90 --test-coverage-branches=80 --test-coverage-functions=95 scripts/symphony/summer-symphony-outbox-consumer.test.mjs scripts/symphony/summer-symphony-outbox-contract.test.mjs scripts/symphony/summer-shipping-lead-contract.test.mjs; else node --test --experimental-test-coverage --test-coverage-include=scripts/symphony/summer-symphony-outbox-consumer.mjs --test-coverage-lines=78 --test-coverage-branches=54 --test-coverage-functions=90 scripts/symphony/summer-symphony-outbox-contract.test.mjs; fi',
    'node --test --experimental-test-coverage --test-coverage-include=scripts/symphony/native-queue-starvation-execute.mjs --test-coverage-lines=90 --test-coverage-branches=80 --test-coverage-functions=85 scripts/symphony/native-queue-starvation-execute.test.mjs',
    'python3 scripts/symphony/tests/test_evaluate_fleet_gate.py',
    'python3 scripts/symphony/tests/run-model-state-gate.py',
    'python3 scripts/symphony/tests/cursor-cli-worker.test.py',
    'python3 scripts/symphony/tests/run-summer-publisher-gate.py',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-summer-ci-audit.coverage" python3 -m coverage run --branch scripts/symphony/tests/summer-ci-audit.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-summer-ci-audit.coverage" python3 -m coverage report --include="*/scripts/symphony/summer_ci_audit.py" --show-missing --precision=2 --fail-under=95',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-astra-readiness.coverage" python3 -m coverage run --branch scripts/symphony/tests/astra-readiness.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-astra-readiness.coverage" python3 -m coverage report --include="*/scripts/symphony/astra/astra_readiness.py" --show-missing --precision=2 --fail-under=90',
    'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-hyperagent-lifecycle.coverage" python3 -m coverage run --branch scripts/symphony/tests/hyperagent-lifecycle.test.py && COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-hyperagent-lifecycle.coverage" python3 -m coverage report --include="*/scripts/symphony/hyperagent/lifecycle.py" --show-missing --precision=2 --fail-under=95',
    'python3 scripts/symphony/tests/symphony-github-poke.test.py',
    'node --test scripts/backlog-orchestrator/__tests__/pre-lease-gates.test.mjs',
    'node --test scripts/backlog-orchestrator/__tests__/gate-next-hold.test.mjs',
    'node --test scripts/backlog-orchestrator/__tests__/ownership-inventory.test.mjs',
    ...STRUCTURAL_PYTHON_REGRESSION_COMMANDS,
    // actionlint runs as a dedicated workflow step before this script (.github/scripts/run-actionlint.sh).
  ];
  const webParts = [
    // JOV-6104: measured marketing contracts must run for registry-only edits.
    MARKETING_CERTIFICATION_COMMAND,
    'pnpm next:proxy-guard',
    'pnpm tailwind:check',
    'pnpm --filter=@jovie/web run lint:no-native-dialogs',
    'pnpm --filter=@jovie/web run lint:seo',
    'pnpm --filter=@jovie/web run lint:contrast-ratchet',
    'pnpm design:shared-ui-visual-arbitrary:check',
    // JOV-6103: execute the certification kernel and its negative-path tests.
    // A missing selector or dependency must fail, never count as proof.
    CERTIFICATION_KERNEL_COMMAND,
    // Revision-bound acquisition decisions and unchanged marketing CAS behavior.
    ACQUISITION_CERTIFICATION_COMMAND,
    // JOV-4421: hard ship gate — tests + matching stories for shippable UI.
    'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/component-ship-gate.test.mjs',
    // JOV-5454: live Storybook certification evaluator + lifecycle.
    'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/component-live-storybook-certification.test.mjs',
    'pnpm component-ship-gate',
    'pnpm screen-registration-gate',
    'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/design-exception-registry.test.mjs --coverage --coverage.include=design-exception-registry.mjs --coverage.thresholds.lines=75 --coverage.thresholds.branches=70 --coverage.thresholds.functions=60',
    'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/design-system/spacing-scale-ratchet.test.ts tests/unit/design-system/concentric-radius-contract.test.ts tests/unit/design-system/native-spacing-scale-ratchet.test.ts tests/unit/app/workspace-page-seam-contract.test.ts --coverage --coverage.include=scripts/optical-grid-scanners.ts --coverage.thresholds.lines=90 --coverage.thresholds.branches=85 --coverage.thresholds.functions=90',
    // Blocking UI invariants (Tim lock 2026-08-30, extended 2026-09-03 by
    // JOV-5951, gbrain ops/reviewed-invariants/blocking-ui-invariants-v1),
    // governed by certify-only-working-v1: unproven is hidden, not green.
    // Target Vitest directly so the screen contracts always execute and fail
    // closed when a file is missing or resolves to zero tests (visual ENOENT
    // is FAIL, not advisory).
    'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/design-system/one-primary-action-per-screen-v1.test.ts tests/unit/design-system/editorial-card-max-v1.test.ts tests/unit/design-system/mac-header-two-lines-v1.test.ts tests/unit/design-system/column-heading-line-clamp-1-v1.test.ts tests/unit/design-system/single-column-one-width-v1.test.ts tests/unit/design-system/one-chrome-layer-v1.test.ts tests/unit/design-system/one-notification-v1.test.ts tests/unit/design-system/one-modal-layer-v1.test.ts',
    'pnpm --filter @jovie/web run test:reliability-detectors',
  ];
  const macParts = [DESKTOP_RELEASE_COVERAGE_COMMAND];
  const allParts = [
    ...(selected.has('operations') || selected.has('web')
      ? [
          webCiContractTestsCommand(undefined, [DEPLOY_WORKFLOW_CI_TEST]),
          STRUCTURAL_RUNNER_COVERAGE_COMMAND,
          'pnpm --dir apps/web exec vitest run --config vitest.config.fast.mts app/api/internal/ovie/summer-bottleneck/route.test.ts --coverage --coverage.include=app/api/internal/ovie/summer-bottleneck/route.ts --coverage.include=lib/ovie/summer-admissions.ts --coverage.include=lib/ovie/summer-ci-audit.ts',
          'pnpm exec vitest --config scripts/vitest.config.mts run lib/__tests__/symphony-health-contract.test.mjs --coverage --coverage.allowExternal --coverage.include="$PWD/packages/agent-transport-contracts/symphony-outage.ts" --coverage.thresholds.lines=100 --coverage.thresholds.statements=100 --coverage.thresholds.functions=100 --coverage.thresholds.branches=90 --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-symphony-health-contract-coverage"',
          // Run the deploy contract by name for operations-only changes too:
          // .github/scripts and workflow diffs select only the operations lane,
          // and the directory run above skips it while it sits in the
          // quarantine ledger (#18339 landed a red deploy contract that way).
          // Targeting Vitest directly also fails closed when the file cannot
          // be resolved or contains no tests.
          `pnpm --filter @jovie/web exec vitest run --config=vitest.config.ci-contracts.mts ${DEPLOY_WORKFLOW_CI_TEST}`,
          ...(selectPlaywrightReceipt(event, selected, changed)
            ? [
                `pnpm --filter @jovie/web exec vitest run --config=vitest.config.ci-contracts.mts ${PLAYWRIGHT_RECEIPT_CI_TEST}`,
              ]
            : []),
        ]
      : []),
    ...invariantParts,
    ...(selected.has('operations') ? operationsParts : []),
    ...(selected.has('web') ? webParts : []),
    ...(selected.has('mac') ? macParts : []),
  ];
  // ci-fast (structural python) runs `only` its parts; remaining skips them.
  // Consume the split mode so nested contract suites (which rebuild this
  // list) don't inherit it and see a filtered pool.
  const mode = process.env.CI_FAST_STRUCTURAL_PYTEST;
  delete process.env.CI_FAST_STRUCTURAL_PYTEST;
  // Same for the fail-fast status file: the runner's own contract suite runs
  // runStructural and must not abort on this job's cheap-lane status.
  const abortStatusFile = process.env.CI_FAST_STRUCTURAL_ABORT_STATUS_FILE;
  delete process.env.CI_FAST_STRUCTURAL_ABORT_STATUS_FILE;
  const parts = allParts.filter(
    part => mode !== (STRUCTURAL_PYTHON_JOB_PARTS.has(part) ? 'skip' : 'only')
  );
  if (parts.length === 0) {
    return {
      code: 0,
      output: 'No structural product lane selected\n',
      skipped: true,
    };
  }

  const concurrency =
    opts.concurrency ??
    structuralConcurrency(process.env.CI_FAST_STRUCTURAL_CONCURRENCY);
  const startedAt = Date.now();
  const results = await runCommandPool(parts, {
    execute,
    concurrency,
    locks: parts.map(structuralLocks),
    stop: opts.stop ?? (() => earlierLaneFailed(abortStatusFile)),
    // Serial runs gain nothing from reordering; keep strict list order there.
    first:
      concurrency > 1
        ? parts.flatMap((command, index) =>
            STRUCTURAL_LONG_POLES.some(pole => command.includes(pole))
              ? [index]
              : []
          )
        : [],
  });
  const wallMs = Date.now() - startedAt;
  const timings = results.flatMap((result, index) =>
    result ? [{ index, command: parts[index], ...result }] : []
  );
  // First failure in list order, not completion order.
  const failedIndex = results.findIndex(result => result && result.code !== 0);
  if (failedIndex !== -1) {
    const { code, output } = results[failedIndex];
    return {
      code,
      output: structuralFailureExcerpt(
        parts[failedIndex],
        output,
        failedIndex,
        parts.length,
        code
      ),
      timings,
      wallMs,
    };
  }
  // findIndex, not some(): unstarted commands are holes in the results array.
  if (results.findIndex(result => result === undefined) !== -1) {
    return {
      code: 0,
      output:
        'skipped: earlier lane failed (fail-fast; background ci-fast lanes exited non-zero)\n',
      skipped: true,
      timings,
      wallMs,
    };
  }
  // Deterministic list order regardless of completion order.
  const combined = results.map(result => result.output).join('');
  return { code: 0, output: combined, timings, wallMs };
}

function annotateFailure(lane, logExcerpt) {
  // GitHub Actions annotation — visible on the PR Checks UI.
  const msg = `${lane.name} failed. Fix: ${lane.nextLocalCommand}`;
  console.error(
    `::error title=${escapeAnnotationProperty(lane.name)}::${escapeAnnotationMessage(msg)}`
  );
  // Keep annotation body short; full log is in the step output.
  const short = failureAnnotationMessage(lane, logExcerpt);
  if (short) console.error(`::error::${short}`);
}

function writeSummary(results, groupId, timingTables = []) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    `### ci-fast lanes (${groupId || 'all'})`,
    '',
    '| Lane | Status | Next local command |',
    '| --- | --- | --- |',
  ];
  for (const r of results) {
    lines.push(`| ${r.name} | **${r.status}** | \`${r.nextLocalCommand}\` |`);
  }
  lines.push('');
  const failed = results.filter(r => r.status === 'failure');
  if (failed.length > 0) {
    lines.push('#### Failing lanes');
    for (const r of failed) {
      lines.push('');
      lines.push(`##### ${r.name}`);
      lines.push('');
      lines.push('```');
      lines.push(r.logExcerpt || '(no output)');
      lines.push('```');
    }
  }
  for (const table of timingTables) lines.push('', table);
  lines.push('');
  appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

/**
 * Always materialize CI_FAST_LANES_OUT so the workflow upload step never sees
 * a missing artifact path (JOV-4446: "No files were found ... ci-fast-lanes.json").
 * @param {LaneResult[]} results
 * @param {string | undefined} laneGroup
 * @param {string | undefined} setupError
 */
function writeLaneResults(results, laneGroup, setupError) {
  const outPath =
    process.env.CI_FAST_LANES_OUT || resolve(REPO_ROOT, 'ci-fast-lanes.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        schemaVersion: 2,
        job: 'ci-fast',
        group: laneGroup || 'all',
        lanes: results,
        setupError: setupError || null,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`[ci-fast] wrote lane results → ${outPath}`);
  return outPath;
}

/** Lanes worth skipping after an earlier failure; every other lane is cheap. */
export const FAIL_FAST_SKIPPABLE_LANES = Object.freeze(new Set(['structural']));

function failFastEnabled() {
  return process.env.CI_FAST_FAIL_FAST !== 'false';
}

async function main() {
  const laneGroup = process.env.CI_FAST_LANE_GROUP;
  /** @type {LaneResult[]} */
  const results = [];
  /** @type {string[]} */
  const timingTables = [];
  /** @type {string | undefined} */
  let setupError;
  const failFast = failFastEnabled();

  try {
    let selectedLanes = selectLanes(laneGroup);
    if (process.env.CI_FAST_ONLY_STRUCTURAL === 'true') {
      selectedLanes = selectedLanes.filter(lane => lane.id === 'structural');
    }

    // Overlap the independent tsc lanes (~5.6 GB each); results keep order.
    const started = new Map();
    for (const lane of selectedLanes.filter(l =>
      LANE_GROUPS.typecheck.includes(l.id)
    )) {
      const run = Promise.resolve().then(() => lane.run());
      run.catch(() => {});
      started.set(lane.id, [Date.now(), run]);
    }

    let failedFast = false;
    for (const lane of selectedLanes) {
      console.log(`\n======== lane: ${lane.id} ========`);
      const [laneStartedAt, run] = started.get(lane.id) ?? [Date.now()];

      if (failedFast && FAIL_FAST_SKIPPABLE_LANES.has(lane.id)) {
        const logExcerpt = 'skipped: earlier lane failed (fail-fast)';
        console.log(`[ci-fast] ${lane.id}: skipped`);
        console.log(logExcerpt);
        results.push({
          id: lane.id,
          name: lane.name,
          nextLocalCommand: lane.nextLocalCommand,
          status: 'skipped',
          logExcerpt,
          durationMs: Math.max(0, Date.now() - laneStartedAt),
        });
        continue;
      }

      let outcome;
      try {
        outcome = await (run ?? lane.run());
      } catch (error) {
        const message =
          error instanceof Error ? error.stack || error.message : String(error);
        outcome = { code: 1, output: message };
      }

      const skipped = Boolean(outcome.skipped);
      const status = skipped
        ? 'skipped'
        : outcome.code === 0
          ? 'success'
          : 'failure';
      const logExcerpt =
        status === 'failure'
          ? laneFailureExcerpt(lane.id, outcome.output)
          : excerpt(outcome.output);

      if (status === 'failure') {
        annotateFailure(lane, logExcerpt);
        if (failFast) failedFast = true;
      }

      console.log(`[ci-fast] ${lane.id}: ${status}`);
      if (lane.id === 'structural' && status === 'success') {
        // Keep exact suite/coverage receipts available in GitHub's job log.
        console.log(outcome.output);
      } else if (logExcerpt && status !== 'success') {
        console.log(logExcerpt);
      }
      const timingTable = formatStructuralTimings(
        outcome.timings,
        outcome.wallMs
      );
      if (timingTable) {
        console.log(`\n${timingTable}`);
        timingTables.push(timingTable);
      }

      results.push({
        id: lane.id,
        name: lane.name,
        nextLocalCommand: lane.nextLocalCommand,
        status,
        logExcerpt,
        durationMs: Math.max(0, Date.now() - laneStartedAt),
      });
    }
  } catch (error) {
    setupError =
      error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[ci-fast] setup failed: ${setupError}`);
  }

  writeSummary(results, laneGroup, timingTables);
  writeLaneResults(results, laneGroup, setupError);

  if (setupError) {
    process.exit(1);
  }

  const failed = results.filter(r => r.status === 'failure');
  if (failed.length > 0) {
    console.error(
      `[ci-fast] ${failed.length} lane(s) failed: ${failed.map(f => f.id).join(', ')}`
    );
    process.exit(1);
  }
  console.log('[ci-fast] all lanes passed');
  process.exitCode = 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  await main();
}
