#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RANGE_SCRIPT="$REPO_ROOT/scripts/security/prepare-ci-secret-scan-range.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

ORIGIN="$TEST_ROOT/origin.git"
SEED="$TEST_ROOT/seed"
git init -q --bare "$ORIGIN"
git init -q "$SEED"
git -C "$SEED" config user.name 'Secret Scan Test'
git -C "$SEED" config user.email 'secret-scan-test@example.invalid'
git -C "$SEED" config commit.gpgsign false
git -C "$SEED" remote add origin "file://$ORIGIN"
git -C "$SEED" switch -q -c main

for revision in 1 2 3 4; do
  printf 'base-%s\n' "$revision" >"$SEED/base.txt"
  git -C "$SEED" add base.txt
  git -C "$SEED" commit -q -m "base $revision"
done
# The exact-tree proof must use checked-in merge attributes. `union` is a
# built-in driver available without machine-local Git config.
printf '*.union-fixture merge=union\n' >"$SEED/.gitattributes"
printf 'common\n' >"$SEED/semantic.union-fixture"
git -C "$SEED" add .gitattributes semantic.union-fixture
git -C "$SEED" commit -q -m 'add built-in merge-driver fixture'
BASE_SHA="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" push -q origin main
PR_BASE_REF='refs/heads/pr-base'
git -C "$SEED" push -q origin "$BASE_SHA:$PR_BASE_REF"
# shellcheck disable=SC2016 # The literal expression is the hostile test data.
HOSTILE_BASE_REF='refs/heads/hostile/$(touch${IFS}secret-scan-expression-injected)'
if ! git check-ref-format "$HOSTILE_BASE_REF"; then
  echo 'FAIL: hostile base-ref fixture must remain Git-valid' >&2
  exit 1
fi
git -C "$SEED" push -q origin "$BASE_SHA:$HOSTILE_BASE_REF"

# A multi-commit PR introduces and later removes a leak-shaped backup file. The
# range preparation must retain that historical commit even though HEAD is clean.
git -C "$SEED" switch -q -c feature "$BASE_SHA"
cp "$REPO_ROOT/scripts/security/gitleaks-backup-fixture.txt" \
  "$SEED/settings.local.json.backup"
git -C "$SEED" add settings.local.json.backup
git -C "$SEED" commit -q -m 'introduce backup fixture'
INTRODUCED_SHA="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" rm -q settings.local.json.backup
git -C "$SEED" commit -q -m 'remove backup fixture'
REMOVED_SHA="$(git -C "$SEED" rev-parse HEAD)"
printf 'feature complete\n' >"$SEED/feature.txt"
git -C "$SEED" add feature.txt
git -C "$SEED" commit -q -m 'finish feature'
SOURCE_HEAD="$(git -C "$SEED" rev-parse HEAD)"

git -C "$SEED" switch -q -c pr-merge "$BASE_SHA"
git -C "$SEED" merge -q --no-ff feature \
  -m $'synthetic pull request merge\n\nparent message-lines-are-not-headers'
PR_HEAD="$(git -C "$SEED" rev-parse HEAD)"
PR_TREE="$(git -C "$SEED" rev-parse "${PR_HEAD}^{tree}")"
REGENERATED_PR_HEAD="$(
  printf 'regenerated synthetic pull request merge\n' \
    | git -C "$SEED" commit-tree "$PR_TREE" -p "$BASE_SHA" -p "$SOURCE_HEAD"
)"
if [[ "$REGENERATED_PR_HEAD" == "$PR_HEAD" ]]; then
  echo 'FAIL: regenerated pull request merge fixture did not change commit id' >&2
  exit 1
fi
git -C "$SEED" push -q origin \
  "$PR_HEAD:refs/pull/1/merge" \
  "$SOURCE_HEAD:refs/pull/1/head"

# GitHub Update Branch can advance the event merge base while a queued
# pull_request payload still carries the older base SHA. A normal source may
# remain behind/diverged, and the live base can advance again after GitHub
# creates the immutable synthetic merge event.
git -C "$SEED" switch -q -c live-base "$BASE_SHA"
printf 'live base advanced\n' >"$SEED/live-base.txt"
printf 'live side\n' >>"$SEED/semantic.union-fixture"
git -C "$SEED" add live-base.txt semantic.union-fixture
git -C "$SEED" commit -q -m 'advance live base'
EVENT_MERGE_BASE_SHA="$(git -C "$SEED" rev-parse HEAD)"
LIVE_BASE_REF='refs/heads/live-base'

