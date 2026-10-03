#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_ROOT="${1:-$(git rev-parse --show-toplevel)}"
readonly GEM_ROOT="${GEM_WORKSPACE:-/home/timwhite/gem-workspace}"
readonly SYMPHONY_ROOT="${SYMPHONY_RUNTIME:-${HOME}/.config/symphony}"
readonly TIMER="gem-pr-drain.timer"
readonly SERVICE="symphony-elixir.service"
readonly CONCURRENCY_SERVICE="symphony-concurrency-controller.service"
readonly CONCURRENCY_TIMER="symphony-concurrency-controller.timer"
readonly RETIRED_CAPACITY_TIMER="gem-oauth-concurrency-evidence.timer"
readonly VERIFY_ONLY="${FLEET_INSTALL_VERIFY_ONLY:-false}"
readonly PREFLIGHT_ONLY="${FLEET_INSTALL_PREFLIGHT_ONLY:-false}"
readonly STAGE_ONLY="${FLEET_INSTALL_STAGE_ONLY:-false}"
readonly EXPECTED_SOURCE_REVISION="${GEM_CONTROLLER_EXPECTED_REVISION:-}"
readonly PROC_ROOT="${GEM_PROC_ROOT:-/proc}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly INSTALL_LOCK_PATH="${GEM_ROOT}/state/fleet-controller-install.lock"

readonly GATE_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem-priority-gate.py"
readonly CLOSURE_SOURCE="${SOURCE_ROOT}/scripts/hermes/closure_health.py"
readonly CONTRACT_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem_gate_contract.py"
readonly CONSUMER_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem-pr-drain.py"
readonly REGISTRY_MODULE_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem_repo_registry.py"
readonly REGISTRY_CONFIG_SOURCE="${SOURCE_ROOT}/scripts/hermes/config/gem-repo-registry.json"
readonly POLICY_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem_rehabilitation_policy.py"
readonly WORKFLOW_SOURCE="${SOURCE_ROOT}/scripts/hermes/symphony/WORKFLOW.md"
readonly SERVICE_UNIT_SOURCE="${SOURCE_ROOT}/scripts/hermes/systemd/symphony-elixir.service"
readonly CAPACITY_MODULE_SOURCE="${SOURCE_ROOT}/scripts/hermes/provider_useful_turns.py"
readonly CAPACITY_WRITER_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem-concurrency-evidence.py"
readonly CAPACITY_BOOTSTRAP_SOURCE="${SOURCE_ROOT}/scripts/hermes/provider-capacity-bootstrap.py"
readonly LEASE_GUARD_SOURCE="${SOURCE_ROOT}/scripts/hermes/symphony-lease-guard"
readonly CONCURRENCY_CONTROLLER_SOURCE="${SOURCE_ROOT}/scripts/hermes/symphony-concurrency-controller.py"
readonly CONCURRENCY_CONTROLLER_UNIT_SOURCE="${SOURCE_ROOT}/scripts/hermes/systemd/symphony-concurrency-controller.service"
readonly CONCURRENCY_CONTROLLER_TIMER_SOURCE="${SOURCE_ROOT}/scripts/hermes/systemd/symphony-concurrency-controller.timer"
readonly CODEX_ROTATE_SOURCE="${SOURCE_ROOT}/scripts/hermes/codex-rotate"
readonly GATE_TARGET="${GEM_ROOT}/scripts/gem-priority-gate.py"
readonly CLOSURE_TARGET="${GEM_ROOT}/scripts/closure_health.py"
readonly CONTRACT_TARGET="${GEM_ROOT}/scripts/gem_gate_contract.py"
readonly CONSUMER_TARGET="${GEM_ROOT}/scripts/gem-pr-drain.py"
readonly REGISTRY_MODULE_TARGET="${GEM_ROOT}/scripts/gem_repo_registry.py"
readonly REGISTRY_CONFIG_TARGET="${GEM_ROOT}/config/gem-repo-registry.json"
readonly POLICY_TARGET="${GEM_ROOT}/scripts/gem_rehabilitation_policy.py"
readonly WORKFLOW_TARGET="${SYMPHONY_ROOT}/WORKFLOW.md"
readonly SERVICE_UNIT_TARGET="${HOME}/.config/systemd/user/symphony-elixir.service"
readonly CAPACITY_MODULE_TARGET="${GEM_ROOT}/scripts/provider_useful_turns.py"
readonly CAPACITY_WRITER_TARGET="${GEM_ROOT}/scripts/gem-concurrency-evidence.py"
readonly CAPACITY_BOOTSTRAP_TARGET="${GEM_ROOT}/scripts/provider-capacity-bootstrap.py"
readonly LEASE_GUARD_TARGET="${HOME}/.local/bin/symphony-lease-guard"
readonly CONCURRENCY_CONTROLLER_TARGET="${HOME}/.local/bin/symphony-concurrency-controller"
readonly CONCURRENCY_MODULE_TARGET="${HOME}/.local/bin/provider_useful_turns.py"
readonly CONCURRENCY_CONTROLLER_UNIT_TARGET="${HOME}/.config/systemd/user/symphony-concurrency-controller.service"
readonly CONCURRENCY_CONTROLLER_TIMER_TARGET="${HOME}/.config/systemd/user/symphony-concurrency-controller.timer"
readonly CODEX_ROTATE_TARGET="${HOME}/.local/bin/codex-rotate"
readonly CONCURRENCY_RECEIPT="${GEM_ROOT}/state/symphony-concurrency.json"
# shellcheck source=lib/user-systemd-context.sh
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/user-systemd-context.sh"

smoke_consumer_import() {
  local consumer="$1" module_root
  module_root="$(dirname "${consumer}")"
  CONSUMER_IMPORT_TARGET="${consumer}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH="${module_root}" \
    python3 - <<'PY'
import os
import runpy

namespace = runpy.run_path(
    os.environ["CONSUMER_IMPORT_TARGET"],
    run_name="gem_pr_drain_import_smoke",
)
required = ("bounded_selection", "decide_action", "lease_key")
missing = [name for name in required if not callable(namespace.get(name))]
if missing:
    raise SystemExit(f"Gem PR drain import smoke missing callables: {', '.join(missing)}")
PY
}

