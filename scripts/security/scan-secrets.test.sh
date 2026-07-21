#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCAN_SCRIPT="$REPO_ROOT/scripts/security/scan-secrets.sh"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

BIN_DIR="$TEST_ROOT/bin"
mkdir -p "$BIN_DIR"

cat >"$BIN_DIR/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$GIT_CALLS"
if [[ " $* " == *" fetch "* && "${SCAN_TEST_SCENARIO:-}" == "repair-failure" ]]; then
  exit 42
fi
case "${1:-}" in
  diff)
    # Staged file list for pre-commit mode (newline-separated, repo-relative).
    printf '%s\n' "${SCAN_TEST_STAGED_FILES:-}"
    ;;
  rev-parse)
    case "${2:-}" in
      HEAD)
        printf '%s\n' "$SCAN_TEST_LOCAL_HEAD"
        ;;
      refs/secret-scan/repair-current)
        printf '%s\n' "$SECRET_SCAN_REMOTE_CURRENT_SHA"
        ;;
      refs/secret-scan/repair-base)
        printf '%s\n' "$SECRET_SCAN_REMOTE_BASE_SHA"
        ;;
      *)
        printf '%s\n' '0123456789abcdef0123456789abcdef01234567'
        ;;
    esac
    ;;
  rev-list)
    # Space-separated SCAN_TEST_RANGE_COMMITS models the exact base..HEAD set
    # that a real git would compute for the range-integrity classifier.
    for commit in ${SCAN_TEST_RANGE_COMMITS:-}; do
      printf '%s\n' "$commit"
    done
    ;;
  config)
    exit 0
    ;;
esac
EOF

cat >"$BIN_DIR/trufflehog" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "$TRUFFLEHOG_COUNT" ]]; then
  count="$(cat "$TRUFFLEHOG_COUNT")"
fi
count=$((count + 1))
printf '%s\n' "$count" >"$TRUFFLEHOG_COUNT"

case "${SCAN_TEST_SCENARIO:-}" in
  corruption | repair-failure)
    if [[ $count -eq 1 ]]; then
      echo 'failed to clone file Git repo: repository corruption on the remote side' >&2
      exit 1
    fi
    ;;
  finding)
    echo 'verified secret detected' >&2
    exit 183
    ;;
  widened | in-range-finding | mixed)
    # Realistic human-format finding blocks; TRUFFLEHOG_FAKE_FINDING_COMMITS is
    # a space-separated list of attributions trufflehog prints per finding.
    for commit in ${TRUFFLEHOG_FAKE_FINDING_COMMITS:-}; do
      printf 'Found unverified result\nDetector Type: Postgres\nRaw result: ***ep-xxx.region.aws.neon.tech:5432\nCommit: %s\nFile: .env.example\nLine: 7\n\n' "$commit"
    done
    exit 183
    ;;
  incomplete)
    # trufflehog 3.95.9 swallows its own scan-preparation errors (verified:
    # go-git merge-base resolution over a shallow boundary) and still exits 0
    # with zero findings. That signature must never pass as a clean scan.
    printf '%s\n' '2026-07-20T00:00:00Z	error	trufflehog	encountered errors during scan	{"job": 1, "errors": ["error chunking dir \"/tmp/x\": unable to resolve merge base: object not found"]}'
    exit 0
    ;;
  pre-commit)
    printf '%s\n' "$*" >"$TRUFFLEHOG_PRECOMMIT_ARGS"
    ;;
esac
EOF

cat >"$BIN_DIR/gitleaks" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$GITLEAKS_CALLS"
EOF

chmod +x "$BIN_DIR/git" "$BIN_DIR/trufflehog" "$BIN_DIR/gitleaks"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

