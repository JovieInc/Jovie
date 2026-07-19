#!/usr/bin/env bash
set -euo pipefail

deploy_id="${PRODUCTION_DEPLOYMENT_ID:-}"
vercel_cli="${VERCEL_CLI:-./node_modules/.bin/vercel}"
gh_cli="${GH_CLI:-gh}"
expected_main_sha="${EXPECTED_MAIN_SHA:-}"
repository="${GITHUB_REPOSITORY:-}"
poll_seconds="${PRODUCTION_PROMOTION_POLL_SECONDS:-5}"
# Production holds at 10% for five minutes. The eight-minute default leaves
# three minutes for Vercel's asynchronous rollout state to converge.
settle_attempts="${PRODUCTION_PROMOTION_SETTLE_ATTEMPTS:-96}"
cleanup_attempts="${PRODUCTION_PROMOTION_CLEANUP_ATTEMPTS:-12}"
promote_timeout="${PRODUCTION_PROMOTION_CLI_TIMEOUT:-3m}"

write_failure() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'failure_subtype=%s\n' "$1" >> "$GITHUB_OUTPUT"
  fi
}

for required in deploy_id expected_main_sha repository GH_TOKEN VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  if [ -z "${!required:-}" ]; then
    echo "${required} is required" >&2
    write_failure production_promotion_state_invalid
    exit 2
  fi
done

if [[ "$deploy_id" != dpl_* ]] ||
  ! [[ "$expected_main_sha" =~ ^[0-9a-f]{40}$ ]] ||
  ! [[ "$repository" =~ ^[^/]+/[^/]+$ ]] ||
  ! [[ "$poll_seconds" =~ ^[0-9]+$ ]] ||
  ! [[ "$settle_attempts" =~ ^[1-9][0-9]*$ ]] ||
  ! [[ "$cleanup_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "Promotion inputs are invalid." >&2
  write_failure production_promotion_state_invalid
  exit 2
fi

vercel() {
  "$vercel_cli" "$@" \
    --token "$VERCEL_TOKEN" \
    --scope "$VERCEL_ORG_ID" \
    --no-color
}

valid_current_json() {
  jq -e '
    type == "object" and
    (.id | type == "string") and
    (.readyState | type == "string") and
    (.target | type == "string")
  ' >/dev/null 2>&1
}

valid_rollout_json() {
  jq -e 'type == "object" or . == null' >/dev/null 2>&1
}

validate_vercel_json() {
  case "$1" in
    current) valid_current_json ;;
    rollout) valid_rollout_json ;;
    *) return 1 ;;
  esac
}

extract_vercel_json() {
  local raw="$1"
  local schema="$2"
  local candidate=""

  if validate_vercel_json "$schema" <<<"$raw"; then
    printf '%s\n' "$raw"
    return 0
  fi

  # Vercel CLI 54.14.5 sends `rolling-release fetch` JSON through its
  # stderr-backed output manager. The first JSON line is prefixed with `> `.
  candidate="$(sed -n '/^> /,$p' <<<"$raw" | sed '1s/^> //')"
  if [ -n "$candidate" ] && validate_vercel_json "$schema" <<<"$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  # Keep accepting raw JSON written to stdout after CLI status lines. This is
  # the shape used by `inspect --format=json` and older rollout fixtures.
  candidate="$(sed -n '/^[[:space:]]*{/,$p' <<<"$raw")"
  if [ -n "$candidate" ] && validate_vercel_json "$schema" <<<"$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi
  candidate="$(sed -n '/^[[:space:]]*null[[:space:]]*$/,$p' <<<"$raw")"
  if [ -n "$candidate" ] && validate_vercel_json "$schema" <<<"$candidate"; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

safe_vercel_failure_reason() {
  local raw="$1"
  local error_json=""
  local reason=""

  error_json="$(extract_vercel_json "$raw" rollout || true)"
  if [ -n "$error_json" ]; then
    reason="$(jq -r '
      if type == "object" then (.reason // .error.code // .code // "")
      else ""
      end
    ' <<<"$error_json" 2>/dev/null || true)"
  fi

  case "$reason" in
    api_error | forbidden | invalid_token | not_found | not_linked | project_not_found | rate_limited | timeout | unauthorized)
      printf '%s\n' "$reason"
      ;;
    *)
      printf 'unclassified\n'
      ;;
  esac
}

read_vercel_json() {
  local operation="$1"
  local schema="$2"
  shift 2

  local raw=""
  local result=""
  local status=0
  local reason=""

  raw="$(vercel "$@" 2>&1)" || status=$?
  if [ "$status" -ne 0 ]; then
    reason="$(safe_vercel_failure_reason "$raw")"
    echo "Vercel ${operation} failed (exit ${status}, reason=${reason})." >&2
    return 1
  fi

  if ! result="$(extract_vercel_json "$raw" "$schema")"; then
    echo "Vercel ${operation} returned malformed JSON (${#raw} captured bytes)." >&2
    return 1
  fi

  printf '%s\n' "$result"
}