assert_official_service_ready() {
  for _ in $(seq 1 45); do
    if systemctl --user is-active --quiet "${SERVICE}" && \
      curl --fail --silent --show-error --max-time 3 \
        http://127.0.0.1:4041/api/v1/state >/dev/null; then
      return 0
    fi
    sleep 2
  done
  printf 'official Symphony service %s is not active and healthy on 4041; run update-symphony-burrito.sh first\n' \
    "${SERVICE}" >&2
  return 4
}

if [[ "${PREFLIGHT_ONLY}" == true ]]; then
  prepare_user_systemd_context
  printf 'Gem user systemd preflight passed (XDG_RUNTIME_DIR=%s)\n' "${XDG_RUNTIME_DIR}"
  exit 0
fi

for source in \
  "${GATE_SOURCE}" \
  "${CLOSURE_SOURCE}" \
  "${CONTRACT_SOURCE}" \
  "${CONSUMER_SOURCE}" \
  "${REGISTRY_MODULE_SOURCE}" \
  "${REGISTRY_CONFIG_SOURCE}" \
  "${POLICY_SOURCE}" \
  "${WORKFLOW_SOURCE}" \
  "${SERVICE_UNIT_SOURCE}" \
  "${CAPACITY_MODULE_SOURCE}" \
  "${CAPACITY_WRITER_SOURCE}" \
  "${CAPACITY_BOOTSTRAP_SOURCE}" \
  "${LEASE_GUARD_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_UNIT_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_TIMER_SOURCE}" \
  "${CODEX_ROTATE_SOURCE}"
do
  [[ -f "${source}" ]] || { printf 'missing install source: %s\n' "${source}" >&2; exit 2; }
done

# A revision attestation may only name bytes present in that exact commit.
# git diff does not report untracked files, so bind every install source to its
# HEAD blob explicitly before using SOURCE_REVISION as provenance.
for source in \
  "${GATE_SOURCE}" \
  "${CLOSURE_SOURCE}" \
  "${CONTRACT_SOURCE}" \
  "${CONSUMER_SOURCE}" \
  "${REGISTRY_MODULE_SOURCE}" \
  "${REGISTRY_CONFIG_SOURCE}" \
  "${POLICY_SOURCE}" \
  "${WORKFLOW_SOURCE}" \
  "${SERVICE_UNIT_SOURCE}" \
  "${CAPACITY_MODULE_SOURCE}" \
  "${CAPACITY_WRITER_SOURCE}" \
  "${CAPACITY_BOOTSTRAP_SOURCE}" \
  "${LEASE_GUARD_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_UNIT_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_TIMER_SOURCE}" \
  "${CODEX_ROTATE_SOURCE}"
do
  relative="${source#"${SOURCE_ROOT}/"}"
  tracked_blob="$(git -C "${SOURCE_ROOT}" rev-parse "HEAD:${relative}" 2>/dev/null)" || {
    printf 'install source is not tracked at HEAD: %s\n' "${relative}" >&2
    exit 2
  }
  source_blob="$(git -C "${SOURCE_ROOT}" hash-object "${source}")"
  [[ "${source_blob}" == "${tracked_blob}" ]] || {
    printf 'install source differs from HEAD: %s\n' "${relative}" >&2
    exit 2
  }
done

git -C "${SOURCE_ROOT}" diff --quiet -- \
  scripts/hermes/gem-priority-gate.py \
  scripts/hermes/closure_health.py \
  scripts/hermes/gem_gate_contract.py \
  scripts/hermes/gem-pr-drain.py \
  scripts/hermes/gem_repo_registry.py \
  scripts/hermes/config/gem-repo-registry.json \
  scripts/hermes/gem_rehabilitation_policy.py \
  scripts/hermes/symphony/WORKFLOW.md \
  scripts/hermes/systemd/symphony-elixir.service \
  scripts/hermes/provider_useful_turns.py \
  scripts/hermes/gem-concurrency-evidence.py \
  scripts/hermes/provider-capacity-bootstrap.py \
  scripts/hermes/symphony-lease-guard \
  scripts/hermes/symphony-concurrency-controller.py \
  scripts/hermes/systemd/symphony-concurrency-controller.service \
  scripts/hermes/systemd/symphony-concurrency-controller.timer \
  scripts/hermes/codex-rotate \
  scripts/hermes/lib/user-systemd-context.sh
git -C "${SOURCE_ROOT}" diff --cached --quiet -- \
  scripts/hermes/gem-priority-gate.py \
  scripts/hermes/closure_health.py \
  scripts/hermes/gem_gate_contract.py \
  scripts/hermes/gem-pr-drain.py \
  scripts/hermes/gem_repo_registry.py \
  scripts/hermes/config/gem-repo-registry.json \
  scripts/hermes/gem_rehabilitation_policy.py \
  scripts/hermes/lib/user-systemd-context.sh \
  scripts/hermes/symphony/WORKFLOW.md \
  scripts/hermes/systemd/symphony-elixir.service \
  scripts/hermes/provider_useful_turns.py \
  scripts/hermes/gem-concurrency-evidence.py \
  scripts/hermes/provider-capacity-bootstrap.py \
  scripts/hermes/symphony-lease-guard \
  scripts/hermes/symphony-concurrency-controller.py \
  scripts/hermes/systemd/symphony-concurrency-controller.service \
  scripts/hermes/systemd/symphony-concurrency-controller.timer \
  scripts/hermes/codex-rotate

SOURCE_REVISION="$(git -C "${SOURCE_ROOT}" rev-parse HEAD)"
if [[ -n "${EXPECTED_SOURCE_REVISION}" ]]; then
  [[ "${EXPECTED_SOURCE_REVISION}" =~ ^[0-9a-f]{40}$ ]] || {
    printf 'GEM_CONTROLLER_EXPECTED_REVISION must be a full lowercase SHA\n' >&2
    exit 2
  }
  [[ "${SOURCE_REVISION}" == "${EXPECTED_SOURCE_REVISION}" ]] || {
    printf 'refusing controller install from %s; expected %s\n' \
      "${SOURCE_REVISION}" "${EXPECTED_SOURCE_REVISION}" >&2
    exit 3
  }
fi

