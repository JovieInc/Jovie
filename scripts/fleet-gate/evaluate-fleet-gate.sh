#!/usr/bin/env bash
# Single evaluate path for Fleet Gate Refresh, Queue-Deferred Release,
# merge-queue fleet-policy, and Production Controller. Calls the shipped
# gem-priority-gate.py CLI.
#
# Env:
#   GEM_PRIORITY_GATE_REPO   repository slug (required by the CLI)
#   GH_TOKEN                 GitHub token for live observation
#   FLEET_GATE_DRY_RUN       1 to pass --dry-run (no persisted receipt)
#   FLEET_GATE_EVALUATE_JSON optional fixture for tests (skips live observe)
#   FLEET_GATE_CONSUMER      fleet (default) or deployment
#   FLEET_GATE_SURFACE       exact consumer surface
#   FLEET_GATE_MUTATION      requested mutation
#   FLEET_GATE_RISK_LANE     JOV-5937 lane (not_applicable/low/medium/high/unknown)
#   FLEET_GATE_HEALTH_SIGNALS_JSON additional typed dependency observations
#   EXPECTED_SHA             when set, receipt main.sha must match
#   FLEET_GATE_RECEIPT       output path (default $RUNNER_TEMP/jovie-fleet-gate.json)
#   GITHUB_OUTPUT            optional Actions output file
#
# FLEET_GATE_ALLOW_LIVE_PERSIST is not an enable switch. Any nonzero spelling
# in live mode forces dry-run so the gate still emits a schema-valid receipt;
# live latest.json writes stay refuse-closed inside gem-priority-gate.py.
#
# Job-output `receipt_b64` is a bounded admission projection, not FLEET_GATE_RECEIPT.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
gate="$repo_root/scripts/fleet-gate/gem-priority-gate.py"
receipt="${FLEET_GATE_RECEIPT:-${RUNNER_TEMP:-/tmp}/jovie-fleet-gate.json}"
consumer="${FLEET_GATE_CONSUMER:-fleet}"
surface="${FLEET_GATE_SURFACE:-fleet-control}"
mutation="${FLEET_GATE_MUTATION:-refresh-fleet-admission}"
risk_lane="${FLEET_GATE_RISK_LANE:-not_applicable}"
health_signals="${FLEET_GATE_HEALTH_SIGNALS_JSON:-[]}"
mkdir -p "$(dirname "$receipt")"

case "$consumer" in
  fleet | deployment) ;;
  *)
    echo "::error::FLEET_GATE_CONSUMER must be fleet or deployment (got $consumer)." >&2
    exit 2
    ;;
esac

live_persist_override_nonzero() {
  local raw="${FLEET_GATE_ALLOW_LIVE_PERSIST-}"
  [[ -n "$raw" ]] || return 1
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  case "$raw" in
    "" | 0 | false | no | off) return 1 ;;
    *) return 0 ;;
  esac
}

if [[ "${FLEET_GATE_DRY_RUN:-0}" != "1" ]] && live_persist_override_nonzero; then
  echo "::warning::FLEET_GATE_ALLOW_LIVE_PERSIST is present and nonzero; forcing dry-run so evaluation still emits a schema-valid receipt (live write refuse-closed)." >&2
  export FLEET_GATE_DRY_RUN=1
fi

args=(python3 "$gate" --consumer "$consumer")
if [[ "${FLEET_GATE_DRY_RUN:-0}" == "1" ]]; then
  args+=(--dry-run)
fi
if [[ -n "${FLEET_GATE_EVALUATE_JSON:-}" ]]; then
  args+=(--evaluate-json "$FLEET_GATE_EVALUATE_JSON")
fi

set +e
"${args[@]}" >"$receipt"
observer_rc=$?
set -e

jq -e '
  .schema == "jovie-fleet-gate/v1" and
  (.observedAt | type == "string") and
  (try (.signals.main.sha | test("^[0-9a-f]{40}$")) catch false) and
  (.signals.integrity.status | IN("clear", "resolved", "active", "invalid")) and
  (.signals.closureHealth.schema == "jovie-closure-health/v1") and
  (.signals.closureHealth.newIssueIntakeAllowed | type == "boolean") and
  (.closureAdmission.newIssueIntakeAllowed | type == "boolean") and
  (.promotionAdmission.allowed | type == "boolean") and
  (.isolatedPromotionAdmission.allowed | type == "boolean") and
  (.promotionMode | IN("normal", "isolated-only", "controller-repair-only", "draft-only", "hold-intake", "blocked")) and
  (.workAdmission.allowed | type == "boolean")
' "$receipt" >/dev/null || {
  echo '::error::Fleet gate emitted a malformed receipt.' >&2
  exit 2
}

