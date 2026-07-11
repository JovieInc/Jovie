#!/usr/bin/env bash
set -euo pipefail

# Non-destructive Codex readiness check for Gem. It never edits, commits, pushes,
# opens a PR, or prints environment/auth contents.
BIN="${HERMES_CODEX_SHIPPER_CODEX_BIN:-/home/timwhite/.npm-global/bin/codex}"
if [[ ! -x "$BIN" ]]; then
  printf '{"schema":"jovie.codex-smoke/v1","status":"unavailable","reason":"executable_missing","path":"%s"}\n' "$BIN"
  exit 2
fi
VERSION="$($BIN --version 2>/dev/null | awk 'NR == 1 { print; exit }')" || {
  printf '{"schema":"jovie.codex-smoke/v1","status":"unavailable","reason":"executable_failed","path":"%s"}\n' "$BIN"
  exit 2
}
# --help is intentionally used as the auth-independent executable smoke.
# A real read-only exec is opt-in because it consumes provider quota.
if [[ "${HERMES_CODEX_AUTH_SMOKE:-0}" == "1" ]]; then
  OUTPUT="$($BIN exec --sandbox read-only --ask-for-approval never 'Respond with exactly CODEX_ESCALATION_SMOKE. Do not inspect or modify files.' 2>&1)"
  if [[ "$OUTPUT" != *CODEX_ESCALATION_SMOKE* ]]; then
    printf '{"schema":"jovie.codex-smoke/v1","status":"auth_failed","version":"%s"}\n' "$VERSION"
    exit 3
  fi
  printf '{"schema":"jovie.codex-smoke/v1","status":"ready","auth":"verified","version":"%s"}\n' "$VERSION"
else
  "$BIN" exec --help >/dev/null
  printf '{"schema":"jovie.codex-smoke/v1","status":"executable_verified","auth":"not_checked","version":"%s","next":"Set HERMES_CODEX_AUTH_SMOKE=1 for a read-only provider smoke."}\n' "$VERSION"
fi