python3 -m py_compile \
  "${GATE_SOURCE}" \
  "${CLOSURE_SOURCE}" \
  "${CONTRACT_SOURCE}" \
  "${CONSUMER_SOURCE}" \
  "${REGISTRY_MODULE_SOURCE}" \
  "${POLICY_SOURCE}" \
  "${CAPACITY_MODULE_SOURCE}" \
  "${CAPACITY_WRITER_SOURCE}" \
  "${CAPACITY_BOOTSTRAP_SOURCE}" \
  "${CONCURRENCY_CONTROLLER_SOURCE}"
python3 -m json.tool "${REGISTRY_CONFIG_SOURCE}" >/dev/null
smoke_consumer_import "${CONSUMER_SOURCE}"
if [[ "${VERIFY_ONLY}" == true ]]; then
  printf 'fleet controller install sources verified\n'
  sha256sum \
    "${GATE_SOURCE}" \
    "${CLOSURE_SOURCE}" \
    "${CONTRACT_SOURCE}" \
    "${CONSUMER_SOURCE}" \
    "${REGISTRY_MODULE_SOURCE}" \
    "${REGISTRY_CONFIG_SOURCE}" \
    "${POLICY_SOURCE}" \
    "${WORKFLOW_SOURCE}" \
    "${SERVICE_UNIT_SOURCE}" \
    "${CAPACITY_MODULE_SOURCE}" \
    "${CAPACITY_WRITER_SOURCE}" \
    "${CAPACITY_BOOTSTRAP_SOURCE}" \
    "${LEASE_GUARD_SOURCE}" \
    "${CONCURRENCY_CONTROLLER_SOURCE}" \
    "${CONCURRENCY_CONTROLLER_UNIT_SOURCE}" \
    "${CONCURRENCY_CONTROLLER_TIMER_SOURCE}" \
    "${CODEX_ROTATE_SOURCE}"
  exit 0
fi

mkdir -p "${GEM_ROOT}/state"
exec 9>"${INSTALL_LOCK_PATH}"
if ! command -v flock >/dev/null 2>&1; then
  printf 'fleet controller install requires util-linux flock\n' >&2
  exit 4
fi
if ! flock -n 9; then
  printf 'fleet controller install lock is already held: %s\n' "${INSTALL_LOCK_PATH}" >&2
  exit 5
fi
release_install_lock() {
  flock -u 9 >/dev/null 2>&1 || true
  exec 9>&-
}
trap release_install_lock EXIT
prepare_user_systemd_context
if [[ "${STAGE_ONLY}" != true ]]; then
  assert_official_service_ready
fi

timer_was_active=false
concurrency_timer_was_active=false
concurrency_timer_was_enabled=false
concurrency_service_was_active=false
retired_capacity_timer_was_active=false
retired_capacity_timer_was_enabled=false

restore_preinstall_units() {
  if [[ "${timer_was_active}" == true ]]; then
    systemctl --user start "${TIMER}" >/dev/null 2>&1 || true
  fi
  if [[ "${concurrency_timer_was_enabled}" == true ]]; then
    systemctl --user enable "${CONCURRENCY_TIMER}" >/dev/null 2>&1 || true
  else
    systemctl --user disable "${CONCURRENCY_TIMER}" >/dev/null 2>&1 || true
  fi
  if [[ "${concurrency_timer_was_active}" == true ]]; then
    systemctl --user start "${CONCURRENCY_TIMER}" >/dev/null 2>&1 || true
  fi
  if [[ "${concurrency_service_was_active}" == true ]]; then
    systemctl --user start "${CONCURRENCY_SERVICE}" >/dev/null 2>&1 || true
  fi
  if [[ "${retired_capacity_timer_was_enabled}" == true ]]; then
    systemctl --user enable "${RETIRED_CAPACITY_TIMER}" >/dev/null 2>&1 || true
  fi
  if [[ "${retired_capacity_timer_was_active}" == true ]]; then
    systemctl --user start "${RETIRED_CAPACITY_TIMER}" >/dev/null 2>&1 || true
  fi
}

restore_preinstall_on_error() {
  local status="$?"
  restore_preinstall_units
  exit "${status}"
}
trap restore_preinstall_on_error ERR

if systemctl --user is-active --quiet "${TIMER}"; then
  timer_was_active=true
  systemctl --user stop "${TIMER}"
fi
if systemctl --user is-active --quiet "${CONCURRENCY_TIMER}"; then
  concurrency_timer_was_active=true
  systemctl --user stop "${CONCURRENCY_TIMER}"
fi
if systemctl --user is-enabled --quiet "${CONCURRENCY_TIMER}"; then
  concurrency_timer_was_enabled=true
fi
if systemctl --user is-active --quiet "${RETIRED_CAPACITY_TIMER}"; then
  retired_capacity_timer_was_active=true
  systemctl --user stop "${RETIRED_CAPACITY_TIMER}"
fi
if systemctl --user is-enabled --quiet "${RETIRED_CAPACITY_TIMER}"; then
  retired_capacity_timer_was_enabled=true
fi
if systemctl --user is-active --quiet "${CONCURRENCY_SERVICE}"; then
  concurrency_service_was_active=true
  systemctl --user stop "${CONCURRENCY_SERVICE}"
fi
for _ in $(seq 1 20); do
  systemctl --user is-active --quiet "${CONCURRENCY_SERVICE}" || break
  sleep 1
done
if systemctl --user is-active --quiet "${CONCURRENCY_SERVICE}"; then
  printf '%s is still active; refusing a concurrent controller install\n' \
    "${CONCURRENCY_SERVICE}" >&2
  restore_preinstall_units
  trap - ERR
  exit 3
fi
for _ in $(seq 1 20); do
  systemctl --user is-active --quiet gem-pr-drain.service || break
  sleep 1
done
if systemctl --user is-active --quiet gem-pr-drain.service; then
  printf 'gem-pr-drain.service is still active; refusing a mixed-interface install\n' >&2
  restore_preinstall_units
  trap - ERR
  exit 3
fi

