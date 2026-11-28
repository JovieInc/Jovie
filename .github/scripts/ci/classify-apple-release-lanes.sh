#!/usr/bin/env bash
set -euo pipefail
PUSH_BASE_SHA="${EVENT_PUSH_BEFORE_SHA}"
if [[ ! "$PUSH_BASE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
  [[ "$PUSH_BASE_SHA" == "0000000000000000000000000000000000000000" ]]; then
  echo "::error::push.before is not a usable exact main base SHA"
  exit 1
fi
git cat-file -e "${PUSH_BASE_SHA}^{commit}"
root="$RUNNER_TEMP/apple-post-queue"
mkdir -p "$root"
git diff --no-renames --name-only "$PUSH_BASE_SHA" HEAD > "$root/changed-paths.txt"
# Policy from the pre-push main tip so a bad landing cannot rewrite
# its own Apple selection rules for this deferred evidence pass.
git show "${PUSH_BASE_SHA}:scripts/lib/product-lane-classifier.mjs" \
  > "$root/product-lane-classifier.mjs"
git show "${PUSH_BASE_SHA}:scripts/lib/apple-post-queue-selection.mjs" \
  > "$root/apple-post-queue-selection.mjs" || {
  # First land of this helper: fall back to the checked-out copy.
  cp scripts/lib/apple-post-queue-selection.mjs "$root/apple-post-queue-selection.mjs"
}
node "$root/product-lane-classifier.mjs" \
  --files-from "$root/changed-paths.txt" \
  --base-ref "$PUSH_BASE_SHA" \
  --head-ref HEAD \
  --json-out "$root/receipt.json"
test -s "$root/receipt.json"
node "$root/apple-post-queue-selection.mjs" \
  --receipt "$root/receipt.json" \
  --github-output "$GITHUB_OUTPUT"
{
  printf '### Apple post-queue selection\n\n'
  printf -- '- run_ios: `%s`\n' "$(sed -n 's/^run_ios=//p' "$GITHUB_OUTPUT" | tail -n1)"
  printf -- '- run_macos: `%s`\n' "$(sed -n 's/^run_macos=//p' "$GITHUB_OUTPUT" | tail -n1)"
  printf -- '- run_macos_native: `%s`\n' "$(sed -n 's/^run_macos_native=//p' "$GITHUB_OUTPUT" | tail -n1)"
} >> "$GITHUB_STEP_SUMMARY"
