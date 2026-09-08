#!/usr/bin/env bash
# Copy a live Gem gem-service-attestation.json to stdout for Summer's
# SUMMER_RUNNER_SOURCE_ATTESTATION_JSON (or write --out). Does not mint trust,
# weaken the 600s gate, or claim E1 closed — operator still collects two
# independent ≤600s observations and runs the E1 verifier separately.
set -euo pipefail

GEM_ROOT="${GEM_WORKSPACE:-$HOME/gem-workspace}"
RECEIPT="${GEM_ROOT}/state/gem-service-attestation.json"
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT="${2:?}"
      shift 2
      ;;
    --gem-root)
      GEM_ROOT="${2:?}"
      RECEIPT="${GEM_ROOT}/state/gem-service-attestation.json"
      shift 2
      ;;
    -h|--help)
      printf 'Usage: %s [--gem-root DIR] [--out FILE]\n' "$0"
      exit 0
      ;;
    *)
      printf 'unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

[[ -f "${RECEIPT}" ]] || {
  printf 'missing attestation receipt: %s\n' "${RECEIPT}" >&2
  exit 2
}

# Fail closed if schema/revision/health look wrong — still not an E1 close.
jq -e '
  .schema == "gem-service-attestation/v1" and
  (.sourceRevision | type == "string" and test("^[0-9a-f]{40}$")) and
  (.configurationSourceRevision | type == "string" and test("^[0-9a-f]{40}$")) and
  .healthy == true and
  .active == true and
  .listener.port == 4041 and
  .listener.boundToService == true
' "${RECEIPT}" >/dev/null

if [[ -n "${OUT}" ]]; then
  jq -c . "${RECEIPT}" >"${OUT}"
  printf 'wrote Summer attestation JSON to %s\n' "${OUT}" >&2
else
  jq -c . "${RECEIPT}"
fi
