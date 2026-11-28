#!/usr/bin/env bash
set -euo pipefail
[[ "$EXPECTED_HEAD" =~ ^[0-9a-f]{40}$ ]]
[[ "$BASE_BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]]
test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"
AUTH_HEADER="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
git -c maintenance.auto=false -c gc.auto=0 -c "http.https://github.com/.extraheader=$AUTH_HEADER" fetch --no-tags --unshallow --filter=blob:none origin "+refs/heads/${BASE_BRANCH}:refs/remotes/origin/${BASE_BRANCH}"
if [[ "$EVENT_NAME" == pull_request ]]; then
  base_tip="$(git rev-parse --verify "refs/remotes/origin/${BASE_BRANCH}^{commit}")"
  COVERAGE_BASE="$(GIT_NO_LAZY_FETCH=1 git merge-base "$base_tip" "$EXPECTED_HEAD")"
else
  COVERAGE_BASE="$MERGE_GROUP_BASE"
fi
[[ "$COVERAGE_BASE" =~ ^[0-9a-f]{40}$ ]]
GIT_NO_LAZY_FETCH=1 git cat-file -e "${COVERAGE_BASE}^{commit}"
git -c "http.https://github.com/.extraheader=$AUTH_HEADER" diff --unified=0 --diff-filter=ACMR --no-renames "${COVERAGE_BASE}...${EXPECTED_HEAD}" -- apps/web > /dev/null
GIT_NO_LAZY_FETCH=1 git diff --unified=0 --diff-filter=ACMR --no-renames "${COVERAGE_BASE}...${EXPECTED_HEAD}" -- apps/web > /dev/null
echo "sha=$COVERAGE_BASE" >> "$GITHUB_OUTPUT"
