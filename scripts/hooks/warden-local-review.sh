#!/usr/bin/env bash
# Local Sentry Warden AI review (advisory gate-ladder rung).
#
# Warden is LOCAL-ONLY in this repo: it must never be wired as a PR status
# check, branch-protection rule, or merge gate. If the CLI or its model
# credentials are missing, warn and let the commit/push proceed — a missing
# local tool must never be the only way to merge.
#
#   staged -> `warden --staged`  (pre-commit: review the staged diff)
#   branch -> `warden`           (pre-push: review the branch against main)
#
# WARDEN_LOCAL_REVIEW controls behavior: warn (default) reports findings and
# proceeds, off skips the review entirely, strict propagates a non-zero
# Warden exit to the hook. See warden.toml for skills and thresholds.
set -uo pipefail

mode="${1:-}"
case "$mode" in
  staged) label="warden --staged (staged changes)" ;;
  branch) label="warden (branch vs default branch)" ;;
  *)
    echo "[warden] unknown mode '${mode}' (expected staged|branch); skipping local review" >&2
    exit 0
    ;;
esac

if [ -n "${CI:-}" ] || [ "${WARDEN_LOCAL_REVIEW:-warn}" = "off" ]; then
  exit 0
fi

if ! command -v warden >/dev/null 2>&1; then
  echo "[warden] warden CLI not installed; skipping local AI review (advisory)." >&2
  echo "[warden] Install with: pnpm add -g @sentry/warden — then set WARDEN_MODEL and the matching provider key locally." >&2
  exit 0
fi

echo "[warden] local AI review: ${label}"
# </dev/null: in pre-push, git holds the receive-pack connection open across
# the hook; never let a reviewer read or hold this hook's stdin.
if [ "$mode" = "staged" ]; then
  warden --staged </dev/null
else
  warden </dev/null
fi
status=$?

case "$status" in
  0) : ;;
  130)
    echo "[warden] review interrupted; continuing (advisory)" >&2
    ;;
  *)
    if [ "${WARDEN_LOCAL_REVIEW:-warn}" = "strict" ]; then
      echo "[warden] findings reported (exit ${status}); WARDEN_LOCAL_REVIEW=strict is failing this hook" >&2
      exit "$status"
    fi
    echo "[warden] findings reported above (exit ${status}). Address or discard them, but this commit/push is NOT blocked:" >&2
    echo "[warden] Warden is advisory in this repo and must never become a merge gate." >&2
    ;;
esac
exit 0
