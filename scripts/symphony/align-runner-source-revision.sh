#!/usr/bin/env bash
# Align JOVIE_CONFIGURATION_SOURCE_REVISION; checkout root if ALIGN_ALLOW_CHECKOUT=1.
# Usage: ALIGN_ALLOW_CHECKOUT=1 bash scripts/symphony/align-runner-source-revision.sh <40-hex>
set -euo pipefail
readonly TIP="${1:-}"
readonly ENV_FILE="${HOME}/.config/symphony/runner-source.env"
readonly ALLOW_CHECKOUT="${ALIGN_ALLOW_CHECKOUT:-0}"
[[ "${TIP}" =~ ^[0-9a-f]{40}$ ]] || { printf 'tip must be 40-hex\n' >&2; exit 2; }
[[ -f "${ENV_FILE}" ]] || { printf 'missing %s\n' "${ENV_FILE}" >&2; exit 2; }
# shellcheck disable=SC1090
source "${ENV_FILE}"
for required in JOVIE_CONFIGURATION_SOURCE_ROOT JOVIE_CONFIGURATION_SOURCE_REVISION; do
  [[ -n "${!required:-}" ]] || { printf 'runner-source.env missing %s\n' "${required}" >&2; exit 2; }
done
[[ -d "${JOVIE_CONFIGURATION_SOURCE_ROOT}/.git" ]] || {
  printf 'source root not git: %s\n' "${JOVIE_CONFIGURATION_SOURCE_ROOT}" >&2
  exit 2
}
if ! git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" diff --quiet \
  || ! git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" diff --cached --quiet; then
  printf 'source root dirty; refuse %s\n' "${TIP}" >&2
  exit 2
fi
current="$(git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" rev-parse HEAD)"
if [[ "${current}" != "${TIP}" ]]; then
  if [[ "${ALLOW_CHECKOUT}" != "1" ]]; then
    printf 'config root at %s tip %s; set ALIGN_ALLOW_CHECKOUT=1\n' "${current}" "${TIP}" >&2
    exit 2
  fi
  if ! git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" cat-file -e "${TIP}^{commit}" 2>/dev/null; then
    git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" fetch --quiet origin "${TIP}"
  fi
  git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" checkout --quiet --detach "${TIP}"
  current="$(git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" rev-parse HEAD)"
  [[ "${current}" == "${TIP}" ]] || {
    printf 'checkout missed tip %s (got %s)\n' "${TIP}" "${current}" >&2
    exit 2
  }
fi
if [[ "${JOVIE_CONFIGURATION_SOURCE_REVISION}" == "${TIP}" ]]; then
  printf 'already aligned to %s\n' "${TIP}"
  exit 0
fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "${ENV_FILE}" "${ENV_FILE}.bak-${stamp}"
tmp="$(mktemp)"
awk -v tip="${TIP}" '
  BEGIN { done = 0 }
  /^JOVIE_CONFIGURATION_SOURCE_REVISION=/ {
    print "JOVIE_CONFIGURATION_SOURCE_REVISION=" tip; done = 1; next
  }
  { print }
  END { if (!done) print "JOVIE_CONFIGURATION_SOURCE_REVISION=" tip }
' "${ENV_FILE}" > "${tmp}"
mv "${tmp}" "${ENV_FILE}"
chmod 0644 "${ENV_FILE}"
printf 'aligned to %s (backup %s)\n' "${TIP}" "${ENV_FILE}.bak-${stamp}"