git -C "$SEED" switch -q -c diverged-feature "$BASE_SHA"
printf 'diverged feature\n' >"$SEED/diverged-feature.txt"
printf 'source side\n' >>"$SEED/semantic.union-fixture"
git -C "$SEED" add diverged-feature.txt semantic.union-fixture
git -C "$SEED" commit -q -m 'diverged feature'
DIVERGED_SOURCE_HEAD="$(git -C "$SEED" rev-parse HEAD)"
DIVERGED_SOURCE_TREE="$(git -C "$SEED" rev-parse "${DIVERGED_SOURCE_HEAD}^{tree}")"
if git -C "$SEED" merge-base --is-ancestor \
  "$EVENT_MERGE_BASE_SHA" "$DIVERGED_SOURCE_HEAD"; then
  echo 'FAIL: diverged-source fixture unexpectedly contains the event merge base' >&2
  exit 1
fi
STALE_BASE_EVENT_TREE="$(
  git -C "$SEED" merge-tree --write-tree \
    "$EVENT_MERGE_BASE_SHA" "$DIVERGED_SOURCE_HEAD"
)"
STALE_BASE_PR_HEAD="$(
  printf 'synthetic merge with stale event base metadata\n' \
    | git -C "$SEED" commit-tree "$STALE_BASE_EVENT_TREE" \
      -p "$EVENT_MERGE_BASE_SHA" -p "$DIVERGED_SOURCE_HEAD"
)"
git -C "$SEED" push -q origin \
  "$STALE_BASE_PR_HEAD:refs/pull/3/merge" \
  "$DIVERGED_SOURCE_HEAD:refs/pull/3/head"

# Preserve exact parents but corrupt the event tree; semantic reconstruction
# must reject it.
WRONG_TREE_PR_HEAD="$(
  printf 'synthetic merge with wrong tree\n' \
    | git -C "$SEED" commit-tree "$DIVERGED_SOURCE_TREE" \
      -p "$EVENT_MERGE_BASE_SHA" -p "$DIVERGED_SOURCE_HEAD"
)"
git -C "$SEED" push -q origin \
  "$WRONG_TREE_PR_HEAD:refs/pull/4/merge" \
  "$DIVERGED_SOURCE_HEAD:refs/pull/4/head"

REVERSED_PARENT_PR_HEAD="$(
  printf 'synthetic merge with reversed parents\n' \
    | git -C "$SEED" commit-tree "$STALE_BASE_EVENT_TREE" \
      -p "$DIVERGED_SOURCE_HEAD" -p "$EVENT_MERGE_BASE_SHA"
)"
git -C "$SEED" push -q origin \
  "$REVERSED_PARENT_PR_HEAD:refs/pull/5/merge" \
  "$DIVERGED_SOURCE_HEAD:refs/pull/5/head"

# Advance the live base after the immutable event was created. Parent1 remains
# its ancestor and therefore remains the exact event scan base.
git -C "$SEED" switch -q live-base
printf 'live base advanced after event\n' >"$SEED/live-base-later.txt"
git -C "$SEED" add live-base-later.txt
git -C "$SEED" commit -q -m 'advance live base after event'
LIVE_BASE_TIP="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" push -q origin "$LIVE_BASE_TIP:$LIVE_BASE_REF"
RACING_BASE_REF='refs/heads/racing-live-base'
git -C "$SEED" push -q origin "$EVENT_MERGE_BASE_SHA:$RACING_BASE_REF"

# A same-generation sibling is not a descendant of the immutable event merge
# base and cannot serve as the authoritative current base ref.
git -C "$SEED" switch -q -c nonancestor-live "$BASE_SHA"
printf 'nonancestor base\n' >"$SEED/nonancestor-base.txt"
git -C "$SEED" add nonancestor-base.txt
git -C "$SEED" commit -q -m 'nonancestor live base'
NONANCESTOR_BASE_SHA="$(git -C "$SEED" rev-parse HEAD)"
NONANCESTOR_BASE_REF='refs/heads/nonancestor-live'
git -C "$SEED" push -q origin "$NONANCESTOR_BASE_SHA:$NONANCESTOR_BASE_REF"

