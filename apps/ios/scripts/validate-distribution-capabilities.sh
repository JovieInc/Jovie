#!/usr/bin/env bash
# Fail before gym when Release entitlements request capabilities the
# installed match AppStore profile cannot sign.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
cd "$repo_root"

if ! command -v node >/dev/null 2>&1; then
  echo "::error::node is required for the distribution capability preflight." >&2
  exit 1
fi

exec node "$script_dir/validate-distribution-capabilities.mjs" "$@"
