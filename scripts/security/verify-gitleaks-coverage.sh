#!/usr/bin/env bash
# Verify gitleaks loads the default ruleset plus the Neon + Clerk custom
# rules, and that *.backup files are never allowlisted (JOV-8895 / JOV-2940 /
# JOV-3215). The default-rules fixture proves AWS, GitHub token, Stripe,
# Slack, private-key and OpenAI shapes all fire.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

GITLEAKS_BIN="${GITLEAKS_BIN:-}"
if [[ -z "$GITLEAKS_BIN" ]]; then
  if command -v gitleaks >/dev/null 2>&1; then
    GITLEAKS_BIN="$(command -v gitleaks)"
  else
    # CI / local fallback: download release binary
    VERSION="${GITLEAKS_VERSION:-8.21.2}"
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m)"
    case "$ARCH" in
      x86_64) ARCH="x64" ;;
      aarch64 | arm64) ARCH="arm64" ;;
    esac
    CACHE_DIR="${TMPDIR:-/tmp}/gitleaks-${VERSION}"
    mkdir -p "$CACHE_DIR"
    TARBALL="gitleaks_${VERSION}_${OS}_${ARCH}.tar.gz"
    if [[ ! -x "$CACHE_DIR/gitleaks" ]]; then
      curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${TARBALL}" \
        | tar -xz -C "$CACHE_DIR" gitleaks
      chmod +x "$CACHE_DIR/gitleaks"
    fi
    GITLEAKS_BIN="$CACHE_DIR/gitleaks"
  fi
fi

run_fixture_scan() {
  local fixture_src="$1"
  local fixture_name="$2"
  # Each argument after the second is a rule id that MUST appear in the
  # output — one miss fails the scan (JOV-8895: prove every expected rule,
  # not just any one of them).
  shift 2
  local -a expected_rules=("$@")
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  cp "$fixture_src" "$tmp_dir/$fixture_name"

  echo "Running gitleaks on intentional fixture $fixture_name (expect leaks found)..."
  set +e
  local output
  output="$("$GITLEAKS_BIN" detect \
    --source "$tmp_dir" \
    --config "$REPO_ROOT/.gitleaks.toml" \
    --no-git \
    --verbose 2>&1)"
  local status=$?
  set -e
  rm -rf "$tmp_dir"

  if [[ $status -eq 0 ]]; then
    echo "FAIL: gitleaks did not detect leaks in fixture file ($fixture_name)" >&2
    echo "$output" >&2
    exit 1
  fi

  local rule
  for rule in "${expected_rules[@]}"; do
    if ! echo "$output" | grep -q "RuleID:      $rule"; then
      echo "FAIL: gitleaks did not report the expected rule '$rule' for $fixture_name" >&2
      echo "$output" >&2
      exit 1
    fi
  done

  echo "PASS: gitleaks detected every expected leak shape in $fixture_name"
}

FIXTURE_SRC="$REPO_ROOT/scripts/security/gitleaks-fixture.txt"
BACKUP_FIXTURE_SRC="$REPO_ROOT/scripts/security/gitleaks-backup-fixture.txt"
DEFAULT_FIXTURE_SRC="$REPO_ROOT/scripts/security/gitleaks-default-fixture.txt"

run_fixture_scan "$FIXTURE_SRC" "leak-fixture.txt" \
  neon-postgres-connection-string clerk-secret-key
run_fixture_scan "$BACKUP_FIXTURE_SRC" "settings.local.json.backup" \
  neon-postgres-connection-string clerk-secret-key

# Default-ruleset shapes (JOV-8895): each rule id must fire on the fixture.
# The OpenAI key shape cannot be committed — push-side secret scanning rejects
# the contiguous marker even for synthetic values (verified 2026-10-25) — so
# the verify script assembles it at runtime into the temp copy.
run_default_fixture_scan() {
  local tmp_dir oai_first oai_second
  tmp_dir="$(mktemp -d)"
  cp "$DEFAULT_FIXTURE_SRC" "$tmp_dir/default-rules-fixture.txt"
  oai_first="FAKEGITLEAKSFIXTURE0"
  oai_second="FAKEGITLEAKSFIXTURE0"
  printf 'OPENAI_API_KEY=sk-%sT3BlbkFJ%s # trufflehog:ignore\n' \
    "$oai_first" "$oai_second" >>"$tmp_dir/default-rules-fixture.txt"
  run_fixture_scan "$tmp_dir/default-rules-fixture.txt" "default-rules-fixture.txt" \
    aws-access-token github-pat stripe-access-token slack-bot-token \
    private-key openai-api-key
  rm -rf "$tmp_dir"
}

run_default_fixture_scan

echo "PASS: gitleaks coverage verification complete"