# Forward-only, like the release rechecks (#18809): a generation whose subject
# main has since moved past is still admissible; a diverged or unreadable
# lineage fails closed. An exact-only match starved every generation while
# merges kept landing during the production-mutation lock wait (JOV-6993).
subject_is_ancestor_of_main() {
  local main_sha="$1" status
  if [[ -n "${FLEET_GATE_COMPARE_STATUS:-}" ]]; then
    status="$FLEET_GATE_COMPARE_STATUS" # test fixture, like FLEET_GATE_EVALUATE_JSON
  elif [[ -n "${GEM_PRIORITY_GATE_REPO:-}" ]]; then
    status="$(gh api "repos/$GEM_PRIORITY_GATE_REPO/compare/$EXPECTED_SHA...$main_sha" --jq .status 2>/dev/null)" || return 1
  else
    return 1
  fi
  [[ "$status" == "ahead" ]]
}

if [[ -n "${EXPECTED_SHA:-}" ]]; then
  main_sha="$(jq -r '.signals.main.sha' "$receipt")"
  if [[ "$main_sha" != "$EXPECTED_SHA" ]]; then
    if subject_is_ancestor_of_main "$main_sha"; then
      echo "::notice::Fleet gate subject $EXPECTED_SHA is an ancestor of main $main_sha; admitting forward-only." >&2
    else
      echo '::error::Fleet gate main.sha is not the expected subject or a descendant of it.' >&2
      exit 2
    fi
  fi
fi

if [[ "$consumer" == "deployment" ]]; then
  jq -e '
    (.deploymentAdmission.allowed | type == "boolean") and
    (.isolatedPromotionAdmission.deploymentsAllowed == false)
  ' "$receipt" >/dev/null || {
    echo '::error::Fleet gate emitted a malformed deployment receipt.' >&2
    exit 2
  }
fi

if [[ "$observer_rc" -ne 0 && "$observer_rc" -ne 2 ]]; then
  echo "::error::Fleet gate exited unexpectedly: $observer_rc" >&2
  exit 2
fi

admission="${receipt}.admission.json"
request="${receipt}.request.json"
revision="${EXPECTED_SHA:-$(jq -r '.signals.main.sha' "$receipt")}"
jq -n \
  --arg consumer "$consumer" \
  --arg surface "$surface" \
  --arg repository "${GEM_PRIORITY_GATE_REPO:-JovieInc/Jovie}" \
  --arg revision "$revision" \
  --arg mutation "$mutation" \
  --arg riskLane "$risk_lane" \
  --argjson healthSignals "$health_signals" \
  '{consumer: $consumer, surface: $surface, repository: $repository, revision: $revision, mutation: $mutation, riskLane: $riskLane, healthSignals: $healthSignals}' \
  >"$request" || { echo '::error::Fleet admission request is malformed.' >&2; exit 2; }
if ! python3 "$repo_root/scripts/fleet-gate/fleet_admission_receipt.py" --request "$request" <"$receipt" >"$admission"; then
  echo '::error::Fleet gate admission projection failed.' >&2
  exit 2
fi
jq -e '
  .schema == "jovie-fleet-gate/v1" and
  .scopedAdmission.schema == "jovie-fleet-admission/v2" and
  (.scopedAdmission.allowed | type == "boolean") and
  (.scopedAdmission.relevantBlockers | type == "array") and
  (.scopedAdmission.unrelatedDegradations | type == "array") and
  (.signals.closureHealth | has("classifications") | not) and
  (.signals.closureHealth | has("changedFileEvidence") | not) and
  (.signals.closureHealth | has("duplicateIssueLanes") | not) and
  (.workAdmission.allowed | type == "boolean")
' "$admission" >/dev/null || {
  echo '::error::Fleet gate emitted a malformed admission projection.' >&2
  exit 2
}

scoped_allowed="$(jq -r '.scopedAdmission.allowed' "$admission")"
scoped_mode="$(jq -r '.scopedAdmission.allowedMode' "$admission")"
scoped_reason="$(jq -r '.scopedAdmission.reason' "$admission")"
gate_rc=2
[[ "$scoped_allowed" == "true" ]] && gate_rc=0
work_allowed=false
new_issue_intake_allowed=false
promotion_allowed=false
deployment_allowed=false
[[ "$(jq -r '.workAdmission.allowed' "$receipt")" == "true" ]] && work_allowed=true
[[ "$(jq -r '.workAdmission.newIssueLeaseAllowed' "$receipt")" == "true" ]] && new_issue_intake_allowed=true
[[ "$(jq -r '.promotionAdmission.allowed' "$receipt")" == "true" ]] && promotion_allowed=true
[[ "$(jq -r '.deploymentAdmission.allowed // false' "$receipt")" == "true" ]] && deployment_allowed=true
if [[ "$consumer" == "fleet" ]]; then
  work_allowed="$scoped_allowed"
else
  deployment_allowed="$scoped_allowed"
fi
promotion_mode="$(jq -r '.promotionMode // "blocked"' "$receipt")"
state="$(jq -r '.state' "$receipt")"
observed_at="$(jq -r '.observedAt // empty' "$receipt")"
receipt_age_seconds=""
if [[ -n "$observed_at" ]]; then
  receipt_age_seconds="$(
    python3 -c '
from datetime import datetime, timezone
import sys
try:
    observed = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
except ValueError:
    raise SystemExit(0)
print(int((datetime.now(timezone.utc) - observed).total_seconds()))
' "$observed_at" 2>/dev/null || true
  )"
