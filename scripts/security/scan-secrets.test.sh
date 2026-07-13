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
  rev-parse)
    printf '%s\n' '0123456789abcdef0123456789abcdef01234567'
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
esac
EOF

chmod +x "$BIN_DIR/git" "$BIN_DIR/trufflehog"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

run_scenario() {
  local scenario="$1"
  local output="$TEST_ROOT/$scenario.output"
  local status=0
  export GIT_CALLS="$TEST_ROOT/$scenario.git-calls"
  export TRUFFLEHOG_COUNT="$TEST_ROOT/$scenario.trufflehog-count"
  export SCAN_TEST_SCENARIO="$scenario"
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

echo 'PASS: scan-secrets corruption recovery regression tests'
