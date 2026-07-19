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
BASE_SHA="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" push -q origin main

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

git -C "$SEED" switch -q -c pr-merge "$BASE_SHA"
git -C "$SEED" merge -q --no-ff feature -m 'synthetic pull request merge'
PR_HEAD="$(git -C "$SEED" rev-parse HEAD)"
git -C "$SEED" push -q origin "$PR_HEAD:refs/pull/1/merge"

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
  local fetch_ref="$2"
  local base_sha="$3"
  local head_sha="$4"
  SCENARIO_DIR="$TEST_ROOT/$name"
  git init -q "$SCENARIO_DIR"
  git -C "$SCENARIO_DIR" remote add origin "file://$ORIGIN"
  git -C "$SCENARIO_DIR" fetch -q --depth=1 origin "$fetch_ref"
  git -C "$SCENARIO_DIR" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$SCENARIO_DIR" rev-list --count HEAD)" -eq 1 ]] \
    || fail "$name did not begin as a depth-1 checkout"
  (
    cd "$SCENARIO_DIR"
    "$RANGE_SCRIPT" "$base_sha" "$head_sha" "$fetch_ref"
  ) >"$TEST_ROOT/$name.output"
  assert_complete_range "$SCENARIO_DIR" "$base_sha" "$head_sha"
  if git -C "$SCENARIO_DIR" show-ref --verify --quiet refs/remotes/origin/unrelated \
    || git -C "$SCENARIO_DIR" show-ref --verify --quiet refs/tags/unrelated-history; then
    fail "$name fetched unrelated refs"
  fi
}

checkout_range pr refs/pull/1/merge "$BASE_SHA" "$PR_HEAD"
PR_DIR="$SCENARIO_DIR"
git -C "$PR_DIR" cat-file -e "${INTRODUCED_SHA}^{commit}" \
  || fail 'introduced-secret commit is absent from PR range'
git -C "$PR_DIR" cat-file -e "${REMOVED_SHA}^{commit}" \
  || fail 'removed-secret commit is absent from PR range'

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

checkout_range merge-group "$QUEUE_REF" "$BASE_SHA" "$QUEUE_HEAD"
git -C "$SCENARIO_DIR" cat-file -e "${QUEUE_ONE_SHA}^{commit}" \
  || fail 'first merge-group side is absent'
git -C "$SCENARIO_DIR" cat-file -e "${QUEUE_TWO_SHA}^{commit}" \
  || fail 'second merge-group side is absent'

checkout_range direct-main refs/heads/main "$BASE_SHA" "$DIRECT_HEAD"
git -C "$SCENARIO_DIR" cat-file -e "${DIRECT_ONE_SHA}^{commit}" \
  || fail 'direct-main intermediate commit is absent'

# A moved event ref fails before fetching or scanning stale history.
STALE_DIR="$TEST_ROOT/stale"
git init -q "$STALE_DIR"
git -C "$STALE_DIR" remote add origin "file://$ORIGIN"
git -C "$STALE_DIR" fetch -q --depth=1 origin refs/pull/1/merge
git -C "$STALE_DIR" checkout -q --detach FETCH_HEAD
git -C "$SEED" push -q --force origin "feature:refs/pull/1/merge"
status=0
(
  cd "$STALE_DIR"
  "$RANGE_SCRIPT" "$BASE_SHA" "$PR_HEAD" refs/pull/1/merge
) >"$TEST_ROOT/stale.output" 2>&1 || status=$?
[[ $status -ne 0 ]] || fail 'a superseded event ref must fail closed'
grep -q 'event ref moved' "$TEST_ROOT/stale.output" \
  || fail 'superseded event ref lacks explicit classification'

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
for _ in $(seq 1 100); do
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

echo 'PASS: exact CI secret-scan range regression tests'
