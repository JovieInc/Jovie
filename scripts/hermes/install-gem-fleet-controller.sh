#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_ROOT="${1:-$(git rev-parse --show-toplevel)}"
readonly GEM_ROOT="${GEM_WORKSPACE:-/home/timwhite/gem-workspace}"
readonly SYMPHONY_ROOT="${SYMPHONY_RUNTIME:-/home/timwhite/symphony-runtime/elixir}"
readonly TIMER="gem-pr-drain.timer"
readonly SERVICE="symphony-ui-pilot.service"
readonly VERIFY_ONLY="${FLEET_INSTALL_VERIFY_ONLY:-false}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly BACKUP_DIR="${GEM_ROOT}/state/backups/fleet-controller-${STAMP}"

readonly GATE_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem-priority-gate.py"
readonly CONTRACT_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem_gate_contract.py"
readonly CONSUMER_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem-pr-drain.py"
readonly WORKFLOW_SOURCE="${SOURCE_ROOT}/scripts/hermes/WORKFLOW.jovie-ui-pilot.md"
readonly GATE_TARGET="${GEM_ROOT}/scripts/gem-priority-gate.py"
readonly CONTRACT_TARGET="${GEM_ROOT}/scripts/gem_gate_contract.py"
readonly CONSUMER_TARGET="${GEM_ROOT}/scripts/gem-pr-drain.py"
readonly WORKFLOW_TARGET="${SYMPHONY_ROOT}/WORKFLOW.jovie-ui-pilot.md"

for source in "${GATE_SOURCE}" "${CONTRACT_SOURCE}" "${CONSUMER_SOURCE}" "${WORKFLOW_SOURCE}"; do
  [[ -f "${source}" ]] || { printf 'missing install source: %s\n' "${source}" >&2; exit 2; }
done

git -C "${SOURCE_ROOT}" diff --quiet -- \
  scripts/hermes/gem-priority-gate.py \
  scripts/hermes/gem_gate_contract.py \
  scripts/hermes/gem-pr-drain.py \
  scripts/hermes/WORKFLOW.jovie-ui-pilot.md
git -C "${SOURCE_ROOT}" diff --cached --quiet -- \
  scripts/hermes/gem-priority-gate.py \
  scripts/hermes/gem_gate_contract.py \
  scripts/hermes/gem-pr-drain.py \
  scripts/hermes/WORKFLOW.jovie-ui-pilot.md

python3 -m py_compile "${GATE_SOURCE}" "${CONTRACT_SOURCE}" "${CONSUMER_SOURCE}"
if [[ "${VERIFY_ONLY}" == true ]]; then
  printf 'fleet controller install sources verified\n'
  sha256sum "${GATE_SOURCE}" "${CONTRACT_SOURCE}" "${CONSUMER_SOURCE}" "${WORKFLOW_SOURCE}"
  exit 0
fi
mkdir -p "${BACKUP_DIR}"
cp -p "${GATE_TARGET}" "${BACKUP_DIR}/gem-priority-gate.py"
cp -p "${CONSUMER_TARGET}" "${BACKUP_DIR}/gem-pr-drain.py"
[[ ! -e "${CONTRACT_TARGET}" ]] || cp -p "${CONTRACT_TARGET}" "${BACKUP_DIR}/gem_gate_contract.py"
cp -p "${WORKFLOW_TARGET}" "${BACKUP_DIR}/WORKFLOW.jovie-ui-pilot.md"

timer_was_active=false
contract_existed=false
install_started=false
install_complete=false
[[ ! -e "${CONTRACT_TARGET}" ]] || contract_existed=true

restore_atomic() {
  local source="$1" target="$2" temporary
  temporary="${target}.rollback.$$"
  cp -p "${source}" "${temporary}"
  mv "${temporary}" "${target}"
}

finish_or_rollback() {
  local status="$?"
  if [[ "${install_complete}" != true ]]; then
    systemctl --user stop "${TIMER}" >/dev/null 2>&1 || true
    if [[ "${install_started}" == true ]]; then
      restore_atomic "${BACKUP_DIR}/gem-priority-gate.py" "${GATE_TARGET}"
      restore_atomic "${BACKUP_DIR}/gem-pr-drain.py" "${CONSUMER_TARGET}"
      restore_atomic "${BACKUP_DIR}/WORKFLOW.jovie-ui-pilot.md" "${WORKFLOW_TARGET}"
      if [[ "${contract_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/gem_gate_contract.py" "${CONTRACT_TARGET}"
      else
        rm -f "${CONTRACT_TARGET}"
      fi
      systemctl --user restart "${SERVICE}" >/dev/null 2>&1 || true
    fi
    if [[ "${timer_was_active}" == true ]]; then
      systemctl --user start "${TIMER}" >/dev/null 2>&1 || true
    fi
    printf 'fleet controller install rolled back; backup=%s\n' "${BACKUP_DIR}" >&2
  fi
  exit "${status}"
}
trap finish_or_rollback EXIT

if systemctl --user is-active --quiet "${TIMER}"; then
  timer_was_active=true
  systemctl --user stop "${TIMER}"
fi
for _ in $(seq 1 20); do
  systemctl --user is-active --quiet gem-pr-drain.service || break
  sleep 1
done
if systemctl --user is-active --quiet gem-pr-drain.service; then
  printf 'gem-pr-drain.service is still active; refusing a mixed-interface install\n' >&2
  exit 3
fi

install_atomic() {
  local source="$1" target="$2" mode="$3" temporary
  temporary="${target}.tmp.$$"
  install -m "${mode}" "${source}" "${temporary}"
  mv "${temporary}" "${target}"
}

install_started=true
install_atomic "${GATE_SOURCE}" "${GATE_TARGET}" 0755
install_atomic "${CONTRACT_SOURCE}" "${CONTRACT_TARGET}" 0644
install_atomic "${CONSUMER_SOURCE}" "${CONSUMER_TARGET}" 0755
install_atomic "${WORKFLOW_SOURCE}" "${WORKFLOW_TARGET}" 0644
python3 -m py_compile "${GATE_TARGET}" "${CONTRACT_TARGET}" "${CONSUMER_TARGET}"

systemctl --user restart "${SERVICE}"
for _ in $(seq 1 45); do
  if systemctl --user is-active --quiet "${SERVICE}" && curl --fail --silent --show-error --max-time 3 \
    http://127.0.0.1:4041/api/v1/state >/dev/null; then
    break
  fi
  sleep 2
done
systemctl --user is-active --quiet "${SERVICE}"
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4041/api/v1/state >/dev/null

if [[ "${timer_was_active}" == true ]]; then
  systemctl --user start "${TIMER}"
fi

install_complete=true
trap - EXIT
printf 'installed fleet controller backup=%s\n' "${BACKUP_DIR}"
sha256sum "${GATE_TARGET}" "${CONTRACT_TARGET}" "${CONSUMER_TARGET}" "${WORKFLOW_TARGET}"
