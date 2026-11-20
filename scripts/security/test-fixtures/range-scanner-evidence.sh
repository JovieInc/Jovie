#!/usr/bin/env bash
# Sourced by the historical-range fixture and its scanner-boundary tests.

# TruffleHog 3.99.4 no longer prints "scanning repo" at the default log
# level. Require completed, nonempty work beyond that progress message;
# an aborted traversal can exit zero after scanning no data.
trufflehog_scanned_data() {
  awk '
    /finished scanning/ &&
      /"chunks":[[:space:]]*[1-9][0-9]*[[:space:]]*[,}]/ &&
      /"bytes":[[:space:]]*[1-9][0-9]*[[:space:]]*[,}]/ { scanned = 1 }
    /encountered errors during scan/ { incomplete = 1 }
    /"level":[[:space:]]*"(error|fatal)"/ { incomplete = 1 }
    END { exit !(scanned && !incomplete) }
  '
}

completion_log='info-0 trufflehog finished scanning {"chunks": 7, "bytes": 1068}'
trufflehog_scanned_data <<<"$completion_log" \
  || fail 'a completed nonempty scan must pass without a progress message'
for scan_log in \
  '' \
  'scanning repo' \
  'finished scanning {}' \
  'finished scanning {"chunks": 0, "bytes": 0}' \
  'finished scanning {"chunks": 7, "bytes": 0}' \
  'finished scanning {"chunks": 0, "bytes": 1068}' \
  "$completion_log"$'\nencountered errors during scan' \
  "$completion_log"$'\n{"level":"error","msg":"scan failed"}'; do
  if trufflehog_scanned_data <<<"$scan_log"; then
    fail 'missing, empty, or aborted scan evidence must fail closed'
  fi
done

range_scanner_fail() {
  local output="$1"
  shift
  cat "$output.output" "$output.jsonl" >&2
  fail "$*"
}

assert_historical_postgres_scan() {
  local checkout="$1" output="$2" scope="$3" status=0
  # 3.99.4 moved "scanning repo" to verbosity 2; 3.95.5 supports it too.
  # JSON keeps finding attribution separate from diagnostic/completion logs.
  "$TRUFFLEHOG_BIN" git "file://$checkout" \
    --log-level=2 --since-commit "$BASE_SHA" --branch HEAD \
    --no-update --no-verification --fail --json \
    >"$output.jsonl" 2>"$output.output" || status=$?
  if [[ "$status" -ne 183 ]]; then
    range_scanner_fail "$output" \
      "trufflehog did not return finding status 183 for $scope: $status"
  fi
  jq -se --arg base "$BASE_SHA" \
    'any(.[]; .msg == "scanning repo" and .base == $base)' \
    "$output.output" >/dev/null \
    || range_scanner_fail "$output" \
      'trufflehog did not emit a positive repository-scan receipt'
  trufflehog_scanned_data <"$output.output" \
    || range_scanner_fail "$output" \
      "trufflehog did not complete a nonempty $scope scan"
  # The bait exists in both the introduction and deletion diffs. Both
  # exact commits belong to the intended historical range;
  # neither the clean final tree nor unrelated findings may satisfy this.
  jq -se --arg introduced "$INTRODUCED_SHA" --arg removed "$REMOVED_SHA" '
    length > 0 and all(.[];
      .DetectorName == "Postgres" and .Verified == false and
      (.Raw | type == "string" and length > 0) and
      .SourceMetadata.Data.Git.file == "settings.local.json.backup" and
      (.SourceMetadata.Data.Git.commit == $introduced or
       .SourceMetadata.Data.Git.commit == $removed))
  ' "$output.jsonl" >/dev/null \
    || range_scanner_fail "$output" \
      'trufflehog did not report only the expected historical Postgres fixture'
  echo "PASS: trufflehog detected historical Postgres bait in the $scope"
}
