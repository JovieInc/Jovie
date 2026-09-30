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

valid_alias_json() {
  jq -e '
    type == "object" and
    (.id | type == "string") and
    (.readyState | type == "string")
  ' >/dev/null 2>&1
}

valid_rollout_json() {
  jq -e 'type == "object" or . == null' >/dev/null 2>&1
}

validate_vercel_json() {
  case "$1" in
    alias) valid_alias_json ;;
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

inspect_staging_alias() {
  read_vercel_json "inspect staging alias" alias \
    inspect staging.jov.ie --format=json
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

staging_preview_id=""
staging_preview_url=""

capture_staging_preview() {
  local alias_json=""
  local deployment_json=""
  local candidate_id=""
  local candidate_ready=""
  local candidate_target=""
  local candidate_url=""

  if ! alias_json="$(inspect_staging_alias)"; then
    echo "Canonical staging alias was unavailable before production promotion; continuing without a restore candidate." >&2
    return 0
  fi
  candidate_id="$(jq -r '.id' <<<"$alias_json")"
  candidate_ready="$(jq -r '.readyState | ascii_upcase' <<<"$alias_json")"
  if [[ "$candidate_id" != dpl_* ]] || [ "$candidate_ready" != "READY" ]; then
    echo "Canonical staging alias was not a READY deployment before production promotion; continuing without a restore candidate." >&2
    return 0
  fi
  if ! deployment_json="$(inspect_deployment "$candidate_id")"; then
    echo "Canonical staging deployment could not be resolved before production promotion; continuing without a restore candidate." >&2
    return 0
  fi
  candidate_target="$(jq -r '.target | ascii_downcase' <<<"$deployment_json")"
  candidate_url="$(jq -r '.url // ""' <<<"$deployment_json")"
  if [[ "$candidate_url" != *://* && "$candidate_url" == *.vercel.app ]]; then
    candidate_url="https://${candidate_url}"
  fi
  candidate_url="${candidate_url%/}"
  if [ "$candidate_target" != "preview" ] ||
    [[ "$candidate_url" != https://*.vercel.app ]]; then
    echo "Canonical staging alias was not bound to a preview before production promotion; continuing without a restore candidate." >&2
    return 0
  fi

  staging_preview_id="$candidate_id"
  staging_preview_url="$candidate_url"
  echo "Captured staging preview $staging_preview_id before production promotion."
}

restore_staging_preview() {
  local alias_json=""
  local current_alias_id=""
  local current_alias_ready=""
  local current_deployment_json=""
  local current_alias_target=""

  [ -n "$staging_preview_id" ] && [ -n "$staging_preview_url" ] || return 0

  if alias_json="$(inspect_staging_alias)"; then
    current_alias_id="$(jq -r '.id' <<<"$alias_json")"
    current_alias_ready="$(jq -r '.readyState | ascii_upcase' <<<"$alias_json")"
    if [ "$current_alias_id" = "$staging_preview_id" ] &&
      [ "$current_alias_ready" = "READY" ]; then
      echo "Canonical staging preview remained bound during production promotion."
      return 0
    fi

    # Preserve a different READY preview if a staging controller repaired the
    # alias before this cleanup ran. Repeated staging-side reassertion covers
    # the inverse race where production finishes after a newer preview bind.
    if [[ "$current_alias_id" == dpl_* ]] &&
      current_deployment_json="$(inspect_deployment "$current_alias_id")"; then
      current_alias_target="$(jq -r '.target | ascii_downcase' <<<"$current_deployment_json")"
      if [ "$current_alias_ready" = "READY" ] &&
        [ "$current_alias_target" = "preview" ]; then
        echo "Canonical staging already owns a newer READY preview; preserving $current_alias_id."
        return 0
      fi
    fi
  fi

  echo "Restoring staging.jov.ie to preview $staging_preview_id after production promotion."
  if ! vercel alias set "$staging_preview_url" staging.jov.ie; then
    echo "Unable to restore the canonical staging preview alias." >&2
    return 1
  fi
  for restore_attempt in $(seq 1 15); do
    if alias_json="$(inspect_staging_alias)"; then
      current_alias_id="$(jq -r '.id' <<<"$alias_json")"
      current_alias_ready="$(jq -r '.readyState | ascii_upcase' <<<"$alias_json")"
      if [ "$current_alias_id" = "$staging_preview_id" ] &&
        [ "$current_alias_ready" = "READY" ]; then
        echo "Canonical staging preview restored to $staging_preview_id."
        return 0
      fi
    fi
    [ "$restore_attempt" -lt 15 ] && sleep "$poll_seconds"
  done
  echo "Canonical staging preview did not converge after production promotion." >&2
  return 1
}

finalize_promotion() {
  local promotion_status=$?
  local restore_status=0
  trap - EXIT

  restore_staging_preview || restore_status=$?
  if [ "$promotion_status" -eq 0 ] && [ "$restore_status" -ne 0 ]; then
    write_failure staging_alias_restore_failed
    exit "$restore_status"
  fi
  if [ "$promotion_status" -ne 0 ] && [ "$restore_status" -ne 0 ]; then
    echo "Staging alias restoration also failed while production promotion was already failing." >&2
  fi
  exit "$promotion_status"
}

capture_staging_preview
trap finalize_promotion EXIT

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
# Forward-only lineage: an authorized SHA that is still an ancestor of main is
# promoted even though main advanced; only a rewind or force-push yields.
if [ "$current_main_sha" != "$expected_main_sha" ] &&
  [ "$($gh_cli api "repos/$repository/compare/${expected_main_sha}...${current_main_sha}" --jq '.status // empty')" != "ahead" ]; then
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'promotion_sha=%s\n' "$current_main_sha" >> "$GITHUB_OUTPUT"
  fi
  echo "Release $expected_main_sha left main's lineage (main is $current_main_sha) before production mutation."
  exit 0
fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  # The promoted SHA is public, high-entropy release identity. Unlike a boolean
  # true, it cannot collide with a Doppler-added secret mask at the job boundary.
  printf 'promotion_sha=%s\n' "$expected_main_sha" >> "$GITHUB_OUTPUT"
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
    # A newer staging controller may publish a preview while Vercel's rolling
    # production release is still settling. Keep the newest observed preview
    # as the restore target before production rewrites the project aliases.
    capture_staging_preview >/dev/null 2>&1 || true
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
