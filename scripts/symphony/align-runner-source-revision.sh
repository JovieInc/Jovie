#!/usr/bin/env bash
# Align JOVIE_CONFIGURATION_SOURCE_REVISION; checkout root if ALIGN_ALLOW_CHECKOUT=1.
# Bare mirrors (e.g. /srv/git/mirrors/Jovie.git) are valid source roots: ensure the tip
# object exists and update the env revision — never require a worktree checkout.
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
readonly ROOT="${JOVIE_CONFIGURATION_SOURCE_ROOT}"
if ! git -C "${ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
  printf 'source root not git: %s\n' "${ROOT}" >&2
  exit 2
fi
bare="$(git -C "${ROOT}" rev-parse --is-bare-repository)"
ensure_tip_object() {
  if git -C "${ROOT}" cat-file -e "${TIP}^{commit}" 2>/dev/null; then
    return 0
  fi
  git -C "${ROOT}" fetch --quiet origin "${TIP}"
  git -C "${ROOT}" cat-file -e "${TIP}^{commit}" 2>/dev/null || {
    printf 'tip %s not present in %s after fetch\n' "${TIP}" "${ROOT}" >&2
    exit 2
  }
}
if [[ "${bare}" == "true" ]]; then
  # Emitters read revision by SHA from the mirror; no worktree to dirty-check or checkout.
  ensure_tip_object
else
  if ! git -C "${ROOT}" diff --quiet \
    || ! git -C "${ROOT}" diff --cached --quiet; then
    printf 'source root dirty; refuse %s\n' "${TIP}" >&2
    exit 2
  fi
  current="$(git -C "${ROOT}" rev-parse HEAD)"
  if [[ "${current}" != "${TIP}" ]]; then
    if [[ "${ALLOW_CHECKOUT}" != "1" ]]; then
      printf 'config root at %s tip %s; set ALIGN_ALLOW_CHECKOUT=1\n' "${current}" "${TIP}" >&2
      exit 2
    fi
    ensure_tip_object
    git -C "${ROOT}" checkout --quiet --detach "${TIP}"
    current="$(git -C "${ROOT}" rev-parse HEAD)"
    [[ "${current}" == "${TIP}" ]] || {
      printf 'checkout missed tip %s (got %s)\n' "${TIP}" "${current}" >&2
      exit 2
    }
  fi
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
