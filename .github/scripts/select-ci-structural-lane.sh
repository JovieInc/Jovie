#!/usr/bin/env bash
set -euo pipefail
if [[ "${GITHUB_EVENT_NAME}" == "pull_request" ]]; then
  # Full (non-shallow) base fetch: guardrails needs git merge-base with
  # origin/<base>; a --depth=1 fetch leaves the base tip shallow and fails
  # desktop-release-guard / version-fanout-guard on PRs.
  AUTH_HEADER="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
  git -c "http.https://github.com/.extraheader=$AUTH_HEADER" fetch origin "${GITHUB_BASE_REF}" --no-tags
  unset AUTH_HEADER GH_TOKEN
  DIFF_BASE="origin/${GITHUB_BASE_REF}"
  DIFF_ARGS=(--name-only)
elif [[ "${GITHUB_EVENT_NAME}" == "merge_group" && "${STRUCTURAL_DOCS_ONLY:-}" == "true" ]]; then
  # JOV-12618: a merge group may skip only when the classifier found
  # every changed path to be documentation AND the source-PR path
  # decision below, rerun against the group's exact classified base,
  # selects nothing. Any other file, or an unusable base, runs it.
  unset GH_TOKEN
  DIFF_BASE="${STRUCTURAL_DIFF_BASE_SHA:-}"
  if [[ ! "$DIFF_BASE" =~ ^[0-9a-f]{40}$ ]] || ! git cat-file -e "${DIFF_BASE}^{commit}" 2>/dev/null; then
    echo "::warning::Merge-group structural base '${DIFF_BASE}' is unusable; running the structural lane."
    echo "skip=false" >> "$GITHUB_OUTPUT"
    exit 0
  fi
  DIFF_ARGS=(--no-renames --name-only)
else
  echo "skip=false" >> "$GITHUB_OUTPUT"
  exit 0
fi
# Control-lane paths are data, one ERE alternative per line, so
# concurrent additions do not conflict on this file (JOV-6837).
STRUCTURAL_CONTROL_PATTERN="$(grep -vE '^[[:space:]]*(#|$)' .github/ci-harness/structural-control-paths.ere | paste -sd'|' -)"
[[ -n "$STRUCTURAL_CONTROL_PATTERN" ]]

# Invariant-scanned sources must run invariants:check (#18182 added a
# readFileSync to apps/desktop/src/main.ts unchecked). Derived from the
# invariants' own scan roots; a node failure fails this step closed.
STRUCTURAL_CONTROL_PATTERN+="|$(node scripts/invariants/scanned-paths.mjs --ere)"

# Component receipts are executable test evidence; Storybook config and
# the shared-UI token audit feed structural component proof.
STRUCTURAL_UI_PATTERN='^(apps/web/data/marketing/|apps/web/lib/agent-os/certification[^/]*\.ts$|apps/web/lib/acquisition/certification-store[^/]*\.ts$|apps/web/app/.*\.(tsx|css)$|apps/web/components/|apps/web/\.storybook/|apps/web/package\.json$|apps/web/scripts/(check-reliability-detectors|lint-contrast-|lint-motion-css|lint-no-native-dialogs|lint-composite-field|lint-design-noise|lint-ui-feel|next-proxy-guard|seo-ratchet-|tailwind-guard)|apps/web/tests/|apps/web/styles/|packages/ui/|package\.json$|DESIGN\.md$|design\.tokens\.json$|scripts/(component-|design-|ds-offscale|screen-certification|shared-ui-visual-arbitrary|story-coverage|storybook-story-quality|ui-story-coverage)|scripts/lib/__tests__/(component-|design-|screen-certification|story-coverage|storybook-story-quality|ui-story-coverage))'
STRUCTURAL_DESKTOP_PATTERN='^scripts/desktop-release-(assets|guard|publisher)(\.test)?\.mjs$|^apps/desktop/electron-builder\.yml$|^apps/desktop/scripts/notarize-release-dmg\.cjs$'
# A new scripts test must prove it is wired into a lane (inventory guard)
# before the queue; #18714 was ejected for an unwired one.
NEW_SCRIPT_TESTS=$(git diff --diff-filter=AR "${DIFF_ARGS[@]}" "$DIFF_BASE" HEAD | grep -E '^scripts/.*\.test\.(mjs|ts)$' || true)
STRUCTURAL_CHANGED_FILES=$(git diff "${DIFF_ARGS[@]}" "$DIFF_BASE" HEAD)
# Here-string, not a pipe: grep -q exiting early must not turn a
# match into a SIGPIPE pipefail "no match" and skip the lane.
if [[ "${GITHUB_EVENT_NAME}" == "merge_group" && -z "${STRUCTURAL_CHANGED_FILES//[$'\t\r\n' ]/}" ]]; then
  # An empty diff is not proof of a docs-only group.
  echo "skip=false" >> "$GITHUB_OUTPUT"
elif [ -n "$NEW_SCRIPT_TESTS" ] || grep -qE "$STRUCTURAL_CONTROL_PATTERN|$STRUCTURAL_UI_PATTERN|$STRUCTURAL_DESKTOP_PATTERN" <<< "$STRUCTURAL_CHANGED_FILES"; then
  echo "skip=false" >> "$GITHUB_OUTPUT"
else
  echo "skip=true" >> "$GITHUB_OUTPUT"
fi
