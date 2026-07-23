#!/usr/bin/env bash
set -euo pipefail

expected_sha="${EXPECTED_COMMIT_SHA:-}"
expected_deploy_id="${EXPECTED_PRODUCTION_DEPLOYMENT_ID:-}"
canonical_domain="${PRODUCTION_DOMAIN:-jov.ie}"
canonical_url="${PRODUCTION_BUILD_INFO_URL:-https://jov.ie/api/health/build-info}"
vercel_cli="${VERCEL_CLI:-./node_modules/.bin/vercel}"
max_attempts="${PRODUCTION_ALIAS_MAX_ATTEMPTS:-15}"
retry_seconds="${PRODUCTION_ALIAS_RETRY_SECONDS:-10}"
required_rounds="${PRODUCTION_ALIAS_REQUIRED_ROUNDS:-3}"
max_transient_failures="${PRODUCTION_ALIAS_MAX_TRANSIENT_FAILURES:-2}"
route_retries="${PRODUCTION_ALIAS_ROUTE_RETRIES:-1}"

write_failure() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf 'failure_subtype=production_alias_not_updated\n' >> "$GITHUB_OUTPUT"
  fi
}

if [ -z "$expected_sha" ] || [ -z "$expected_deploy_id" ] ||
  [ -z "${VERCEL_TOKEN:-}" ] || [ -z "${VERCEL_ORG_ID:-}" ]; then
  echo "EXPECTED_COMMIT_SHA, EXPECTED_PRODUCTION_DEPLOYMENT_ID, VERCEL_TOKEN, and VERCEL_ORG_ID are required." >&2
  write_failure
  exit 2
fi

expected_sha="${expected_sha:0:7}"
if [[ "$expected_deploy_id" != dpl_* ]] ||
  ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]] ||
  ! [[ "$retry_seconds" =~ ^[0-9]+$ ]] ||
  ! [[ "$required_rounds" =~ ^[1-9][0-9]*$ ]] ||
  ! [[ "$max_transient_failures" =~ ^[0-9]+$ ]] ||
  ! [[ "$route_retries" =~ ^[0-9]+$ ]] ||
  [ "$required_rounds" -gt "$max_attempts" ]; then
  echo "Production alias verifier inputs are invalid." >&2
  write_failure
  exit 2
fi

vercel() {
  "$vercel_cli" "$@" \
    --scope "$VERCEL_ORG_ID" \
    --no-color
}

curl_args=(
  -sS
  -L
  --connect-timeout 3
  --max-time 3
  -A "Mozilla/5.0 (compatible; JovieCI/1.0; +https://jov.ie)"
  -H "Cache-Control: no-cache, no-store, must-revalidate"
  -H "Pragma: no-cache"
)

