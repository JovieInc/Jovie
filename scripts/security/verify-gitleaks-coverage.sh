#!/usr/bin/env bash
# Verify gitleaks detects Neon + Clerk secret shapes (JOV-2940 acceptance criterion).
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
      aarch64|arm64) ARCH="arm64" ;;
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

FIXTURE_SRC="$REPO_ROOT/scripts/security/gitleaks-fixture.txt"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
cp "$FIXTURE_SRC" "$TMP_DIR/leak-fixture.txt"

echo "Running gitleaks on intentional fixture (expect leaks found)..."
set +e
OUTPUT="$("$GITLEAKS_BIN" detect \
  --source "$TMP_DIR" \
  --config "$REPO_ROOT/.gitleaks.toml" \
  --no-git \
  --verbose 2>&1)"
STATUS=$?
set -e

if [[ $STATUS -eq 0 ]]; then
  echo "FAIL: gitleaks did not detect leaks in fixture file" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

if ! echo "$OUTPUT" | grep -q "neon-postgres-connection-string\|clerk-secret-key"; then
  echo "FAIL: gitleaks reported leaks but not via JOV-2940 custom rules" >&2
  echo "$OUTPUT" >&2
  exit 1
fi

echo "PASS: gitleaks detected Neon and Clerk leak shapes in fixture"