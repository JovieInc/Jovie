#!/usr/bin/env bash
# Fail-closed authorization guard for Graphite merge-queue synthetic PRs.
#
# Modes:
#   --snapshot  Validate gtmq PRs from a drain snapshot read on stdin.
#   --synthetic-event N  Immediately validate known synthetic N.
#   --source-event A     Rescan open synthetics when source action A can revoke
#                        authorization.
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
if [[ "$DRY_RUN" != "1" ]]; then
  case "${GTMQ_MUTATION_AUTHORIZATION:-}" in
    drain-snapshot | gtmq-source-authorization-workflow | test-fixture) ;;
    *)
      echo "::error::Refusing live Graphite guard without recognized GTMQ_MUTATION_AUTHORIZATION" >&2
      exit 2
      ;;
  esac
fi
if [[ -n "${DRAIN_EXPECT_GH:-}" ]]; then
  resolved_gh="$(command -v gh || true)"
  if [[ "$resolved_gh" != "$DRAIN_EXPECT_GH" ]]; then
    echo "::error::Refusing Graphite guard: expected gh at $DRAIN_EXPECT_GH, resolved ${resolved_gh:-missing}" >&2
    exit 2
  fi
fi

source_prs() {
  grep -Eo "(app\.graphite\.com/github/pr/${REPO}/[0-9]+|github\.com/${REPO}/pull/[0-9]+)" <<<"$1" \
    | grep -Eo '[0-9]+$' \
    | sort -nu \
    || true
}

source_revocation_reason() {
  local n="$1" current state hard_gates
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json state,isDraft,labels 2>/dev/null)"; then
    echo "source #$n lookup failed"
    return 0
  fi
  if ! jq -e '
    (.state | type == "string")
    and (.isDraft | type == "boolean")
    and (.labels | type == "array")
    and all(.labels[]; (.name | type == "string"))
  ' <<<"$current" >/dev/null 2>&1; then
    echo "source #$n returned malformed state metadata"
    return 0
  fi

  state="$(jq -r '.state' <<<"$current")"
  case "$state" in
    CLOSED | MERGED)
      echo "source #$n is $state and no longer authorizes this synthetic"
      ;;
    OPEN)
      hard_gates="$(jq -r '[.labels[].name | select(. == "gated" or . == "hold" or . == "needs-human" or . == "queue-deferred" or . == "needs-conflict-resolution" or . == "needs:taste" or . == "needs-human-taste" or . == "needs-human-review" or . == "human-review-required" or . == "no-auto" or . == "taste")] | join(",")' <<<"$current")"
      if jq -e '.isDraft == true' <<<"$current" >/dev/null; then
        echo "source #$n is OPEN but is draft"
      elif [[ -n "$hard_gates" ]]; then
        echo "source #$n is OPEN with hard gate(s): $hard_gates"
      elif ! jq -e '[.labels[].name] | index("merge-queue") != null' <<<"$current" >/dev/null; then
        echo "source #$n is OPEN but no longer has merge-queue"
      fi
      ;;
    *)
      echo "source #$n returned unsupported state: $state"
      ;;
  esac
}

close_synthetic_strict() {
  local n="$1" reason="$2" current close_failed=0
  local comment="Root cause: Graphite synthetic #$n no longer has provable source authorization and must not land. ${reason}. Active synthetics are valid only while every open source PR is non-draft, explicitly merge-queue enrolled, and has none of gated, hold, needs-human, queue-deferred, needs-conflict-resolution, needs:taste, needs-human-taste, needs-human-review, human-review-required, no-auto, or taste. Incident class: #14071 was re-gated and dequeued, but synthetic #14307 later pushed f427ed44 before required CI finished; #14279 was dequeued and gated, but Graphite still landed synthetic #14328 before that PR was visible. Durable guard: #14312."
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would document root cause and close Graphite synthetic #$n"
    return 0
  fi
  gh_retry pr close "$n" -R "$REPO" --comment "$comment" >/dev/null \
    || close_failed=1
  if ! current="$(gh_retry pr view "$n" -R "$REPO" --json state 2>/dev/null)"; then
    echo "    !! could not verify closure of Graphite synthetic #$n" >&2
    return 1
  fi
  if jq -e '.state == "CLOSED" or .state == "MERGED"' <<<"$current" >/dev/null; then
    echo "    closed unauthorized Graphite synthetic #$n"
    return 0
  fi
  if (( close_failed > 0 )); then
    echo "    !! failed to close unauthorized Graphite synthetic #$n" >&2
  fi
  echo "    !! Graphite synthetic #$n remains open after close request" >&2
  return 1
}

