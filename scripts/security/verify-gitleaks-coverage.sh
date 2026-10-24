#!/usr/bin/env bash
# Verify gitleaks detects Neon + Clerk leak shapes and *.backup files (JOV-2940 / JOV-3215).
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
  local expected_rules="$3"
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

  if ! echo "$output" | grep -qE "$expected_rules"; then
    echo "FAIL: gitleaks reported leaks but not via expected rules for $fixture_name" >&2
    echo "$output" >&2
    exit 1
  fi

  echo "PASS: gitleaks detected expected leak shapes in $fixture_name"
}

FIXTURE_SRC="$REPO_ROOT/scripts/security/gitleaks-fixture.txt"
BACKUP_FIXTURE_SRC="$REPO_ROOT/scripts/security/gitleaks-backup-fixture.txt"

run_fixture_scan "$FIXTURE_SRC" "leak-fixture.txt" "neon-postgres-connection-string|clerk-secret-key"
run_fixture_scan "$BACKUP_FIXTURE_SRC" "settings.local.json.backup" "neon-postgres-connection-string|clerk-secret-key"

# JOV-8895: [extend] must load gitleaks' DEFAULT ruleset on top of the custom
# rules (Neon, Clerk). The fixture generated below carries shapes ONLY default
# rules detect; assert every expected default rule id actually fires. Without
# 'useDefault = true' under [extend], none of them do.
#
# The fixture is generated at RUNTIME, and detector-bait tokens are assembled
# from split literals: GitHub push protection, gitleaks, and trufflehog all
# scan committed bytes, and none of these values are real — splitting them
# keeps the committed tree free of contiguous token-shaped strings while the
# runtime temp fixture still matches every default rule. Do not join them.

build_default_rules_fixture() {
  local dest="$1"
  {
    echo "# Intentional leak-shaped strings for default-ruleset coverage (JOV-8895)."
    echo "# Generated at runtime by verify-gitleaks-coverage.sh; every value is fake."
    echo "# Tokens below are assembled from split literals so the committed bytes"
    echo "# never contain a contiguous detector-matching string (GitHub push"
    echo "# protection, gitleaks, and trufflehog all scan committed content)."
    echo "# Do NOT join them into one literal."
    echo "AWS_ACCESS_KEY_ID=AKIA""4TQ7XN2MR8LZB6WE"
    echo "GITHUB_TOKEN=ghp_""Yq3vN7xKm2Rt9Wd5Pz8Qs4Lb1Xc6Vf0Jh3Gt"
    echo "STRIPE_API_KEY=sk_live_""9x4Qm2Rt7Wd5Pz8Qb3Lc"
    echo "SLACK_BOT_TOKEN=xox""b-2491637502-8819273645-Nq3vN7xKm2Rt9Wd5"
    echo "OPENAI_API_KEY=sk-""4tQ7Xn2Mr8LzB6wEp9Yc""T3BlbkFJ""9bWm4Rt7Xn2Qz8Lc5VfH"
    echo "-----BEGIN RSA PRIVATE ""KEY-----"
    echo "MIICXAIBAAKBgQC0Z3VS5JJcds3xfnAyGHy3XffFvAzG8zJz3H0pQw9XeF9uY0MK"
    echo "b2RqN0cS0mV8tT4xQpW6zH2fKd9Lb3Vc5Xe7Yg1Ai3Ck5Em7Go9Iq1Ms3Ou5Ww7Y"
    echo "yQIDAQABAoGBAN6tQ2W8xZc4Vf6Hb8Jd0Lg2Ni4Pk6Rm8To0Uv2Xw4Zy6Ba8Cc0Ee"
    echo "-----END RSA PRIVATE ""KEY-----"
  } >"$dest"
}

run_fixture_scan_rules() {
  local fixture_name="$1"
  shift
  local tmp_dir rule output status
  tmp_dir="$(mktemp -d)"
  build_default_rules_fixture "$tmp_dir/$fixture_name"

  echo "Running gitleaks on intentional fixture $fixture_name (expect every listed rule to fire)..."
  set +e
  output="$($GITLEAKS_BIN detect \
    --source "$tmp_dir" \
    --config "$REPO_ROOT/.gitleaks.toml" \
    --no-git \
    --verbose 2>&1)"
  status=$?
  set -e
  rm -rf "$tmp_dir"

  if [[ $status -eq 0 ]]; then
    echo "FAIL: gitleaks did not detect leaks in fixture file ($fixture_name)" >&2
    echo "$output" >&2
    exit 1
  fi

  for rule in "$@"; do
    if ! echo "$output" | grep -qE "$rule"; then
      echo "FAIL: gitleaks reported leaks but not via rule '$rule' for $fixture_name" >&2
      echo "Hint: does .gitleaks.toml set useDefault = true under [extend]?" >&2
      echo "$output" >&2
      exit 1
    fi
  done

  echo "PASS: gitleaks detected every expected rule in $fixture_name"
}

run_fixture_scan_rules "default-rules-fixture.txt" \
  "aws-access-token" \
  "github-pat" \
  "stripe-access-token" \
  "slack-bot-token" \
  "openai-api-key" \
  "private-key"

echo "PASS: gitleaks coverage verification complete"