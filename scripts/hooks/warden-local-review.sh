#!/usr/bin/env bash
# Local Sentry Warden AI review (advisory gate-ladder rung).
#
# Warden is LOCAL-ONLY in this repo: it must never be wired as a PR status
# check, branch-protection rule, or merge gate. If the CLI or its model
# credentials are missing, warn and let the commit/push proceed — a missing
# local tool must never be the only way to merge.
#
#   staged -> `warden --staged`  (pre-commit: review the staged diff)
#   branch -> `warden`           (pre-push: review the branch against main;
#                                 off unless WARDEN_PUSH_REVIEW=on, because the
#                                 same lines were already reviewed per commit)
#
# Model: Claude Haiku 5.5 (warden.toml pins agent + auxiliary), paid by the
# Anthropic API credits that come with the Claude plan. The key lives only in
# your environment as WARDEN_ANTHROPIC_API_KEY (never ANTHROPIC_API_KEY, which
# Claude Code itself would pick up). Haiku 5.5 is newer than Warden's built-in
# pi catalog, so this script hands pi scripts/hooks/warden-pi-models.json.
#
# A free first pass skips ordinary docs, lockfiles and assets; executable,
# instruction, configuration and test changes are conservatively reviewed.
#
# Knobs:
#   WARDEN_LOCAL_REVIEW    warn (default) | off | strict (propagate reviewer errors)
#   WARDEN_PUSH_REVIEW     off (default) | on  (also review the branch pre-push)
#   WARDEN_TRIAGE          on (default)  | off (review every diff)
#   WARDEN_TIMEOUT_SECONDS 180 (default; 0 disables)
set -uo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# CI never runs or records a local AI review. Node owns the portable timeout.
if [ -n "${CI:-}" ]; then exit 0; fi
if ! command -v node >/dev/null 2>&1; then
  echo "[warden] Node unavailable; local AI review unavailable (advisory)." >&2
  exit 0
fi
exec node "${script_dir}/warden-local-review.mjs" "${1:-}"
