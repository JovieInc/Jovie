#!/usr/bin/env bash
# Run gitleaks + trufflehog for defense-in-depth secret scanning (JOV-3215).
# Modes:
#   pre-commit          Scan staged changes (fast, for git hooks)
#   ci-pr [base-ref]    Scan commits since base ref (PR CI)
#   full                Scan full git history
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-pre-commit}"
BASE_REF="${2:-origin/main}"
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.21.2}"
TRUFFLEHOG_VERSION="${TRUFFLEHOG_VERSION:-3.95.5}"
EXCLUDE_PATHS="$REPO_ROOT/.trufflehog-exclude.txt"

ensure_gitleaks() {
  if [[ -n "${GITLEAKS_BIN:-}" ]]; then
    return
  fi
  if command -v gitleaks >/dev/null 2>&1; then
    GITLEAKS_BIN="$(command -v gitleaks)"
    return
  fi

  local os arch cache_dir tarball
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x64" ;;
    aarch64 | arm64) arch="arm64" ;;
  esac
  cache_dir="${TMPDIR:-/tmp}/gitleaks-${GITLEAKS_VERSION}"
  mkdir -p "$cache_dir"
  tarball="gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz"
  if [[ ! -x "$cache_dir/gitleaks" ]]; then
    curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${tarball}" \
      | tar -xz -C "$cache_dir" gitleaks
    chmod +x "$cache_dir/gitleaks"
  fi
  GITLEAKS_BIN="$cache_dir/gitleaks"
}

ensure_trufflehog() {
  if [[ -n "${TRUFFLEHOG_BIN:-}" ]]; then
    return
  fi
  if command -v trufflehog >/dev/null 2>&1; then
    TRUFFLEHOG_BIN="$(command -v trufflehog)"
    return
  fi

  local os arch cache_dir tarball
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
  esac
  cache_dir="${TMPDIR:-/tmp}/trufflehog-${TRUFFLEHOG_VERSION}"
  mkdir -p "$cache_dir"
  tarball="trufflehog_${TRUFFLEHOG_VERSION}_${os}_${arch}.tar.gz"
  if [[ ! -x "$cache_dir/trufflehog" ]]; then
    curl -sSfL "https://github.com/trufflesecurity/trufflehog/releases/download/v${TRUFFLEHOG_VERSION}/${tarball}" \
      | tar -xz -C "$cache_dir" trufflehog
    chmod +x "$cache_dir/trufflehog"
  fi
  TRUFFLEHOG_BIN="$cache_dir/trufflehog"
}

trufflehog_exclude_args() {
  # --exclude-globs, not --exclude-paths: trufflehog git mode does not honor
  # --exclude-paths entries (verified 2026-07-20 with 3.95.9 — findings in
  # excluded files still fired), while comma-separated globs suppress in
  # both git and filesystem modes. Entries in EXCLUDE_PATHS are plain
  # repo-relative paths, which are valid globs as-is; comment lines and
  # blanks are dropped when building the list.
  if [[ -f "$EXCLUDE_PATHS" ]]; then
    local globs
    globs="$(grep -vE '^\s*(#|$)' "$EXCLUDE_PATHS" | paste -sd, -)"
    if [[ -n "$globs" ]]; then
      printf '%s' "--exclude-globs=$globs"
    fi
  fi
}

run_gitleaks_pre_commit() {
  echo "Running gitleaks protect on staged changes..."
  "$GITLEAKS_BIN" protect \
    --staged \
    --config "$REPO_ROOT/.gitleaks.toml" \
    --verbose
}

run_gitleaks_ci_pr() {
  echo "Running gitleaks detect on ${BASE_REF}..HEAD..."
  "$GITLEAKS_BIN" detect \
    --source "$REPO_ROOT" \
    --config "$REPO_ROOT/.gitleaks.toml" \
    --log-opts="${BASE_REF}..HEAD" \
    --verbose
}