inspect_current() {
  read_vercel_json "inspect current" current \
    inspect jov.ie --format=json
}

inspect_deployment() {
  read_vercel_json "inspect deployment" current \
    inspect "$1" --format=json
}

fetch_rollout() {
  read_vercel_json "rolling-release fetch" rollout \
    rolling-release fetch
}

rollout_is_active() {
  # Terminal records can retain activeStage; unknown states must stay fail-closed.
  jq -e '
    . != null and
    .state != "COMPLETE" and
    .state != "ABORTED"
  ' >/dev/null 2>&1 <<<"$1"
}

rollout_target_id() {
  jq -r '
    if . == null then ""
    else (
      .canaryDeployment.id //
      .canaryDeploymentId //
      .default.targetDeploymentId //
      .targetDeploymentId //
      ""
    )
    end
  ' <<<"$1"
}

current_json=""
rollout_json=""
if ! current_json="$(inspect_current)" || ! rollout_json="$(fetch_rollout)"; then
  echo "Unable to establish canonical production state before promotion." >&2
  write_failure production_promotion_state_invalid
  exit 1
fi

previous_id="$(jq -r '.id' <<<"$current_json")"
if [[ "$previous_id" != dpl_* ]]; then
  echo "Current jov.ie deployment has an invalid deployment ID." >&2
  write_failure production_promotion_state_invalid
  exit 1
fi

