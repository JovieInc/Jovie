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
# A free first pass (scripts/hooks/warden-triage.mjs) skips docs-, lockfile-,
# asset-, test-only and tiny diffs; risky paths are always reviewed.
#
# Knobs:
#   WARDEN_LOCAL_REVIEW    warn (default) | off | strict (propagate findings exit)
#   WARDEN_PUSH_REVIEW     off (default) | on  (also review the branch pre-push)
#   WARDEN_TRIAGE          on (default)  | off (review every diff)
#   WARDEN_TIMEOUT_SECONDS 180 (default; 0 disables)
set -uo pipefail

WARDEN_VERSION="0.54.0"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

if [ "$mode" = "branch" ] && [ "${WARDEN_PUSH_REVIEW:-off}" != "on" ]; then
  # Each commit was already reviewed pre-commit; reviewing the branch again
  # would pay twice for the same lines. Opt in with WARDEN_PUSH_REVIEW=on.
  exit 0
fi

if [ -z "${WARDEN_ANTHROPIC_API_KEY:-}" ]; then
  echo "[warden] no WARDEN_ANTHROPIC_API_KEY in this environment; skipping local AI review (advisory)." >&2
  echo "[warden] Setup: docs/PR_FLOW.md, section 'Local AI review (Sentry Warden)' (Haiku 5.5 on the Claude plan's API credits)." >&2
  exit 0
fi

if [ "${WARDEN_TRIAGE:-on}" != "off" ] && command -v node >/dev/null 2>&1; then
  verdict="$(node "${script_dir}/warden-triage.mjs" "$mode")"
  triage_status=$?
  if [ "$triage_status" -eq 3 ]; then
    echo "[warden] free first pass: ${verdict#skip: }; no model review needed."
    exit 0
  fi
  echo "[warden] free first pass: ${verdict#review: }; sending to the model."
fi

# Resolve the CLI: a warden on PATH wins; otherwise run the pinned version
# through npm (the first run downloads it once, later runs use the npm cache).
if command -v warden >/dev/null 2>&1; then
  warden_cmd=(warden)
elif command -v npm >/dev/null 2>&1; then
  warden_cmd=(npm exec --yes "--package=@sentry/warden@${WARDEN_VERSION}" -- warden)
else
  echo "[warden] warden CLI not installed and npm not found; skipping local AI review (advisory)." >&2
  echo "[warden] Install with: npm install -g @sentry/warden@${WARDEN_VERSION}" >&2
  exit 0
fi

# Isolated pi agent dir holding the Haiku 5.5 model definition, so a personal
# ~/.pi/agent setup is neither read nor changed by this hook.
agent_dir="${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/jovie-warden/pi-agent"
if mkdir -p "$agent_dir" 2>/dev/null \
  && cp "${script_dir}/warden-pi-models.json" "${agent_dir}/models.json" 2>/dev/null; then
  export PI_CODING_AGENT_DIR="$agent_dir"
else
  echo "[warden] could not write ${agent_dir}; Haiku 5.5 may not resolve (see output below)." >&2
fi

args=()
[ "$mode" = "staged" ] && args+=(--staged)

timeout_seconds="${WARDEN_TIMEOUT_SECONDS:-180}"
timeout_cmd=()
if [ "$timeout_seconds" != "0" ]; then
  if command -v timeout >/dev/null 2>&1; then
    timeout_cmd=(timeout "$timeout_seconds")
  elif command -v gtimeout >/dev/null 2>&1; then
    timeout_cmd=(gtimeout "$timeout_seconds")
  fi
fi

errlog="$(mktemp "${TMPDIR:-/tmp}/jovie-warden-err.XXXXXX")"
trap 'rm -f "$errlog"' EXIT

echo "[warden] local AI review: ${label}"
# </dev/null: in pre-push, git holds the receive-pack connection open across
# the hook; never let a reviewer read or hold this hook's stdin.
# stderr goes to the terminal and, through tee, to $errlog for the hints
# below; stdout stays on fd 3 (the terminal) untouched.
{
  "${timeout_cmd[@]+"${timeout_cmd[@]}"}" "${warden_cmd[@]}" "${args[@]+"${args[@]}"}" \
    </dev/null 2>&1 1>&3 | tee "$errlog" >&2
  status=${PIPESTATUS[0]}
} 3>&1

if grep -q "Pi model not found" "$errlog" 2>/dev/null; then
  echo "[warden] Haiku 5.5 did not resolve. Check scripts/hooks/warden-pi-models.json against Warden ${WARDEN_VERSION}." >&2
elif grep -qiE "credit balance|insufficient.?credit" "$errlog" 2>/dev/null; then
  echo "[warden] the API credits look used up for this cycle; reviews stop until they renew (nothing is charged)." >&2
elif grep -qiE "auth_failed|authentication_error|invalid x-api-key" "$errlog" 2>/dev/null; then
  echo "[warden] the Anthropic API rejected WARDEN_ANTHROPIC_API_KEY; replace it in your environment." >&2
fi

case "$status" in
  0) : ;;
  124)
    echo "[warden] review timed out after ${timeout_seconds}s; continuing (advisory). Raise WARDEN_TIMEOUT_SECONDS if this repeats." >&2
    ;;
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
