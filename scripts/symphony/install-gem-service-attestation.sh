#!/usr/bin/env bash
# Install the JOV-6163 runner-source attestation publisher onto the existing
# Gem gem-service-attestation.timer path. Does not mint authority, restart
# Symphony, or invent operator-selected provenance/config inputs.
set -euo pipefail

readonly SOURCE_ROOT="${1:-$(git rev-parse --show-toplevel)}"
readonly GEM_ROOT="${GEM_WORKSPACE:-${HOME}/gem-workspace}"
readonly UNIT_ROOT="${HOME}/.config/systemd/user"
readonly ENV_FILE="${HOME}/.config/symphony/runner-source.env"
readonly TIMER="gem-service-attestation.timer"
readonly SERVICE="gem-service-attestation.service"
readonly VERIFY_ONLY="${GEM_SERVICE_ATTESTATION_VERIFY_ONLY:-false}"

# shellcheck source=lib/user-systemd-context.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/user-systemd-context.sh"

readonly -a RELATIVE_SOURCES=(
  scripts/symphony/emit_gem_service_attestation.py
  scripts/symphony/symphony_proof_context.py
  scripts/symphony/gem_gate_contract.py
  scripts/symphony/systemd/gem-service-attestation.service
)

readonly -a TARGETS=(
  "${GEM_ROOT}/scripts/emit-gem-service-attestation.py"
  "${GEM_ROOT}/scripts/symphony_proof_context.py"
  "${GEM_ROOT}/scripts/gem_gate_contract.py"
  "${UNIT_ROOT}/gem-service-attestation.service"
)

for relative in "${RELATIVE_SOURCES[@]}"; do
  [[ -f "${SOURCE_ROOT}/${relative}" ]] || {
    printf 'missing gem-service-attestation source: %s\n' "${relative}" >&2
    exit 2
  }
done

git -C "${SOURCE_ROOT}" diff --quiet -- "${RELATIVE_SOURCES[@]}"
git -C "${SOURCE_ROOT}" diff --cached --quiet -- "${RELATIVE_SOURCES[@]}"

[[ -f "${ENV_FILE}" ]] || {
  printf 'missing operator-selected runner-source env: %s\n' "${ENV_FILE}" >&2
  exit 2
}

# shellcheck disable=SC1090
source "${ENV_FILE}"
for required in SYMPHONY_RELEASE_PROVENANCE JOVIE_CONFIGURATION_SOURCE_ROOT JOVIE_CONFIGURATION_SOURCE_REVISION; do
  [[ -n "${!required:-}" ]] || {
    printf 'runner-source.env missing %s\n' "${required}" >&2
    exit 2
  }
done
[[ "${JOVIE_CONFIGURATION_SOURCE_REVISION}" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'JOVIE_CONFIGURATION_SOURCE_REVISION must be a full lowercase SHA\n' >&2
  exit 2
}
[[ -f "${SYMPHONY_RELEASE_PROVENANCE}" ]] || {
  printf 'SYMPHONY_RELEASE_PROVENANCE not found: %s\n' "${SYMPHONY_RELEASE_PROVENANCE}" >&2
  exit 2
}
[[ -d "${JOVIE_CONFIGURATION_SOURCE_ROOT}/.git" ]] || {
  printf 'JOVIE_CONFIGURATION_SOURCE_ROOT is not a git checkout: %s\n' "${JOVIE_CONFIGURATION_SOURCE_ROOT}" >&2
  exit 2
}

prepare_user_systemd_context

if [[ "${VERIFY_ONLY}" == true ]]; then
  set +e
  python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
    --provenance "${SYMPHONY_RELEASE_PROVENANCE}" \
    --source-root "${JOVIE_CONFIGURATION_SOURCE_ROOT}" \
    --source-revision "${JOVIE_CONFIGURATION_SOURCE_REVISION}" \
    --gem-root "${GEM_ROOT}" \
    --check
  status=$?
  set -e
  exit "${status}"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly BACKUP_DIR="${GEM_ROOT}/state/backups/gem-service-attestation-${STAMP}"
mkdir -p "${BACKUP_DIR}" "${GEM_ROOT}/scripts" "${GEM_ROOT}/state" "${UNIT_ROOT}"

# Pause only the existing attestation timer; do not restart Symphony.
if systemctl --user is-active --quiet "${TIMER}"; then
  systemctl --user stop "${TIMER}"
fi
for _ in $(seq 1 30); do
  systemctl --user is-active --quiet "${SERVICE}" || break
  sleep 1
done
if systemctl --user is-active --quiet "${SERVICE}"; then
  printf 'gem-service-attestation.service still active; refuse to replace\n' >&2
  exit 2
fi

for index in "${!RELATIVE_SOURCES[@]}"; do
  source_path="${SOURCE_ROOT}/${RELATIVE_SOURCES[$index]}"
  target_path="${TARGETS[$index]}"
  if [[ -e "${target_path}" ]]; then
    cp -a "${target_path}" "${BACKUP_DIR}/$(basename "${target_path}")"
  fi
  install -D -m 0644 "${source_path}" "${target_path}"
done
chmod 0755 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py"

# Pre-flight against live inputs before enabling the timer again.
set +e
python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
  --provenance "${SYMPHONY_RELEASE_PROVENANCE}" \
  --source-root "${JOVIE_CONFIGURATION_SOURCE_ROOT}" \
  --source-revision "${JOVIE_CONFIGURATION_SOURCE_REVISION}" \
  --gem-root "${GEM_ROOT}" \
  --check
check_status=$?
set -e
if [[ "${check_status}" -ne 0 ]]; then
  printf 'pre-install --check failed with exit %s; leaving timer stopped and backups in %s\n' \
    "${check_status}" "${BACKUP_DIR}" >&2
  exit "${check_status}"
fi

systemctl --user daemon-reload
# Resume the same existing timer; this repo does not ship a replacement timer.
if systemctl --user list-unit-files "${TIMER}" | grep -q "${TIMER}"; then
  systemctl --user start "${TIMER}"
else
  printf 'warning: %s is not installed as a user unit; publisher files installed but timer not started\n' "${TIMER}" >&2
fi

# Publish one fresh observation for activation verify.
set +e
python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
  --provenance "${SYMPHONY_RELEASE_PROVENANCE}" \
  --source-root "${JOVIE_CONFIGURATION_SOURCE_ROOT}" \
  --source-revision "${JOVIE_CONFIGURATION_SOURCE_REVISION}" \
  --gem-root "${GEM_ROOT}"
publish_status=$?
set -e
if [[ "${publish_status}" -ne 0 ]]; then
  printf 'publisher install succeeded but observation publish exited %s\n' "${publish_status}" >&2
  exit "${publish_status}"
fi

printf 'gem-service-attestation publisher installed (backup=%s)\n' "${BACKUP_DIR}"