mkdir -p "${GEM_ROOT}/state/backups"
BACKUP_DIR="$(mktemp -d "${GEM_ROOT}/state/backups/fleet-controller-${STAMP}-XXXXXX")"
readonly BACKUP_DIR
mkdir -p \
  "${BACKUP_DIR}" \
  "${GEM_ROOT}/scripts" \
  "${GEM_ROOT}/config" \
  "$(dirname "${WORKFLOW_TARGET}")" \
  "${HOME}/.local/bin" \
  "${HOME}/.config/systemd/user"
cp -p "${GATE_TARGET}" "${BACKUP_DIR}/gem-priority-gate.py"
[[ ! -e "${CLOSURE_TARGET}" ]] || cp -p "${CLOSURE_TARGET}" "${BACKUP_DIR}/closure_health.py"
cp -p "${CONSUMER_TARGET}" "${BACKUP_DIR}/gem-pr-drain.py"
[[ ! -e "${CONTRACT_TARGET}" ]] || cp -p "${CONTRACT_TARGET}" "${BACKUP_DIR}/gem_gate_contract.py"
[[ ! -e "${REGISTRY_MODULE_TARGET}" ]] || \
  cp -p "${REGISTRY_MODULE_TARGET}" "${BACKUP_DIR}/gem_repo_registry.py"
[[ ! -e "${REGISTRY_CONFIG_TARGET}" ]] || \
  cp -p "${REGISTRY_CONFIG_TARGET}" "${BACKUP_DIR}/gem-repo-registry.json"
[[ ! -e "${POLICY_TARGET}" ]] || \
  cp -p "${POLICY_TARGET}" "${BACKUP_DIR}/gem_rehabilitation_policy.py"
[[ ! -e "${WORKFLOW_TARGET}" ]] || cp -p "${WORKFLOW_TARGET}" "${BACKUP_DIR}/WORKFLOW.md"
[[ ! -e "${SERVICE_UNIT_TARGET}" ]] || cp -p "${SERVICE_UNIT_TARGET}" "${BACKUP_DIR}/symphony-elixir.service"
[[ ! -e "${CAPACITY_MODULE_TARGET}" ]] || cp -p "${CAPACITY_MODULE_TARGET}" "${BACKUP_DIR}/provider_useful_turns.py"
[[ ! -e "${CAPACITY_WRITER_TARGET}" ]] || cp -p "${CAPACITY_WRITER_TARGET}" "${BACKUP_DIR}/gem-concurrency-evidence.py"
[[ ! -e "${CAPACITY_BOOTSTRAP_TARGET}" ]] || cp -p "${CAPACITY_BOOTSTRAP_TARGET}" "${BACKUP_DIR}/provider-capacity-bootstrap.py"
[[ ! -e "${LEASE_GUARD_TARGET}" ]] || cp -p "${LEASE_GUARD_TARGET}" "${BACKUP_DIR}/symphony-lease-guard"
[[ ! -e "${CONCURRENCY_CONTROLLER_TARGET}" ]] || cp -p "${CONCURRENCY_CONTROLLER_TARGET}" "${BACKUP_DIR}/symphony-concurrency-controller"
[[ ! -e "${CONCURRENCY_MODULE_TARGET}" ]] || cp -p "${CONCURRENCY_MODULE_TARGET}" "${BACKUP_DIR}/controller-provider_useful_turns.py"
[[ ! -e "${CONCURRENCY_CONTROLLER_UNIT_TARGET}" ]] || cp -p "${CONCURRENCY_CONTROLLER_UNIT_TARGET}" "${BACKUP_DIR}/symphony-concurrency-controller.service"
[[ ! -e "${CONCURRENCY_CONTROLLER_TIMER_TARGET}" ]] || cp -p "${CONCURRENCY_CONTROLLER_TIMER_TARGET}" "${BACKUP_DIR}/symphony-concurrency-controller.timer"
[[ ! -e "${CODEX_ROTATE_TARGET}" ]] || cp -p "${CODEX_ROTATE_TARGET}" "${BACKUP_DIR}/codex-rotate"

closure_existed=false
contract_existed=false
registry_module_existed=false
registry_config_existed=false
policy_existed=false
workflow_existed=false
service_unit_existed=false
capacity_module_existed=false
capacity_writer_existed=false
capacity_bootstrap_existed=false
lease_guard_existed=false
concurrency_controller_existed=false
concurrency_module_existed=false
concurrency_controller_unit_existed=false
concurrency_controller_timer_existed=false
codex_rotate_existed=false
install_started=false
install_complete=false
[[ ! -e "${CONTRACT_TARGET}" ]] || contract_existed=true
[[ ! -e "${CLOSURE_TARGET}" ]] || closure_existed=true
[[ ! -e "${REGISTRY_MODULE_TARGET}" ]] || registry_module_existed=true
[[ ! -e "${REGISTRY_CONFIG_TARGET}" ]] || registry_config_existed=true
[[ ! -e "${POLICY_TARGET}" ]] || policy_existed=true
[[ ! -e "${WORKFLOW_TARGET}" ]] || workflow_existed=true
[[ ! -e "${SERVICE_UNIT_TARGET}" ]] || service_unit_existed=true
[[ ! -e "${CAPACITY_MODULE_TARGET}" ]] || capacity_module_existed=true
[[ ! -e "${CAPACITY_WRITER_TARGET}" ]] || capacity_writer_existed=true
[[ ! -e "${CAPACITY_BOOTSTRAP_TARGET}" ]] || capacity_bootstrap_existed=true
[[ ! -e "${LEASE_GUARD_TARGET}" ]] || lease_guard_existed=true
[[ ! -e "${CONCURRENCY_CONTROLLER_TARGET}" ]] || concurrency_controller_existed=true
[[ ! -e "${CONCURRENCY_MODULE_TARGET}" ]] || concurrency_module_existed=true
[[ ! -e "${CONCURRENCY_CONTROLLER_UNIT_TARGET}" ]] || concurrency_controller_unit_existed=true
[[ ! -e "${CONCURRENCY_CONTROLLER_TIMER_TARGET}" ]] || concurrency_controller_timer_existed=true
[[ ! -e "${CODEX_ROTATE_TARGET}" ]] || codex_rotate_existed=true

restore_atomic() {
  local source="$1" target="$2" temporary
  temporary="${target}.rollback.$$"
  cp -p "${source}" "${temporary}"
  mv "${temporary}" "${target}"
}

