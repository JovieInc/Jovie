#!/usr/bin/env bash
# Auto-Fix Lint on Agent Drafts
#
# Finds agent-owned draft PRs with a failing Lint/Biome check, checks out the
# PR head, runs `pnpm biome check --write .` on changed files, and pushes the
# mechanical fixes back. If typecheck fails (semantic error), it skips and
# comments instead.
#
# Only fires on agent branches. Human PRs are left alone.
#
# Env:
#   DRY_RUN=1   classify and print only; fix nothing
set -euo pipefail

# shellcheck source=./scripts/lib/gh-retry.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/gh-retry.sh"

REPO="${REPO:-JovieInc/Jovie}"
DRY_RUN="${DRY_RUN:-0}"
AGENT_RE='^(tim/|codex/|agent/|claude/|linear/|dependabot/)'

check_failures_for_pr() {  # check_failures_for_pr <num>
  local n="$1"
  local attempts="${GH_RETRY_ATTEMPTS:-5}"
  local base_delay="${GH_RETRY_BASE_DELAY:-2}"
  local max_delay="${GH_RETRY_MAX_DELAY:-30}"
  local attempt=1
  local out_file err_file err delay
  out_file="$(mktemp)"
  err_file="$(mktemp)"

  # TERMINAL failures only — same filter as drain-pr-queue.sh
  local jq_filter='[
    .[]
    | select(
        ((.bucket // "") | test("^fail$"; "i"))
        or ((.state // "") | test("^(FAILURE|ERROR|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$"; "i"))
      )
    | select(((.name // "") | test("advisory|Preview Deploy|Slop Gate"; "i")) | not)
    | (.name // .workflow // .description // "unnamed check")
  ]'

  while [[ "$attempt" -le "$attempts" ]]; do
    : >"$out_file"
    : >"$err_file"
    if gh pr checks "$n" -R "$REPO" --required --json name,bucket,state,workflow,description --jq "$jq_filter" >"$out_file" 2>"$err_file"; then
      if jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
        cat "$out_file"
        rm -f "$out_file" "$err_file"
        return 0
      fi
    elif jq -e 'type == "array"' "$out_file" >/dev/null 2>&1; then
      cat "$out_file"
      rm -f "$out_file" "$err_file"
      return 0
    fi

    err="$(<"$err_file")"
    if [[ "$attempt" -eq "$attempts" ]] || ! gh_retry_is_transient_error "$err"; then
      [[ -n "$err" ]] && echo "  !! could not read required checks for #$n: $err" >&2
      jq -cn --arg reason "required check status unavailable" '[$reason]'
      rm -f "$out_file" "$err_file"
      return 0
    fi

    delay=$((base_delay * (2 ** (attempt - 1))))
    [[ "$delay" -gt "$max_delay" ]] && delay="$max_delay"
    echo "  [gh-retry] pr checks #$n attempt $attempt/$attempts failed (transient); retrying in ${delay}s…" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  rm -f "$out_file" "$err_file"
  jq -cn --arg reason "required check status unavailable" '[$reason]'
}

comment() {  # comment <num> <body>
  [[ "$DRY_RUN" == "1" ]] && { echo "    [dry-run] would comment on #$1"; return 0; }
  gh_retry pr comment "$1" -R "$REPO" --body "$2" >/dev/null 2>&1 \
    && echo "    ✓ commented on #$1" || echo "    !! failed to comment on #$1"
}

echo "=== AUTO-FIX LINT: scanning for agent drafts with failing lint ==="

SNAP="$(gh_retry pr list -R "$REPO" --state open --limit 200 \
  --json number,title,isDraft,mergeable,mergeStateStatus,labels,headRefName,headRepositoryOwner,headRepository --jq '
  [ .[] | {
    n: .number,
    t: (.title[0:48]),
    draft: .isDraft,
    m: .mergeable,
    ms: (.mergeStateStatus // "UNKNOWN"),
    head: .headRefName,
    headOwner: (.headRepositoryOwner.login // ""),
    headRepo: (.headRepository.name // ""),
    L: [.labels[].name],
    fail: []
  } ]')"

# Enrich with check failures for agent-owned drafts
ENRICHED="[]"
while IFS= read -r pr; do
  n="$(jq -r '.n' <<<"$pr")"
  fail="[]"
  if jq -e '
    .draft
    and ((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast")) | not)
  ' <<<"$pr" >/dev/null; then
    fail="$(check_failures_for_pr "$n")"
  fi
  ENRICHED="$(jq -c --argjson pr "$pr" --argjson fail "$fail" '. + [$pr + {fail: $fail}]' <<<"$ENRICHED")"
done < <(jq -c '.[]' <<<"$SNAP")
SNAP="$ENRICHED"

# Filter to PRs with a failing lint check
LINT_PR="$(echo "$SNAP" | jq -c '[.[] |
  select(
    .draft
    and ((.head | test("^(tim/|codex/|agent/|claude/|linear/|dependabot/)")))
    and (([.L[]] | any(. == "needs-human" or . == "hold" or . == "gated" or . == "fast")) | not)
    and ([.fail[]] | any(test("(?i)lint|biome")))
  )
]')"

count="$(jq length <<<"$LINT_PR")"
echo "  Found $count agent draft(s) with failing lint"

if [[ "$count" -eq 0 ]]; then
  echo "=== done (nothing to fix) ==="
  exit 0
fi

echo "=== FIX: checkout, biome --write, push ==="

# Create a temp workdir for fix operations
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

while IFS= read -r pr; do
  n=$(jq -r '.n' <<<"$pr")
  t=$(jq -r '.t' <<<"$pr")
  head=$(jq -r '.head' <<<"$pr")
  headOwner=$(jq -r '.headOwner' <<<"$pr")
  headRepo=$(jq -r '.headRepo' <<<"$pr")

  echo "  #$n  $t  [$head]"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "    [dry-run] would checkout and biome --write"
    continue
  fi

  # Clone the PR head into a temp dir
  clone_dir="$WORKDIR/pr-$n"
  mkdir -p "$clone_dir"

  # Determine clone URL — same repo or fork
  if [[ -n "$headOwner" && "$headOwner" != "$(echo "$REPO" | cut -d/ -f1)" ]]; then
    clone_url="https://github.com/$headOwner/$headRepo.git"
  else
    clone_url="https://github.com/$REPO.git"
  fi

  if ! git clone --depth 50 --branch "$head" "$clone_url" "$clone_dir" 2>/dev/null; then
    echo "    !! failed to clone $clone_url branch $head"
    comment "$n" "🤖 Auto-fix failed: could not clone branch \`$head\`. Manual fix needed."
    continue
  fi

  cd "$clone_dir"

  # Setup pnpm and install
  if ! command -v pnpm >/dev/null 2>&1; then
    npm install -g pnpm@latest >/dev/null 2>&1
  fi

  if ! pnpm install --frozen-lockfile >/dev/null 2>&1; then
    echo "    !! pnpm install failed"
    comment "$n" "🤖 Auto-fix failed: dependency install error. Manual fix needed."
    continue
  fi

  # Run biome check --write on the repo
  if pnpm biome check --write . 2>/dev/null; then
    # Check if there are changes
    if git diff --cached --quiet && git diff --quiet; then
      echo "    no biome changes to commit"
      continue
    fi

    # Stage and commit
    git add -A
    git -c user.name="jovie-bot" -c user.email="bot@jovie.com" \
      commit -m "chore(ci): auto-fix biome lint failures"

    # Push back to the PR branch
    if git push origin "$head" 2>/dev/null; then
      echo "    ✓ pushed biome fixes to $head"
      comment "$n" "🤖 Auto-fixed biome lint violations. If typecheck still fails, manual fix needed."
    else
      echo "    !! push failed"
      comment "$n" "🤖 Auto-fix failed: could not push to \`$head\`. Manual fix needed."
    fi
  else
    echo "    !! biome --write returned non-zero (possible semantic error)"
    comment "$n" "🤖 Auto-fix skipped: biome reported non-fixable issues. Manual fix needed."
  fi

  cd - >/dev/null
done < <(jq -c '.[]' <<<"$LINT_PR")

echo "=== done (DRY_RUN=$DRY_RUN) ==="
