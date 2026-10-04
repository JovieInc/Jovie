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
if [[ " $* " == *" fetch "* && "${SCAN_TEST_SCENARIO:-}" =~ ^(repair-failure|gitleaks-repair-failure)$ ]]; then
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
  widened | in-range-finding | mixed | full-allowlisted | full-blocked)
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
count="$(wc -l <"$GITLEAKS_CALLS")"
case "${SCAN_TEST_SCENARIO:-}" in
  gitleaks-corruption | gitleaks-unrepaired | gitleaks-repair-failure)
    if [[ "$SCAN_TEST_SCENARIO" != gitleaks-corruption || $count -eq 1 ]]; then
      echo '12:00PM ERR [git] fatal: unable to read tree (0123456789abcdef0123456789abcdef01234567)' >&2
      echo '12:00PM ERR failed to scan Git repository error="stderr is not empty"' >&2
      echo '12:00PM INF no leaks found' >&2
    fi
    ;;
  gitleaks-incomplete)
    echo '12:00PM ERR failed to start scan: permission denied' >&2
    ;;
  gitleaks-finding)
    echo '12:00PM WRN leaks found: 1' >&2
    exit 1
    ;;
  gitleaks-exit-error)
    exit 42
    ;;
esac
EOF

chmod +x "$BIN_DIR/git" "$BIN_DIR/trufflehog" "$BIN_DIR/gitleaks"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Gitleaks 8.21.2 can emit a Git reader error and still exit 0 with
# "no leaks found". Exercise the shipped script, including bounded repair.
run_gitleaks_scenario() {
  local scenario="$1" mode="${2:-publication}" status=0
  export SCAN_TEST_SCENARIO="$scenario"
  export GIT_CALLS="$TEST_ROOT/$scenario.$mode.git-calls"
  export GITLEAKS_CALLS="$TEST_ROOT/$scenario.$mode.gitleaks-calls"
  export TRUFFLEHOG_COUNT="$TEST_ROOT/$scenario.$mode.trufflehog-count"
  export SECRET_SCAN_REMOTE_CURRENT_REF='refs/pull/14493/head'
  export SECRET_SCAN_REMOTE_CURRENT_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  export SECRET_SCAN_REMOTE_BASE_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  : >"$GIT_CALLS"
  : >"$GITLEAKS_CALLS"
  PATH="$BIN_DIR:$PATH" GITLEAKS_BIN="$BIN_DIR/gitleaks" TRUFFLEHOG_BIN="$BIN_DIR/trufflehog" \
    bash "$SCAN_SCRIPT" "$mode" origin/main >"$TEST_ROOT/$scenario.$mode.output" 2>&1 || status=$?
  printf '%s\n' "$status"
}

for mode in publication ci-pr full; do
  status="$(run_gitleaks_scenario gitleaks-corruption "$mode")"
  [[ $status -eq 0 ]] || fail "Gitleaks checkout recovery failed in $mode: $status"
  [[ "$(wc -l <"$TEST_ROOT/gitleaks-corruption.$mode.gitleaks-calls")" -eq 2 ]] \
    || fail 'Gitleaks corruption must retry exactly once'
  [[ "$(grep -c '^fetch ' "$TEST_ROOT/gitleaks-corruption.$mode.git-calls")" -eq 1 ]] \
    || fail 'Gitleaks recovery must use one successful fetch'
  grep -q '+refs/pull/14493/head:refs/secret-scan/repair-current' "$TEST_ROOT/gitleaks-corruption.$mode.git-calls" \
    || fail 'Gitleaks recovery must fetch the stable source ref'

  status="$(run_gitleaks_scenario gitleaks-unrepaired "$mode")"
  [[ $status -ne 0 ]] || fail "Gitleaks incomplete scan must fail closed in $mode"
  [[ "$(wc -l <"$TEST_ROOT/gitleaks-unrepaired.$mode.gitleaks-calls")" -eq 2 ]] \
    || fail 'Gitleaks recovery must stop after one retry'
  grep -q 'Secret scan incomplete' "$TEST_ROOT/gitleaks-unrepaired.$mode.output" \
    || fail 'Gitleaks failed recovery must explain the incomplete scan'
  if grep -q 'PASS: secret scan' "$TEST_ROOT/gitleaks-unrepaired.$mode.output"; then
    fail 'incomplete Gitleaks scan must not publish a success receipt'
  fi
done

for scenario in gitleaks-incomplete gitleaks-finding gitleaks-exit-error gitleaks-repair-failure; do
  status="$(run_gitleaks_scenario "$scenario")"
  [[ $status -ne 0 ]] || fail "$scenario must fail the scan"
  [[ "$(wc -l <"$TEST_ROOT/$scenario.publication.gitleaks-calls")" -eq 1 ]] \
    || fail "$scenario must not retry the scanner"
  if [[ "$scenario" != gitleaks-repair-failure ]]; then
    [[ "$(grep -c '^fetch ' "$TEST_ROOT/$scenario.publication.git-calls" || true)" -eq 0 ]] \
      || fail "$scenario must not repair the checkout"
  fi
  if [[ "$scenario" == gitleaks-finding ]]; then
    [[ $status -eq 1 ]] || fail 'Gitleaks findings must preserve their exit status'
  elif [[ "$scenario" == gitleaks-exit-error ]]; then
    [[ $status -eq 42 ]] || fail 'Gitleaks errors must preserve their exit status'
  fi
done

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

