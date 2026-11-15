#!/usr/bin/env bash
# Sourced by scan-secrets.test.sh; uses its pin fixture and fail helper.
pin_scan() {
  local mode="$1" expected="$2" status=0
  PATH="$BIN_DIR:$PATH" GITLEAKS_BIN="$BIN_DIR/gitleaks" TRUFFLEHOG_BIN="$BIN_DIR/trufflehog" \
    bash "$SCAN_SCRIPT" "$mode" origin/main >"$PIN_ROOT/output" 2>&1 || status=$?
  if [[ "$status" -ne "$expected" ]]; then
    cat "$PIN_ROOT/output" >&2
    fail "$mode: expected $expected, got $status"
  fi
}

for mode in pre-commit publication ci-pr-trufflehog full-trufflehog; do
  pin_scan "$mode" 0
  PIN_LINE=3 pin_scan "$mode" 183
  PIN_VERIFIED=true pin_scan "$mode" 183
  PIN_DETECTOR=Postgres pin_scan "$mode" 183
  PIN_SECRET_PART=0000000000000000000000000000000000000000 pin_scan "$mode" 183
  PIN_MIXED=1 pin_scan "$mode" 183
  PIN_SCANNER_ERROR=runtime pin_scan "$mode" 42
  PIN_SCANNER_ERROR=empty-failure pin_scan "$mode" 183
  PIN_SCANNER_ERROR=blank-failure pin_scan "$mode" 183
  PIN_SCANNER_ERROR=malformed pin_scan "$mode" 1
  PIN_SCANNER_ERROR=incomplete pin_scan "$mode" 1
  if [[ "$mode" == *trufflehog ]]; then
    PIN_COMMIT=unknown pin_scan "$mode" 1
    SCAN_TEST_PIN_READ_ERROR=1 pin_scan "$mode" 183
  fi
done

# Ambiguous duplicate matches outside the pin, including comments, stay red.
printf 'steps:\n  - uses: actions/github-script@%s # %s\n' "$PIN_SHA" "$PIN_RAW" >"$PIN_ROOT/wf.yml"
pin_scan publication 183
# A SHA mentioned in the comment is not part of the pin itself.
printf 'steps:\n  - uses: actions/github-script@%040d # %s\n' 0 "$PIN_RAW" >"$PIN_ROOT/wf.yml"
pin_scan publication 183
# Git's proof must use historical source even when HEAD looks harmless.
PIN_LINE=3 pin_scan ci-pr-trufflehog 183
# And the current file must not turn a valid historical pin into a finding.
pin_scan ci-pr-trufflehog 0
cp "$PIN_ROOT/wf.yml" "$PIN_ROOT/historical.yml"
# A pin in the current file cannot hide a secret in the attributed commit.
printf 'steps:\n  - uses: actions/github-script@%s\n' "$PIN_SHA" >"$PIN_ROOT/wf.yml"
pin_scan publication 0
pin_scan ci-pr-trufflehog 183

echo 'PASS: trufflehog per-line pins, historical source, same-file findings and scanner failures'

# SonarCloud commit-message pins: drop only an unverified hit with no file.
SONAR_PIN_RAW="$(printf '%s%s' 'a1b2c3d4e5f60789abcd' '0123456789abcdef0123')"
export PIN_DETECTOR=SonarCloud PIN_VERIFIED=false PIN_LINE=19 PIN_MIXED= PIN_SCANNER_ERROR=
export PIN_COMMIT=dddddddddddddddddddddddddddddddddddddddd PIN_SECRET_PART=not-a-pin
export PIN_RAW="$SONAR_PIN_RAW" PIN_FILE= SCAN_TEST_ACTION_PIN_GREP=1
unset SCAN_TEST_PIN_READ_ERROR
pin_scan ci-pr-trufflehog 0
SCAN_TEST_ACTION_PIN_GREP= pin_scan ci-pr-trufflehog 183
SCAN_TEST_ACTION_PIN_GREP=comment pin_scan ci-pr-trufflehog 183
SCAN_TEST_ACTION_PIN_GREP=script pin_scan ci-pr-trufflehog 183
PIN_VERIFIED=true SCAN_TEST_ACTION_PIN_GREP=1 pin_scan ci-pr-trufflehog 183
PIN_FILE=apps/web/lib/example.ts PIN_VERIFIED=false SCAN_TEST_ACTION_PIN_GREP=1 pin_scan ci-pr-trufflehog 183
unset PIN_FILE SCAN_TEST_ACTION_PIN_GREP
echo 'PASS: SonarCloud commit-message action pins stay distinct from other hits'
