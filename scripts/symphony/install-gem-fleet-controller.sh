#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_ROOT="${1:-$(git rev-parse --show-toplevel)}"
readonly GEM_ROOT="${GEM_WORKSPACE:-/home/timwhite/gem-workspace}"
readonly SYMPHONY_ROOT="${SYMPHONY_RUNTIME:-${HOME}/.config/symphony}"
readonly TIMER="gem-pr-drain.timer"
readonly SERVICE="symphony-elixir.service"
readonly VERIFY_ONLY="${FLEET_INSTALL_VERIFY_ONLY:-false}"
readonly PREFLIGHT_ONLY="${FLEET_INSTALL_PREFLIGHT_ONLY:-false}"
readonly EXPECTED_SOURCE_REVISION="${GEM_CONTROLLER_EXPECTED_REVISION:-}"
readonly PROC_ROOT="${GEM_PROC_ROOT:-/proc}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly BACKUP_DIR="${GEM_ROOT}/state/backups/fleet-controller-${STAMP}"

readonly GATE_SOURCE="${SOURCE_ROOT}/scripts/symphony/gem-priority-gate.py"
readonly CLOSURE_SOURCE="${SOURCE_ROOT}/scripts/symphony/closure_health.py"
readonly CONTRACT_SOURCE="${SOURCE_ROOT}/scripts/symphony/gem_gate_contract.py"
readonly CONSUMER_SOURCE="${SOURCE_ROOT}/scripts/symphony/gem-pr-drain.py"
readonly REGISTRY_MODULE_SOURCE="${SOURCE_ROOT}/scripts/symphony/gem_repo_registry.py"
readonly REGISTRY_CONFIG_SOURCE="${SOURCE_ROOT}/scripts/symphony/config/gem-repo-registry.json"
readonly POLICY_SOURCE="${SOURCE_ROOT}/scripts/symphony/gem_rehabilitation_policy.py"
readonly CONCURRENCY_SOURCE="${SOURCE_ROOT}/scripts/symphony/symphony-concurrency-controller.py"
readonly CONCURRENCY_SERVICE_SOURCE="${SOURCE_ROOT}/scripts/symphony/systemd/symphony-concurrency-controller.service"
readonly CONCURRENCY_TIMER_SOURCE="${SOURCE_ROOT}/scripts/symphony/systemd/symphony-concurrency-controller.timer"
readonly WORKFLOW_SOURCE="${SOURCE_ROOT}/scripts/symphony/WORKFLOW.md"
readonly SERVICE_UNIT_SOURCE="${SOURCE_ROOT}/scripts/symphony/systemd/symphony-elixir.service"
readonly RUNTIME_HELPER_SOURCE="${SOURCE_ROOT}/scripts/symphony/symphony_official_runtime.py"
readonly AUTO_ROUTE_SOURCE="${SOURCE_ROOT}/scripts/symphony/symphony-auto-route.mjs"
readonly SAFE_RESTART_SOURCE="${SOURCE_ROOT}/scripts/symphony/symphony-elixir-safe-restart"
readonly FROZEN_TRANSITION_SOURCE="${SOURCE_ROOT}/scripts/symphony/symphony-frozen-generation-transition"
readonly GATE_TARGET="${GEM_ROOT}/scripts/gem-priority-gate.py"
readonly CLOSURE_TARGET="${GEM_ROOT}/scripts/closure_health.py"
readonly CONTRACT_TARGET="${GEM_ROOT}/scripts/gem_gate_contract.py"
readonly CONSUMER_TARGET="${GEM_ROOT}/scripts/gem-pr-drain.py"
readonly REGISTRY_MODULE_TARGET="${GEM_ROOT}/scripts/gem_repo_registry.py"
readonly REGISTRY_CONFIG_TARGET="${GEM_ROOT}/config/gem-repo-registry.json"
readonly POLICY_TARGET="${GEM_ROOT}/scripts/gem_rehabilitation_policy.py"
readonly CONCURRENCY_TARGET="${HOME}/.local/bin/symphony-concurrency-controller"
readonly CONCURRENCY_SERVICE_TARGET="${HOME}/.config/systemd/user/symphony-concurrency-controller.service"
readonly CONCURRENCY_TIMER_TARGET="${HOME}/.config/systemd/user/symphony-concurrency-controller.timer"
readonly WORKFLOW_TARGET="${SYMPHONY_ROOT}/WORKFLOW.md"
readonly SERVICE_UNIT_TARGET="${HOME}/.config/systemd/user/symphony-elixir.service"
readonly ATTESTATION_TARGET="${GEM_ROOT}/state/gem-service-attestation.json"
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
  "${CONCURRENCY_SOURCE}" \
  "${CONCURRENCY_SERVICE_SOURCE}" \
  "${CONCURRENCY_TIMER_SOURCE}" \
  "${WORKFLOW_SOURCE}" \
  "${SERVICE_UNIT_SOURCE}" \
  "${RUNTIME_HELPER_SOURCE}" \
  "${AUTO_ROUTE_SOURCE}" \
  "${SAFE_RESTART_SOURCE}" \
  "${FROZEN_TRANSITION_SOURCE}"