# A merge-group head can contain more than one branch side. Both sides must be
# complete relative to the exact queue base.
git -C "$SEED" switch -q -c queue-one "$BASE_SHA"
printf 'queue one\n' >"$SEED/queue-one.txt"
git -C "$SEED" add queue-one.txt
git -C "$SEED" commit -q -m 'queue one'
QUEUE_ONE_SHA="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" switch -q -c queue-two "$BASE_SHA"
printf 'queue two\n' >"$SEED/queue-two.txt"
git -C "$SEED" add queue-two.txt
git -C "$SEED" commit -q -m 'queue two'
QUEUE_TWO_SHA="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" switch -q -c queue-merge "$BASE_SHA"
git -C "$SEED" merge -q --no-ff queue-one queue-two -m 'synthetic merge group'
QUEUE_HEAD="$(git -C "$SEED" rev-parse HEAD)"
QUEUE_REF='refs/heads/gh-readonly-queue/main/pr-1-test'
git -C "$SEED" push -q origin "$QUEUE_HEAD:$QUEUE_REF"

# Direct-main fallback scans every commit since push.before.
git -C "$SEED" switch -q -C main "$BASE_SHA"
printf 'direct one\n' >"$SEED/direct.txt"
git -C "$SEED" add direct.txt
git -C "$SEED" commit -q -m 'direct main one'
DIRECT_ONE_SHA="$(git -C "$SEED" rev-parse HEAD)"
printf 'direct two\n' >>"$SEED/direct.txt"
git -C "$SEED" commit -qam 'direct main two'
DIRECT_HEAD="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" push -q --force origin main

# These refs model the cost that fetch-depth: 0 used to pull into every scan.
git -C "$SEED" switch -q -c unrelated "$BASE_SHA"
printf 'unrelated\n' >"$SEED/unrelated.txt"
git -C "$SEED" add unrelated.txt
git -C "$SEED" commit -q -m 'unrelated history'
git -C "$SEED" tag unrelated-history
git -C "$SEED" push -q origin unrelated unrelated-history

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_complete_range() {
  local checkout="$1"
  local base_sha="$2"
  local head_sha="$3"
  local boundary shallow_file

  git -C "$checkout" cat-file -e "${base_sha}^{commit}" \
    || fail "base commit was not fetched"
  git -C "$checkout" merge-base --is-ancestor "$base_sha" "$head_sha" \
    || fail "base is not an ancestor of head"
  shallow_file="$(git -C "$checkout" rev-parse --git-path shallow)"
  [[ -f "$checkout/$shallow_file" ]] || return 0
  while IFS= read -r boundary; do
    if git -C "$checkout" merge-base --is-ancestor "$boundary" "$head_sha" \
      && ! git -C "$checkout" merge-base --is-ancestor "$boundary" "$base_sha"; then
      fail "range still has a non-base shallow boundary: $boundary"
    fi
  done <"$checkout/$shallow_file"
}

checkout_range() {
  local name="$1"
  local checkout_ref="$2"
  local base_sha="$3"
  local head_sha="$4"
  local current_ref="$5"
  local current_sha="$6"
  local current_base_ref="${7:-}"
  local regenerated_head="${8:-}"
  local effective_base_sha="${9:-$base_sha}"
  SCENARIO_DIR="$TEST_ROOT/$name"
  git init -q "$SCENARIO_DIR"
  git -C "$SCENARIO_DIR" remote add origin "file://$ORIGIN"
  git -C "$SCENARIO_DIR" fetch -q --depth=1 origin "$checkout_ref"
  git -C "$SCENARIO_DIR" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$SCENARIO_DIR" rev-list --count HEAD)" -eq 1 ]] \
    || fail "$name did not begin as a depth-1 checkout"
  if [[ -n "$regenerated_head" ]]; then
    git -C "$SEED" push -q --force origin "$regenerated_head:$checkout_ref"
  fi
  (
    cd "$SCENARIO_DIR"
    "$RANGE_SCRIPT" "$base_sha" "$head_sha" "$current_ref" "$current_sha" \
      "$current_base_ref"
  ) >"$TEST_ROOT/$name.output"
  assert_complete_range \
    "$SCENARIO_DIR" "$effective_base_sha" \
    "$(git -C "$SCENARIO_DIR" rev-parse HEAD)"
  if git -C "$SCENARIO_DIR" show-ref --verify --quiet refs/remotes/origin/unrelated \
    || git -C "$SCENARIO_DIR" show-ref --verify --quiet refs/tags/unrelated-history; then
    fail "$name fetched unrelated refs"
  fi
}