fi
capacity_accepted="$(jq -r '.concurrency.gem.evidenceAccepted // false' "$receipt")"
capacity_max_concurrent="$(jq -r '.concurrency.gem.maxConcurrent // 0' "$receipt")"
capacity_reason="$(jq -r '.concurrency.gem.reason // "unknown"' "$receipt")"
new_mutation_allowed="$(jq -r '.concurrency.gem.newMutationAllowed // false' "$receipt")"

mode="$scoped_mode"

if [[ "$work_allowed" == "true" ]]; then
  work_out=true
else
  work_out=false
fi

receipt_b64="$(base64 -w0 <"$admission" 2>/dev/null || base64 <"$admission" | tr -d '\n')"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "gate_rc=$gate_rc"
    echo "work_allowed=$work_out"
    echo "new_issue_intake_allowed=$new_issue_intake_allowed"
    echo "promotion_allowed=$promotion_allowed"
    echo "deployment_allowed=$deployment_allowed"
    echo "promotion_mode=$promotion_mode"
    echo "mode=$mode"
    echo "state=$state"
    echo "receipt_age_seconds=${receipt_age_seconds}"
    echo "capacity_accepted=$capacity_accepted"
    echo "capacity_max_concurrent=$capacity_max_concurrent"
    echo "capacity_reason=$capacity_reason"
    echo "new_mutation_allowed=$new_mutation_allowed"
    echo "receipt_path=$receipt"
    echo "receipt_b64=$receipt_b64"
  } >>"$GITHUB_OUTPUT"
fi

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "### Fleet receipt"
    echo
    echo "| Field | Value |"
    echo "| --- | --- |"
    echo "| state | $state |"
    echo "| promotion_mode | $promotion_mode |"
    echo "| consumer_surface | $surface |"
    echo "| requested_mutation | $mutation |"
    echo "| risk_lane | $risk_lane |"
    echo "| allowed_mode | $mode |"
    echo "| decision_reason | $scoped_reason |"
    echo "| receipt_age_seconds | ${receipt_age_seconds:-unknown} |"
    echo "| capacity_accepted | $capacity_accepted |"
    echo "| capacity_max_concurrent | $capacity_max_concurrent |"
    echo "| capacity_reason | $capacity_reason |"
    echo "| new_mutation_allowed | $new_mutation_allowed |"
    echo "| promotion_allowed | $promotion_allowed |"
    echo "| new_issue_intake_allowed | $new_issue_intake_allowed |"
    echo
    echo "Capacity bounds new agent dispatch only. Already-green promotion/enroll uses live promotionMode, not Gem-local seat flaps."
  } >>"$GITHUB_STEP_SUMMARY"
fi

echo "Fleet gate evaluated (state=$state consumer=$consumer consumer_rc=$gate_rc work_allowed=$work_out new_issue_intake_allowed=$new_issue_intake_allowed deployment_allowed=$deployment_allowed mode=$mode promotion_mode=$promotion_mode receipt_age_seconds=${receipt_age_seconds:-unknown} capacity_accepted=$capacity_accepted capacity_max_concurrent=$capacity_max_concurrent)."

# JOV-8000 follow-up 26: machine-readable promotion diagnostics right after the
# summary line. The persisted receipt lives only on the Gem host (auth-gated for
# every remote reader), so promotionMode=blocked previously surfaced with NO
# reasons and NO signal detail in the step log — a 15-hour diagnosis loop. These
# lines make the step log self-sufficient: the promotion mode with its reason
# codes, then each signal that feeds promotionMode with its status and a
# redacted first-200-char error excerpt. Logging only: zero behavior change.
promotion_reasons="$(jq -r '[.reasons[]? | .code] | join(";")' "$receipt" 2>/dev/null)"
echo "fleet-gate.promotion mode=$promotion_mode reasons=[$promotion_reasons]"
emit_gate_signal() {
  local name="$1"
  local jq_filter="$2"
  local status error
  status="$(jq -r "$jq_filter | .status // \"unknown\"" "$receipt" 2>/dev/null || true)"
  error="$(jq -r "$jq_filter | .error // \"\"" "$receipt" 2>/dev/null || true)"
  # Redact token-like and secret-shaped strings before any log write.
  error="$(
    printf '%s' "$error" \
    | sed -E 's/(gh[pousr]_[A-Za-z0-9]{8,})/[REDACTED]/g; s/(github_pat_[A-Za-z0-9_]{8,})/[REDACTED]/g; s/(Bearer[[:space:]]+[A-Za-z0-9._-]{8,})/[REDACTED]/g; s/([A-Fa-f0-9]{40,})/[REDACTED]/g' \
    | head -c 200
  )"
  echo "fleet-gate.signal $name status=${status:-unknown} error=$error"
}
emit_gate_signal controller '.signals.controller'
emit_gate_signal production '.signals.production'
emit_gate_signal main '.signals.main'
emit_gate_signal integrity '.signals.integrity'
emit_gate_signal queue '.signals.queue'
emit_gate_signal closure-health '.signals.closureHealth'
emit_gate_signal concurrency '.signals.concurrency.gem'
emit_gate_signal independent-review '.signals.independentReview'
exit 0
