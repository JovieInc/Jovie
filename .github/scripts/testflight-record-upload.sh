#!/usr/bin/env bash
# Prove the exact TestFlight upload and write testflight-upload-verified.json.
#
# GitHub reads go through gh-api-hold.sh. A reset inside
# GH_API_HOLD_BUDGET_SECONDS waits, then this same proof writes the marker.
# A reset outside that budget does not write a marker: the first attempt
# publishes quota_deferred and exits 0 so a later job can record this same
# upload. TESTFLIGHT_RECORD_QUOTA_RETRY=1 makes that second miss fatal.
# A permission failure, a missing reset, or a proof that does not match the
# successful upload exits non-zero and writes no marker.
set -euo pipefail

if [ -z "${RUNNER_TEMP:-}" ] || [ ! -d "$RUNNER_TEMP" ]; then
  echo "::error::TestFlight upload record requires RUNNER_TEMP." >&2
  exit 1
fi

hold="${GITHUB_WORKSPACE:-}/.github/scripts/gh-api-hold.sh"
if [ ! -f "$hold" ]; then
  echo "::error::TestFlight upload record cannot find gh-api-hold.sh." >&2
  exit 1
fi

rm -f "$RUNNER_TEMP/testflight-upload-verified.json"

defer_record() {
  local reset_epoch reset_iso line
  reset_epoch="$(sed -n 's/.*GitHub rate limit resets at \([0-9][0-9]*\).*/\1/p' "$1" | head -n 1)"
  if ! [[ "$reset_epoch" =~ ^[0-9]+$ ]]; then
    echo "::error::TestFlight upload record defer could not read the reset epoch." >&2
    exit 1
  fi
  reset_iso="$(date -u -d "@${reset_epoch}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
  if ! [[ "$reset_iso" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    reset_iso="$(date -u -r "$reset_epoch" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
  fi
  if ! [[ "$reset_iso" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
    echo "::error::TestFlight upload record defer could not format the reset instant." >&2
    exit 1
  fi
  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    echo "::error::TestFlight upload record defer has no GITHUB_OUTPUT." >&2
    exit 1
  fi
  if ! [[ "${RELEASE_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "::error::TestFlight upload record defer has no release SHA." >&2
    exit 1
  fi
  {
    echo "quota_deferred=true"
    echo "quota_reset_epoch=${reset_epoch}"
  } >> "$GITHUB_OUTPUT"
  line="Installation quota resets at ${reset_iso}. Deferring the TestFlight upload record for ${RELEASE_SHA}. No marker was written; the same upload is recorded after the reset."
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$line" >> "$GITHUB_STEP_SUMMARY"
  fi
  printf '%s\n' "::warning::${line}"
}

read_api() {
  local dest="$1"
  shift
  local err
  err="$(mktemp)"
  # Keep the defer warning on this script's stdout. Redirecting the whole
  # helper would hide it inside the response file and still exit 0.
  if GH_API_HOLD_BIN="$(command -v gh)" bash "$hold" api "$@" >"$dest" 2>"$err"; then
    cat "$err" >&2
    rm -f "$err"
    return 0
  fi
  cat "$err" >&2
  if grep -Eq 'outside the .*budget' "$err" && grep -q 'Not passing' "$err"; then
    if [ "${TESTFLIGHT_RECORD_QUOTA_RETRY:-}" = "1" ]; then
      echo "::error::TestFlight upload record deferred again after the quota retry. Not passing." >&2
      rm -f "$err"
      exit 1
    fi
    defer_record "$err"
    rm -f "$err"
    exit 0
  fi
  rm -f "$err"
  return 1
}

[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] &&
  [[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] &&
  [[ "$RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || {
  echo "::error::TestFlight upload marker identity is malformed." >&2
  exit 1
}

run_file="$(mktemp)"
read_api "$run_file" "repos/$REPOSITORY/actions/runs/$RUN_ID" || exit 1
run_record="$(cat "$run_file")"
workflow_file="$(mktemp)"
read_api "$workflow_file" "repos/$REPOSITORY/actions/workflows/ios-testflight.yml" || exit 1
testflight_workflow="$(cat "$workflow_file")"
jq -e '
  type == "object" and
  (.id | type == "number" and . >= 1 and floor == .) and
  .name == "iOS TestFlight" and
  .path == ".github/workflows/ios-testflight.yml"
' >/dev/null <<<"$testflight_workflow" || {
  echo "::error::GitHub returned malformed TestFlight workflow identity." >&2
  exit 1
}
testflight_workflow_id="$(jq -r '.id | tostring' <<<"$testflight_workflow")"
jq -e \
  --arg repo "$REPOSITORY" \
  --arg run "$RUN_ID" \
  --arg attempt "$RUN_ATTEMPT" \
  --arg sha "$TRANSPORT_SHA" \
  --arg workflow_id "$testflight_workflow_id" '
    type == "object" and
    (.id | tostring) == $run and
    (.run_attempt | tostring) == $attempt and
    (.workflow_id | tostring) == $workflow_id and
    .path == ".github/workflows/ios-testflight.yml" and
    .display_title == ("iOS TestFlight " + $sha) and
    (.event == "workflow_run" or .event == "workflow_dispatch") and
    .head_branch == "main" and
    .head_sha == $sha and
    .head_repository.full_name == $repo
  ' >/dev/null <<<"$run_record" || {
  echo "::error::Current TestFlight run does not match the authorized upload identity." >&2
  exit 1
}

# Publisher-only reruns may retain a successful beta from an earlier
# attempt. Upload intents prevent another upload; recover its exact
# successful attempt and binary attestation without repeating beta.
upload_attempt=""
upload_job=""
attempt=1
while [ "$attempt" -le "$RUN_ATTEMPT" ]; do
  jobs_file="$(mktemp)"
  read_api "$jobs_file" --paginate --slurp \
    "repos/$REPOSITORY/actions/runs/$RUN_ID/attempts/$attempt/jobs?per_page=100" || exit 1
  jobs_json="$(cat "$jobs_file")"
  jq -e '
    type == "array" and length > 0 and
    all(.[]; type == "object" and (.jobs | type == "array"))
  ' >/dev/null <<<"$jobs_json" || {
    echo "::error::GitHub returned malformed TestFlight upload evidence." >&2
    exit 1
  }
  attempt_matches="$(jq -c \
    --arg sha "$TRANSPORT_SHA" \
    '
      [
        .[].jobs[]?
        | select(
            .name == "Upload Internal TestFlight" and
            .head_sha == $sha and
            .status == "completed" and
            .conclusion == "success" and
            (.id | type == "number")
          )
        | (.id | tostring)
      ]
    ' <<<"$jobs_json")"
  attempt_match_count="$(jq 'unique | length' <<<"$attempt_matches")"
  if [ "$attempt_match_count" -gt 1 ]; then
    echo "::error::TestFlight attempt $attempt has ambiguous successful upload jobs." >&2
    exit 1
  fi
  if [ "$attempt_match_count" = "1" ]; then
    upload_attempt="$attempt"
    upload_job="$(jq -r 'unique | .[0]' <<<"$attempt_matches")"
  fi
  attempt=$((attempt + 1))
done

[[ "$upload_attempt" =~ ^[1-9][0-9]*$ ]] &&
  [[ "$upload_job" =~ ^[1-9][0-9]*$ ]] || {
  echo "::error::No successful exact TestFlight upload job exists in this run." >&2
  exit 1
}
artifacts_file="$(mktemp)"
read_api "$artifacts_file" "repos/$REPOSITORY/actions/runs/$RUN_ID/artifacts?per_page=100" || exit 1
binary_artifacts="$(cat "$artifacts_file")"
binary_id="$(jq -er --arg name "testflight-binary-$upload_attempt" '
  [.artifacts[] | select(.name == $name and .expired == false)] |
  if length == 1 then .[0].id else error("ambiguous binary attestation") end
' <<<"$binary_artifacts")"
read_api "$RUNNER_TEMP/testflight-binary.zip" \
  "repos/$REPOSITORY/actions/artifacts/$binary_id/zip" || exit 1
unzip -p "$RUNNER_TEMP/testflight-binary.zip" testflight-upload-attestation.json \
  > "$RUNNER_TEMP/testflight-binary.json"
jq -e --argjson lease "$LEASE" --arg sha "$RELEASE_SHA" --arg transport "$TRANSPORT_SHA" --arg run "$RUN_ID" --arg attempt "$upload_attempt" '
  .schema == "jovie-testflight-binary/v1" and .lease == $lease and
  .lease.sourceSha == $sha and .lease.transportSha == $transport and
  .lease.workflowRun == $run and .lease.workflowAttempt == $attempt and
  (.binarySha256 | type == "string" and test("^[0-9a-f]{64}$")) and
  (.buildNumber | type == "string" and test("^[0-9]+$"))
' >/dev/null "$RUNNER_TEMP/testflight-binary.json" || {
  echo "::error::Uploaded binary attestation does not match the certified source lease." >&2
  exit 1
}
jq -n \
  --slurpfile binary "$RUNNER_TEMP/testflight-binary.json" \
  --arg sha "$RELEASE_SHA" \
  --arg transport "$TRANSPORT_SHA" \
  --argjson lease "$LEASE" \
  --arg workflow_run "$RUN_ID" \
  --arg upload_attempt "$upload_attempt" \
  --arg upload_job "$upload_job" \
  '{
    schema: "jovie-testflight-upload/v2",
    sha: $sha,
    transportSha: $transport,
    lease: $lease,
    binarySha256: $binary[0].binarySha256,
    buildNumber: $binary[0].buildNumber,
    workflowRun: $workflow_run,
    uploadRunAttempt: $upload_attempt,
    uploadJob: $upload_job
  }' > "$RUNNER_TEMP/testflight-upload-verified.json"
