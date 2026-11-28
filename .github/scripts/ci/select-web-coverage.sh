#!/usr/bin/env bash
set -euo pipefail
CHANGED_PATHS="$RUNNER_TEMP/product-lane-classification/changed-paths.txt"
test -f "$CHANGED_PATHS"
# Promptfoo eval-infrastructure-only source PRs keep V8 on the combined head.
PROMPTFOO_INFRA_TRIGGER_PATTERN='^(\.github/workflows/README\.md|apps/web/tests/eval/promptfoo/|apps/web/tests/eval/golden/)'
PROMPTFOO_INFRA_ALLOWED_PATTERN='^(\.github/(workflows/ci\.yml|scripts/(ci/[^/]+\.sh|detect-ci-path-changes\.sh|select-ci-structural-lane\.sh))|\.github/workflows/README\.md|apps/web/tests/eval/promptfoo/.*|apps/web/tests/eval/golden/.*|apps/web/vitest\.config\.golden-eval\.mts|apps/web/scripts/run-golden-eval-set-ci\.sh|apps/web/package.*\.json|package.*\.json|pnpm-lock\.yaml)$'
if [[ "$EVENT_NAME" == "pull_request" ]] &&
  grep -q -E "$PROMPTFOO_INFRA_TRIGGER_PATTERN" "$CHANGED_PATHS" &&
  ! grep -v -E "$PROMPTFOO_INFRA_ALLOWED_PATTERN" "$CHANGED_PATHS" | grep -q .; then
  echo "has_web_coverage_changes=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
# Full V8 coverage is meaningful only when the exact diff can affect
# web runtime behavior or its test/coverage substrate.
WEB_COVERAGE_PATTERN='^(apps/web/.*\.[cm]?[jt]sx?$|apps/web/package\.json$|packages/ui/|package\.json$|pnpm-lock\.yaml$|turbo\.json$)'
if grep -q -E "$WEB_COVERAGE_PATTERN" "$CHANGED_PATHS"; then
  echo "has_web_coverage_changes=true" >> "$GITHUB_OUTPUT"
else
  echo "has_web_coverage_changes=false" >> "$GITHUB_OUTPUT"
fi
