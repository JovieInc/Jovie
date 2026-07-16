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
  [ "$required_rounds" -gt "$max_attempts" ]; then
  echo "Production alias verifier inputs are invalid." >&2
  write_failure
  exit 2
fi

vercel() {
  "$vercel_cli" "$@" \
    --token "$VERCEL_TOKEN" \
    --scope "$VERCEL_ORG_ID" \
    --no-color
}

curl_args=(
  -sS
  -L
  --connect-timeout 3
  --max-time 5
  -A "Mozilla/5.0 (compatible; JovieCI/1.0; +https://jov.ie)"
  -H "Cache-Control: no-cache, no-store, must-revalidate"
  -H "Pragma: no-cache"
)

last_status=""
last_sha=""
last_current_id=""
consecutive_rounds=0
for attempt in $(seq 1 "$max_attempts"); do
  if [ "$attempt" -gt 1 ]; then
    sleep "$retry_seconds"
  fi

  current_ok=false
  current_json=""
  if current_json="$(vercel inspect "$canonical_domain" --format=json 2>/dev/null)" &&
    jq -e '
      type == "object" and
      (.id | type == "string") and
      (.readyState | type == "string") and
      (.target | type == "string")
    ' >/dev/null 2>&1 <<<"$current_json"; then
    last_current_id="$(jq -r '.id' <<<"$current_json")"
    current_ready="$(jq -r '.readyState | ascii_upcase' <<<"$current_json")"
    current_target="$(jq -r '.target | ascii_downcase' <<<"$current_json")"
    if [ "$last_current_id" = "$expected_deploy_id" ] &&
      [ "$current_ready" = "READY" ] &&
      [ "$current_target" = "production" ]; then
      current_ok=true
    fi
  fi

  echo "  attempt ${attempt}/${max_attempts} production-current: id=${last_current_id:-<unknown>} expected=${expected_deploy_id}"

  round_ok="$current_ok"
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

    response="$(curl "${curl_args[@]}" -w "\n%{http_code}" "$probe_url" 2>/dev/null || printf '\n000')"
    last_status="${response##*$'\n'}"
    body="${response%$'\n'*}"
    last_sha="$(printf '%s' "$body" | jq -r '.commitSha // ""' 2>/dev/null || echo "")"
    environment="$(printf '%s' "$body" | jq -r '.environment // ""' 2>/dev/null || echo "")"

    echo "  attempt ${attempt}/${max_attempts} production-alias/${routing}: HTTP ${last_status}, commitSha=${last_sha:-<empty>}, environment=${environment:-<empty>}"
    if [ "$last_status" != "200" ] ||
      [ "$last_sha" != "$expected_sha" ] ||
      [ "$environment" != "production" ]; then
      round_ok=false
    fi
  done

  if [ "$round_ok" = "true" ]; then
    consecutive_rounds=$((consecutive_rounds + 1))
    if [ "$consecutive_rounds" -ge "$required_rounds" ]; then
      echo "Canonical production is ${expected_deploy_id} and serves ${expected_sha} across ${required_rounds} consecutive routing rounds."
      exit 0
    fi
  else
    consecutive_rounds=0
  fi
done

echo "Canonical production did not converge: current='${last_current_id:-<unknown>}', HTTP ${last_status:-<unknown>}, commitSha='${last_sha:-<empty>}', expected deployment '${expected_deploy_id}' and SHA '${expected_sha}'." >&2
write_failure
exit 1
