#!/usr/bin/env bash
cd "$GITHUB_WORKSPACE"
# JOV-5489: recorded visual review of the golden-path keyframes. A
# suspected blocker is re-reviewed once; only a reproduced blocker fails.
# The gateway key is mapped in for the reviewer only, never the server.
KEYFRAMES="$GITHUB_WORKSPACE/apps/web/test-results/golden-path-keyframes"
# The review runs as its own guarded producer scoped to the keyframes
# only, so the staged evidence includes verdict.json and only these
# journey keyframes are declared public (failure captures never are).
review() {
  AI_GATEWAY_API_KEY="$GOLDEN_PATH_REVIEW_GATEWAY_KEY" \
    WORKERS_AI_TOKEN="$GOLDEN_PATH_REVIEW_WORKERS_AI_TOKEN" \
    PLAYWRIGHT_ARTIFACT_PATHS=apps/web/test-results/golden-path-keyframes \
    PLAYWRIGHT_ARTIFACT_ALLOW_PUBLIC_IMAGES=true \
    node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- \
    pnpm --filter @jovie/web exec tsx scripts/golden-path-visual-review.ts "$@"
}
review --dir "$KEYFRAMES/first" --out "$KEYFRAMES/first/verdict.json"
if [ "$(jq '.suspected | length' "$KEYFRAMES/first/verdict.json")" -gt 0 ]; then
  echo "::warning::Golden path visual review suspects a blocker; re-reviewing to confirm."
  # ponytail: independent second review of the same keyframes, not a
  # journey replay: the journey claims a protected fixture once per DB.
  # Ceiling: a capture-timing flake is judged twice on one frame.
  review --dir "$KEYFRAMES/first" --out "$KEYFRAMES/first/confirm.json" --confirm-against "$KEYFRAMES/first/verdict.json"
fi
