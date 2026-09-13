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

printf 'commission-verify-profile-export regression OK\n'
