#!/usr/bin/env bash
# Regression: bare JOVIE_CONFIGURATION_SOURCE_ROOT must align without a worktree.
# bug-to-test: satisfied — reproduces commission failure "source root not git: …/Jovie.git"
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="${ROOT}/scripts/symphony/align-runner-source-revision.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
export HOME="${TMP}/home"
mkdir -p "${HOME}/.config/symphony"

repo="${TMP}/repo"
mkdir -p "${repo}"
git -C "${repo}" -c init.defaultBranch=main init -q
printf 'fixture\n' >"${repo}/README"
git -C "${repo}" -c user.name=Fixture -c user.email=fixture@example.invalid add README
git -C "${repo}" -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm fixture
TIP="$(git -C "${repo}" rev-parse HEAD)"
mirror="${TMP}/mirrors/Jovie.git"
git clone -q --bare "${repo}" "${mirror}"

printf '%s\n' \
  "JOVIE_CONFIGURATION_SOURCE_ROOT=${mirror}" \
  "JOVIE_CONFIGURATION_SOURCE_REVISION=$(printf '0%.0s' {1..40})" \
  >"${HOME}/.config/symphony/runner-source.env"

if [[ -d "${mirror}/.git" ]]; then
  printf 'fixture setup error: bare mirror unexpectedly has .git/\n' >&2
  exit 1
fi

ALIGN_ALLOW_CHECKOUT=1 bash "${SCRIPT}" "${TIP}"
grep -qx "JOVIE_CONFIGURATION_SOURCE_REVISION=${TIP}" "${HOME}/.config/symphony/runner-source.env"

out="$(ALIGN_ALLOW_CHECKOUT=1 bash "${SCRIPT}" "${TIP}")"
[[ "${out}" == *"already aligned to ${TIP}"* ]]

bogus="${TMP}/not-git"
mkdir -p "${bogus}"
printf '%s\n' \
  "JOVIE_CONFIGURATION_SOURCE_ROOT=${bogus}" \
  "JOVIE_CONFIGURATION_SOURCE_REVISION=${TIP}" \
  >"${HOME}/.config/symphony/runner-source.env"
set +e
err="$(ALIGN_ALLOW_CHECKOUT=1 bash "${SCRIPT}" "${TIP}" 2>&1)"
rc=$?
set -e
[[ "${rc}" -eq 2 ]]
[[ "${err}" == *"source root not git: ${bogus}"* ]]

printf 'align-runner-source-revision bare-mirror regression OK\n'