checkout_range \
  pr \
  refs/pull/1/merge \
  "$BASE_SHA" \
  "$PR_HEAD" \
  refs/pull/1/head \
  "$SOURCE_HEAD" \
  "$PR_BASE_REF" \
  "$REGENERATED_PR_HEAD"
PR_DIR="$SCENARIO_DIR"
PR_SCAN_HEAD="$(git -C "$PR_DIR" rev-parse HEAD)"
[[ "$PR_SCAN_HEAD" != "$PR_HEAD" ]] \
  || fail 'pull request scan head remained the obsolete shallow merge object'
[[ "$(git -C "$PR_DIR" rev-parse "${PR_SCAN_HEAD}^{tree}")" == "$PR_TREE" ]] \
  || fail 'pull request scan head did not preserve the checked-out event tree'
[[ "$(git -C "$PR_DIR" show -s --format='%P' "$PR_SCAN_HEAD")" == "$BASE_SHA $SOURCE_HEAD" ]] \
  || fail 'pull request scan head did not preserve exact ordered parents'
git -C "$PR_DIR" cat-file -e "${INTRODUCED_SHA}^{commit}" \
  || fail 'introduced-secret commit is absent from PR range'
git -C "$PR_DIR" cat-file -e "${REMOVED_SHA}^{commit}" \
  || fail 'removed-secret commit is absent from PR range'

# A Git-valid base branch may contain shell-significant characters. Workflow
# environment transport plus quoted helper arguments must preserve it literally.
checkout_range \
  hostile-base-ref \
  refs/pull/1/merge \
  "$BASE_SHA" \
  "$REGENERATED_PR_HEAD" \
  refs/pull/1/head \
  "$SOURCE_HEAD" \
  "$HOSTILE_BASE_REF"
[[ ! -e "$SCENARIO_DIR/secret-scan-expression-injected" ]] \
  || fail 'hostile base ref crossed a shell-expression boundary'

checkout_range \
  stale-event-base \
  refs/pull/3/merge \
  "$BASE_SHA" \
  "$STALE_BASE_PR_HEAD" \
  refs/pull/3/head \
  "$DIVERGED_SOURCE_HEAD" \
  "$LIVE_BASE_REF" \
  '' \
  "$EVENT_MERGE_BASE_SHA"
STALE_BASE_DIR="$SCENARIO_DIR"
STALE_BASE_SCAN_HEAD="$(git -C "$STALE_BASE_DIR" rev-parse HEAD)"
[[ "$(git -C "$STALE_BASE_DIR" rev-parse refs/secret-scan/exact-base)" == "$EVENT_MERGE_BASE_SHA" ]] \
  || fail 'stale event base did not resolve to the immutable event merge base'
[[ "$(git -C "$STALE_BASE_DIR" rev-parse refs/secret-scan/live-base)" == "$LIVE_BASE_TIP" ]] \
  || fail 'current live base tip was not independently preserved'
[[ "$(git -C "$STALE_BASE_DIR" rev-parse "${STALE_BASE_SCAN_HEAD}^{tree}")" == "$STALE_BASE_EVENT_TREE" ]] \
  || fail 'stale-base scan head did not preserve the exact recomputed merge tree'
[[ "$(git -C "$STALE_BASE_DIR" show -s --format='%P' "$STALE_BASE_SCAN_HEAD")" == "$EVENT_MERGE_BASE_SHA $DIVERGED_SOURCE_HEAD" ]] \
  || fail 'stale-base scan head did not preserve immutable ordered parents'
STALE_BASE_DRIVER_CONTENT="$(
  git -C "$STALE_BASE_DIR" show \
    "${STALE_BASE_SCAN_HEAD}:semantic.union-fixture"
)"
grep -q 'live side' <<<"$STALE_BASE_DRIVER_CONTENT" \
  || fail 'exact-tree proof ignored the checked-in union merge driver base side'
