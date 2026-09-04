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
readonly WORKFLOW_SOURCE="${SOURCE_ROOT}/scripts/symphony/symphony/WORKFLOW.md"
readonly SERVICE_UNIT_SOURCE="${SOURCE_ROOT}/scripts/symphony/systemd/symphony-elixir.service"
readonly GATE_TARGET="${GEM_ROOT}/scripts/gem-priority-gate.py"
readonly CLOSURE_TARGET="${GEM_ROOT}/scripts/closure_health.py"
readonly CONTRACT_TARGET="${GEM_ROOT}/scripts/gem_gate_contract.py"
readonly CONSUMER_TARGET="${GEM_ROOT}/scripts/gem-pr-drain.py"
readonly REGISTRY_MODULE_TARGET="${GEM_ROOT}/scripts/gem_repo_registry.py"
readonly REGISTRY_CONFIG_TARGET="${GEM_ROOT}/config/gem-repo-registry.json"
readonly POLICY_TARGET="${GEM_ROOT}/scripts/gem_rehabilitation_policy.py"
readonly WORKFLOW_TARGET="${SYMPHONY_ROOT}/WORKFLOW.md"
readonly SERVICE_UNIT_TARGET="${HOME}/.config/systemd/user/symphony-elixir.service"
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
  "${SERVICE_UNIT_SOURCE}"
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
  scripts/symphony/symphony/WORKFLOW.md \
  scripts/symphony/systemd/symphony-elixir.service \
  scripts/symphony/lib/user-systemd-context.sh
git -C "${SOURCE_ROOT}" diff --cached --quiet -- \
  scripts/symphony/gem-priority-gate.py \
  scripts/symphony/closure_health.py \
  scripts/symphony/gem_gate_contract.py \
  scripts/symphony/gem-pr-drain.py \
  scripts/symphony/gem_repo_registry.py \
  scripts/symphony/config/gem-repo-registry.json \
  scripts/symphony/gem_rehabilitation_policy.py \
  scripts/symphony/lib/user-systemd-context.sh \
  scripts/symphony/symphony/WORKFLOW.md \
  scripts/symphony/systemd/symphony-elixir.service

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
  "${POLICY_SOURCE}"
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
    "${SERVICE_UNIT_SOURCE}"
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
[[ ! -e "${WORKFLOW_TARGET}" ]] || cp -p "${WORKFLOW_TARGET}" "${BACKUP_DIR}/WORKFLOW.md"
[[ ! -e "${SERVICE_UNIT_TARGET}" ]] || cp -p "${SERVICE_UNIT_TARGET}" "${BACKUP_DIR}/symphony-elixir.service"

timer_was_active=false
closure_existed=false
contract_existed=false
registry_module_existed=false
registry_config_existed=false
policy_existed=false
workflow_existed=false
service_unit_existed=false
install_started=false
install_complete=false
[[ ! -e "${CONTRACT_TARGET}" ]] || contract_existed=true
[[ ! -e "${CLOSURE_TARGET}" ]] || closure_existed=true
[[ ! -e "${REGISTRY_MODULE_TARGET}" ]] || registry_module_existed=true
[[ ! -e "${REGISTRY_CONFIG_TARGET}" ]] || registry_config_existed=true
[[ ! -e "${POLICY_TARGET}" ]] || policy_existed=true
[[ ! -e "${WORKFLOW_TARGET}" ]] || workflow_existed=true
[[ ! -e "${SERVICE_UNIT_TARGET}" ]] || service_unit_existed=true

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
      systemctl --user daemon-reload >/dev/null 2>&1 || true
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
install_atomic "${CLOSURE_SOURCE}" "${CLOSURE_TARGET}" 0755
install_atomic "${CONTRACT_SOURCE}" "${CONTRACT_TARGET}" 0644
install_atomic "${CONSUMER_SOURCE}" "${CONSUMER_TARGET}" 0755
install_atomic "${REGISTRY_MODULE_SOURCE}" "${REGISTRY_MODULE_TARGET}" 0755
install_atomic "${REGISTRY_CONFIG_SOURCE}" "${REGISTRY_CONFIG_TARGET}" 0644
install_atomic "${POLICY_SOURCE}" "${POLICY_TARGET}" 0644
install_atomic "${WORKFLOW_SOURCE}" "${WORKFLOW_TARGET}" 0644
mkdir -p "$(dirname "${SERVICE_UNIT_TARGET}")"
install_atomic "${SERVICE_UNIT_SOURCE}" "${SERVICE_UNIT_TARGET}" 0644
python3 -m py_compile \
  "${GATE_TARGET}" \
  "${CLOSURE_TARGET}" \
  "${CONTRACT_TARGET}" \
  "${CONSUMER_TARGET}" \
  "${REGISTRY_MODULE_TARGET}" \
  "${POLICY_TARGET}"
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
from datetime import datetime, timezone

root = pathlib.Path(os.environ["GEM_ROOT"])
destination = root / "state" / "gem-service-attestation.json"
destination.parent.mkdir(parents=True, exist_ok=True)
temporary = destination.with_suffix(".json.tmp")

# The pressure controller owns exactly one bounded runtime overlay. It may
# update this value while the official workflow hot-reloads, so attest that
# semantic overlay without restarting or replacing the running Elixir process.
concurrency_pattern = re.compile(
    r"^(\s*max_concurrent_agents:\s*)([1-8])(\s*)$",
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
        installed_concurrency <= source_concurrency
        and normalized(workflow_source) == normalized(workflow_installed)
    )
    if workflow_matches:
        workflow_match_mode = (
            "exact"
            if workflow_source == workflow_installed
            else "bounded_concurrency_overlay"
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
}
if not all(
    receipt[artifact]["matches"]
    for artifact in ("workflow", "unit", "policy", "gate", "closureHealth")
):
    raise SystemExit("refusing stale Gem service attestation")
temporary.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
temporary.replace(destination)
PY

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
  "${WORKFLOW_TARGET}" \
  "${SERVICE_UNIT_TARGET}"