run_scenario() {
  local scenario="$1"
  local range_commits="${2:-}"
  local finding_commits="${3:-}"
  local output="$TEST_ROOT/$scenario.output"
  local status=0
  export GIT_CALLS="$TEST_ROOT/$scenario.git-calls"
  export TRUFFLEHOG_COUNT="$TEST_ROOT/$scenario.trufflehog-count"
  export SCAN_TEST_SCENARIO="$scenario"
  export SCAN_TEST_LOCAL_HEAD='cccccccccccccccccccccccccccccccccccccccc'
  export SCAN_TEST_RANGE_COMMITS="$range_commits"
  export TRUFFLEHOG_FAKE_FINDING_COMMITS="$finding_commits"
  export SECRET_SCAN_REMOTE_CURRENT_REF='refs/pull/14493/head'
  export SECRET_SCAN_REMOTE_CURRENT_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  export SECRET_SCAN_REMOTE_BASE_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  : >"$GIT_CALLS"
  rm -f "$TRUFFLEHOG_COUNT"

  PATH="$BIN_DIR:$PATH" TRUFFLEHOG_BIN="$BIN_DIR/trufflehog" \
    bash "$SCAN_SCRIPT" ci-pr-trufflehog origin/main >"$output" 2>&1 || status=$?
  printf '%s\n' "$status"
}

status="$(run_scenario corruption)"
[[ $status -eq 0 ]] || fail "corruption repair scenario returned $status"
[[ "$(cat "$TEST_ROOT/corruption.trufflehog-count")" -eq 2 ]] \
  || fail 'corruption must trigger exactly one retry'
[[ "$(grep -c '^fetch ' "$TEST_ROOT/corruption.git-calls")" -eq 1 ]] \
  || fail 'corruption must trigger exactly one successful repair fetch'
grep -q 'Secret scan checkout corruption' "$TEST_ROOT/corruption.output" \
  || fail 'corruption must emit an explicit CI classification'
grep -q '+refs/pull/14493/head:refs/secret-scan/repair-current' \
  "$TEST_ROOT/corruption.git-calls" \
  || fail 'corruption repair must fetch the stable pull request source ref'
grep -q '+bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:refs/secret-scan/repair-base' \
  "$TEST_ROOT/corruption.git-calls" \
  || fail 'corruption repair must fetch the exact base SHA'
if grep -q 'cccccccccccccccccccccccccccccccccccccccc' \
  "$TEST_ROOT/corruption.git-calls"; then
  fail 'corruption repair must not ask origin for the local-only scan head'
fi

status="$(run_scenario finding)"
[[ $status -eq 183 ]] || fail "secret finding status was not preserved: $status"
[[ "$(cat "$TEST_ROOT/finding.trufflehog-count")" -eq 1 ]] \
  || fail 'a real finding must not retry'
[[ "$(grep -c '^fetch ' "$TEST_ROOT/finding.git-calls" || true)" -eq 0 ]] \
  || fail 'a real finding must not repair the checkout'

status="$(run_scenario repair-failure)"
[[ $status -ne 0 ]] || fail 'repair failure must remain nonzero'
[[ "$(cat "$TEST_ROOT/repair-failure.trufflehog-count")" -eq 1 ]] \
  || fail 'failed repair must not retry TruffleHog'
[[ "$(grep -c 'fetch origin' "$TEST_ROOT/repair-failure.git-calls")" -eq 2 ]] \
  || fail 'repair must try the primary fetch and compatibility fallback'
grep -q 'Secret scan checkout repair failed' "$TEST_ROOT/repair-failure.output" \
  || fail 'repair failure must emit an explicit CI classification'

IN_RANGE_COMMIT='dddddddddddddddddddddddddddddddddddddddd'
OUT_OF_RANGE_COMMIT='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

# trufflehog's --since-commit walk can widen below an excluded-paths-only base
# (JOV-4333). Findings outside the exact rev-list range are pre-existing main
# content: they must be classified loudly but must not fail this event.
status="$(run_scenario widened "$IN_RANGE_COMMIT" "$OUT_OF_RANGE_COMMIT")"
[[ $status -eq 0 ]] \
  || fail "out-of-range findings must not fail the event: $status"
grep -q '::warning title=Secret scan range widened below exact base' \
  "$TEST_ROOT/widened.output" \
  || fail 'widened scan lacks the explicit out-of-range classification'
grep -q "$OUT_OF_RANGE_COMMIT" "$TEST_ROOT/widened.output" \
  || fail 'widened scan classification must name the out-of-range commit'
