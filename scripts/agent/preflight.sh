#!/usr/bin/env bash
# scripts/agent/preflight.sh — thin wrapper around preflight.mjs (JOV-4183)
# Kept so skills can call `bash scripts/agent/preflight.sh` without Node path guessing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$ROOT/scripts/agent/preflight.mjs" "$@"