validate_synthetic() {
  local n="$1" title="$2" body="$3" source_numbers reason reason_summary
  local -a reasons=()
  source_numbers="$(source_prs "$body")"
  if [[ -z "$source_numbers" ]]; then
    reasons+=("generated body has missing or malformed source PR metadata")
  else
    while IFS= read -r source_n; do
      [[ -z "$source_n" ]] && continue
      reason="$(source_revocation_reason "$source_n")"
      [[ -n "$reason" ]] && reasons+=("$reason")
    done <<<"$source_numbers"
  fi

  if (( ${#reasons[@]} == 0 )); then
    echo "  #$n  $title  ACTIVE/PRESERVE (all open sources non-draft, explicitly queued, and ungated)"
    return 0
  fi

  reason_summary="$(IFS='; '; echo "${reasons[*]}")"
  echo "  #$n  $title  CLOSE: $reason_summary"
  if ! close_synthetic_strict "$n" "$reason_summary"; then
    echo "::error::Failed to prove unauthorized Graphite synthetic #$n is closed" >&2
    return 1
  fi
  return 10
}

validate_snapshot() {
  local snapshot="$1" pr n title body head result preserved=0 closed=0
  if ! jq -e 'type == "array"' <<<"$snapshot" >/dev/null 2>&1; then
    echo "::error::Malformed Graphite synthetic snapshot" >&2
    return 1
  fi
  while IFS= read -r pr; do
    n="$(jq -r '.n // .number // empty' <<<"$pr")"
    title="$(jq -r '.t // .title // "Graphite synthetic"' <<<"$pr")"
    body="$(jq -r '.body // ""' <<<"$pr")"
    head="$(jq -r '.head // .headRefName // empty' <<<"$pr")"
    [[ "$head" == gtmq_* ]] || continue
    if [[ ! "$n" =~ ^[0-9]+$ ]]; then
      echo "::error::Malformed Graphite synthetic PR number" >&2
      return 1
    fi
    set +e
    validate_synthetic "$n" "$title" "$body"
    result=$?
    set -e
    case "$result" in
      0) preserved=$((preserved + 1)) ;;
      10) closed=$((closed + 1)) ;;
      *) return "$result" ;;
    esac
  done < <(jq -c '.[]' <<<"$snapshot")
  echo "  Graphite synthetics closed: $closed; active/preserved: $preserved"
}

list_open_synthetics() {
  gh_retry pr list -R "$REPO" --state open --limit 200 \
    --json number,title,body,headRefName --jq '[.[] | select(.headRefName | startswith("gtmq_"))]'
}

synthetic_event_guard() {
  local event_pr="$1" current snapshot
  if ! current="$(gh_retry pr view "$event_pr" -R "$REPO" --json number,title,body,headRefName,state 2>/dev/null)"; then
    echo "  #$event_pr  CLOSE: synthetic event lookup failed"
    close_synthetic_strict "$event_pr" "synthetic event lookup failed; authorization cannot be proven"
    return
  fi
  if ! jq -e '
    (.number | type == "number") and (.title | type == "string")
    and (.body | type == "string") and (.headRefName | type == "string")
    and (.state | type == "string")
  ' <<<"$current" >/dev/null 2>&1; then
    echo "  #$event_pr  CLOSE: synthetic event returned malformed metadata"
    close_synthetic_strict "$event_pr" "synthetic event returned malformed metadata; authorization cannot be proven"
    return
  fi
  if [[ "$(jq -r '.headRefName' <<<"$current")" != gtmq_* ]]; then
    echo "  #$event_pr  CLOSE: trusted event classified this PR as synthetic but API head is not gtmq"
    close_synthetic_strict "$event_pr" "synthetic event returned a non-gtmq head; authorization cannot be proven"
    return
  fi
  # A terminal synthetic cannot land; duplicate close events are idempotent.
  if [[ "$(jq -r '.state' <<<"$current")" != "OPEN" ]]; then
    echo "  Graphite synthetic #$event_pr is terminal; no authorization mutation"
    return 0
  fi
  snapshot="$(jq -c '[.]' <<<"$current")"
  validate_snapshot "$snapshot"
}

source_event_guard() {
  local action="$1" snapshot
  case "$action" in
    closed | reopened | labeled | unlabeled | converted_to_draft | ready_for_review)
      snapshot="$(list_open_synthetics)" || {
        echo "::error::Open Graphite synthetic lookup failed" >&2
        return 1
      }
      validate_snapshot "$snapshot"
      ;;
    *)
      echo "  Source PR event '$action' does not revoke authorization; no scan required"
      ;;
  esac
}

case "${1:-}" in
  --snapshot)
    validate_snapshot "$(cat)"
    ;;
  --synthetic-event)
    [[ "${2:-}" =~ ^[0-9]+$ ]] || { echo "usage: $0 --synthetic-event <pr-number>" >&2; exit 2; }
    synthetic_event_guard "$2"
    ;;
  --source-event)
    source_event_guard "${2:-unknown}"
    ;;
  *)
    echo "usage: $0 --snapshot | --synthetic-event <pr-number> | --source-event <action>" >&2
    exit 2
    ;;
esac