run_gitleaks_full() {
  echo "Running gitleaks detect on full git history..."
  "$GITLEAKS_BIN" detect \
    --source "$REPO_ROOT" \
    --config "$REPO_ROOT/.gitleaks.toml" \
    --verbose
}

is_trufflehog_excluded() {
  local file="$1"
  if [[ ! -f "$EXCLUDE_PATHS" ]]; then
    return 1
  fi
  while IFS= read -r excluded || [[ -n "$excluded" ]]; do
    [[ -z "$excluded" || "$excluded" == \#* ]] && continue
    if [[ "$file" == "$excluded" || "${file#./}" == "$excluded" ]]; then
      return 0
    fi
  done < "$EXCLUDE_PATHS"
  return 1
}

run_trufflehog_pre_commit() {
  local -a staged_files=()
  local file

  while IFS= read -r file; do
    if [[ -n "$file" && -f "$file" ]] && ! is_trufflehog_excluded "$file"; then
      staged_files+=("$file")
    fi
  done < <(git diff --cached --name-only --diff-filter=ACMR)

  if [[ ${#staged_files[@]} -eq 0 ]]; then
    echo "No staged files for trufflehog filesystem scan."
    return
  fi

  echo "Running trufflehog filesystem on ${#staged_files[@]} staged file(s)..."
  # --exclude-globs is git-mode-only (verified on 3.95.5 and 3.95.9:
  # filesystem mode rejects the flag). The staged list above was already
  # filtered through is_trufflehog_excluded, which honors the same file.
  # shellcheck disable=SC2048,SC2086
  "$TRUFFLEHOG_BIN" filesystem \
    ${staged_files[@]} \
    --no-verification \
    --fail
}

# trufflehog `git file://…` internally clones the local repo. On persistent
# CI runners the workdir can be a partial (promisor) clone whose object store
# stops serving local clones — upload-pack dies with "could not fetch <sha>
# from promisor remote" before any scanning happens (#13994). That signature
# is infrastructure corruption, never a secret finding, so it is safe to
# repair the object store and retry once. Findings failures never match the
# signature and propagate unchanged.
CLONE_CORRUPTION_SIGNATURE='promisor remote|repository corruption on the remote side|failed to clone file Git repo'

repair_partial_clone() {
  echo "Partial-clone corruption detected — repairing workdir (#13994)..."
  git config --unset-all remote.origin.promisor || true
  git config --unset-all remote.origin.partialclonefilter || true
  # trufflehog's internal `git clone file://…` makes upload-pack serve every
  # advertised ref, and persistent runner workdirs accumulate stale refs whose
  # objects were promisor-elided long ago. Drop every ref the diff scan does
  # not need (detached HEAD survives — its objects arrived with this job's own
  # checkout fetch), then transfer a complete pack for the scan base.
  local base_branch keep_ref ref
  base_branch="${BASE_REF#origin/}"
  keep_ref="refs/remotes/origin/${base_branch}"
  # Ref pruning is CI-only (persistent runner workdirs); never touch a
  # developer clone's refs. refs/heads is left alone everywhere.
  if [[ -n "${CI:-}" ]]; then
    while IFS= read -r ref; do
      [[ "$ref" == "$keep_ref" ]] && continue
      git update-ref -d "$ref" 2>/dev/null || true
    done < <(git for-each-ref --format='%(refname)' refs/remotes refs/tags refs/replace refs/prefetch)
  fi
  # Refetch must cover the scan head's parent histories too: incremental
  # checkouts on a blob:none workdir can leave older objects promisor-elided,
  # so repairing only the base still fails on the next unreadable object.
  local base_sha current_ref current_sha repair_base_ref repair_current_ref
  base_sha="${SECRET_SCAN_REMOTE_BASE_SHA:-}"
  current_ref="${SECRET_SCAN_REMOTE_CURRENT_REF:-}"
  current_sha="${SECRET_SCAN_REMOTE_CURRENT_SHA:-}"
  repair_base_ref="refs/secret-scan/repair-base"
  repair_current_ref="refs/secret-scan/repair-current"

  if [[ -n "$base_sha" && -n "$current_ref" && -n "$current_sha" ]]; then
    if [[ ! "$base_sha" =~ ^[0-9a-f]{40}$ ]] \
      || [[ "$base_sha" == "0000000000000000000000000000000000000000" ]] \
      || [[ ! "$current_sha" =~ ^[0-9a-f]{40}$ ]] \
      || [[ "$current_sha" == "0000000000000000000000000000000000000000" ]] \
      || [[ "$current_ref" != refs/* ]] \
      || ! git check-ref-format "$current_ref"; then
      echo "::error title=Secret scan checkout repair failed::Exact remote repair coordinates are invalid." >&2
      return 1
    fi
    # PR scan HEAD may be a local-only commit that preserves GitHub's checked-
    # out merge tree. Repair its parent histories from the stable current ref
    # plus exact base; never ask origin for the local synthetic commit.
    git fetch --refetch origin \
      "+${current_ref}:${repair_current_ref}" \
      "+${base_sha}:${repair_base_ref}" \
      || git -c fetch.negotiationAlgorithm=noop fetch origin \
        "+${current_ref}:${repair_current_ref}" \
        "+${base_sha}:${repair_base_ref}" \
      || return $?
    [[ "$(git rev-parse "$repair_current_ref")" == "$current_sha" ]] \
      || return 1
    [[ "$(git rev-parse "$repair_base_ref")" == "$base_sha" ]] \
      || return 1
    return 0
  fi
  if [[ -n "$base_sha$current_ref$current_sha" ]]; then
    echo "::error title=Secret scan checkout repair failed::Remote repair coordinates must be provided together." >&2
    return 1
  fi

  local head_sha
  head_sha="$(git rev-parse HEAD)"
  # --refetch needs git >= 2.36; older runner images fall back to a noop
  # negotiation fetch, which also transfers a complete unfiltered pack.
  git fetch --refetch origin \
    "+refs/heads/${base_branch}:${keep_ref}" "$head_sha" \
    || git -c fetch.negotiationAlgorithm=noop fetch origin \
      "+refs/heads/${base_branch}:${keep_ref}" "$head_sha"
}

run_trufflehog_git() {
  local log status
  log="$(mktemp)"
  status=0
  # shellcheck disable=SC2046
  "$TRUFFLEHOG_BIN" git file://"$REPO_ROOT" "$@" $(trufflehog_exclude_args) \
    >"$log" 2>&1 || status=$?
  if [[ $status -ne 0 ]] && grep -qiE "$CLONE_CORRUPTION_SIGNATURE" "$log"; then
    echo "::error title=Secret scan checkout corruption::TruffleHog could not read the runner's Git object store; repairing the checkout and retrying once." >&2
    repair_partial_clone || {
      status=$?
      echo "::error title=Secret scan checkout repair failed::Unable to fetch a complete Git object store; secret scanning did not run." >&2
      rm -f "$log"
      return "$status"
    }
    status=0
    # The retry's output replaces the corrupted attempt wholesale so range
    # classification downstream parses exactly one final scan result.
    : >"$log"
    # shellcheck disable=SC2046
    "$TRUFFLEHOG_BIN" git file://"$REPO_ROOT" "$@" $(trufflehog_exclude_args) \
      >"$log" 2>&1 || status=$?
  fi
  cat "$log"
  rm -f "$log"
  return $status
}

# trufflehog's git --since-commit is not a rev-list exclusion: it walks
# `git log --patch --full-history <head> -- . ':(exclude)<glob>'...` and stops
# at the first walked commit equal to the base (verified against the 3.95.9
# source and the exact CI binary, JOV-4333). A base commit that only touches
# excluded paths never appears in that path-limited log, so the walk widens
# into history below the base and attributes pre-existing main content to this
# event. Git's own rev-list is the exact range contract: findings outside
# <base>..HEAD are classified loudly and excluded from this event's verdict;
# findings inside it fail the scan.
classify_trufflehog_ci_pr_findings() {
  local base_commit="$1" scan_log="$2" status="$3"
  local finding_commits range_file inside outside

  # trufflehog can abort its own scan preparation (for example go-git
  # merge-base resolution over a shallow-clone boundary) yet still exit 0
  # with zero findings. That is a scan that never ran; never accept it.
  if grep -q 'encountered errors during scan' "$scan_log"; then
    echo "::error title=Secret scan incomplete::trufflehog aborted its git scan before completion; failing closed instead of accepting an empty result." >&2
    return 1
  fi

  finding_commits="$(
    grep -oE '^Commit: [0-9a-f]{40}$' "$scan_log" | awk '{print $2}' | sort -u
  )"
  if [[ -z "$finding_commits" ]]; then
    return "$status"
  fi
  if [[ "$status" -ne 0 && "$status" -ne 183 ]]; then
    return "$status"
  fi

  range_file="$(mktemp)"
  # NB: this function runs with set -e suspended (checked `||` call site), so
  # every fallible command needs an explicit guard.
  if ! git rev-list "${base_commit}..HEAD" >"$range_file"; then
    rm -f "$range_file"
    echo "::error title=Secret scan range check failed::could not compute the exact ${base_commit}..HEAD range for finding classification; failing closed." >&2
    return 1
  fi
  inside="$(grep -xF -f "$range_file" <<<"$finding_commits" || true)"
  outside="$(grep -vxF -f "$range_file" <<<"$finding_commits" || true)"
  rm -f "$range_file"
  if [[ -n "$outside" ]]; then
    echo "::warning title=Secret scan range widened below exact base::trufflehog walked past the exact scan base and reported pre-existing content in $(wc -l <<<"$outside" | tr -d ' ') out-of-range commit(s): $(paste -sd, - <<<"$outside"). These commits are not in ${base_commit}..HEAD and cannot fail this event; track them on main." >&2
  fi
  if [[ -n "$inside" ]]; then
    return 183
  fi
  return 0
}

run_trufflehog_ci_pr() {
  local base_commit scan_log status classify_status
  base_commit="$(git rev-parse "$BASE_REF")"

  echo "Running trufflehog git since ${BASE_REF} (${base_commit})..."
  scan_log="$(mktemp)"
  status=0
  run_trufflehog_git \
    --since-commit "$base_commit" \
    --branch HEAD \
    --no-verification \
    --fail >"$scan_log" 2>&1 || status=$?
  cat "$scan_log"
  # The classifier owns the final verdict: trufflehog's raw exit status
  # reflects findings anywhere its walk reached, not necessarily this event's
  # exact range.
  classify_status=0
  classify_trufflehog_ci_pr_findings "$base_commit" "$scan_log" "$status" \
    || classify_status=$?
  rm -f "$scan_log"
  return "$classify_status"
}

run_trufflehog_full() {
  echo "Running trufflehog git on full history..."
  run_trufflehog_git \
    --no-verification \
    --fail
}

usage() {
  echo "Usage: $0 {pre-commit|ci-pr|ci-pr-trufflehog|full|full-trufflehog} [base-ref]" >&2
  exit 1
}

ensure_gitleaks
ensure_trufflehog

case "$MODE" in
  pre-commit)
    run_gitleaks_pre_commit
    run_trufflehog_pre_commit
    ;;
  ci-pr)
    run_gitleaks_ci_pr
    run_trufflehog_ci_pr
    ;;
  ci-pr-trufflehog)
    run_trufflehog_ci_pr
    ;;
  full)
    run_gitleaks_full
    run_trufflehog_full
    ;;
  full-trufflehog)
    run_trufflehog_full
    ;;
  *)
    usage
    ;;
esac

echo "PASS: secret scan (${MODE}) completed with no findings"
