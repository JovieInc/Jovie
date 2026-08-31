#!/usr/bin/env bash
# Auto-Ready Agent Drafts
#
# Promotes only trusted bot-created drafts, or exact current heads produced
# by the trusted FX writer, once they are MERGEABLE with zero failing
# required checks. Branch-name prefixes are discovery noise, never
# authorization. Native merge-queue autoenroll is the only enrollment owner.
#
# Opt out per-PR with taste/security/hold labels, controlled-proof/canary
# markers, or any of: needs-human, hold, gated, queue-deferred, fast.
#
# Env:
#   DRY_RUN=1                 classify and print only; flip no PRs
#   ATTEMPT_COOLDOWN_HOURS    min hours between flip attempts per PR (default 6)
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
PROVENANCE_LIB="$SCRIPT_DIR/lib/auto-ready-provenance.mjs"
# Idempotency guard (#13342): one marker comment per PR, edited in place, and a
# hard cap of one flip attempt per PR per ATTEMPT_COOLDOWN_HOURS. Without this,
# a PR the token cannot actually flip (see #13122) gets an identical
# "Enrolling in merge queue" comment every cron cycle — 221 in 12h observed.
READY_MARKER="auto-ready"
ATTEMPT_COOLDOWN_HOURS="${ATTEMPT_COOLDOWN_HOURS:-6}"
HOLD_LABEL_RE="$(node "$PROVENANCE_LIB" hold-re)"
now_epoch="$(date -u +%s)"

# Mutation budget: `gh pr ready` runs at most once per PR per controller pass.
# A raced hold/head change is compensated with `pr ready --undo`, never a
# second ready transition on the same number.
mark_ready() {  # mark_ready <num> — returns non-zero when the flip call failed
  local n="$1"
  if [[ "${READY_ATTEMPTED_FOR:-}" == "$n" ]]; then
    echo "    !! refusing a second gh pr ready for #$n in this pass"
    return 1
  fi
  READY_ATTEMPTED_FOR="$n"
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would mark #$n ready"; return 0; }
  if gh_retry pr ready "$n" -R "$REPO" >/dev/null 2>&1; then
    echo "    ✓ marked #$n ready"
    return 0
  fi
  echo "    !! failed to mark #$n ready"
  return 1
}

# Upsert the single auto-ready status comment (edited in place on repeat runs).
upsert_status_comment() {  # upsert_status_comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would upsert status comment on #$1"; return 0; }
  GITHUB_REPOSITORY="$REPO" bash "$(dirname "${BASH_SOURCE[0]}")/lib/upsert-pr-comment.sh" "$1" "$READY_MARKER" "$2" \
    && echo "    ✓ upserted status comment on #$1" || echo "    !! failed to upsert status comment on #$1"
}

