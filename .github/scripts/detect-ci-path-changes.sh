#!/usr/bin/env bash
set -euo pipefail
emit_ci_lanes() {
  local mode="${1:-}"
  if [[ -z "${TRUSTED_CI_REPO_LANES:-}" ]]; then
    echo "::error::Trusted repo-lane classifier is unavailable"
    exit 1
  fi
  if [[ "$mode" == "all" ]]; then
    node "$TRUSTED_CI_REPO_LANES" --emit-github-output --all
  elif [[ "$mode" == "none" ]]; then
    node "$TRUSTED_CI_REPO_LANES" --emit-github-output --none
  else
    printf '%s\n' "${CHANGED_FILES:-}" | node "$TRUSTED_CI_REPO_LANES" --emit-github-output
  fi
}
IS_FORK="${IS_FORK_PULL_REQUEST}"
# Determine changed files
if [[ "${EVENT_NAME}" == "merge_group" ]]; then
  # JOV-4446: merge_group must use its exact SHAs; PR/push fields are empty.
  MERGE_GROUP_BASE_SHA="${EVENT_MERGE_GROUP_BASE_SHA}"
  MERGE_GROUP_HEAD_SHA="${EVENT_MERGE_GROUP_HEAD_SHA}"
  if [[ ! "$MERGE_GROUP_BASE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    [[ ! "$MERGE_GROUP_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    [[ "$MERGE_GROUP_BASE_SHA" == "0000000000000000000000000000000000000000" ]] ||
    [[ "$MERGE_GROUP_HEAD_SHA" == "0000000000000000000000000000000000000000" ]]; then
    echo "::error::merge_group base_sha/head_sha are not usable exact SHAs"
    exit 1
  fi
  # Re-resolved heads can hide changes in an empty event range.
  # Retry against live main before requiring exact no-op trees.
  PATH_DIFF_DIR="$RUNNER_TEMP/merge-group-path-diff"
  mkdir -p "$PATH_DIFF_DIR"
  TRUSTED_PATH_DIFF_RESOLVER="$PATH_DIFF_DIR/resolve-merge-group-path-diff.mjs"
  git show "${MERGE_GROUP_BASE_SHA}:scripts/lib/resolve-merge-group-path-diff.mjs" \
    > "$TRUSTED_PATH_DIFF_RESOLVER"
  node "$TRUSTED_PATH_DIFF_RESOLVER" \
    --base "$MERGE_GROUP_BASE_SHA" \
    --head "$MERGE_GROUP_HEAD_SHA" \
    --files-out "$PATH_DIFF_DIR/files.txt" \
    --meta-out "$PATH_DIFF_DIR/meta.env"
  IS_NOOP=$(sed -n 's/^IS_NOOP=//p' "$PATH_DIFF_DIR/meta.env")
  SOURCE=$(sed -n 's/^SOURCE=//p' "$PATH_DIFF_DIR/meta.env")
  PATH_DIFF_BASE_SHA=$(sed -n 's/^PATH_DIFF_BASE_SHA=//p' "$PATH_DIFF_DIR/meta.env")
  PATH_DIFF_HEAD_SHA=$(sed -n 's/^PATH_DIFF_HEAD_SHA=//p' "$PATH_DIFF_DIR/meta.env")
  [[ "$IS_NOOP" == "true" || "$IS_NOOP" == "false" ]] || {
    echo "::error::Trusted merge-group resolver emitted an invalid no-op flag"
    exit 1
  }
  [[ "$SOURCE" =~ ^(event_base|live_main_merge_base|noop)$ ]] || {
    echo "::error::Trusted merge-group resolver emitted an invalid source"
    exit 1
  }
  TRUSTED_CI_REPO_LANES="$PATH_DIFF_DIR/ci-repo-lanes.mjs"
  git show "${MERGE_GROUP_BASE_SHA}:scripts/lib/ci-repo-lanes.mjs" \
    > "$TRUSTED_CI_REPO_LANES"
  CHANGED_FILES=$(cat "$PATH_DIFF_DIR/files.txt")
  if [[ "${IS_NOOP:-}" == "true" ]]; then
    # Typed no-op: Path Changes passes with all optional lanes off;
    # merge-group gates still validate the exact combined head.
    NOOP_BASE_TREE=$(git rev-parse --verify "${MERGE_GROUP_BASE_SHA}^{tree}")
    NOOP_HEAD_TREE=$(git rev-parse --verify "${MERGE_GROUP_HEAD_SHA}^{tree}")
    if [[ "$NOOP_BASE_TREE" != "$NOOP_HEAD_TREE" ]]; then
      echo "::error::Typed no-op requires equal exact event-base and head trees."
      exit 1
    fi
    PRODUCT_LANE_DIR="$RUNNER_TEMP/product-lane-classification"
    mkdir -p "$PRODUCT_LANE_DIR"
    : > "$PRODUCT_LANE_DIR/changed-paths.txt"
    {
      echo "path_diff_base_sha=$MERGE_GROUP_BASE_SHA"
      echo "path_diff_head_sha=$MERGE_GROUP_HEAD_SHA"
      echo "is_noop_merge_group=true"
      for output in run_build run_test run_test_performance run_storybook_a11y run_public_lighthouse run_dashboard_lighthouse run_onboarding_lighthouse run_admin_lighthouse run_chat_lighthouse run_promptfoo_evals run_golden_eval_set run_e2e run_golden_path run_drizzle run_neon run_ios run_macos run_web run_operations run_cross_product has_code_changes; do
        echo "$output=false"
      done
      echo "selected_lanes=none"
      echo "shared_contract_impact=none"
    } >> "$GITHUB_OUTPUT"
    emit_ci_lanes none
    exit 0
  fi
  # Compat for the landing where the trusted base resolver predates
  # explicit SHA metadata; future bases emit these directly.
  if [[ -z "$PATH_DIFF_BASE_SHA" ]]; then
    if [[ "$SOURCE" == "event_base" ]]; then
      PATH_DIFF_BASE_SHA="$MERGE_GROUP_BASE_SHA"
    else
      PATH_DIFF_BASE_SHA=$(git merge-base "$MERGE_GROUP_HEAD_SHA" refs/remotes/origin/main)
    fi
  fi
  PATH_DIFF_HEAD_SHA="${PATH_DIFF_HEAD_SHA:-$MERGE_GROUP_HEAD_SHA}"
  if [[ ! "$PATH_DIFF_BASE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    [[ ! "$PATH_DIFF_HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    [[ "$PATH_DIFF_HEAD_SHA" != "$MERGE_GROUP_HEAD_SHA" ]]; then
    echo "::error::Trusted merge-group resolver emitted invalid diff provenance"
    exit 1
  fi
  git cat-file -e "${PATH_DIFF_BASE_SHA}^{commit}"
  git cat-file -e "${PATH_DIFF_HEAD_SHA}^{commit}"
  git merge-base --is-ancestor "$PATH_DIFF_BASE_SHA" "$PATH_DIFF_HEAD_SHA"
  echo "path_diff_base_sha=$PATH_DIFF_BASE_SHA" >> "$GITHUB_OUTPUT"
  CLASSIFICATION_BASE_REF="$PATH_DIFF_BASE_SHA"
  CLASSIFICATION_HEAD_REF="$PATH_DIFF_HEAD_SHA"
  CLASSIFICATION_POLICY_REF="$CLASSIFICATION_BASE_REF"
elif [[ "${EVENT_NAME}" == "pull_request" ]]; then
  # Fail closed on base resolution: an empty CHANGED_FILES list must
  # not look docs-only and skip-cascade required lanes.
  git fetch --no-tags origin "${BASE_REF}"
  if ! git rev-parse --verify "origin/${BASE_REF}" >/dev/null 2>&1; then
    echo "::error::Could not resolve origin/${BASE_REF} after fetch"
    exit 1
  fi
  CLASSIFICATION_BASE_REF="origin/${BASE_REF}"
  CLASSIFICATION_HEAD_REF="HEAD"
  CLASSIFICATION_POLICY_REF="$CLASSIFICATION_BASE_REF"
  TRUSTED_CI_REPO_LANES="$RUNNER_TEMP/ci-repo-lanes.mjs"
  git show "${CLASSIFICATION_BASE_REF}:scripts/lib/ci-repo-lanes.mjs" \
    > "$TRUSTED_CI_REPO_LANES"
  CHANGED_FILES=$(git diff --no-renames --name-only "origin/${BASE_REF}" HEAD)
  if [[ -z "${CHANGED_FILES//[$'\t\r\n' ]/}" ]]; then
    # Merge tree-identical to base; classify merge-base..head (JOV-6820).
    PULL_REQUEST_HEAD_SHA="${EVENT_PULL_REQUEST_HEAD_SHA}"
    git fetch --no-tags origin "$PULL_REQUEST_HEAD_SHA"
    CLASSIFICATION_BASE_REF=$(git merge-base "origin/${BASE_REF}" "$PULL_REQUEST_HEAD_SHA")
    CLASSIFICATION_HEAD_REF="$PULL_REQUEST_HEAD_SHA"
    CHANGED_FILES=$(git diff --no-renames --name-only "$CLASSIFICATION_BASE_REF" "$CLASSIFICATION_HEAD_REF")
  fi
  if [[ -z "${CHANGED_FILES//[$'\t\r\n' ]/}" ]]; then
    echo "::error::Empty changed-file list vs origin/${BASE_REF}; refusing a false docs-only classification."
    exit 1
  fi
elif [[ "${EVENT_NAME}" == "workflow_dispatch" ]]; then
  # Manual dispatch: run everything
  echo "Manual dispatch: running all checks"
  printf '### Qualification classification\n\nManual dispatch requires full qualification across all product lanes.\n' >> "$GITHUB_STEP_SUMMARY"
  PRODUCT_LANE_DIR="$RUNNER_TEMP/product-lane-classification"
  mkdir -p "$PRODUCT_LANE_DIR"
  git ls-files > "$PRODUCT_LANE_DIR/changed-paths.txt"
  TRUSTED_CI_REPO_LANES="scripts/lib/ci-repo-lanes.mjs"
  for t in run_build run_test run_test_performance run_storybook_a11y run_public_lighthouse run_dashboard_lighthouse run_onboarding_lighthouse run_admin_lighthouse run_chat_lighthouse run_promptfoo_evals run_golden_eval_set run_e2e run_golden_path run_drizzle run_neon run_ios run_macos run_web run_operations run_cross_product has_code_changes; do
    echo "$t=true" >> "$GITHUB_OUTPUT"
  done
  echo "selected_lanes=ios,mac,web,operations,cross-product" >> "$GITHUB_OUTPUT"
  echo "shared_contract_impact=ios,mac,web" >> "$GITHUB_OUTPUT"
  emit_ci_lanes all
  exit 0
elif [[ "${EVENT_NAME}" == "push" ]]; then
  PUSH_BASE_SHA="${EVENT_PUSH_BEFORE_SHA}"
  if [[ ! "$PUSH_BASE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    [[ "$PUSH_BASE_SHA" == "0000000000000000000000000000000000000000" ]]; then
    echo "::error::push.before is not a usable exact main base SHA"
    exit 1
  fi
  git cat-file -e "${PUSH_BASE_SHA}^{commit}"
  CLASSIFICATION_BASE_REF="$PUSH_BASE_SHA"
  CLASSIFICATION_HEAD_REF="HEAD"
  CLASSIFICATION_POLICY_REF="$CLASSIFICATION_BASE_REF"
  TRUSTED_CI_REPO_LANES="$RUNNER_TEMP/ci-repo-lanes.mjs"
  git show "${CLASSIFICATION_BASE_REF}:scripts/lib/ci-repo-lanes.mjs" \
    > "$TRUSTED_CI_REPO_LANES"
  CHANGED_FILES=$(git diff --no-renames --name-only "$PUSH_BASE_SHA" HEAD)
else
  echo "::error::Unsupported event for path change detection: ${EVENT_NAME}"
  exit 1
fi

# Physical path: the classifier runs only when argv[1] matches its own
# URL, which a symlinked temp dir (macOS /var) silently breaks.
PRODUCT_LANE_DIR="$(cd "$RUNNER_TEMP" && pwd -P)/product-lane-classification"
mkdir -p "$PRODUCT_LANE_DIR"
printf '%s\n' "$CHANGED_FILES" > "$PRODUCT_LANE_DIR/changed-paths.txt"
CLASSIFICATION_BASE_SHA=$(git rev-parse --verify "${CLASSIFICATION_BASE_REF}^{commit}")
CLASSIFICATION_HEAD_SHA=$(git rev-parse --verify "${CLASSIFICATION_HEAD_REF}^{commit}")
echo "path_diff_base_sha=$CLASSIFICATION_BASE_SHA" >> "$GITHUB_OUTPUT"
echo "path_diff_head_sha=$CLASSIFICATION_HEAD_SHA" >> "$GITHUB_OUTPUT"
TRUSTED_PRODUCT_LANE_CLASSIFIER="$PRODUCT_LANE_DIR/product-lane-classifier.mjs"
git show "${CLASSIFICATION_POLICY_REF}:scripts/lib/product-lane-classifier.mjs" \
  > "$TRUSTED_PRODUCT_LANE_CLASSIFIER"
node "$TRUSTED_PRODUCT_LANE_CLASSIFIER" \
  --files-from "$PRODUCT_LANE_DIR/changed-paths.txt" \
  --base-ref "$CLASSIFICATION_BASE_REF" \
  --head-ref "$CLASSIFICATION_HEAD_REF" \
  --json-out "$PRODUCT_LANE_DIR/receipt.json" \
  --summary-out "$PRODUCT_LANE_DIR/summary.md" \
  --github-output "$GITHUB_OUTPUT"
# A classifier that never ran must not read as zero selected lanes.
test -s "$PRODUCT_LANE_DIR/receipt.json"
TEST_PERFORMANCE_PATTERN='^apps/web/scripts/test-performance-(guard\.ts|profiler(\.test)?\.ts)$'
if echo "$CHANGED_FILES" | grep -q -E "$TEST_PERFORMANCE_PATTERN"; then
  echo "run_test_performance=true" >> "$GITHUB_OUTPUT"
else
  echo "run_test_performance=false" >> "$GITHUB_OUTPUT"
fi

PROMPTFOO_INFRA_TRIGGER_PATTERN='^(\.github/workflows/README\.md|apps/web/tests/eval/promptfoo/|apps/web/tests/eval/golden/)'
PROMPTFOO_INFRA_ALLOWED_PATTERN='^(\.github/workflows/ci\.yml|\.github/workflows/README\.md|apps/web/tests/eval/promptfoo/.*|apps/web/tests/eval/golden/.*|apps/web/vitest\.config\.golden-eval\.mts|apps/web/scripts/run-golden-eval-set-ci\.sh|apps/web/package.*\.json|package.*\.json|pnpm-lock\.yaml)$'
if [[ "${EVENT_NAME}" == "pull_request" ]] &&
  echo "$CHANGED_FILES" | grep -q -E "$PROMPTFOO_INFRA_TRIGGER_PATTERN" &&
  ! echo "$CHANGED_FILES" | grep -v -E "$PROMPTFOO_INFRA_ALLOWED_PATTERN" | grep -q .; then
  echo "Promptfoo eval-infrastructure-only source PR: deferring semantic evidence to the merge-group head."
  {
    echo "has_code_changes=true"
    echo "run_promptfoo_evals=false"
    echo "run_golden_eval_set=false"
    for t in run_build run_test run_test_performance run_storybook_a11y run_public_lighthouse run_dashboard_lighthouse run_onboarding_lighthouse run_admin_lighthouse run_chat_lighthouse run_e2e run_golden_path run_drizzle run_neon; do
      echo "$t=false"
    done
  } >> "$GITHUB_OUTPUT"
  emit_ci_lanes
  exit 0
fi

# CHANGELOG.md is customer-facing web content, not documentation.
if ! echo "$CHANGED_FILES" | grep -q -E '^(\.github/|CHANGELOG\.md$|docs/playbooks/[^/]+\.playbook\.md$)' &&
  ! echo "$CHANGED_FILES" | grep -q -v -E '\.(md|txt)$'; then
  echo "Only documentation files changed"
  for t in run_build run_test run_test_performance run_storybook_a11y run_public_lighthouse run_dashboard_lighthouse run_onboarding_lighthouse run_admin_lighthouse run_chat_lighthouse run_promptfoo_evals run_golden_eval_set run_e2e run_golden_path run_drizzle run_neon has_code_changes; do
    echo "$t=false" >> "$GITHUB_OUTPUT"
  done
  emit_ci_lanes
  exit 0
fi

echo "has_code_changes=true" >> "$GITHUB_OUTPUT"

# Build paths
BUILD_PATTERN='^(CHANGELOG\.md$|apps/web/app/|apps/web/components/|apps/web/lib/|apps/web/hooks/|apps/web/types/|apps/web/constants/|apps/web/package.*\.json|apps/web/next\.config\.(js|mjs|ts)|vercel\.json|packages/|apps/web/tailwind\.config\.|apps/web/postcss\.config\.|apps/web/instrumentation.*\.ts|apps/web/sentry\..*\.config\.ts|apps/web/proxy\.ts|package.*\.json|turbo\.json)'
if echo "$CHANGED_FILES" | grep -q -E "$BUILD_PATTERN"; then
  RUN_BUILD=true
  echo "run_build=true" >> "$GITHUB_OUTPUT"
else
  RUN_BUILD=false
  echo "run_build=false" >> "$GITHUB_OUTPUT"
fi

# Test paths
TEST_PATTERN='^(docs/playbooks/[^/]+\.playbook\.md$|apps/web/app/|apps/web/components/|apps/web/lib/|apps/web/hooks/|apps/web/types/|apps/web/tests/unit/|apps/web/__tests__/|packages/|.*\.test\.|.*\.spec\.|apps/web/package.*\.json|package.*\.json)'
if echo "$CHANGED_FILES" | grep -q -E "$TEST_PATTERN"; then
  RUN_TEST=true
  echo "run_test=true" >> "$GITHUB_OUTPUT"
else
  RUN_TEST=false
  echo "run_test=false" >> "$GITHUB_OUTPUT"
fi

STORYBOOK_A11Y_PATTERN='^(apps/web/components/|apps/web/\.storybook/|apps/web/app/globals\.css|apps/web/styles/|apps/web/(tailwind|postcss)\.config\.|apps/web/vitest\.config\.storybook\.mts|apps/web/package\.json|packages/ui/|pnpm-lock\.yaml|\.github/workflows/(ci|visual-a11y)\.yml)'
if echo "$CHANGED_FILES" | grep -q -E "$STORYBOOK_A11Y_PATTERN"; then
  echo "run_storybook_a11y=true" >> "$GITHUB_OUTPUT"
else
  echo "run_storybook_a11y=false" >> "$GITHUB_OUTPUT"
fi

# Exclude screenshot exports (marketing assets) from public Lighthouse + Neon.
PUBLIC_LIGHTHOUSE_PATTERN='^(\.github/workflows/ci\.yml|scripts/lighthouse-retry\.mjs|apps/web/\.lighthouserc\.pr\.json|apps/web/\.lighthouserc\.public-launch\.json|apps/web/app/\(home\)/|apps/web/app/\(marketing\)/|apps/web/app/\(dynamic\)/legal/|apps/web/content/legal/|apps/web/app/\[username\]/|apps/web/app/layout\.tsx|apps/web/app/globals\.css|apps/web/public/|apps/web/styles/|apps/web/components/features/home/|apps/web/components/features/marketing/|apps/web/components/features/profile/|apps/web/components/homepage/|apps/web/components/marketing/|apps/web/scripts/run-public-lighthouse\.ts|apps/web/scripts/public-route-qa\.ts|apps/web/scripts/public-surface-qa\.ts|apps/web/scripts/performance-route-manifest\.ts|apps/web/tests/e2e/public-exhaustive\.spec\.ts|apps/web/tests/e2e/profile-mobile-viewport-stability\.spec\.ts|apps/web/tests/e2e/axe-audit\.spec\.ts|apps/web/tests/e2e/utils/(public-surface-(manifest|helpers)|smoke-test-utils|mobile-profile-viewports)\.ts|packages/|apps/web/package.*\.json|package.*\.json|apps/web/tailwind\.config\.|apps/web/postcss\.config\.)'
PUBLIC_LIGHTHOUSE_FILES=$(echo "$CHANGED_FILES" | grep -v -E '^apps/web/public/product-screenshots/' || true)
if echo "$PUBLIC_LIGHTHOUSE_FILES" | grep -q -E "$PUBLIC_LIGHTHOUSE_PATTERN"; then
  echo "run_public_lighthouse=true" >> "$GITHUB_OUTPUT"
else
  echo "run_public_lighthouse=false" >> "$GITHUB_OUTPUT"
fi

DASHBOARD_LIGHTHOUSE_PATTERN='^(\.github/(workflows/ci\.yml|scripts/lighthouse-.*)|apps/web/(\.lighthouserc\.(dashboard|chat|onboarding)\.pr\.json|scripts/lighthouse-.*)|scripts/ci/wait-background-build\.sh)$'
dash_lh=false
if [[ "$RUN_BUILD" == "true" || "$RUN_TEST" == "true" ]] || echo "$CHANGED_FILES" | grep -q -E "$DASHBOARD_LIGHTHOUSE_PATTERN"; then dash_lh=true; fi
echo "run_dashboard_lighthouse=$dash_lh" >> "$GITHUB_OUTPUT"

ONBOARDING_LIGHTHOUSE_PATTERN='^(\.github/workflows/ci\.yml|apps/web/\.lighthouserc\.onboarding\.pr\.json|apps/web/scripts/lighthouse-dashboard-auth\.cjs|apps/web/app/onboarding/|apps/web/components/features/dashboard/organisms/onboarding|apps/web/components/features/dashboard/organisms/apple-style-onboarding|apps/web/components/features/onboarding/|apps/web/lib/onboarding/)'
if [[ "$RUN_BUILD" == "true" || "$RUN_TEST" == "true" ]] || echo "$CHANGED_FILES" | grep -q -E "$ONBOARDING_LIGHTHOUSE_PATTERN"; then
  echo "run_onboarding_lighthouse=true" >> "$GITHUB_OUTPUT"
else
  echo "run_onboarding_lighthouse=false" >> "$GITHUB_OUTPUT"
fi

ADMIN_LIGHTHOUSE_PATTERN='^(\.github/workflows/ci\.yml|apps/web/\.lighthouserc\.admin\.pr\.json|apps/web/scripts/lighthouse-dashboard-auth\.cjs|apps/web/app/app/\(shell\)/admin/|apps/web/components/features/admin/)'
if [[ "$RUN_BUILD" == "true" || "$RUN_TEST" == "true" ]] || echo "$CHANGED_FILES" | grep -q -E "$ADMIN_LIGHTHOUSE_PATTERN"; then
  echo "run_admin_lighthouse=true" >> "$GITHUB_OUTPUT"
else
  echo "run_admin_lighthouse=false" >> "$GITHUB_OUTPUT"
fi

CHAT_LIGHTHOUSE_PATTERN='^(\.github/workflows/ci\.yml|apps/web/\.lighthouserc\.chat\.pr\.json|apps/web/scripts/lighthouse-dashboard-auth\.cjs|apps/web/app/app/\(shell\)/chat/|apps/web/components/jovie/|apps/web/components/chat/)'
if [[ "$RUN_BUILD" == "true" || "$RUN_TEST" == "true" ]] || echo "$CHANGED_FILES" | grep -q -E "$CHAT_LIGHTHOUSE_PATTERN"; then
  echo "run_chat_lighthouse=true" >> "$GITHUB_OUTPUT"
else
  echo "run_chat_lighthouse=false" >> "$GITHUB_OUTPUT"
fi

PROMPTFOO_EVAL_PATTERN='^(\.github/workflows/ci\.yml|apps/web/tests/eval/promptfoo/|apps/web/tests/eval/golden/|apps/web/vitest\.config\.golden-eval\.mts|apps/web/scripts/run-golden-eval-set-ci\.sh|apps/web/lib/chat/|apps/web/app/api/chat/|apps/web/data/onboarding-script-promotions/|apps/web/package.*\.json|package.*\.json|pnpm-lock\.yaml)'
if echo "$CHANGED_FILES" | grep -q -E "$PROMPTFOO_EVAL_PATTERN"; then
  echo "run_promptfoo_evals=true" >> "$GITHUB_OUTPUT"
  echo "run_golden_eval_set=true" >> "$GITHUB_OUTPUT"
else
  echo "run_promptfoo_evals=false" >> "$GITHUB_OUTPUT"
  echo "run_golden_eval_set=false" >> "$GITHUB_OUTPUT"
fi

# E2E paths
E2E_PATTERN='^(apps/web/app/|apps/web/components/|apps/web/tests/e2e/|apps/web/tests/smoke/|apps/web/playwright\.config\.|apps/web/package.*\.json|package.*\.json)'
if echo "$CHANGED_FILES" | grep -q -E "$E2E_PATTERN"; then
  echo "run_e2e=true" >> "$GITHUB_OUTPUT"
else
  echo "run_e2e=false" >> "$GITHUB_OUTPUT"
fi

# Launch-gate golden path (JOV-3758), mirroring docs/launch/LAUNCH_GATES.md.
LAUNCH_GATE_PATTERN='^(apps/web/app/onboarding/|apps/web/components/features/onboarding/|apps/web/lib/onboarding/|apps/web/app/\(auth\)/|apps/web/app/sign-?(in|up)/|apps/web/app/app/\(shell\)/|apps/web/components/features/dashboard/|apps/web/components/organisms/sidebar/|apps/web/lib/app-shell/|apps/web/tests/e2e/(shell-(nav-click-through|route-health)|releases-first-paint-visual)\.spec\.ts|apps/web/(components/(shell|jovie|chat)/|instrumentation-client\.ts|proxy\.ts|tests/e2e/(utils/)?dashboard-click-navigation)|apps/web/lib/releases/|apps/web/app/api/stripe/|apps/web/app/api/billing/|apps/web/app/api/checkout/|apps/web/lib/stripe/|apps/web/tests/e2e/golden-path\.spec\.ts|apps/web/tests/helpers/auth.ts|apps/web/tests/global-setup\.ts|apps/web/playwright\.config\.ts|\.github/workflows/ci\.yml|apps/web/\.lighthouserc\.(dashboard|onboarding|chat)\.pr\.json|docs/launch/LAUNCH_GATES\.md|apps/web/package.*\.json|package.*\.json|scripts/ci/wait-background-build\.sh)'
if echo "$CHANGED_FILES" | grep -q -E "$LAUNCH_GATE_PATTERN"; then
  echo "run_golden_path=true" >> "$GITHUB_OUTPUT"
else
  echo "run_golden_path=false" >> "$GITHUB_OUTPUT"
fi

# No UI file changed: skip the paid golden-path model review (empty = review runs)
echo "$CHANGED_FILES" | grep -q -E '^(apps/web/(app|components|styles|public)/|apps/web/.*\.(css|scss|tsx)$|packages/ui/)' || echo "golden_path_no_ui_diff=true" >> "$GITHUB_OUTPUT"

# Drizzle paths
DRIZZLE_PATTERN='^(apps/web/drizzle/|apps/web/lib/db/|apps/web/drizzle\.config\.ts|drizzle\.kit\.(m?js|ts))'
if echo "$CHANGED_FILES" | grep -q -E "$DRIZZLE_PATTERN"; then
  echo "run_drizzle=true" >> "$GITHUB_OUTPUT"
else
  echo "run_drizzle=false" >> "$GITHUB_OUTPUT"
fi

# Isolated DB certification: database, authz, migration, harness, dependency inputs.
NEON_PATTERN='^(apps/web/drizzle/|apps/web/lib/(db|queries|auth)/|apps/web/scripts/(drizzle-migrate|verify-db-migrations)\.ts|apps/web/tests/(integration/|setup-db\.ts)|apps/web/lib/domain/(releases|profile)\.ts|apps/web/lib/ai/tools/create-release\.ts|apps/web/lib/chat/tools/(tasks|merch-tools|canvas-status|release-pitch|album-art)\.ts|apps/web/app/api/(chat/confirm-[a-z-]+|account/delete)/|apps/web/lib/merch/(design-generation|concept-review(-store)?|generation-concepts|generation-quarantine|source-candidates|service)\.ts|apps/web/app/app/\(shell\)/dashboard/tasks/task-actions\.ts|apps/web/vitest\.config\.integration\.mts|apps/web/drizzle\.config\.ts|drizzle\.kit\.(m?js|ts)|.*\.sql$|apps/web/app/api/cron/|pnpm-lock\.yaml|\.github/workflows/ci\.yml)'
if echo "$CHANGED_FILES" | grep -q -E "$NEON_PATTERN"; then
  echo "run_neon=true" >> "$GITHUB_OUTPUT"
else
  echo "run_neon=false" >> "$GITHUB_OUTPUT"
fi

# Fork guard: disable E2E for forks (no secrets)
if [[ "$IS_FORK" == "true" ]]; then
  echo "Fork PR: disabling e2e and build"
  {
    echo "run_e2e=false"
    echo "run_golden_path=false"
    echo "run_build=false"
    echo "run_public_lighthouse=false"
    echo "run_dashboard_lighthouse=false"
    echo "run_admin_lighthouse=false"
    echo "run_chat_lighthouse=false"
    echo "run_test=false"
    echo "run_test_performance=false"
  } >> "$GITHUB_OUTPUT"
fi

emit_ci_lanes