restore_managed() {
  local existed="$1" backup="$2" target="$3"
  if [[ "${existed}" == true ]]; then
    restore_atomic "${backup}" "${target}"
  else
    rm -f "${target}"
  fi
}

finish_or_rollback() {
  local status="$?"
  if [[ "${install_complete}" != true ]]; then
    systemctl --user stop "${TIMER}" >/dev/null 2>&1 || true
    systemctl --user stop "${CONCURRENCY_TIMER}" >/dev/null 2>&1 || true
    if [[ "${install_started}" == true ]]; then
      restore_atomic "${BACKUP_DIR}/gem-priority-gate.py" "${GATE_TARGET}"
      restore_atomic "${BACKUP_DIR}/gem-pr-drain.py" "${CONSUMER_TARGET}"
      if [[ "${workflow_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/WORKFLOW.md" "${WORKFLOW_TARGET}"
      else
        rm -f "${WORKFLOW_TARGET}"
      fi
      if [[ "${closure_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/closure_health.py" "${CLOSURE_TARGET}"
      else
        rm -f "${CLOSURE_TARGET}"
      fi
      if [[ "${contract_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/gem_gate_contract.py" "${CONTRACT_TARGET}"
      else
        rm -f "${CONTRACT_TARGET}"
      fi
      if [[ "${registry_module_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/gem_repo_registry.py" "${REGISTRY_MODULE_TARGET}"
      else
        rm -f "${REGISTRY_MODULE_TARGET}"
      fi
      if [[ "${registry_config_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/gem-repo-registry.json" "${REGISTRY_CONFIG_TARGET}"
      else
        rm -f "${REGISTRY_CONFIG_TARGET}"
      fi
      if [[ "${policy_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/gem_rehabilitation_policy.py" "${POLICY_TARGET}"
      else
        rm -f "${POLICY_TARGET}"
      fi
      if [[ "${service_unit_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/symphony-elixir.service" "${SERVICE_UNIT_TARGET}"
      else
        rm -f "${SERVICE_UNIT_TARGET}"
      fi
      restore_managed "${capacity_module_existed}" "${BACKUP_DIR}/provider_useful_turns.py" "${CAPACITY_MODULE_TARGET}"
      restore_managed "${capacity_writer_existed}" "${BACKUP_DIR}/gem-concurrency-evidence.py" "${CAPACITY_WRITER_TARGET}"
      restore_managed "${capacity_bootstrap_existed}" "${BACKUP_DIR}/provider-capacity-bootstrap.py" "${CAPACITY_BOOTSTRAP_TARGET}"
      restore_managed "${lease_guard_existed}" "${BACKUP_DIR}/symphony-lease-guard" "${LEASE_GUARD_TARGET}"
      restore_managed "${concurrency_controller_existed}" "${BACKUP_DIR}/symphony-concurrency-controller" "${CONCURRENCY_CONTROLLER_TARGET}"
      restore_managed "${concurrency_module_existed}" "${BACKUP_DIR}/controller-provider_useful_turns.py" "${CONCURRENCY_MODULE_TARGET}"
      restore_managed "${concurrency_controller_unit_existed}" "${BACKUP_DIR}/symphony-concurrency-controller.service" "${CONCURRENCY_CONTROLLER_UNIT_TARGET}"
      restore_managed "${concurrency_controller_timer_existed}" "${BACKUP_DIR}/symphony-concurrency-controller.timer" "${CONCURRENCY_CONTROLLER_TIMER_TARGET}"
      restore_managed "${codex_rotate_existed}" "${BACKUP_DIR}/codex-rotate" "${CODEX_ROTATE_TARGET}"
      systemctl --user daemon-reload >/dev/null 2>&1 || true
    fi
    restore_preinstall_units
    printf 'fleet controller install rolled back; backup=%s\n' "${BACKUP_DIR}" >&2
  fi
  release_install_lock
  exit "${status}"
}
trap - ERR
trap finish_or_rollback EXIT

install_atomic() {
  local source="$1" target="$2" mode="$3" temporary
  temporary="${target}.tmp.$$"
  install -m "${mode}" "${source}" "${temporary}"
  mv "${temporary}" "${target}"
}

install_started=true
install_atomic "${GATE_SOURCE}" "${GATE_TARGET}" 0755
install_atomic "${CLOSURE_SOURCE}" "${CLOSURE_TARGET}" 0755
install_atomic "${CONTRACT_SOURCE}" "${CONTRACT_TARGET}" 0644
install_atomic "${CONSUMER_SOURCE}" "${CONSUMER_TARGET}" 0755
install_atomic "${REGISTRY_MODULE_SOURCE}" "${REGISTRY_MODULE_TARGET}" 0755
install_atomic "${REGISTRY_CONFIG_SOURCE}" "${REGISTRY_CONFIG_TARGET}" 0644
install_atomic "${POLICY_SOURCE}" "${POLICY_TARGET}" 0644
WORKFLOW_INSTALL_SOURCE="${WORKFLOW_SOURCE}"
if [[ -f "${WORKFLOW_TARGET}" ]]; then
  WORKFLOW_OVERLAY_CANDIDATE="${BACKUP_DIR}/WORKFLOW.overlay"
  if PRESERVED_WORKFLOW_CAP="$(python3 - "${WORKFLOW_SOURCE}" "${WORKFLOW_TARGET}" "${WORKFLOW_OVERLAY_CANDIDATE}" <<'PY'
import pathlib
import re
import sys

source_path, installed_path, candidate_path = map(pathlib.Path, sys.argv[1:])
pattern = re.compile(r"^(\s*max_concurrent_agents:\s*)(\d+)(\s*)$", re.MULTILINE)
source = source_path.read_text(encoding="utf-8")
installed = installed_path.read_text(encoding="utf-8")
source_matches = list(pattern.finditer(source))
installed_matches = list(pattern.finditer(installed))
if len(source_matches) != 1 or len(installed_matches) != 1:
    raise SystemExit(1)
installed_cap = int(installed_matches[0].group(2))
if not 1 <= installed_cap <= 40:
    raise SystemExit(1)
normalize = lambda text: pattern.sub(r"\g<1>__RUNTIME_OVERLAY__\g<3>", text)
if normalize(source) != normalize(installed):
    raise SystemExit(1)
candidate = pattern.sub(
    lambda match: f"{match.group(1)}{installed_cap}{match.group(3)}", source
)
candidate_path.write_text(candidate, encoding="utf-8")
print(installed_cap)
PY
)"; then
    WORKFLOW_INSTALL_SOURCE="${WORKFLOW_OVERLAY_CANDIDATE}"
    printf 'preserving controller-owned max_concurrent_agents=%s\n' \
      "${PRESERVED_WORKFLOW_CAP}"
  fi
fi
install_atomic "${WORKFLOW_INSTALL_SOURCE}" "${WORKFLOW_TARGET}" 0644
mkdir -p "$(dirname "${SERVICE_UNIT_TARGET}")"
install_atomic "${SERVICE_UNIT_SOURCE}" "${SERVICE_UNIT_TARGET}" 0644
install_atomic "${CAPACITY_MODULE_SOURCE}" "${CAPACITY_MODULE_TARGET}" 0644
install_atomic "${CAPACITY_WRITER_SOURCE}" "${CAPACITY_WRITER_TARGET}" 0755
install_atomic "${CAPACITY_BOOTSTRAP_SOURCE}" "${CAPACITY_BOOTSTRAP_TARGET}" 0755
install_atomic "${LEASE_GUARD_SOURCE}" "${LEASE_GUARD_TARGET}" 0755
install_atomic "${CONCURRENCY_CONTROLLER_SOURCE}" "${CONCURRENCY_CONTROLLER_TARGET}" 0755
install_atomic "${CAPACITY_MODULE_SOURCE}" "${CONCURRENCY_MODULE_TARGET}" 0644
install_atomic "${CONCURRENCY_CONTROLLER_UNIT_SOURCE}" "${CONCURRENCY_CONTROLLER_UNIT_TARGET}" 0644
install_atomic "${CONCURRENCY_CONTROLLER_TIMER_SOURCE}" "${CONCURRENCY_CONTROLLER_TIMER_TARGET}" 0644
install_atomic "${CODEX_ROTATE_SOURCE}" "${CODEX_ROTATE_TARGET}" 0755
python3 -m py_compile \
  "${GATE_TARGET}" \
  "${CLOSURE_TARGET}" \
  "${CONTRACT_TARGET}" \
  "${CONSUMER_TARGET}" \
  "${REGISTRY_MODULE_TARGET}" \
  "${POLICY_TARGET}" \
  "${CAPACITY_MODULE_TARGET}" \
  "${CAPACITY_WRITER_TARGET}" \
  "${CAPACITY_BOOTSTRAP_TARGET}" \
  "${CONCURRENCY_CONTROLLER_TARGET}"
python3 -m json.tool "${REGISTRY_CONFIG_TARGET}" >/dev/null
smoke_consumer_import "${CONSUMER_TARGET}"

systemctl --user daemon-reload
# Capacity derivation is composed into the existing pressure-controller tick;
# the retired OAuth-seat timer must not remain a second readiness writer.
if ! systemctl --user disable --now "${RETIRED_CAPACITY_TIMER}" >/dev/null 2>&1; then
  if systemctl --user list-unit-files "${RETIRED_CAPACITY_TIMER}" --no-legend 2>/dev/null \
    | grep -Fq "${RETIRED_CAPACITY_TIMER}"; then
    printf 'failed to retire legacy capacity writer: %s\n' "${RETIRED_CAPACITY_TIMER}" >&2
    exit 6
  fi
fi
if systemctl --user is-active --quiet "${RETIRED_CAPACITY_TIMER}" || \
  systemctl --user is-enabled --quiet "${RETIRED_CAPACITY_TIMER}"; then
  printf 'legacy capacity writer remains active or enabled: %s\n' "${RETIRED_CAPACITY_TIMER}" >&2
  exit 6
fi
if [[ "${STAGE_ONLY}" == true ]]; then
  # Activation may be recovering an inactive official runtime. Install and run
  # the service-independent capacity pipeline first so the guarded wrapper has
  # a fresh admission receipt when it starts. Keep the timer disabled until
  # the post-restart installer to exclude a workflow rewrite race while the
  # updater snapshots and promotes the runtime configuration.
  systemctl --user disable --now "${CONCURRENCY_TIMER}"
  systemctl --user start "${CONCURRENCY_SERVICE}"
  [[ -s "${CONCURRENCY_RECEIPT}" ]] || {
    printf 'stage-only controller did not produce %s\n' \
      "${CONCURRENCY_RECEIPT}" >&2
    exit 7
  }
  install_complete=true
  trap - EXIT
  release_install_lock
  printf 'staged fleet capacity pipeline backup=%s\n' "${BACKUP_DIR}"
  exit 0
fi
systemctl --user enable --now "${CONCURRENCY_TIMER}"
systemctl --user start "${CONCURRENCY_SERVICE}"
if ! systemctl --user is-enabled --quiet "${CONCURRENCY_TIMER}" || \
  ! systemctl --user is-active --quiet "${CONCURRENCY_TIMER}"; then
  printf 'concurrency controller timer is not enabled and active: %s\n' \
    "${CONCURRENCY_TIMER}" >&2
  exit 7
fi
assert_official_service_ready
SERVICE_PID="$(systemctl --user show "${SERVICE}" --property=MainPID --value)"
SERVICE_CONTROL_GROUP="$(systemctl --user show "${SERVICE}" --property=ControlGroup --value)"
[[ "${SERVICE_PID}" =~ ^[1-9][0-9]*$ ]]
[[ "${SERVICE_CONTROL_GROUP}" == */symphony-elixir.service ]]
grep -Fq "${SERVICE_CONTROL_GROUP}" "${PROC_ROOT}/${SERVICE_PID}/cgroup"
LISTENER_PID="$(
  ss -ltnp 'sport = :4041' \
    | sed -n 's/.*pid=\([0-9][0-9]*\),.*/\1/p' \
    | head -n 1
)"
[[ "${LISTENER_PID}" =~ ^[1-9][0-9]*$ ]]
grep -Fq "${SERVICE_CONTROL_GROUP}" "${PROC_ROOT}/${LISTENER_PID}/cgroup"

# File writes are not runtime proof. Attest the exact source revision and both
# deployed configuration surfaces only after daemon-reload, service activation,
# and the local state endpoint have all succeeded. This receipt contains hashes
# and state only; it never serializes credentials or configuration contents.
UNIT_SOURCE_SHA="$(sha256sum "${SERVICE_UNIT_SOURCE}" | awk '{print $1}')"
UNIT_TARGET_SHA="$(sha256sum "${SERVICE_UNIT_TARGET}" | awk '{print $1}')"
POLICY_SOURCE_SHA="$(sha256sum "${POLICY_SOURCE}" | awk '{print $1}')"
POLICY_TARGET_SHA="$(sha256sum "${POLICY_TARGET}" | awk '{print $1}')"
GATE_SOURCE_SHA="$(sha256sum "${GATE_SOURCE}" | awk '{print $1}')"
GATE_TARGET_SHA="$(sha256sum "${GATE_TARGET}" | awk '{print $1}')"
CLOSURE_SOURCE_SHA="$(sha256sum "${CLOSURE_SOURCE}" | awk '{print $1}')"
CLOSURE_TARGET_SHA="$(sha256sum "${CLOSURE_TARGET}" | awk '{print $1}')"
export \
  SOURCE_REVISION \
  CAPACITY_MODULE_SOURCE \
  CAPACITY_MODULE_TARGET \
  CAPACITY_WRITER_SOURCE \
  CAPACITY_WRITER_TARGET \
  CAPACITY_BOOTSTRAP_SOURCE \
  CAPACITY_BOOTSTRAP_TARGET \
  LEASE_GUARD_SOURCE \
  LEASE_GUARD_TARGET \
  CONCURRENCY_CONTROLLER_SOURCE \
  CONCURRENCY_CONTROLLER_TARGET \
  CONCURRENCY_MODULE_TARGET \
  CONCURRENCY_CONTROLLER_UNIT_SOURCE \
  CONCURRENCY_CONTROLLER_UNIT_TARGET \
  CONCURRENCY_CONTROLLER_TIMER_SOURCE \
  CONCURRENCY_CONTROLLER_TIMER_TARGET \
  CODEX_ROTATE_SOURCE \
  CODEX_ROTATE_TARGET \
  CONCURRENCY_RECEIPT \
  WORKFLOW_SOURCE \
  WORKFLOW_TARGET \
  UNIT_SOURCE_SHA \
  UNIT_TARGET_SHA \
  POLICY_SOURCE_SHA \
  POLICY_TARGET_SHA \
  GATE_SOURCE_SHA \
  GATE_TARGET_SHA \
  CLOSURE_SOURCE_SHA \
  CLOSURE_TARGET_SHA \
  SERVICE_PID \
  LISTENER_PID \
  SERVICE_CONTROL_GROUP \
  GEM_ROOT
python3 - <<'PY'
import hashlib
import json
import os
import pathlib
import re
from datetime import datetime, timedelta, timezone

root = pathlib.Path(os.environ["GEM_ROOT"])
destination = root / "state" / "gem-service-attestation.json"
destination.parent.mkdir(parents=True, exist_ok=True)
temporary = destination.with_suffix(".json.tmp")

# The pressure controller owns exactly one bounded runtime overlay. It may
# update this value while the official workflow hot-reloads, so attest that
# semantic overlay without restarting or replacing the running Elixir process.
concurrency_pattern = re.compile(
    r"^(\s*max_concurrent_agents:\s*)(\d+)(\s*)$",
    re.MULTILINE,
)
workflow_source_bytes = pathlib.Path(os.environ["WORKFLOW_SOURCE"]).read_bytes()
workflow_installed_bytes = pathlib.Path(os.environ["WORKFLOW_TARGET"]).read_bytes()
workflow_source = workflow_source_bytes.decode("utf-8")
workflow_installed = workflow_installed_bytes.decode("utf-8")
source_matches = list(concurrency_pattern.finditer(workflow_source))
installed_matches = list(concurrency_pattern.finditer(workflow_installed))
workflow_matches = False
workflow_match_mode = "invalid"
source_concurrency = None
installed_concurrency = None
if len(source_matches) == 1 and len(installed_matches) == 1:
    source_concurrency = int(source_matches[0].group(2))
    installed_concurrency = int(installed_matches[0].group(2))

    def normalized(text: str) -> str:
        return concurrency_pattern.sub(
            lambda match: f"{match.group(1)}<runtime>{match.group(3)}", text
        )

    workflow_matches = (
        1 <= source_concurrency <= 40
        and 1 <= installed_concurrency <= 40
        and normalized(workflow_source) == normalized(workflow_installed)
    )
    if workflow_matches:
        workflow_match_mode = (
            "exact"
            if workflow_source == workflow_installed
            else "bounded_concurrency_overlay"
        )

def artifact(source_name: str, target_name: str) -> dict:
    source = pathlib.Path(os.environ[source_name]).read_bytes()
    target = pathlib.Path(os.environ[target_name]).read_bytes()
    source_sha = hashlib.sha256(source).hexdigest()
    target_sha = hashlib.sha256(target).hexdigest()
    return {
        "sourceSha256": source_sha,
        "installedSha256": target_sha,
        "matches": source_sha == target_sha,
    }

capacity_pipeline = {
    "providerModule": artifact("CAPACITY_MODULE_SOURCE", "CAPACITY_MODULE_TARGET"),
    "controllerProviderModule": artifact(
        "CAPACITY_MODULE_SOURCE", "CONCURRENCY_MODULE_TARGET"
    ),
    "writer": artifact("CAPACITY_WRITER_SOURCE", "CAPACITY_WRITER_TARGET"),
    "bootstrap": artifact("CAPACITY_BOOTSTRAP_SOURCE", "CAPACITY_BOOTSTRAP_TARGET"),
    "leaseGuard": artifact("LEASE_GUARD_SOURCE", "LEASE_GUARD_TARGET"),
    "controller": artifact(
        "CONCURRENCY_CONTROLLER_SOURCE", "CONCURRENCY_CONTROLLER_TARGET"
    ),
    "serviceUnit": artifact(
        "CONCURRENCY_CONTROLLER_UNIT_SOURCE", "CONCURRENCY_CONTROLLER_UNIT_TARGET"
    ),
    "timerUnit": artifact(
        "CONCURRENCY_CONTROLLER_TIMER_SOURCE", "CONCURRENCY_CONTROLLER_TIMER_TARGET"
    ),
    "codexRotate": artifact("CODEX_ROTATE_SOURCE", "CODEX_ROTATE_TARGET"),
}

controller_receipt_path = pathlib.Path(os.environ["CONCURRENCY_RECEIPT"])
controller_receipt_bytes = controller_receipt_path.read_bytes()
controller_tick = json.loads(controller_receipt_bytes)
controller_observed = datetime.fromisoformat(
    str(controller_tick.get("observedAt", "")).replace("Z", "+00:00")
)
controller_age = datetime.now(timezone.utc) - controller_observed
controller_files_valid = (
    controller_tick.get("schema") == "symphony-concurrency/v1"
    and controller_tick.get("mode") == "applied"
    and timedelta(0) <= controller_age <= timedelta(minutes=2)
    and controller_tick.get("resourceScope", {}).get("workflow")
    == os.environ["WORKFLOW_TARGET"]
    and controller_tick.get("target") == installed_concurrency
    and controller_tick.get("workflowSha256")
    == hashlib.sha256(workflow_installed_bytes).hexdigest()
    and controller_tick.get("controllerSha256")
    == capacity_pipeline["controller"]["installedSha256"]
)

receipt = {
    "schema": "gem-service-attestation/v1",
    "observedAt": datetime.now(timezone.utc).isoformat(),
    "sourceRevision": os.environ["SOURCE_REVISION"],
    "daemonReloaded": True,
    "service": "symphony-elixir.service",
    "active": True,
    "healthy": True,
    "listener": {
        "port": 4041,
        "pid": int(os.environ["LISTENER_PID"]),
        "wrapperPid": int(os.environ["SERVICE_PID"]),
        "controlGroup": os.environ["SERVICE_CONTROL_GROUP"],
        "boundToService": True,
    },
    "workflow": {
        "sourceSha256": hashlib.sha256(workflow_source_bytes).hexdigest(),
        "installedSha256": hashlib.sha256(workflow_installed_bytes).hexdigest(),
        "matches": workflow_matches,
        "matchMode": workflow_match_mode,
        "sourceMaxConcurrentAgents": source_concurrency,
        "installedMaxConcurrentAgents": installed_concurrency,
    },
    "unit": {
        "sourceSha256": os.environ["UNIT_SOURCE_SHA"],
        "installedSha256": os.environ["UNIT_TARGET_SHA"],
        "matches": os.environ["UNIT_SOURCE_SHA"] == os.environ["UNIT_TARGET_SHA"],
    },
    "policy": {
        "sourceSha256": os.environ["POLICY_SOURCE_SHA"],
        "installedSha256": os.environ["POLICY_TARGET_SHA"],
        "matches": os.environ["POLICY_SOURCE_SHA"] == os.environ["POLICY_TARGET_SHA"],
    },
    "gate": {
        "sourceSha256": os.environ["GATE_SOURCE_SHA"],
        "installedSha256": os.environ["GATE_TARGET_SHA"],
        "matches": os.environ["GATE_SOURCE_SHA"] == os.environ["GATE_TARGET_SHA"],
    },
    "closureHealth": {
        "sourceSha256": os.environ["CLOSURE_SOURCE_SHA"],
        "installedSha256": os.environ["CLOSURE_TARGET_SHA"],
        "matches": os.environ["CLOSURE_SOURCE_SHA"] == os.environ["CLOSURE_TARGET_SHA"],
    },
    "capacityPipeline": capacity_pipeline,
    "controllerTick": {
        "schema": controller_tick.get("schema"),
        "mode": controller_tick.get("mode"),
        "observedAt": controller_tick.get("observedAt"),
        "target": controller_tick.get("target"),
        "receiptSha256": hashlib.sha256(controller_receipt_bytes).hexdigest(),
        "matchesInstalledFiles": controller_files_valid,
        "matchesInstalledRuntime": False,
        "runtimeProof": {
            "status": "UNKNOWN",
            "reason": "official-runtime-does-not-expose-loaded-concurrency",
        },
    },
    "controllerTimer": {
        "unit": "symphony-concurrency-controller.timer",
        "enabled": True,
        "active": True,
    },
}
if not all(
    receipt[artifact]["matches"]
    for artifact in ("workflow", "unit", "policy", "gate", "closureHealth")
):
    raise SystemExit("refusing stale Gem service attestation")
if not all(item["matches"] for item in capacity_pipeline.values()):
    raise SystemExit("refusing stale Gem capacity pipeline attestation")
if not controller_files_valid:
    raise SystemExit("refusing unproven Gem concurrency controller tick")
temporary.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
temporary.replace(destination)
PY

if [[ "${timer_was_active}" == true ]]; then
  systemctl --user start "${TIMER}"
fi

install_complete=true
trap - EXIT
release_install_lock
printf 'installed fleet controller backup=%s\n' "${BACKUP_DIR}"
sha256sum \
  "${GATE_TARGET}" \
  "${CLOSURE_TARGET}" \
  "${CONTRACT_TARGET}" \
  "${CONSUMER_TARGET}" \
  "${REGISTRY_MODULE_TARGET}" \
  "${REGISTRY_CONFIG_TARGET}" \
  "${POLICY_TARGET}" \
  "${WORKFLOW_TARGET}" \
  "${SERVICE_UNIT_TARGET}" \
  "${CAPACITY_MODULE_TARGET}" \
  "${CAPACITY_WRITER_TARGET}" \
  "${CAPACITY_BOOTSTRAP_TARGET}" \
  "${LEASE_GUARD_TARGET}" \
  "${CONCURRENCY_CONTROLLER_TARGET}" \
  "${CONCURRENCY_MODULE_TARGET}" \
  "${CONCURRENCY_CONTROLLER_UNIT_TARGET}" \
  "${CONCURRENCY_CONTROLLER_TIMER_TARGET}" \
  "${CODEX_ROTATE_TARGET}"
