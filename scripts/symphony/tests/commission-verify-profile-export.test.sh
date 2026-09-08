#!/usr/bin/env bash
# Regression: commission Verify must export sourced profile into child environ
# AND pass --profile explicitly. Tip run after #17781 failed because Verify
# sourced runner-source.env without set -a, then called emit without --profile;
# argparse defaulted to canonical via os.environ while Install used shell argv.
# bug-to-test: satisfied — reproduces unexported-profile → canonical fallback.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="${ROOT}/.github/workflows/gem-publisher-commission.yml"
EMIT="${ROOT}/scripts/symphony/emit_gem_service_attestation.py"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

# 1) Workflow wiring: export + explicit --profile (guards the CI path).
grep -q 'set -a' "${WORKFLOW}"
grep -q 'source "${HOME}/.config/symphony/runner-source.env"' "${WORKFLOW}"
grep -q 'set +a' "${WORKFLOW}"
grep -q -- '--profile "${profile}"' "${WORKFLOW}"
# Unhealthy emit must print a diagnosable stderr schema (guards silent exit 2).
grep -q 'gem-service-attestation-unhealthy/v1' "${EMIT}"

# 2) Shell semantics: sourced-but-unexported profile is invisible to python
#    os.environ (the tip failure mode). Exported profile is visible.
printf '%s\n' 'JOVIE_CONFIGURATION_PROFILE=governor-bounded' >"${TMP}/runner-source.env"

unexported="$(
  bash -c '
    set -euo pipefail
    source "$1"
    python3 -c "import os; print(os.environ.get(\"JOVIE_CONFIGURATION_PROFILE\", \"MISSING\"))"
  ' bash "${TMP}/runner-source.env"
)"
[[ "${unexported}" == "MISSING" ]]

exported="$(
  bash -c '
    set -euo pipefail
    set -a
    source "$1"
    set +a
    python3 -c "import os; print(os.environ.get(\"JOVIE_CONFIGURATION_PROFILE\", \"MISSING\"))"
  ' bash "${TMP}/runner-source.env"
)"
[[ "${exported}" == "governor-bounded" ]]

# 3) Explicit --profile argv wins even when environ is unset (Install pattern).
argv_profile="$(
  env -u JOVIE_CONFIGURATION_PROFILE python3 -c '
import argparse, os
p = argparse.ArgumentParser()
p.add_argument("--profile", default=os.environ.get("JOVIE_CONFIGURATION_PROFILE", "canonical"))
print(p.parse_args(["--profile", "governor-bounded"]).profile)
'
)"
[[ "${argv_profile}" == "governor-bounded" ]]

fallback="$(
  env -u JOVIE_CONFIGURATION_PROFILE python3 -c '
import argparse, os
p = argparse.ArgumentParser()
p.add_argument("--profile", default=os.environ.get("JOVIE_CONFIGURATION_PROFILE", "canonical"))
print(p.parse_args([]).profile)
'
)"
[[ "${fallback}" == "canonical" ]]

# 4) emit_ok fail-closed: emit exit 0 + receipt jq miss must not succeed.
#    Sentry 16703710: `return "${status:-2}"` masked persistent jq failures.
#    Sentry 16703781: `set +e` + `return` leaks into the caller so cp/verify
#    continue after a failed observation — exhausted-retry must `exit`.
grep -q 'never return 0 here' "${WORKFLOW}"
grep -A8 'failed after retries' "${WORKFLOW}" | grep -q 'exit 2'
if grep -A10 'failed after retries' "${WORKFLOW}" | grep -q 'set +e'; then
  echo "FAIL: exhausted-retry path still uses set +e (leaks into caller)" >&2
  exit 1
fi

fail_closed_rc=0
bash -c '
  set -euo pipefail
  receipt="$1/receipt.json"
  printf "%s\n" "{\"healthy\":false}" >"${receipt}"
  emit() { printf "emitted\n"; return 0; }
  ok=".healthy==true"
  emit_ok() {
    local label="$1" out status attempt jq_rc
    for attempt in 1 2 3; do
      set +e
      out="$(emit 2>&1)"
      status=$?
      jq_rc=1
      if [[ "${status}" -eq 0 ]]; then
        jq -e "$ok" "${receipt}" >/dev/null
        jq_rc=$?
      fi
      set -e
      if [[ "${status}" -eq 0 && "${jq_rc}" -eq 0 ]]; then
        return 0
      fi
    done
    # Fail the step — do not set +e + return (sticky options leak).
    if [[ "${status:-1}" -ne 0 ]]; then
      exit "${status}"
    fi
    exit 2
  }
  emit_ok "observation-a"
  echo SHOULD_NOT_REACH
  exit 0
' bash "${TMP}" || fail_closed_rc=$?
[[ "${fail_closed_rc}" == "2" ]]

# 5) Successful emit_ok must leave set -e intact for subsequent commands.
set_e_intact_rc=0
bash -c '
  set -euo pipefail
  receipt="$1/receipt.json"
  printf "%s\n" "{\"healthy\":true}" >"${receipt}"
  emit() { printf "emitted\n"; return 0; }
  ok=".healthy==true"
  emit_ok() {
    local out status
    set +e
    out="$(emit 2>&1)"
    status=$?
    set -e
    if [[ "${status}" -eq 0 ]] && jq -e "$ok" "${receipt}" >/dev/null; then
      return 0
    fi
    exit 2
  }
  emit_ok "observation-a"
  # Under sticky set +e this false would be ignored; under set -e it aborts.
  false
  echo SHOULD_NOT_REACH
' bash "${TMP}" || set_e_intact_rc=$?
[[ "${set_e_intact_rc}" -ne 0 ]]

printf 'commission-verify-profile-export regression OK\n'