grep -q 'source side' <<<"$STALE_BASE_DRIVER_CONTENT" \
  || fail 'exact-tree proof ignored the checked-in union merge driver source side'
grep -q 'Resolved stale pull request event base' \
  "$TEST_ROOT/stale-event-base.output" \
  || fail 'stale event base recovery lacks explicit classification'

# Move the authoritative base ref after the first fetch. The helper must reuse
# its already rewritten local scan head, refresh the descendant proof, and
# finish without requesting an Update Branch mutation.
RACING_DIR="$TEST_ROOT/racing-base"
git init -q "$RACING_DIR"
git -C "$RACING_DIR" remote add origin "file://$ORIGIN"
git -C "$RACING_DIR" fetch -q --depth=1 origin refs/pull/3/merge
git -C "$RACING_DIR" checkout -q --detach FETCH_HEAD
RACE_GIT="$TEST_ROOT/racing-git"
RACE_REAL_GIT_BIN="$(command -v git)"
RACE_REF_COUNT_FILE="$TEST_ROOT/racing-base-ref-count"
cat >"$RACE_GIT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "ls-remote" ]] && [[ " $* " == *" $RACE_REMOTE_BASE_REF "* ]]; then
  count=0
  [[ ! -f "$RACE_REF_COUNT_FILE" ]] || count="$(cat "$RACE_REF_COUNT_FILE")"
  count=$((count + 1))
  printf '%s\n' "$count" >"$RACE_REF_COUNT_FILE"
  if [[ $count -eq 2 ]]; then
    "$RACE_REAL_GIT_BIN" --git-dir="$RACE_ORIGIN" update-ref \
      "$RACE_REMOTE_BASE_REF" "$RACE_LIVE_BASE_TIP"
  fi
fi
exec "$RACE_REAL_GIT_BIN" "$@"
EOF
chmod +x "$RACE_GIT"
(
  cd "$RACING_DIR"
  RACE_REMOTE_BASE_REF="$RACING_BASE_REF" \
    RACE_REF_COUNT_FILE="$RACE_REF_COUNT_FILE" \
    RACE_REAL_GIT_BIN="$RACE_REAL_GIT_BIN" \
    RACE_ORIGIN="$ORIGIN" \
    RACE_LIVE_BASE_TIP="$LIVE_BASE_TIP" \
    SECRET_SCAN_GIT_BIN="$RACE_GIT" \
    "$RANGE_SCRIPT" "$BASE_SHA" "$STALE_BASE_PR_HEAD" refs/pull/3/head \
      "$DIVERGED_SOURCE_HEAD" "$RACING_BASE_REF"
) >"$TEST_ROOT/racing-base.output"
RACING_SCAN_HEAD="$(git -C "$RACING_DIR" rev-parse HEAD)"
grep -q 'base advanced during range fetch' "$TEST_ROOT/racing-base.output" \
  || fail 'racing base fixture did not force a second proof iteration'
[[ "$(git -C "$RACING_DIR" rev-parse refs/secret-scan/live-base)" == "$LIVE_BASE_TIP" ]] \
  || fail 'second proof iteration did not fetch the advanced live base'
[[ "$(git -C "$RACING_DIR" rev-parse "${RACING_SCAN_HEAD}^{tree}")" == "$STALE_BASE_EVENT_TREE" ]] \
  || fail 'second proof iteration lost the rewritten exact event tree'
[[ "$(git -C "$RACING_DIR" show -s --format='%P' "$RACING_SCAN_HEAD")" == "$EVENT_MERGE_BASE_SHA $DIVERGED_SOURCE_HEAD" ]] \
  || fail 'second proof iteration lost immutable ordered parents'

if GITLEAKS_BIN="${GITLEAKS_BIN:-$(command -v gitleaks || true)}" \
  && [[ -n "$GITLEAKS_BIN" ]]; then
  status=0
  "$GITLEAKS_BIN" detect \
    --source "$PR_DIR" \
    --config "$REPO_ROOT/.gitleaks.toml" \
    --log-opts="${BASE_SHA}..HEAD" \
    --verbose >"$TEST_ROOT/gitleaks.output" 2>&1 || status=$?
  [[ $status -ne 0 ]] || fail 'gitleaks missed an introduced-then-removed backup secret'
  grep -qE 'neon-postgres-connection-string|clerk-secret-key' \
    "$TEST_ROOT/gitleaks.output" \
    || fail 'gitleaks failed for an unexpected rule'
  echo 'PASS: gitleaks detected an introduced-then-removed backup secret'
