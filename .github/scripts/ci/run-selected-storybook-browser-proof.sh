#!/usr/bin/env bash
set -euo pipefail
specs=()
if [[ "$RUN_SPOTIFY" == 'true' ]]; then
  specs+=(tests/e2e/storybook-spotify-connect.spec.ts)
fi
if [[ "$RUN_KBD" == 'true' ]]; then
  specs+=(tests/e2e/storybook-kbd-motion.spec.ts)
fi
if [[ "$RUN_OVERLAY" == 'true' ]]; then
  specs+=(tests/e2e/storybook-overlay-collisions.spec.ts)
fi
if [[ "$RUN_PRIVACY" == 'true' ]]; then
  specs+=(tests/e2e/storybook-ovie-privacy-boundary.spec.ts)
fi
if [[ "$RUN_TASKS" == 'true' ]]; then
  specs+=(tests/e2e/storybook-task-row-geometry.spec.ts)
fi
if [[ "$RUN_DESKTOP_UPDATE" == 'true' ]]; then
  specs+=(tests/e2e/storybook-desktop-update-modal.spec.ts)
  specs+=(tests/e2e/storybook-desktop-update-control.spec.ts)
fi
if [[ "$RUN_DSP" == 'true' ]]; then
  specs+=(tests/e2e/storybook-dsp-details.spec.ts)
fi
if [[ "${RUN_SMART_LINK:-false}" == 'true' ]]; then
  specs+=(tests/e2e/storybook-smart-link-reachability.spec.ts)
fi
if [[ "${RUN_ACCOUNT_SURFACE:-false}" == 'true' ]]; then
  specs+=(tests/e2e/storybook-account-surface.spec.ts)
fi
test "${#specs[@]}" -gt 0
pnpm exec storybook dev -p 6006 --no-open &
STORYBOOK_PID=$!
trap 'kill "$STORYBOOK_PID" 2>/dev/null || true' EXIT

for _attempt in $(seq 1 150); do
  kill -0 "$STORYBOOK_PID" 2>/dev/null || {
    echo "::error::Storybook dev server died"
    exit 1
  }
  if curl -sf http://localhost:6006/iframe.html >/dev/null 2>&1; then
    node ../../.github/scripts/guard-playwright-artifacts.mjs --run -- \
      pnpm exec playwright test \
        "${specs[@]}" \
        --config=playwright.config.storybook.ts --project=chromium --reporter=line
    exit 0
  fi
  sleep 2
done
echo "::error::Storybook dev server failed to start within 300s"
exit 1
