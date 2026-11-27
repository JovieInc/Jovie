#!/usr/bin/env bash
set -euo pipefail
for _ in $(seq 1 540); do
  [[ -f "$BASE_FETCH_DIR/status" ]] && break
  sleep 1
done
cat "$BASE_FETCH_DIR/fetch.log" 2>/dev/null || true
if [[ ! -f "$BASE_FETCH_DIR/status" ]]; then
  echo "::error title=Base-branch fetch::background fetch did not finish within 540s"
  exit 1
fi
fetch_status="$(cat "$BASE_FETCH_DIR/status")"
if [[ "$fetch_status" != '0' ]]; then
  echo "::error title=Base-branch fetch::git fetch exited $fetch_status"
  exit 1
fi
# No command in this job may kick detached `git maintenance run
# --auto` (or gc --auto): it keeps rewriting
# .git/objects/info/commit-graph while the structural lane's
# provenance guards read it, which intermittently flips
# `merge-base --is-ancestor` to a false "not an ancestor".
git config maintenance.auto false
git config gc.auto 0
if [[ "$(git rev-parse --is-shallow-repository)" != 'false' ]]; then
  echo "::error title=Base-branch fetch::checkout is still shallow"
  exit 1
fi
if ! git rev-parse --verify --quiet "refs/remotes/origin/${BASE_BRANCH}^{commit}" > /dev/null; then
  echo "::error title=Base-branch fetch::origin/${BASE_BRANCH} is missing"
  exit 1
fi
# A pull_request checkout is a merge onto the base as it was at
# checkout; the fetch above can land a newer base. Diffs against
# origin/<base> would then count commits merged since checkout as
# this PR's changes, so pin the ref to the merge's first parent.
if [[ "$EVENT_NAME" == 'pull_request' ]] \
  && git rev-parse --verify --quiet 'HEAD^2^{commit}' > /dev/null \
  && git merge-base --is-ancestor 'HEAD^1' "refs/remotes/origin/${BASE_BRANCH}"; then
  git update-ref "refs/remotes/origin/${BASE_BRANCH}" "$(git rev-parse 'HEAD^1')"
  echo "Pinned origin/${BASE_BRANCH} to the checkout merge base $(git rev-parse --short 'HEAD^1')."
fi
