#!/usr/bin/env bash
# Shared source-head and combined-head proof; keep the complete MQ spec list.
set -euo pipefail
cd "$GITHUB_WORKSPACE/apps/web"

# Started by "Start Storybook dev server"; fail closed without it.
: "${STORYBOOK_PID:?Storybook dev server was not started}"
trap 'kill "$STORYBOOK_PID" 2>/dev/null || true
  echo "::group::Storybook dev server log"
  cat "$RUNNER_TEMP/storybook-dev.log" 2>/dev/null || true
  echo "::endgroup::"' EXIT

for ((attempt = 1; attempt <= 150; attempt++)); do
  kill -0 "$STORYBOOK_PID" 2>/dev/null || {
    echo "::error::Storybook dev server died"
    exit 1
  }
  if curl -sf http://localhost:6006/iframe.html >/dev/null 2>&1; then
    if [[ "$STORYBOOK_SHARD" == 'certification' ]]; then
      node "$GITHUB_WORKSPACE/scripts/component-merge-group-storybook-cert.mjs"
      exit 0
    fi
    node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- \
      pnpm exec playwright test \
        tests/e2e/storybook-agent-status.spec.ts \
        tests/e2e/storybook-chat-composer-streaming.spec.ts \
        tests/e2e/storybook-destructive-button.spec.ts \
        tests/e2e/storybook-download-visual.spec.ts \
        tests/e2e/storybook-elevation.spec.ts \
        tests/e2e/storybook-input.spec.ts \
        tests/e2e/storybook-status-copy.spec.ts \
        tests/e2e/storybook-marketing-faq.spec.ts \
        tests/e2e/storybook-marketing-h1.spec.ts \
        tests/e2e/storybook-skeleton.spec.ts \
        tests/e2e/storybook-separator.spec.ts \
        tests/e2e/storybook-scoped-theme.spec.ts \
        tests/e2e/storybook-sheet.spec.ts \
        tests/e2e/storybook-overlay-collisions.spec.ts \
        tests/e2e/storybook-profile-claim-name.spec.ts \
        tests/e2e/storybook-spotify-connect.spec.ts \
        tests/e2e/storybook-ovie-privacy-boundary.spec.ts \
        tests/e2e/storybook-onboarding-dsp-strip-clearance.spec.ts \
        tests/e2e/storybook-onboarding-recovery.spec.ts \
        tests/e2e/storybook-task-row-geometry.spec.ts \
        tests/e2e/storybook-desktop-update-modal.spec.ts \
        tests/e2e/storybook-desktop-update-control.spec.ts \
        tests/e2e/storybook-dsp-details.spec.ts \
        tests/e2e/storybook-smart-link-reachability.spec.ts \
        --config=playwright.config.storybook.ts --project=chromium --reporter=line \
        --workers=2 --shard="$STORYBOOK_SHARD/3"
    exit 0
  fi
  sleep 2
done
echo "::error::Storybook dev server failed to start within 300s"
exit 1
