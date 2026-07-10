#!/usr/bin/env bash
# Convenience wrapper — CI runs node:test directly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec node --test scripts/agent/preflight.test.mjs
