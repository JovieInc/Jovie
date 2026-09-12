#!/usr/bin/env bash
# Regression: align-runner-source-revision refuses dirty/mismatch without
# ALIGN_ALLOW_CHECKOUT, then aligns + stays idempotent with checkout allowed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ALIGN="${ROOT}/scripts/symphony/align-runner-source-revision.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

git init -q "${TMP}/cfg"
git -C "${TMP}/cfg" config user.email regression@example.com
git -C "${TMP}/cfg" config user.name regression
printf 'a\n' > "${TMP}/cfg/f"
git -C "${TMP}/cfg" add f
git -C "${TMP}/cfg" commit -qm first
SHA1="$(git -C "${TMP}/cfg" rev-parse HEAD)"
printf 'b\n' > "${TMP}/cfg/f"
git -C "${TMP}/cfg" add f
git -C "${TMP}/cfg" commit -qm second
SHA2="$(git -C "${TMP}/cfg" rev-parse HEAD)"
git -C "${TMP}/cfg" checkout -q "${SHA1}"

mkdir -p "${TMP}/home/.config/symphony"
cat > "${TMP}/home/.config/symphony/runner-source.env" <<EOF
SYMPHONY_RELEASE_PROVENANCE=${TMP}/prov.json
JOVIE_CONFIGURATION_SOURCE_ROOT=${TMP}/cfg
JOVIE_CONFIGURATION_SOURCE_REVISION=${SHA1}
EOF
printf '{}\n' > "${TMP}/prov.json"

if HOME="${TMP}/home" bash "${ALIGN}" "${SHA2}"; then
  printf 'expected refusal without ALIGN_ALLOW_CHECKOUT\n' >&2
  exit 1
fi

HOME="${TMP}/home" ALIGN_ALLOW_CHECKOUT=1 bash "${ALIGN}" "${SHA2}"
# shellcheck disable=SC1090
source "${TMP}/home/.config/symphony/runner-source.env"
[[ "${JOVIE_CONFIGURATION_SOURCE_REVISION}" == "${SHA2}" ]]
[[ "$(git -C "${TMP}/cfg" rev-parse HEAD)" == "${SHA2}" ]]
[[ -f "${TMP}/home/.config/symphony/runner-source.env.bak-"* ]] \
  || ls "${TMP}/home/.config/symphony/runner-source.env.bak-"* >/dev/null

HOME="${TMP}/home" ALIGN_ALLOW_CHECKOUT=1 bash "${ALIGN}" "${SHA2}"
printf 'align-runner-source-revision regression PASS\n'
