#!/usr/bin/env bash
#
# Optional Clerk setup for AI agents.
#
# This intentionally lives outside scripts/setup.sh. Human/dev bootstrap should
# not mutate agent instruction state, and missing Clerk CLI auth must not block
# repo setup.
set -euo pipefail

if ! command -v clerk >/dev/null 2>&1; then
  echo "Clerk CLI not found; skipping agent Clerk setup." >&2
  exit 0
fi

if ! clerk --version >&2; then
  echo "Unable to read Clerk CLI version; skipping agent Clerk setup." >&2
  exit 0
fi

if ! clerk skill install --help >/dev/null 2>&1; then
  echo "Clerk CLI does not expose 'skill install'; skipping agent Clerk setup." >&2
  exit 0
fi

if ! clerk skill install -y --pm pnpm >&2; then
  echo "Clerk agent skill install failed; continuing without Clerk agent setup." >&2
  exit 0
fi
