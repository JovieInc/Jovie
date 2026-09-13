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

# 4) emit_ok fail-closed: emit exit 0 + receipt jq miss must not return 0.
#    Sentry 16703710: `return "${status:-2}"` masked persistent jq failures.
grep -q 'never return 0 here' "${WORKFLOW}"
grep -A6 'failed after retries' "${WORKFLOW}" | grep -q 'return 2'

fail_closed_rc="$(
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
      # set +e before non-zero return (bash set -e + return ≠0 exits the shell)
      set +e
      if [[ "${status:-1}" -ne 0 ]]; then
        return "${status}"
      fi
      return 2
    }
    set +e
    emit_ok "observation-a"
    rc=$?
    set -e
    printf "%s" "${rc}"
    exit 0
  ' bash "${TMP}"
)"
[[ "${fail_closed_rc}" == "2" ]]

printf 'commission-verify-profile-export regression OK\n'
