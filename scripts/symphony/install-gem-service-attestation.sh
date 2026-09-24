#!/usr/bin/env bash
# Install the existing Gem runner-source observer onto its existing timer.
# Explicit upstream preservation mode remains separate from legacy health and
# never restarts Symphony or invents operator-approved binding inputs.
set -euo pipefail

SOURCE_ROOT=""
MODE="legacy"
MODE_EXPLICIT=false
UPSTREAM_BINDING=""
UPSTREAM_BINDING_SHA256=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ "${MODE_EXPLICIT}" == false && $# -ge 2 ]] || {
        printf 'invalid or repeated --mode\n' >&2
        exit 2
      }
      MODE="$2"
      MODE_EXPLICIT=true
      shift 2
      ;;
    --upstream-binding)
      [[ -z "${UPSTREAM_BINDING}" && $# -ge 2 ]] || {
        printf 'invalid or repeated --upstream-binding\n' >&2
        exit 2
      }
      UPSTREAM_BINDING="$2"
      shift 2
      ;;
    --upstream-binding-sha256)
      [[ -z "${UPSTREAM_BINDING_SHA256}" && $# -ge 2 ]] || {
        printf 'invalid or repeated --upstream-binding-sha256\n' >&2
        exit 2
      }
      UPSTREAM_BINDING_SHA256="$2"
      shift 2
      ;;
    --help|-h)
      printf 'Usage: %s [SOURCE_ROOT] [--mode legacy|upstream-preservation] [--upstream-binding PATH --upstream-binding-sha256 SHA256]\n' "$0"
      exit 0
      ;;
    -* )
      printf 'unknown option: %s\n' "$1" >&2
      exit 2
      ;;
    *)
      [[ -z "${SOURCE_ROOT}" ]] || {
        printf 'only one SOURCE_ROOT may be provided\n' >&2
        exit 2
      }
      SOURCE_ROOT="$1"
      shift
      ;;
  esac
done
[[ -n "${SOURCE_ROOT}" ]] || SOURCE_ROOT="$(git rev-parse --show-toplevel)"
readonly SOURCE_ROOT
readonly MODE
readonly UPSTREAM_BINDING
readonly UPSTREAM_BINDING_SHA256
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
  scripts/symphony/symphony_official_runtime.py
  scripts/symphony/verify_upstream_burrito_payload.py
  scripts/symphony/systemd/gem-service-attestation.service
)

