#!/usr/bin/env bash
# Single evaluate path for Fleet Gate Refresh, Queue-Deferred Release, and
# merge-queue fleet-policy. Calls the shipped gem-priority-gate.py CLI.
#
# Env:
#   GEM_PRIORITY_GATE_REPO   repository slug (required by the CLI)
#   GH_TOKEN                 GitHub token for live observation
#   FLEET_GATE_DRY_RUN       1 to pass --dry-run (no persisted receipt)
#   FLEET_GATE_EVALUATE_JSON optional fixture for tests (skips live observe)
#   FLEET_GATE_RECEIPT       output path (default $RUNNER_TEMP/jovie-fleet-gate.json)
#   GITHUB_OUTPUT            optional Actions output file
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
gate="$repo_root/scripts/hermes/gem-priority-gate.py"
receipt="${FLEET_GATE_RECEIPT:-${RUNNER_TEMP:-/tmp}/jovie-fleet-gate.json}"
mkdir -p "$(dirname "$receipt")"

args=(python3 "$gate" --consumer fleet)
if [[ "${FLEET_GATE_DRY_RUN:-0}" == "1" ]]; then
  args+=(--dry-run)
fi
if [[ -n "${FLEET_GATE_EVALUATE_JSON:-}" ]]; then
  args+=(--evaluate-json "$FLEET_GATE_EVALUATE_JSON")
fi

set +e
"${args[@]}" >"$receipt"
gate_rc=$?
set -e

jq -e '
  .schema == "jovie-fleet-gate/v1" and
  (.observedAt | type == "string") and
  (.signals.main.sha | test("^[0-9a-f]{40}$")) and
  (.signals.integrity.status | IN("clear", "resolved", "active", "invalid")) and
  (.promotionAdmission.allowed | type == "boolean") and
  (.isolatedPromotionAdmission.allowed | type == "boolean") and
  (.promotionMode | IN("normal", "isolated-only", "draft-only", "hold-intake", "blocked")) and
  (.workAdmission.allowed | type == "boolean")
' "$receipt" >/dev/null || {
  echo '::error::Fleet gate emitted a malformed receipt.' >&2
  exit 2
}

if [[ "$gate_rc" -ne 0 && "$gate_rc" -ne 2 ]]; then
  echo "::error::Fleet gate exited unexpectedly: $gate_rc" >&2
  exit 2
fi

work_allowed=false
promotion_allowed=false
[[ "$(jq -r '.workAdmission.allowed' "$receipt")" == "true" ]] && work_allowed=true
[[ "$(jq -r '.promotionAdmission.allowed' "$receipt")" == "true" ]] && promotion_allowed=true
promotion_mode="$(jq -r '.promotionMode // "blocked"' "$receipt")"
state="$(jq -r '.state' "$receipt")"

mode=blocked
if [[ "$state" == "GREEN" && "$promotion_allowed" == "true" ]]; then
  mode=normal
elif [[ "$promotion_mode" != "null" && -n "$promotion_mode" ]]; then
  mode="$promotion_mode"
fi

if [[ "$work_allowed" == "true" ]]; then
  work_out=true
else
  work_out=false
fi

receipt_b64="$(base64 -w0 <"$receipt" 2>/dev/null || base64 <"$receipt" | tr -d '\n')"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "gate_rc=$gate_rc"
    echo "work_allowed=$work_out"
    echo "promotion_allowed=$promotion_allowed"
    echo "promotion_mode=$promotion_mode"
    echo "mode=$mode"
    echo "state=$state"
    echo "receipt_path=$receipt"
    echo "receipt_b64=$receipt_b64"
  } >>"$GITHUB_OUTPUT"
fi

echo "Fleet gate evaluated (state=$state consumer_rc=$gate_rc work_allowed=$work_out mode=$mode)."
exit 0