else
  echo 'SKIP: gitleaks binary unavailable for historical-range fixture assertion'
fi

if TRUFFLEHOG_BIN="${TRUFFLEHOG_BIN:-$(command -v trufflehog || true)}" \
  && [[ -n "$TRUFFLEHOG_BIN" ]]; then
  "$TRUFFLEHOG_BIN" git "file://$PR_DIR" \
    --since-commit "$BASE_SHA" \
    --branch HEAD \
    --no-verification \
    --fail >"$TEST_ROOT/trufflehog.output" 2>&1 \
    || fail 'trufflehog could not clone and scan the local-only pull request scan head'
  echo 'PASS: trufflehog cloned and scanned the local-only pull request scan head'
else
  echo 'SKIP: trufflehog binary unavailable for local-only scan-head assertion'
fi

checkout_range \
  merge-group "$QUEUE_REF" "$BASE_SHA" "$QUEUE_HEAD" "$QUEUE_REF" "$QUEUE_HEAD" ''
git -C "$SCENARIO_DIR" cat-file -e "${QUEUE_ONE_SHA}^{commit}" \
  || fail 'first merge-group side is absent'
git -C "$SCENARIO_DIR" cat-file -e "${QUEUE_TWO_SHA}^{commit}" \
  || fail 'second merge-group side is absent'

checkout_range \
  direct-main refs/heads/main "$BASE_SHA" "$DIRECT_HEAD" refs/heads/main "$DIRECT_HEAD" ''
git -C "$SCENARIO_DIR" cat-file -e "${DIRECT_ONE_SHA}^{commit}" \
  || fail 'direct-main intermediate commit is absent'

# A moved PR source-head ref fails before fetching or scanning stale history,
# even though GitHub's mutable synthetic merge ref is not used as freshness.
STALE_DIR="$TEST_ROOT/stale"
git init -q "$STALE_DIR"
git -C "$STALE_DIR" remote add origin "file://$ORIGIN"
git -C "$STALE_DIR" fetch -q --depth=1 origin refs/pull/1/merge
git -C "$STALE_DIR" checkout -q --detach FETCH_HEAD
STALE_HEAD="$(git -C "$STALE_DIR" rev-parse HEAD)"
git -C "$SEED" switch -q feature
printf 'superseded source head\n' >>"$SEED/feature.txt"
git -C "$SEED" commit -qam 'supersede source head'
SUPERSEDING_SOURCE_HEAD="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" push -q --force origin \
  "$SUPERSEDING_SOURCE_HEAD:refs/pull/1/head"
status=0
(
  cd "$STALE_DIR"
  "$RANGE_SCRIPT" "$BASE_SHA" "$STALE_HEAD" refs/pull/1/head "$SOURCE_HEAD" \
    "$PR_BASE_REF"
) >"$TEST_ROOT/stale.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'a superseded pull request source ref must fail closed'
grep -q 'current ref moved' "$TEST_ROOT/stale.output" \
  || fail 'superseded pull request source ref lacks explicit classification'

# A matching fork-safe pull head ref cannot bless a synthetic merge whose
# second parent is not that exact source.
TOPOLOGY_DIR="$TEST_ROOT/topology"
git init -q "$TOPOLOGY_DIR"
git -C "$TOPOLOGY_DIR" remote add origin "file://$ORIGIN"
git -C "$TOPOLOGY_DIR" fetch -q --depth=1 origin refs/pull/1/merge
git -C "$TOPOLOGY_DIR" checkout -q --detach FETCH_HEAD
TOPOLOGY_HEAD="$(git -C "$TOPOLOGY_DIR" rev-parse HEAD)"
git -C "$SEED" push -q --force origin "$QUEUE_ONE_SHA:refs/pull/2/head"
status=0
(
  cd "$TOPOLOGY_DIR"
  "$RANGE_SCRIPT" "$BASE_SHA" "$TOPOLOGY_HEAD" refs/pull/2/head "$QUEUE_ONE_SHA" \
    "$PR_BASE_REF"
) >"$TEST_ROOT/topology.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'wrong pull request parent topology must fail closed'
grep -q 'exact ordered merge-base/source parent topology' "$TEST_ROOT/topology.output" \
  || fail 'wrong pull request parent topology lacks explicit classification'