last_status=""
last_sha=""
last_current_id=""
# Prove each target independently so one transport reset cannot erase another
# target's exact evidence. Unknowns preserve proof only within the bounded
# tolerance; observed mismatches reset it, and success still requires an
# all-exact latest round.
current_matches=0
current_transient_failures=0
routing_matches=(0 0 0)
routing_transient_failures=(0 0 0)
for attempt in $(seq 1 "$max_attempts"); do
  if [ "$attempt" -gt 1 ]; then
    sleep "$retry_seconds"
  fi

  round_exact=true
  current_observation="transient"
  observed_current_id=""
  current_json=""
  if current_json="$(vercel inspect "$canonical_domain" --format=json 2>/dev/null)" &&
    jq -e '
      type == "object" and
      (.id | type == "string") and
      (.readyState | type == "string") and
      (.target | type == "string")
    ' >/dev/null 2>&1 <<<"$current_json"; then
    observed_current_id="$(jq -r '.id' <<<"$current_json")"
    last_current_id="$observed_current_id"
    current_ready="$(jq -r '.readyState | ascii_upcase' <<<"$current_json")"
    current_target="$(jq -r '.target | ascii_downcase' <<<"$current_json")"
    current_observation="mismatch"
    if [ "$observed_current_id" = "$expected_deploy_id" ] &&
      [ "$current_ready" = "READY" ] &&
      [ "$current_target" = "production" ]; then
      current_observation="match"
    fi
  fi

  case "$current_observation" in
    match)
      if [ "$current_matches" -lt "$required_rounds" ]; then
        current_matches=$((current_matches + 1))
      fi
      current_transient_failures=0
      ;;
    mismatch)
      current_matches=0
      current_transient_failures=0
      round_exact=false
      ;;
    transient)
      current_transient_failures=$((current_transient_failures + 1))
      if [ "$current_transient_failures" -gt "$max_transient_failures" ]; then
        current_matches=0
      fi
      round_exact=false
      ;;
  esac

  echo "  attempt ${attempt}/${max_attempts} production-current: id=${observed_current_id:-<unknown>} expected=${expected_deploy_id}, proof=${current_matches}/${required_rounds}, transient=${current_transient_failures}/${max_transient_failures}"

  routing_index=0
  for routing in plain stable canary; do
    routing_query=""
    case "$routing" in
      stable) routing_query="vcrrForceStable=true" ;;
      canary) routing_query="vcrrForceCanary=true" ;;
    esac

    separator="?"
    [[ "$canonical_url" == *"?"* ]] && separator="&"
    probe_url="${canonical_url}${separator}_cb=$(date +%s%N)"
    if [ -n "$routing_query" ]; then
      probe_url="${probe_url}&${routing_query}"
    fi

    route_observation="transient"
    response=""
    last_status="000"
    last_sha=""
    environment=""
    route_attempt=0
    while [ "$route_attempt" -le "$route_retries" ]; do
      route_attempt=$((route_attempt + 1))
      response=""
      last_status="000"
      last_sha=""
      environment=""
      if response="$(curl "${curl_args[@]}" -w "\n%{http_code}" "$probe_url" 2>/dev/null)"; then
        last_status="${response##*$'\n'}"
        body="${response%$'\n'*}"
        if [ "$last_status" != "000" ]; then
          last_sha="$(printf '%s' "$body" | jq -r '.commitSha // ""' 2>/dev/null || echo "")"
          environment="$(printf '%s' "$body" | jq -r '.environment // ""' 2>/dev/null || echo "")"
          route_observation="match"
          if [ "$last_status" != "200" ] ||
            [ "$last_sha" != "$expected_sha" ] ||
            [ "$environment" != "production" ]; then
            route_observation="mismatch"
          fi
          break
        fi
      fi

      if [ "$route_attempt" -le "$route_retries" ]; then
        echo "  attempt ${attempt}/${max_attempts} production-alias/${routing}: transport unknown (HTTP 000), retry ${route_attempt}/${route_retries} within logical route observation"
      fi
    done

    case "$route_observation" in
      match)
        if [ "${routing_matches[$routing_index]}" -lt "$required_rounds" ]; then
          routing_matches[routing_index]=$((routing_matches[routing_index] + 1))
        fi
        routing_transient_failures[routing_index]=0
        ;;
      mismatch)
        routing_matches[routing_index]=0
        routing_transient_failures[routing_index]=0
        round_exact=false
        ;;
      transient)
        routing_transient_failures[routing_index]=$((routing_transient_failures[routing_index] + 1))
        if [ "${routing_transient_failures[$routing_index]}" -gt "$max_transient_failures" ]; then
          routing_matches[routing_index]=0
        fi
        round_exact=false
        ;;
    esac

    echo "  attempt ${attempt}/${max_attempts} production-alias/${routing}: HTTP ${last_status}, commitSha=${last_sha:-<empty>}, environment=${environment:-<empty>}, proof=${routing_matches[$routing_index]}/${required_rounds}, transient=${routing_transient_failures[$routing_index]}/${max_transient_failures}"
    routing_index=$((routing_index + 1))
  done

  proof_complete=true
  if [ "$current_matches" -lt "$required_rounds" ]; then
    proof_complete=false
  fi
  for routing_index in 0 1 2; do
    if [ "${routing_matches[$routing_index]}" -lt "$required_rounds" ]; then
      proof_complete=false
    fi
  done
  if [ "$round_exact" = "true" ] && [ "$proof_complete" = "true" ]; then
    echo "Canonical production is ${expected_deploy_id} and serves ${expected_sha}; Production Current and every routing path have ${required_rounds} independently confirmed exact observations, and the latest round is exact."
    exit 0
  fi
done

echo "Canonical production did not converge: current='${last_current_id:-<unknown>}', HTTP ${last_status:-<unknown>}, commitSha='${last_sha:-<empty>}', expected deployment '${expected_deploy_id}' and SHA '${expected_sha}'." >&2
write_failure
exit 1