do
  [[ -f "${source}" ]] || { printf 'missing install source: %s\n' "${source}" >&2; exit 2; }
done

git -C "${SOURCE_ROOT}" diff --quiet -- \
  scripts/symphony/gem-priority-gate.py \
  scripts/symphony/closure_health.py \
  scripts/symphony/gem_gate_contract.py \
  scripts/symphony/gem-pr-drain.py \
  scripts/symphony/gem_repo_registry.py \
  scripts/symphony/config/gem-repo-registry.json \
  scripts/symphony/gem_rehabilitation_policy.py \
  scripts/symphony/symphony-concurrency-controller.py \
  scripts/symphony/systemd/symphony-concurrency-controller.service \
  scripts/symphony/systemd/symphony-concurrency-controller.timer \
  scripts/symphony/WORKFLOW.md \
  scripts/symphony/systemd/symphony-elixir.service \
  scripts/symphony/symphony_official_runtime.py \
  scripts/symphony/symphony-auto-route.mjs \
  scripts/symphony/symphony-elixir-safe-restart \
  scripts/symphony/symphony-frozen-generation-transition \
  scripts/symphony/lib/user-systemd-context.sh
git -C "${SOURCE_ROOT}" diff --cached --quiet -- \
  scripts/symphony/gem-priority-gate.py \
  scripts/symphony/closure_health.py \
  scripts/symphony/gem_gate_contract.py \
  scripts/symphony/gem-pr-drain.py \
  scripts/symphony/gem_repo_registry.py \
  scripts/symphony/config/gem-repo-registry.json \
  scripts/symphony/gem_rehabilitation_policy.py \
  scripts/symphony/symphony-concurrency-controller.py \
  scripts/symphony/systemd/symphony-concurrency-controller.service \
  scripts/symphony/systemd/symphony-concurrency-controller.timer \
  scripts/symphony/lib/user-systemd-context.sh \
  scripts/symphony/WORKFLOW.md \
  scripts/symphony/systemd/symphony-elixir.service \
  scripts/symphony/symphony_official_runtime.py \
  scripts/symphony/symphony-auto-route.mjs \
  scripts/symphony/symphony-elixir-safe-restart \
  scripts/symphony/symphony-frozen-generation-transition

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
  "${CONCURRENCY_SOURCE}"
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
    "${CONCURRENCY_SOURCE}" \
    "${CONCURRENCY_SERVICE_SOURCE}" \
    "${CONCURRENCY_TIMER_SOURCE}" \
    "${WORKFLOW_SOURCE}" \
    "${SERVICE_UNIT_SOURCE}" \
    "${RUNTIME_HELPER_SOURCE}" \
    "${AUTO_ROUTE_SOURCE}" \
    "${SAFE_RESTART_SOURCE}" \
    "${FROZEN_TRANSITION_SOURCE}"
  exit 0
fi
prepare_user_systemd_context
assert_official_service_ready
mkdir -p "${BACKUP_DIR}" "${GEM_ROOT}/scripts" "${GEM_ROOT}/config" "$(dirname "${WORKFLOW_TARGET}")"
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
[[ ! -e "${CONCURRENCY_TARGET}" ]] || \
  cp -p "${CONCURRENCY_TARGET}" "${BACKUP_DIR}/symphony-concurrency-controller"
[[ ! -e "${CONCURRENCY_SERVICE_TARGET}" ]] || \
  cp -p "${CONCURRENCY_SERVICE_TARGET}" "${BACKUP_DIR}/symphony-concurrency-controller.service"
[[ ! -e "${CONCURRENCY_TIMER_TARGET}" ]] || \
  cp -p "${CONCURRENCY_TIMER_TARGET}" "${BACKUP_DIR}/symphony-concurrency-controller.timer"