run_full_scenario() {
  local scenario="$1"
  local finding_commits="${2:-}"
  local output="$TEST_ROOT/$scenario.output"
  local status=0
  export GIT_CALLS="$TEST_ROOT/$scenario.git-calls"
  export TRUFFLEHOG_COUNT="$TEST_ROOT/$scenario.trufflehog-count"
  export SCAN_TEST_SCENARIO="$scenario"
  export TRUFFLEHOG_FAKE_FINDING_COMMITS="$finding_commits"
  : >"$GIT_CALLS"
  rm -f "$TRUFFLEHOG_COUNT"

  PATH="$BIN_DIR:$PATH" TRUFFLEHOG_BIN="$BIN_DIR/trufflehog" \
    bash "$SCAN_SCRIPT" full-trufflehog >"$output" 2>&1 || status=$?
  printf '%s\n' "$status"
}

FULL_ALLOWLISTED_COMMIT='304e0d95ae1b5f80f58c27b4ca6b7939b3a04584'
FULL_BLOCKED_COMMIT='ffffffffffffffffffffffffffffffffffffffff'

status="$(run_full_scenario full-allowlisted "$FULL_ALLOWLISTED_COMMIT")"
[[ $status -eq 0 ]] \
  || fail "allowlisted full-history commit must not fail the schedule scan: $status"
grep -q '::warning title=Secret scan allowlisted historical commit' \
  "$TEST_ROOT/full-allowlisted.output" \
  || fail 'allowlisted full-history scan must classify the known commit'

status="$(run_full_scenario full-blocked "$FULL_BLOCKED_COMMIT")"
[[ $status -eq 183 ]] \
  || fail "non-allowlisted full-history findings must still fail: $status"

bash "$REPO_ROOT/scripts/security/prepare-ci-secret-scan-range.test.sh"

# JOV-6809: a transient download failure (curl 35 connection reset on
# ubuntu-latest) must be retried, not fail the scan outright. Stub curl to
# fail the first attempt then succeed; stub tar to lay down a no-op binary.
# A restricted PATH keeps real gitleaks/trufflehog installs from
# short-circuiting the download path.
DL_BIN="$TEST_ROOT/dl-bin"
DL_TMP="$TEST_ROOT/dl-tmp"
mkdir -p "$DL_BIN" "$DL_TMP"
cat >"$DL_BIN/curl" <<'EOF'
#!/usr/bin/env bash
count=0
[[ -f "$CURL_COUNT" ]] && count="$(cat "$CURL_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" >"$CURL_COUNT"
if [[ "${CURL_ALWAYS_FAIL:-}" == "1" || $count -eq 1 ]]; then
  echo "curl: (35) Recv failure: Connection reset by peer" >&2
  exit 35
fi
out=''
prev=''
for arg in "$@"; do
  [[ "$prev" == '-o' ]] && out="$arg"
  prev="$arg"
done
printf 'fake-tarball' >"$out"
EOF
cat >"$DL_BIN/tar" <<'EOF'
#!/usr/bin/env bash
dest=''
prev=''
for arg in "$@"; do
  [[ "$prev" == '-C' ]] && dest="$arg"
  prev="$arg"
done
member="${!#}"
printf '#!/usr/bin/env bash\nexit 0\n' >"$dest/$member"
EOF
chmod +x "$DL_BIN/curl" "$DL_BIN/tar"

export CURL_COUNT="$TEST_ROOT/download.curl-count"
: >"$CURL_COUNT"
status=0
# CI exports TRUFFLEHOG_BIN for the installed-binary regression run; the
# download path must be exercised without either scanner env override.
PATH="$DL_BIN:/usr/bin:/bin" TMPDIR="$DL_TMP" SCAN_SECRETS_RETRY_DELAY=0 \
  GITLEAKS_BIN= TRUFFLEHOG_BIN= \
  bash "$SCAN_SCRIPT" pre-commit >"$TEST_ROOT/download.output" 2>&1 \
  || status=$?
[[ $status -eq 0 ]] \
  || fail "transient download failure must be retried to success: $status"
[[ "$(cat "$CURL_COUNT")" -eq 3 ]] \
  || fail 'expected 1 failed attempt + 2 successful downloads (gitleaks, trufflehog)'
grep -q 'download attempt 1 failed; retrying' "$TEST_ROOT/download.output" \
  || fail 'download retry must log the retry'
grep -q 'PASS: secret scan' "$TEST_ROOT/download.output" \
  || fail 'scan must still pass after a retried download'

# Exhausted retries still fail the scan with an explicit classification.
mkdir -p "$TEST_ROOT/dl-tmp2"
: >"$CURL_COUNT"
status=0
PATH="$DL_BIN:/usr/bin:/bin" TMPDIR="$TEST_ROOT/dl-tmp2" \
  SCAN_SECRETS_RETRY_DELAY=0 CURL_ALWAYS_FAIL=1 \
  GITLEAKS_BIN= TRUFFLEHOG_BIN= \
  bash "$SCAN_SCRIPT" pre-commit >"$TEST_ROOT/download-fail.output" 2>&1 \
  || status=$?
[[ $status -ne 0 ]] || fail 'exhausted download retries must fail the scan'
[[ "$(cat "$CURL_COUNT")" -eq 3 ]] \
  || fail 'download must stop after exactly 3 attempts'
grep -q 'Secret scanner download failed' "$TEST_ROOT/download-fail.output" \
  || fail 'download failure must emit an explicit CI classification'

echo 'PASS: scan-secrets corruption recovery regression tests'
