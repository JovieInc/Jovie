#!/usr/bin/env bash
set -euo pipefail
AUTH_HEADER="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
mkdir -p "$BASE_FETCH_DIR"
rm -f "$BASE_FETCH_DIR/status" "$BASE_FETCH_DIR/status.tmp"
{
  echo "GIT_CONFIG_COUNT=1"
  echo "GIT_CONFIG_KEY_0=http.https://github.com/.extraheader"
  echo "GIT_CONFIG_VALUE_0=$AUTH_HEADER"
} >> "$GITHUB_ENV"
(
  set +e
  for attempt in 1 2 3; do
    timeout 150 git -c maintenance.auto=false -c gc.auto=0 -c "http.https://github.com/.extraheader=$AUTH_HEADER" fetch --no-tags --unshallow --filter=blob:none origin "+refs/heads/${BASE_BRANCH}:refs/remotes/origin/${BASE_BRANCH}"
    fetch_rc=$?
    [[ "$fetch_rc" == 0 ]] && break
    echo "base-branch fetch attempt $attempt exited $fetch_rc"
  done
  echo "$fetch_rc" > "$BASE_FETCH_DIR/status.tmp"
  mv "$BASE_FETCH_DIR/status.tmp" "$BASE_FETCH_DIR/status"
) < /dev/null > "$BASE_FETCH_DIR/fetch.log" 2>&1 &
echo "Base-branch history fetch started in the background (pid $!)."