# Hours since the last auto-ready attempt marker comment on this PR. Empty
# output means "never attempted" (treated as cooldown-elapsed).
last_attempt_age_hours() {  # last_attempt_age_hours <num>
  local n="$1"
  local updated_at
  updated_at="$(gh_retry api "repos/${REPO}/issues/${n}/comments" --paginate \
    --jq "[.[] | select(.body | contains(\"<!-- bot-comment:${READY_MARKER} -->\")) | .updated_at] | last" \
    2>/dev/null | grep -E '^[0-9]{4}-' | tail -n1 || true)"
  [[ -z "$updated_at" || "$updated_at" == "null" ]] && { echo ""; return 0; }
  local updated_epoch
  updated_epoch="$(date -u -d "$updated_at" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; print(int(datetime.datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()))" "$updated_at")"
  echo $(( (now_epoch - updated_epoch) / 3600 ))
}

# Read mutation-critical fields in one API snapshot. Discovery is never
# authorization: every promotion is pinned to this exact head and live labels.
read_state() {  # read_state <num>
  gh_retry pr view "$1" -R "$REPO" \
    --json isDraft,headRefOid,headRefName,labels,mergeable,state \
    --jq '{draft: .isDraft, head: ((.headRefOid // "") | ascii_downcase), branch: .headRefName, labels: [.labels[].name], mergeable: .mergeable, state: .state}'
}

state_is_eligible_draft() {  # state_is_eligible_draft <json> <expected-head> <expected-branch>
  jq -e --arg expected_head "$2" --arg expected_branch "$3" --arg hold_re "$HOLD_LABEL_RE" '
    .state == "OPEN"
    and .draft == true
    and .head == $expected_head
    and .branch == $expected_branch
    and .mergeable == "MERGEABLE"
    and ([.labels[] | select(test($hold_re))] | length == 0)
  ' <<<"$1" >/dev/null
}

undo_ready() {  # undo_ready <num> — fail closed and verify the compensation
  local n="$1"
  if ! gh_retry pr ready "$n" -R "$REPO" --undo >/dev/null 2>&1; then
    echo "    !! compensating draft restore failed for #$n"
    return 1
  fi

  local restored
  if ! restored="$(read_state "$n" 2>/dev/null)"; then
    echo "    !! could not verify compensating draft restore for #$n"
    return 1
  fi
  if jq -e '.state != "OPEN" or .draft == true' <<<"$restored" >/dev/null; then
    echo "    ✓ compensated: restored #$n to draft"
    return 0
  fi

  echo "    !! #$n remained ready after compensating draft restore"
  return 1
}

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local raw_file out_file err_file err delay
  raw_file="$(mktemp)"
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$raw_file"
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --json name,bucket,state,workflow,description,startedAt,completedAt >"$raw_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
        && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
          --classify-auto-ready <"$raw_file" >"$out_file"; then
        cat "$out_file"
        rm -f "$raw_file" "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$raw_file" >/dev/null 2>&1 \
      && node "$(dirname "${BASH_SOURCE[0]}")/lib/pr-check-failures.mjs" \
        --classify-auto-ready <"$raw_file" >"$out_file"; then
      cat "$out_file"
      rm -f "$raw_file" "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$raw_file" "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$raw_file" "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

fetch_head_commit() {  # fetch_head_commit <sha>
  gh_retry api "repos/${REPO}/commits/${1}" --jq '{
    sha: (.sha // "" | ascii_downcase),
    message: (.commit.message // ""),
    parentShas: [(.parents // [])[].sha | ascii_downcase],
    authorName: (.commit.author.name // ""),
    authorEmail: (.commit.author.email // ""),
    authorLogin: (.author.login // ""),
    committerName: (.commit.committer.name // ""),
    committerEmail: (.commit.committer.email // ""),
    committerLogin: (.committer.login // ""),
    verified: (.commit.verification.verified // false)
  }'
}

fetch_fx_run() {  # fetch_fx_run <parent-sha>
  gh_retry api "repos/${REPO}/actions/workflows/rolling-ci-dispatch.yml/runs?head_sha=${1}&status=completed&per_page=10" --jq '
    [.workflow_runs[]
      | select(.conclusion == "success")
      | select((.path // "") | test("rolling-ci-dispatch\\.yml$"))
      | {
          workflowPath: (.path // ""),
          workflowName: (.name // ""),
          conclusion: .conclusion,
          event: (.event // ""),
          actorLogin: (.actor.login // ""),
          headSha: ((.head_sha // "") | ascii_downcase)
        }
    ] | first // null'
}

classify_promotion() {  # classify_promotion <json>
  node "$PROVENANCE_LIB" classify <<<"$1"
}

build_promotion_input() {  # build_promotion_input <author> <title> <branch> <labels-json> <head> [commit-json] [fx-run-json]
  local author="$1" title="$2" branch="$3" labels_json="$4" head="$5"
  local commit_json="${6:-null}"
  local fx_run_json="${7:-null}"
  jq -nc \
    --arg author "$author" \
    --arg title "$title" \
    --arg branch "$branch" \
    --argjson labels "$labels_json" \
    --arg head "$head" \
    --argjson commit "$commit_json" \
    --argjson fxRun "$fx_run_json" \
    '{
      authorLogin: $author,
      title: $title,
      branch: $branch,
      labels: $labels,
      headSha: $head,
      commit: $commit,
      fxRun: $fxRun
    }'
}

resolve_promotion() {  # resolve_promotion <author> <title> <branch> <labels-json> <head>
  local author="$1" title="$2" branch="$3" labels_json="$4" head="$5"
  local input verdict reason commit_json fx_run_json trailer
  input="$(build_promotion_input "$author" "$title" "$branch" "$labels_json" "$head")"
  verdict="$(classify_promotion "$input")"
  reason="$(jq -r '.reason' <<<"$verdict")"
  if [[ "$(jq -r '.eligible' <<<"$verdict")" == "true" || "$reason" != "commit-provenance-required" ]]; then
    echo "$verdict"
    return 0
  fi
  if ! commit_json="$(fetch_head_commit "$head" 2>/dev/null)"; then
    jq -nc '{eligible:false, reason:"commit-unavailable"}'
    return 0
  fi
  trailer="$(jq -r '.message // ""' <<<"$commit_json" | node "$PROVENANCE_LIB" trailer | tr -d '[:space:]')"
  fx_run_json="null"
  if [[ -n "$trailer" ]]; then
    fx_run_json="$(fetch_fx_run "$trailer" 2>/dev/null || echo null)"
    [[ -z "$fx_run_json" ]] && fx_run_json="null"
  fi
  input="$(build_promotion_input "$author" "$title" "$branch" "$labels_json" "$head" "$commit_json" "$fx_run_json")"
  classify_promotion "$input"
}

echo "=== AUTO-READY: scanning for green trusted-bot or FX-repaired drafts ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,headRefOid,author --jq '
  [ .[] | {
    n: .number,
    t: .title,
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    oid: ((.headRefOid // "") | ascii_downcase),
    author: (.author.login // ""),
    L: [.labels[].name]
  } ]')"

# Flip only provenance-authorized green drafts to ready. Branch prefixes never
# authorize; the Node classifier owns bot-author and FX-child admission.
echo "=== FLIP: draft + trusted provenance + mergeable + 0 failing checks → ready ==="
echo "$SNAP" | jq -c --arg hold_re "$HOLD_LABEL_RE" '.[]
  | select(.draft)
  | select(.m == "MERGEABLE")
  | select([.L[] | select(test($hold_re))] | length == 0)' \
  | while read -r pr; do
    READY_ATTEMPTED_FOR=""
    n=$(jq -r '.n' <<<"$pr"); t=$(jq -r '.t' <<<"$pr")
    expected_head=$(jq -r '.oid' <<<"$pr")
    expected_branch=$(jq -r '.head' <<<"$pr")
    author_login=$(jq -r '.author' <<<"$pr")
    labels_json=$(jq -c '.L' <<<"$pr")
    echo "  #$n  ${t:0:48}"

    snapshot_verdict="$(resolve_promotion "$author_login" "$t" "$expected_branch" "$labels_json" "$expected_head")"
    if [[ "$(jq -r '.eligible' <<<"$snapshot_verdict")" != "true" ]]; then
      echo "    ~ provenance $(jq -r '.reason' <<<"$snapshot_verdict"); leaving draft"
      continue
    fi

    # Idempotency guard (#13342): at most one attempt per PR per cooldown window.
    attempt_age_h="$(last_attempt_age_hours "$n")"
    if [[ -n "$attempt_age_h" && "$attempt_age_h" -lt "$ATTEMPT_COOLDOWN_HOURS" ]]; then
      echo "    ~ last attempt ${attempt_age_h}h ago (< ${ATTEMPT_COOLDOWN_HOURS}h cooldown); skipping"
      continue
    fi

    # The list snapshot is discovery only. Re-read the exact head, draft bit,
    # mergeability, and live labels before consulting checks.
    if ! before="$(read_state "$n" 2>/dev/null)"; then
      echo "    ~ could not read live PR state; leaving draft"
      continue
    fi
    if ! state_is_eligible_draft "$before" "$expected_head" "$expected_branch"; then
      echo "    ~ live state no longer matches the eligible draft snapshot; leaving draft"
      continue
    fi
    live_labels="$(jq -c '.labels' <<<"$before")"
    live_verdict="$(resolve_promotion "$author_login" "$t" "$expected_branch" "$live_labels" "$expected_head")"
    if [[ "$(jq -r '.eligible' <<<"$live_verdict")" != "true" ]]; then
      echo "    ~ live provenance $(jq -r '.reason' <<<"$live_verdict"); leaving draft"
      continue
    fi

    fail="$(check_failures_for_pr "$n")"
    if [[ "$(jq 'length' <<<"$fail")" -ne 0 ]]; then
      echo "    ~ required checks are not exact-head green: $(jq -r 'join(", ")' <<<"$fail")"
      continue
    fi

    # Checks, labels, and head provenance can change while the API call above
    # is in flight. This second snapshot is the actual mutation precondition.
    if ! before_mutation="$(read_state "$n" 2>/dev/null)"; then
      echo "    ~ could not re-read live PR state before mutation; leaving draft"
      continue
    fi
    if ! state_is_eligible_draft "$before_mutation" "$expected_head" "$expected_branch"; then
      echo "    ~ head, labels, or draft state changed before mutation; leaving draft"
      continue
    fi
    mutation_labels="$(jq -c '.labels' <<<"$before_mutation")"
    mutation_verdict="$(resolve_promotion "$author_login" "$t" "$expected_branch" "$mutation_labels" "$expected_head")"
    if [[ "$(jq -r '.eligible' <<<"$mutation_verdict")" != "true" ]]; then
      echo "    ~ provenance changed before mutation ($(jq -r '.reason' <<<"$mutation_verdict")); leaving draft"
      continue
    fi

    if ! mark_ready "$n"; then
      upsert_status_comment "$n" "⚠️ Auto-ready: all required checks are passing, but marking this PR ready for review **failed** (likely a token-permission gap — see #13122). A human needs to flip it to ready. Will retry in ${ATTEMPT_COOLDOWN_HOURS}h. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    [[ "$DRY_RUN" == "1" ]] && continue

    # Verify the exact head and live labels after the mutation. If a hold label
    # or new head raced the promotion, restore draft status immediately so the
    # now-unproven revision cannot be enrolled.
    if ! after="$(read_state "$n" 2>/dev/null)"; then
      undo_ready "$n" || true
      upsert_status_comment "$n" "⚠️ Auto-ready: the ready transition could not be verified, so a compensating draft restore was attempted. Re-run after the current head and labels stabilize. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
      continue
    fi

    head_after="$(jq -r '.head // ""' <<<"$after")"
    branch_after="$(jq -r '.branch // ""' <<<"$after")"
    draft_after="$(jq -r '.draft' <<<"$after")"
    state_after="$(jq -r '.state // "UNKNOWN"' <<<"$after")"
    held_after="$(jq -r --arg hold_re "$HOLD_LABEL_RE" '[.labels[] | select(test($hold_re))] | join(",")' <<<"$after")"

    if [[ "$state_after" == "OPEN" && "$draft_after" == "false" && "$head_after" == "$expected_head" && "$branch_after" == "$expected_branch" && -z "$held_after" ]]; then
      upsert_status_comment "$n" "🤖 Auto-ready: all required checks passing — marked ready for review and enrolling in merge queue. _(verified ready at $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    elif [[ "$state_after" == "OPEN" && "$draft_after" == "false" ]]; then
      undo_ready "$n" || true
      upsert_status_comment "$n" "⚠️ Auto-ready: the PR changed during promotion (head=\`${head_after:0:12}\`, holds=\`${held_after:-none}\`), so it was restored to draft. Re-run checks on the live head before promoting it again. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    else
      upsert_status_comment "$n" "⚠️ Auto-ready: \`gh pr ready\` reported success but the verified state is state=${state_after}, draft=${draft_after}. No queue enrollment was claimed. _(last attempt: $(date -u +%Y-%m-%dT%H:%M:%SZ))_"
    fi
  done

echo "=== done (DRY_RUN=$DRY_RUN) ==="