if grep -q '::error title=Secret scan incomplete' "$TEST_ROOT/widened.output"; then
  fail 'widened scan must not be misclassified as an incomplete scan'
fi

# Findings inside the exact range are this event's delta and still fail.
status="$(run_scenario in-range-finding "$IN_RANGE_COMMIT" "$IN_RANGE_COMMIT")"
[[ $status -eq 183 ]] \
  || fail "in-range findings must fail the scan: $status"
if grep -q 'range widened below exact base' \
  "$TEST_ROOT/in-range-finding.output"; then
  fail 'in-range findings must not emit the out-of-range classification'
fi

# Mixed attribution: the in-range finding decides the failure; the
# out-of-range one is still classified.
status="$(run_scenario mixed "$IN_RANGE_COMMIT" "$IN_RANGE_COMMIT $OUT_OF_RANGE_COMMIT")"
[[ $status -eq 183 ]] \
  || fail "mixed findings must fail on the in-range commit: $status"
grep -q '::warning title=Secret scan range widened below exact base' \
  "$TEST_ROOT/mixed.output" \
  || fail 'mixed findings must still classify the out-of-range commit'

# A trufflehog run that aborts its own scan yet exits 0 with zero findings is
# a scan that never ran; fail closed instead of accepting the empty result.
status="$(run_scenario incomplete)"
[[ $status -ne 0 ]] || fail 'an aborted trufflehog scan must fail closed'
grep -q '::error title=Secret scan incomplete' "$TEST_ROOT/incomplete.output" \
  || fail 'aborted scan lacks the explicit incomplete classification'

# pre-commit mode filters the staged list through .trufflehog-exclude.txt and
# must not pass git-mode-only --exclude-globs to the filesystem scan
# (filesystem mode rejects that flag on 3.95.5 and 3.95.9 alike).
export GIT_CALLS="$TEST_ROOT/pre-commit.git-calls"
export GITLEAKS_CALLS="$TEST_ROOT/pre-commit.gitleaks-calls"
export TRUFFLEHOG_COUNT="$TEST_ROOT/pre-commit.trufflehog-count"
export TRUFFLEHOG_PRECOMMIT_ARGS="$TEST_ROOT/pre-commit.trufflehog-args"
export SCAN_TEST_SCENARIO='pre-commit'
export SCAN_TEST_STAGED_FILES=$'scripts/security/scan-secrets.sh\nscripts/security/gitleaks-fixture.txt'
: >"$GIT_CALLS"
: >"$GITLEAKS_CALLS"
rm -f "$TRUFFLEHOG_COUNT" "$TRUFFLEHOG_PRECOMMIT_ARGS"
status=0
PATH="$BIN_DIR:$PATH" TRUFFLEHOG_BIN="$BIN_DIR/trufflehog" \
  bash "$SCAN_SCRIPT" pre-commit >"$TEST_ROOT/pre-commit.output" 2>&1 \
  || status=$?
[[ $status -eq 0 ]] || fail "pre-commit scenario returned $status"
grep -q 'protect --staged' "$GITLEAKS_CALLS" \
  || fail 'pre-commit must run gitleaks protect on the staged diff'
[[ "$(cat "$TRUFFLEHOG_COUNT")" -eq 1 ]] \
  || fail 'pre-commit must invoke trufflehog once for the staged files'
grep -q 'scripts/security/scan-secrets.sh' "$TRUFFLEHOG_PRECOMMIT_ARGS" \
  || fail 'pre-commit must scan the non-excluded staged file'
if grep -q 'gitleaks-fixture.txt' "$TRUFFLEHOG_PRECOMMIT_ARGS"; then
  fail 'pre-commit must not scan files listed in .trufflehog-exclude.txt'
fi
if grep -q -- '--exclude-globs' "$TRUFFLEHOG_PRECOMMIT_ARGS"; then
  fail 'pre-commit filesystem scan must not receive git-mode-only --exclude-globs'
fi

bash "$REPO_ROOT/scripts/security/prepare-ci-secret-scan-range.test.sh"

echo 'PASS: scan-secrets corruption recovery regression tests'
