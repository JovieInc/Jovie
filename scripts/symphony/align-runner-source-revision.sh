#!/usr/bin/env bash
# Align ~/.config/symphony/runner-source.env's JOVIE_CONFIGURATION_SOURCE_REVISION
# to an authorized tip SHA, and ensure JOVIE_CONFIGURATION_SOURCE_ROOT is checked
# out at that SHA. Does not invent provenance paths or mint authority.
#
# Usage:
#   ALIGN_ALLOW_CHECKOUT=1 bash scripts/symphony/align-runner-source-revision.sh <40-hex>
#
# Fail-closed when the env file is missing, the tip is malformed, the config
# root is dirty, or checkout is required but ALIGN_ALLOW_CHECKOUT is unset.
set -euo pipefail

readonly TIP="${1:-}"
readonly ENV_FILE="${HOME}/.config/symphony/runner-source.env"
readonly ALLOW_CHECKOUT="${ALIGN_ALLOW_CHECKOUT:-0}"

[[ "${TIP}" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'tip must be a full lowercase 40-hex SHA\n' >&2
  exit 2
}

[[ -f "${ENV_FILE}" ]] || {
  printf 'missing operator-selected runner-source env: %s\n' "${ENV_FILE}" >&2
  exit 2
}

# shellcheck disable=SC1090
source "${ENV_FILE}"
for required in JOVIE_CONFIGURATION_SOURCE_ROOT JOVIE_CONFIGURATION_SOURCE_REVISION; do
  [[ -n "${!required:-}" ]] || {
    printf 'runner-source.env missing %s\n' "${required}" >&2
    exit 2
  }
done

[[ -d "${JOVIE_CONFIGURATION_SOURCE_ROOT}/.git" ]] || {
  printf 'JOVIE_CONFIGURATION_SOURCE_ROOT is not a git checkout: %s\n' \
    "${JOVIE_CONFIGURATION_SOURCE_ROOT}" >&2
  exit 2
}

if ! git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" diff --quiet \
  || ! git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" diff --cached --quiet; then
  printf 'JOVIE_CONFIGURATION_SOURCE_ROOT is dirty; refuse to align tip %s\n' "${TIP}" >&2
  exit 2
fi

current="$(git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" rev-parse HEAD)"
if [[ "${current}" != "${TIP}" ]]; then
  if [[ "${ALLOW_CHECKOUT}" != "1" ]]; then
    printf 'config root at %s but tip is %s; set ALIGN_ALLOW_CHECKOUT=1 to checkout\n' \
      "${current}" "${TIP}" >&2
    exit 2
  fi
  if git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" cat-file -e "${TIP}^{commit}" 2>/dev/null; then
    git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" checkout --quiet --detach "${TIP}"
  else
    git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" fetch --quiet origin "${TIP}"
    git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" checkout --quiet --detach "${TIP}"
  fi
  current="$(git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" rev-parse HEAD)"
  [[ "${current}" == "${TIP}" ]] || {
    printf 'checkout did not land on tip %s (got %s)\n' "${TIP}" "${current}" >&2
    exit 2
  }
fi

if [[ "${JOVIE_CONFIGURATION_SOURCE_REVISION}" == "${TIP}" ]]; then
  printf 'runner-source revision already aligned to %s\n' "${TIP}"
  exit 0
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "${ENV_FILE}" "${ENV_FILE}.bak-${stamp}"
tmp="$(mktemp)"
awk -v tip="${TIP}" '
  BEGIN { done = 0 }
  /^JOVIE_CONFIGURATION_SOURCE_REVISION=/ {
    print "JOVIE_CONFIGURATION_SOURCE_REVISION=" tip
    done = 1
    next
  }
  { print }
  END {
    if (!done) {
      print "JOVIE_CONFIGURATION_SOURCE_REVISION=" tip
    }
  }
' "${ENV_FILE}" > "${tmp}"
mv "${tmp}" "${ENV_FILE}"
chmod 0644 "${ENV_FILE}"
printf 'aligned JOVIE_CONFIGURATION_SOURCE_REVISION to %s (backup %s)\n' \
  "${TIP}" "${ENV_FILE}.bak-${stamp}"
