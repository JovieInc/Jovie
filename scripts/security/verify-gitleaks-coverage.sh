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

echo "PASS: gitleaks coverage verification complete"