# Exact ordered parents are insufficient when the checked-out event tree is
# not the tree Git recomputes from those parents.
WRONG_TREE_DIR="$TEST_ROOT/wrong-tree"
git init -q "$WRONG_TREE_DIR"
git -C "$WRONG_TREE_DIR" remote add origin "file://$ORIGIN"
git -C "$WRONG_TREE_DIR" fetch -q --depth=1 origin refs/pull/4/merge
git -C "$WRONG_TREE_DIR" checkout -q --detach FETCH_HEAD
status=0
(
  cd "$WRONG_TREE_DIR"
  "$RANGE_SCRIPT" "$BASE_SHA" "$WRONG_TREE_PR_HEAD" refs/pull/4/head \
    "$DIVERGED_SOURCE_HEAD" "$LIVE_BASE_REF"
) >"$TEST_ROOT/wrong-tree.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'pull request event with wrong tree must fail closed'
grep -q 'does not match the exact recomputed merge tree' \
  "$TEST_ROOT/wrong-tree.output" \
  || fail 'wrong pull request event tree lacks explicit classification'

# Parent order is part of the event identity, even if the same two commit ids
# are present.
REVERSED_DIR="$TEST_ROOT/reversed-parents"
git init -q "$REVERSED_DIR"
git -C "$REVERSED_DIR" remote add origin "file://$ORIGIN"
git -C "$REVERSED_DIR" fetch -q --depth=1 origin refs/pull/5/merge
git -C "$REVERSED_DIR" checkout -q --detach FETCH_HEAD
status=0
(
  cd "$REVERSED_DIR"
  "$RANGE_SCRIPT" "$BASE_SHA" "$REVERSED_PARENT_PR_HEAD" refs/pull/5/head \
    "$DIVERGED_SOURCE_HEAD" "$LIVE_BASE_REF"
) >"$TEST_ROOT/reversed-parents.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'reversed pull request event parents must fail closed'
grep -q 'exact ordered merge-base/source parent topology' \
  "$TEST_ROOT/reversed-parents.output" \
  || fail 'reversed parent order lacks explicit classification'

# The event payload base must be equal to or an ancestor of immutable parent1;
# an unrelated/fork coordinate cannot replace it.
WRONG_EVENT_BASE_DIR="$TEST_ROOT/wrong-event-base"
git init -q "$WRONG_EVENT_BASE_DIR"
git -C "$WRONG_EVENT_BASE_DIR" remote add origin "file://$ORIGIN"
git -C "$WRONG_EVENT_BASE_DIR" fetch -q --depth=1 origin refs/pull/3/merge
git -C "$WRONG_EVENT_BASE_DIR" checkout -q --detach FETCH_HEAD
status=0
(
  cd "$WRONG_EVENT_BASE_DIR"
  "$RANGE_SCRIPT" "$NONANCESTOR_BASE_SHA" "$STALE_BASE_PR_HEAD" \
    refs/pull/3/head "$DIVERGED_SOURCE_HEAD" "$LIVE_BASE_REF"
) >"$TEST_ROOT/wrong-event-base.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'unrelated pull request event base must fail closed'
grep -q 'event base is not an ancestor of the immutable event merge base' \
  "$TEST_ROOT/wrong-event-base.output" \
  || fail 'unrelated event base lacks explicit classification'

# The authoritative base ref may advance past parent1, but it may never move to
# a non-descendant history.
NONANCESTOR_DIR="$TEST_ROOT/nonancestor-live"
git init -q "$NONANCESTOR_DIR"
git -C "$NONANCESTOR_DIR" remote add origin "file://$ORIGIN"
git -C "$NONANCESTOR_DIR" fetch -q --depth=1 origin refs/pull/3/merge
git -C "$NONANCESTOR_DIR" checkout -q --detach FETCH_HEAD
status=0
(
  cd "$NONANCESTOR_DIR"
  "$RANGE_SCRIPT" "$BASE_SHA" "$STALE_BASE_PR_HEAD" refs/pull/3/head \
    "$DIVERGED_SOURCE_HEAD" "$NONANCESTOR_BASE_REF"
) >"$TEST_ROOT/nonancestor-live.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'non-descendant authoritative base ref must fail closed'
grep -q 'immutable event merge base is not an ancestor of the authoritative base ref' \
  "$TEST_ROOT/nonancestor-live.output" \
  || fail 'non-descendant authoritative base lacks explicit classification'