readonly -a TARGETS=(
  "${GEM_ROOT}/scripts/emit-gem-service-attestation.py"
  "${GEM_ROOT}/scripts/symphony_proof_context.py"
  "${GEM_ROOT}/scripts/gem_gate_contract.py"
  "${GEM_ROOT}/scripts/symphony_official_runtime.py"
  "${GEM_ROOT}/scripts/verify_upstream_burrito_payload.py"
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

# Source only the existing operator-selected file. Clear inherited values so
# an ambient shell cannot turn one mode into a mixed-mode invocation.
unset GEM_SERVICE_ATTESTATION_MODE SYMPHONY_UPSTREAM_BINDING SYMPHONY_UPSTREAM_BINDING_SHA256
unset SYMPHONY_RELEASE_PROVENANCE JOVIE_CONFIGURATION_SOURCE_ROOT JOVIE_CONFIGURATION_SOURCE_REVISION
unset JOVIE_CONFIGURATION_PROFILE
# shellcheck disable=SC1090,SC1091 # operator-selected runtime config lives outside the repository
source "${ENV_FILE}"

case "${MODE}" in
  legacy)
    [[ -z "${UPSTREAM_BINDING}" && -z "${UPSTREAM_BINDING_SHA256}" ]] || {
      printf 'upstream binding inputs require --mode upstream-preservation\n' >&2
      exit 2
    }
    [[ -z "${GEM_SERVICE_ATTESTATION_MODE:-}" || "${GEM_SERVICE_ATTESTATION_MODE}" == legacy ]] || {
      printf 'runner-source.env mode does not match legacy installer mode\n' >&2
      exit 2
    }
    [[ -z "${SYMPHONY_UPSTREAM_BINDING:-}" && -z "${SYMPHONY_UPSTREAM_BINDING_SHA256:-}" ]] || {
      printf 'mixed legacy and upstream preservation inputs are not allowed\n' >&2
      exit 2
    }
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
      printf 'SYMPHONY_RELEASE_PROVENANCE not found\n' >&2
      exit 2
    }
    git -C "${JOVIE_CONFIGURATION_SOURCE_ROOT}" rev-parse --git-dir >/dev/null 2>&1 || {
      printf 'JOVIE_CONFIGURATION_SOURCE_ROOT is not a git repository\n' >&2
      exit 2
    }
    ;;
  upstream-preservation)
    [[ -n "${UPSTREAM_BINDING}" && -n "${UPSTREAM_BINDING_SHA256}" ]] || {
      printf 'upstream preservation requires both binding path and approved SHA256\n' >&2
      exit 2
    }
    [[ "${UPSTREAM_BINDING}" == /* && -f "${UPSTREAM_BINDING}" ]] || {
      printf 'upstream binding path must be an existing absolute file\n' >&2
      exit 2
    }
    [[ "${UPSTREAM_BINDING_SHA256}" =~ ^[0-9a-f]{64}$ ]] || {
      printf 'upstream binding SHA256 must be a full lowercase SHA256\n' >&2
      exit 2
    }
    if command -v sha256sum >/dev/null 2>&1; then
      actual_binding_sha256="$(sha256sum "${UPSTREAM_BINDING}")"
    elif command -v shasum >/dev/null 2>&1; then
      actual_binding_sha256="$(shasum -a 256 "${UPSTREAM_BINDING}")"
    else
      printf 'no SHA256 utility is available\n' >&2
      exit 2
    fi
    actual_binding_sha256="${actual_binding_sha256%% *}"
    [[ "${actual_binding_sha256}" == "${UPSTREAM_BINDING_SHA256}" ]] || {
      printf 'upstream binding does not match the independently approved SHA256\n' >&2
      exit 2
    }
    [[ "${GEM_SERVICE_ATTESTATION_MODE:-}" == upstream-preservation ]] || {
      printf 'runner-source.env mode does not match upstream-preservation installer mode\n' >&2
      exit 2
    }
    [[ "${SYMPHONY_UPSTREAM_BINDING:-}" == "${UPSTREAM_BINDING}" &&
       "${SYMPHONY_UPSTREAM_BINDING_SHA256:-}" == "${UPSTREAM_BINDING_SHA256}" ]] || {
      printf 'runner-source.env binding inputs do not match explicit approved inputs\n' >&2
      exit 2
    }
    [[ -z "${SYMPHONY_RELEASE_PROVENANCE:-}" &&
       -z "${JOVIE_CONFIGURATION_SOURCE_ROOT:-}" &&
       -z "${JOVIE_CONFIGURATION_SOURCE_REVISION:-}" &&
       -z "${JOVIE_CONFIGURATION_PROFILE:-}" ]] || {
      printf 'mixed legacy and upstream preservation inputs are not allowed\n' >&2
      exit 2
    }
    ;;
  *)
    printf 'unsupported attestation mode\n' >&2
    exit 2
    ;;
esac

prepare_user_systemd_context

if [[ "${VERIFY_ONLY}" == true ]]; then
  set +e
  if [[ "${MODE}" == upstream-preservation ]]; then
    PYTHONPATH="${SOURCE_ROOT}/scripts/symphony${PYTHONPATH:+:${PYTHONPATH}}" \
      python3 "${SOURCE_ROOT}/scripts/symphony/emit_gem_service_attestation.py" \
      --upstream-binding "${UPSTREAM_BINDING}" \
      --upstream-binding-sha256 "${UPSTREAM_BINDING_SHA256}" \
      --gem-root "${GEM_ROOT}" \
      --check
  else
    python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
      --provenance "${SYMPHONY_RELEASE_PROVENANCE}" \
      --source-root "${JOVIE_CONFIGURATION_SOURCE_ROOT}" \
      --source-revision "${JOVIE_CONFIGURATION_SOURCE_REVISION}" \
      --profile "${JOVIE_CONFIGURATION_PROFILE:-canonical}" \
      --gem-root "${GEM_ROOT}" \
      --check
  fi
  status=$?
  set -e
  exit "${status}"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly BACKUP_DIR="${GEM_ROOT}/state/backups/gem-service-attestation-${STAMP}"
mkdir -p "${BACKUP_DIR}" "${GEM_ROOT}/scripts" "${GEM_ROOT}/state" "${UNIT_ROOT}"

# Pause only the existing attestation timer; do not restart Symphony.
timer_was_active=false
if systemctl --user is-active --quiet "${TIMER}"; then
  timer_was_active=true
  systemctl --user stop "${TIMER}"
fi
install_started=false
install_complete=false
finish_or_rollback() {
  local status="$?" index target_path temporary
  if [[ "${install_complete}" != true && "${install_started}" == true ]]; then
    systemctl --user stop "${TIMER}" || true
    for index in "${!TARGETS[@]}"; do
      target_path="${TARGETS[$index]}"
      if [[ -e "${BACKUP_DIR}/${index}.existed" ]]; then
        temporary="${target_path}.rollback.$$"
        cp -p "${BACKUP_DIR}/${index}" "${temporary}"
        mv "${temporary}" "${target_path}"
      else
        rm -f "${target_path}"
      fi
    done
    systemctl --user daemon-reload || true
  fi
  if [[ "${install_complete}" != true && "${timer_was_active}" == true ]]; then
    systemctl --user start "${TIMER}" || true
  fi
  exit "${status}"
}
trap finish_or_rollback EXIT
for _ in $(seq 1 30); do
  systemctl --user is-active --quiet "${SERVICE}" || break
  sleep 1
done
if systemctl --user is-active --quiet "${SERVICE}"; then
  printf 'gem-service-attestation.service still active; refuse to replace\n' >&2
  exit 2
fi

for index in "${!TARGETS[@]}"; do
  target_path="${TARGETS[$index]}"
  if [[ -e "${target_path}" ]]; then
    cp -p "${target_path}" "${BACKUP_DIR}/${index}"
    : >"${BACKUP_DIR}/${index}.existed"
  fi
done
install_started=true
for index in "${!RELATIVE_SOURCES[@]}"; do
  target_path="${TARGETS[$index]}"
  temporary="${target_path}.install.$$"
  install -m 0644 "${SOURCE_ROOT}/${RELATIVE_SOURCES[$index]}" "${temporary}"
  mv "${temporary}" "${target_path}"
done
chmod 0755 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py"

# Pre-flight against live inputs before enabling the timer again.
set +e
if [[ "${MODE}" == upstream-preservation ]]; then
  python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
    --upstream-binding "${UPSTREAM_BINDING}" \
    --upstream-binding-sha256 "${UPSTREAM_BINDING_SHA256}" \
    --gem-root "${GEM_ROOT}" \
    --check
else
  python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
    --provenance "${SYMPHONY_RELEASE_PROVENANCE}" \
    --source-root "${JOVIE_CONFIGURATION_SOURCE_ROOT}" \
    --source-revision "${JOVIE_CONFIGURATION_SOURCE_REVISION}" \
    --profile "${JOVIE_CONFIGURATION_PROFILE:-canonical}" \
    --gem-root "${GEM_ROOT}" \
    --check
fi
check_status=$?
set -e
if [[ "${check_status}" -ne 0 ]]; then
  printf 'pre-install --check failed with exit %s; restoring previous source and timer state from %s\n' \
    "${check_status}" "${BACKUP_DIR}" >&2
  exit "${check_status}"
fi

systemctl --user daemon-reload

# Publish one fresh observation for activation verify.
set +e
if [[ "${MODE}" == upstream-preservation ]]; then
  python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
    --upstream-binding "${UPSTREAM_BINDING}" \
    --upstream-binding-sha256 "${UPSTREAM_BINDING_SHA256}" \
    --gem-root "${GEM_ROOT}"
else
  python3 "${GEM_ROOT}/scripts/emit-gem-service-attestation.py" \
    --provenance "${SYMPHONY_RELEASE_PROVENANCE}" \
    --source-root "${JOVIE_CONFIGURATION_SOURCE_ROOT}" \
    --source-revision "${JOVIE_CONFIGURATION_SOURCE_REVISION}" \
    --profile "${JOVIE_CONFIGURATION_PROFILE:-canonical}" \
    --gem-root "${GEM_ROOT}"
fi
publish_status=$?
set -e
if [[ "${publish_status}" -ne 0 ]]; then
  printf 'publisher install succeeded but observation publish exited %s\n' "${publish_status}" >&2
  exit "${publish_status}"
fi

# Publish successfully before resuming the same timer. A failed publisher must
# not leave a newly active timer reading files during source rollback.
if systemctl --user list-unit-files "${TIMER}" | grep -q "${TIMER}"; then
  systemctl --user start "${TIMER}"
else
  printf 'warning: %s is not installed as a user unit; publisher files installed but timer not started\n' "${TIMER}" >&2
fi

printf 'gem-service-attestation publisher installed (backup=%s)\n' "${BACKUP_DIR}"
install_complete=true
trap - EXIT