[[ ! -e "${WORKFLOW_TARGET}" ]] || cp -p "${WORKFLOW_TARGET}" "${BACKUP_DIR}/WORKFLOW.md"
[[ ! -e "${SERVICE_UNIT_TARGET}" ]] || cp -p "${SERVICE_UNIT_TARGET}" "${BACKUP_DIR}/symphony-elixir.service"
[[ ! -e "${ATTESTATION_TARGET}" ]] || cp -p "${ATTESTATION_TARGET}" "${BACKUP_DIR}/gem-service-attestation.json"

timer_was_active=false
concurrency_timer_was_active=false
concurrency_timer_was_enabled=false
closure_existed=false
contract_existed=false
registry_module_existed=false
registry_config_existed=false
policy_existed=false
concurrency_existed=false
concurrency_service_existed=false
concurrency_timer_existed=false
workflow_existed=false
service_unit_existed=false
attestation_existed=false
install_started=false
install_complete=false
[[ ! -e "${CONTRACT_TARGET}" ]] || contract_existed=true
[[ ! -e "${CLOSURE_TARGET}" ]] || closure_existed=true
[[ ! -e "${REGISTRY_MODULE_TARGET}" ]] || registry_module_existed=true
[[ ! -e "${REGISTRY_CONFIG_TARGET}" ]] || registry_config_existed=true
[[ ! -e "${POLICY_TARGET}" ]] || policy_existed=true
[[ ! -e "${CONCURRENCY_TARGET}" ]] || concurrency_existed=true
[[ ! -e "${CONCURRENCY_SERVICE_TARGET}" ]] || concurrency_service_existed=true
[[ ! -e "${CONCURRENCY_TIMER_TARGET}" ]] || concurrency_timer_existed=true
[[ ! -e "${WORKFLOW_TARGET}" ]] || workflow_existed=true
[[ ! -e "${SERVICE_UNIT_TARGET}" ]] || service_unit_existed=true
[[ ! -e "${ATTESTATION_TARGET}" ]] || attestation_existed=true

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
    systemctl --user stop symphony-concurrency-controller.timer >/dev/null 2>&1 || true
    systemctl --user stop symphony-concurrency-controller.service >/dev/null 2>&1 || true
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
      if [[ "${concurrency_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/symphony-concurrency-controller" "${CONCURRENCY_TARGET}"
      else
        rm -f "${CONCURRENCY_TARGET}"
      fi
      if [[ "${concurrency_service_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/symphony-concurrency-controller.service" "${CONCURRENCY_SERVICE_TARGET}"
      else
        rm -f "${CONCURRENCY_SERVICE_TARGET}"
      fi
      if [[ "${concurrency_timer_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/symphony-concurrency-controller.timer" "${CONCURRENCY_TIMER_TARGET}"
      else
        rm -f "${CONCURRENCY_TIMER_TARGET}"
      fi
      if [[ "${service_unit_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/symphony-elixir.service" "${SERVICE_UNIT_TARGET}"
      else
        rm -f "${SERVICE_UNIT_TARGET}"
      fi
      if [[ "${attestation_existed}" == true ]]; then
        restore_atomic "${BACKUP_DIR}/gem-service-attestation.json" "${ATTESTATION_TARGET}"
      else
        rm -f "${ATTESTATION_TARGET}"
      fi
      systemctl --user daemon-reload >/dev/null 2>&1 || true
      if [[ "${concurrency_timer_was_enabled}" == true ]]; then
        systemctl --user enable symphony-concurrency-controller.timer >/dev/null 2>&1 || true
      else
        systemctl --user disable symphony-concurrency-controller.timer >/dev/null 2>&1 || true
      fi
    fi
    if [[ "${timer_was_active}" == true ]]; then
      systemctl --user start "${TIMER}" >/dev/null 2>&1 || true
    fi
    if [[ "${concurrency_timer_was_active}" == true ]]; then
      systemctl --user start symphony-concurrency-controller.timer >/dev/null 2>&1 || true
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
if systemctl --user is-enabled --quiet symphony-concurrency-controller.timer; then
  concurrency_timer_was_enabled=true
fi
if systemctl --user is-active --quiet symphony-concurrency-controller.timer; then
  concurrency_timer_was_active=true
  systemctl --user stop symphony-concurrency-controller.timer
fi
systemctl --user stop symphony-concurrency-controller.service >/dev/null 2>&1 || true
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
install_atomic "${CLOSURE_SOURCE}" "${CLOSURE_TARGET}" 0755
install_atomic "${CONTRACT_SOURCE}" "${CONTRACT_TARGET}" 0644
install_atomic "${CONSUMER_SOURCE}" "${CONSUMER_TARGET}" 0755
install_atomic "${REGISTRY_MODULE_SOURCE}" "${REGISTRY_MODULE_TARGET}" 0755
install_atomic "${REGISTRY_CONFIG_SOURCE}" "${REGISTRY_CONFIG_TARGET}" 0644
install_atomic "${POLICY_SOURCE}" "${POLICY_TARGET}" 0644
mkdir -p "$(dirname "${CONCURRENCY_TARGET}")" "$(dirname "${CONCURRENCY_SERVICE_TARGET}")"
install_atomic "${CONCURRENCY_SOURCE}" "${CONCURRENCY_TARGET}" 0755
install_atomic "${CONCURRENCY_SERVICE_SOURCE}" "${CONCURRENCY_SERVICE_TARGET}" 0644
install_atomic "${CONCURRENCY_TIMER_SOURCE}" "${CONCURRENCY_TIMER_TARGET}" 0644
install_atomic "${WORKFLOW_SOURCE}" "${WORKFLOW_TARGET}" 0644
mkdir -p "$(dirname "${SERVICE_UNIT_TARGET}")"
install_atomic "${SERVICE_UNIT_SOURCE}" "${SERVICE_UNIT_TARGET}" 0644
python3 -m py_compile \
  "${GATE_TARGET}" \
  "${CLOSURE_TARGET}" \
  "${CONTRACT_TARGET}" \
  "${CONSUMER_TARGET}" \
  "${REGISTRY_MODULE_TARGET}" \
  "${POLICY_TARGET}" \
  "${CONCURRENCY_TARGET}"
python3 -m json.tool "${REGISTRY_CONFIG_TARGET}" >/dev/null
smoke_consumer_import "${CONSUMER_TARGET}"

systemctl --user daemon-reload
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

# File writes are not runtime proof. Seed the recurring read-only verifier only
# after the existing service/cgroup/listener checks establish official ownership.
# The installed controller records exact source, build, and provider identities;
# every later controller sample must revalidate those identities before widening.
if ! "${CONCURRENCY_TARGET}" \
  --runtime-home "${HOME}" \
  --gem-root "${GEM_ROOT}" \
  --workflow "${WORKFLOW_TARGET}" \
  --source-attestation "${ATTESTATION_TARGET}" \
  --initial-wrapper-pid "${SERVICE_PID}" \
  --initial-listener-pid "${LISTENER_PID}" \
  --initial-control-group "${SERVICE_CONTROL_GROUP}" \
  --initialize-source-attestation "${SOURCE_ROOT}" "${SOURCE_REVISION}" >/dev/null; then
  printf 'refusing stale Gem service attestation\n' >&2
  exit 5
fi

# The fleet installer owns the workflow consumed by the existing adaptive
# controller, so it must also make that controller durable. Run one sample
# immediately after the fresh source attestation exists; missing provider,
# auth, downstream, or runtime evidence is handled inside the controller by
# reducing the workflow to its fail-closed floor.
systemctl --user enable --now symphony-concurrency-controller.timer
systemctl --user start symphony-concurrency-controller.service
systemctl --user is-enabled --quiet symphony-concurrency-controller.timer
systemctl --user is-active --quiet symphony-concurrency-controller.timer

if [[ "${timer_was_active}" == true ]]; then
  systemctl --user start "${TIMER}"
fi

install_complete=true
trap - EXIT
printf 'installed fleet controller backup=%s\n' "${BACKUP_DIR}"
sha256sum \
  "${GATE_TARGET}" \
  "${CLOSURE_TARGET}" \
  "${CONTRACT_TARGET}" \
  "${CONSUMER_TARGET}" \
  "${REGISTRY_MODULE_TARGET}" \
  "${REGISTRY_CONFIG_TARGET}" \
  "${POLICY_TARGET}" \
  "${CONCURRENCY_TARGET}" \
  "${CONCURRENCY_SERVICE_TARGET}" \
  "${CONCURRENCY_TIMER_TARGET}" \
  "${WORKFLOW_TARGET}" \
  "${SERVICE_UNIT_TARGET}"