# Cancellation reaches the in-flight exact-range fetch instead of leaving an
# unbounded child process behind.
CANCEL_DIR="$TEST_ROOT/cancel"
git init -q "$CANCEL_DIR"
git -C "$CANCEL_DIR" remote add origin "file://$ORIGIN"
git -C "$CANCEL_DIR" fetch -q --depth=1 origin "$QUEUE_REF"
git -C "$CANCEL_DIR" checkout -q --detach FETCH_HEAD
REAL_GIT_BIN="$(command -v git)"
FAKE_GIT="$TEST_ROOT/cancellable-git"
cat >"$FAKE_GIT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "fetch" ]]; then
  echo "$$" >"$FETCH_PID_FILE"
  trap 'exit 143' INT TERM
  while true; do sleep 1; done
fi
exec "$REAL_GIT_BIN" "$@"
EOF
chmod +x "$FAKE_GIT"
FETCH_PID_FILE="$TEST_ROOT/fetch.pid"
previous_dir="$PWD"
cd "$CANCEL_DIR"
FETCH_PID_FILE="$FETCH_PID_FILE" REAL_GIT_BIN="$REAL_GIT_BIN" \
  SECRET_SCAN_GIT_BIN="$FAKE_GIT" \
  "$RANGE_SCRIPT" "$BASE_SHA" "$QUEUE_HEAD" "$QUEUE_REF" \
  >"$TEST_ROOT/cancel.output" 2>&1 &
helper_pid=$!
cd "$previous_dir"
for _ in $(seq 1 250); do
  [[ -f "$FETCH_PID_FILE" ]] && break
  sleep 0.02
done
[[ -f "$FETCH_PID_FILE" ]] || fail 'cancellable fetch did not start'
started_at="$(date +%s)"
kill -TERM "$helper_pid"
status=0
wait "$helper_pid" || status=$?
elapsed=$(( $(date +%s) - started_at ))
[[ $status -ne 0 ]] || fail 'cancelled range preparation returned success'
[[ $elapsed -le 3 ]] || fail "cancelled fetch took ${elapsed}s to stop"
fetch_pid="$(cat "$FETCH_PID_FILE")"
for _ in $(seq 1 100); do
  kill -0 "$fetch_pid" 2>/dev/null || break
  sleep 0.02
done
if kill -0 "$fetch_pid" 2>/dev/null; then
  fail 'cancelled range preparation left its fetch child running'
fi

# The helper itself owns one absolute network budget; the job timeout is only a
# final backstop. A wedged fetch is killed and reaped without external signals.
DEADLINE_FETCH_PID_FILE="$TEST_ROOT/deadline-fetch.pid"
started_at="$(date +%s)"
status=0
(
  cd "$CANCEL_DIR"
  FETCH_PID_FILE="$DEADLINE_FETCH_PID_FILE" REAL_GIT_BIN="$REAL_GIT_BIN" \
    SECRET_SCAN_GIT_BIN="$FAKE_GIT" \
    SECRET_SCAN_RANGE_DEADLINE_SECONDS=2 \
    "$RANGE_SCRIPT" "$BASE_SHA" "$QUEUE_HEAD" "$QUEUE_REF"
) >"$TEST_ROOT/deadline.output" 2>&1 || status=$?
elapsed=$(( $(date +%s) - started_at ))
[[ $status -ne 0 ]] || fail 'absolute range deadline returned success'
[[ $elapsed -le 5 ]] || fail "absolute range deadline took ${elapsed}s"
[[ -f "$DEADLINE_FETCH_PID_FILE" ]] \
  || fail 'absolute range deadline did not reach the wedged fetch child'
grep -q 'absolute network budget was exhausted' "$TEST_ROOT/deadline.output" \
  || fail 'absolute range deadline lacks explicit classification'
deadline_fetch_pid="$(cat "$DEADLINE_FETCH_PID_FILE")"
if kill -0 "$deadline_fetch_pid" 2>/dev/null; then
  fail 'absolute range deadline left its fetch child running'
fi

echo 'PASS: exact CI secret-scan range regression tests'
