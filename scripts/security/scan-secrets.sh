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
  if [[ -f "$EXCLUDE_PATHS" ]]; then
    printf '%s' "--exclude-paths=$EXCLUDE_PATHS"
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
  # shellcheck disable=SC2048,SC2086
  "$TRUFFLEHOG_BIN" filesystem \
    ${staged_files[@]} \
    --no-verification \
    --fail \
    $(trufflehog_exclude_args)
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
  echo "Partial-clone corruption detected — refetching full objects (#13994)..."
  git config --unset-all remote.origin.promisor || true
  git config --unset-all remote.origin.partialclonefilter || true
  git fetch --refetch origin '+refs/heads/*:refs/remotes/origin/*'
}

run_trufflehog_git() {
  local log status
  log="$(mktemp)"
  status=0
  # shellcheck disable=SC2046
  "$TRUFFLEHOG_BIN" git file://"$REPO_ROOT" "$@" $(trufflehog_exclude_args) \
    >"$log" 2>&1 || status=$?
  cat "$log"
  if [[ $status -ne 0 ]] && grep -qiE "$CLONE_CORRUPTION_SIGNATURE" "$log"; then
    repair_partial_clone
    status=0
    # shellcheck disable=SC2046
    "$TRUFFLEHOG_BIN" git file://"$REPO_ROOT" "$@" $(trufflehog_exclude_args) \
      || status=$?
  fi
  rm -f "$log"
  return $status
}

run_trufflehog_ci_pr() {
  local base_commit
  base_commit="$(git rev-parse "$BASE_REF")"

  echo "Running trufflehog git since ${BASE_REF} (${base_commit})..."
  run_trufflehog_git \
    --since-commit "$base_commit" \
    --branch HEAD \
    --no-verification \
    --fail
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