previous_url="$(jq -r '.url // ""' <<<"$current_json")"
if [[ "$previous_url" != *://* && "$previous_url" == *.vercel.app ]]; then
  previous_url="https://${previous_url}"
fi
previous_url="${previous_url%/}"
if [[ "$previous_url" != https://*.vercel.app ]]; then
  echo "Current jov.ie deployment has an invalid immutable URL." >&2
  write_failure production_promotion_state_invalid
  exit 1
fi

previous_deployment_json=""
if ! previous_deployment_json="$(inspect_deployment "$previous_id")"; then
  echo "Unable to prove the previous canonical deployment's immutable URL." >&2
  write_failure production_promotion_state_invalid
  exit 1
fi
inspected_previous_id="$(jq -r '.id // ""' <<<"$previous_deployment_json")"
inspected_previous_url="$(jq -r '.url // ""' <<<"$previous_deployment_json")"
if [[ "$inspected_previous_url" != *://* && "$inspected_previous_url" == *.vercel.app ]]; then
  inspected_previous_url="https://${inspected_previous_url}"
fi
inspected_previous_url="${inspected_previous_url%/}"
if [ "$inspected_previous_id" != "$previous_id" ] ||
  [ "$inspected_previous_url" != "$previous_url" ]; then
  echo "Canonical previous deployment ID/URL did not match direct immutable inspection." >&2
  write_failure production_promotion_state_invalid
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'previous_production_deployment_id=%s\n' "$previous_id" >> "$GITHUB_OUTPUT"
  printf 'previous_production_deployment_url=%s\n' "$previous_url" >> "$GITHUB_OUTPUT"
fi

echo "Current production deployment before promotion: $previous_id ($previous_url)"

# Main may advance while the staged production artifact is inspected. Bind the
# mutation inside this controller, immediately after authoritative Vercel state
# discovery and before any promote/rollout command.
current_main_sha="$($gh_cli api "repos/$repository/commits/main" --jq '.sha // empty')"
if [[ ! "$current_main_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Unable to resolve exact main immediately before production mutation." >&2
  write_failure production_promotion_state_invalid
  exit 1
fi
if [ "$current_main_sha" != "$expected_main_sha" ]; then
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'is_current=false\n' >> "$GITHUB_OUTPUT"
  fi
  echo "Release $expected_main_sha was superseded by $current_main_sha before production mutation."
  exit 0
fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'is_current=true\n' >> "$GITHUB_OUTPUT"
fi

promotion_requested=false
promote_status=0
current_ready="$(jq -r '.readyState | ascii_upcase' <<<"$current_json")"
current_target="$(jq -r '.target | ascii_downcase' <<<"$current_json")"
if [ "$previous_id" = "$deploy_id" ] &&
  [ "$current_ready" = "READY" ] &&
  [ "$current_target" = "production" ] &&
  ! rollout_is_active "$rollout_json"; then
  echo "Production Current is already terminal on $deploy_id."
  exit 0
elif rollout_is_active "$rollout_json"; then
  active_target="$(rollout_target_id "$rollout_json")"
  if [ "$active_target" != "$deploy_id" ]; then
    echo "A foreign rolling release is active for ${active_target:-<unknown>}; refusing to mutate production." >&2
    write_failure production_promotion_foreign_rollout
    exit 1
  fi
  echo "Resuming the already-active rolling release for $deploy_id."
else
  promotion_requested=true
  promote_output="$(vercel promote "$deploy_id" --yes --timeout "$promote_timeout" 2>&1)" || promote_status=$?
  printf '%s\n' "$promote_output"
  if [ "$promote_status" -ne 0 ]; then
    echo "Promotion command exited ${promote_status}; checking server state without resubmitting." >&2
  fi
fi

abort_owned_rollout() {
  local cleanup_rollout=""
  local cleanup_target=""
  local cleanup_current=""

  if ! cleanup_rollout="$(fetch_rollout)"; then
    echo "Cannot verify rollout ownership for cleanup." >&2
    return 1
  fi

  if rollout_is_active "$cleanup_rollout"; then
    cleanup_target="$(rollout_target_id "$cleanup_rollout")"
    if [ "$cleanup_target" != "$deploy_id" ]; then
      echo "Refusing cleanup because the active rollout is not owned by this deployment." >&2
      return 1
    fi
    echo "Aborting the owned rolling release for $deploy_id." >&2
    if ! vercel rolling-release abort --dpl "$deploy_id"; then
      return 1
    fi
  fi

  for cleanup_attempt in $(seq 1 "$cleanup_attempts"); do
    if cleanup_current="$(inspect_current)" && cleanup_rollout="$(fetch_rollout)"; then
      cleanup_current_id="$(jq -r '.id' <<<"$cleanup_current")"
      cleanup_ready="$(jq -r '.readyState | ascii_upcase' <<<"$cleanup_current")"
      cleanup_target_type="$(jq -r '.target | ascii_downcase' <<<"$cleanup_current")"

      if [ "$cleanup_current_id" = "$deploy_id" ] &&
        [ "$cleanup_ready" = "READY" ] &&
        [ "$cleanup_target_type" = "production" ] &&
        ! rollout_is_active "$cleanup_rollout"; then
        echo "Production completed while cleanup was being evaluated."
        return 2
      fi

      if [ "$cleanup_current_id" = "$previous_id" ] &&
        [ "$cleanup_ready" = "READY" ] &&
        [ "$cleanup_target_type" = "production" ] &&
        ! rollout_is_active "$cleanup_rollout"; then
        echo "Rollback verified: production Current remains $previous_id." >&2
        return 0
      fi
    fi

    if [ "$cleanup_attempt" -lt "$cleanup_attempts" ]; then
      sleep "$poll_seconds"
    fi
  done

  return 1
}

last_state_valid=false
last_rollout_active=false
last_rollout_target=""
for attempt in $(seq 1 "$settle_attempts"); do
  if current_json="$(inspect_current)" && rollout_json="$(fetch_rollout)"; then
    last_state_valid=true
    current_id="$(jq -r '.id' <<<"$current_json")"
    current_ready="$(jq -r '.readyState | ascii_upcase' <<<"$current_json")"
    current_target="$(jq -r '.target | ascii_downcase' <<<"$current_json")"
    last_rollout_active=false
    last_rollout_target=""
    if rollout_is_active "$rollout_json"; then
      last_rollout_active=true
      last_rollout_target="$(rollout_target_id "$rollout_json")"
    fi

    echo "  promotion attempt ${attempt}/${settle_attempts}: current=${current_id} ready=${current_ready} rollout=${last_rollout_target:-none}"

    if [ "$current_id" = "$deploy_id" ] &&
      [ "$current_ready" = "READY" ] &&
      [ "$current_target" = "production" ] &&
      [ "$last_rollout_active" = "false" ]; then
      echo "Production Current is terminal on $deploy_id."
      exit 0
    fi

    if [ "$last_rollout_active" = "true" ]; then
      if [ "$last_rollout_target" != "$deploy_id" ]; then
        echo "A foreign rolling release became active for ${last_rollout_target:-<unknown>}; refusing further mutation." >&2
        write_failure production_promotion_foreign_rollout
        exit 1
      fi

      # Automatic Vercel stages advance on their configured durations. Never
      # call `rolling-release complete` here: that command forces 100% traffic
      # and would truncate the 10% canary when `promote --timeout` returns.
      echo "  observing owned automatic rollout; waiting for Vercel to advance"
    fi
  else
    last_state_valid=false
    echo "  promotion attempt ${attempt}/${settle_attempts}: state unavailable or malformed" >&2
  fi

  if [ "$attempt" -lt "$settle_attempts" ]; then
    sleep "$poll_seconds"
  fi
done

if [ "$last_state_valid" != "true" ]; then
  cleanup_status=0
  abort_owned_rollout || cleanup_status=$?
  if [ "$cleanup_status" -eq 2 ]; then
    exit 0
  fi
  write_failure production_promotion_state_invalid
  exit 1
fi

if [ "$last_rollout_active" = "true" ] && [ "$last_rollout_target" = "$deploy_id" ]; then
  cleanup_status=0
  abort_owned_rollout || cleanup_status=$?
  if [ "$cleanup_status" -eq 2 ]; then
    exit 0
  fi
  if [ "$cleanup_status" -ne 0 ]; then
    write_failure production_promotion_rollback_failed
    exit 1
  fi
fi

if [ "$promote_status" -ne 0 ] || [ "$promotion_requested" = "true" ]; then
  write_failure production_promotion_failed
else
  write_failure production_promotion_state_blocked
fi
exit 1
