#!/usr/bin/env bash
set -euo pipefail

readonly SOURCE_ROOT="${1:-$(git rev-parse --show-toplevel)}"
readonly GEM_ROOT="${GEM_WORKSPACE:-/home/timwhite/gem-workspace}"
readonly EXPECTED_SOURCE_REVISION="${GEM_CONTROLLER_EXPECTED_REVISION:-}"
readonly VERIFY_ONLY="${GEM_REHABILITATION_VERIFY_ONLY:-false}"
readonly UNIT_ROOT="${HOME}/.config/systemd/user"
readonly TIMER="gem-pr-drain.timer"
readonly SERVICE="gem-pr-drain.service"
readonly PREFLIGHT_ONLY="${GEM_REHABILITATION_PREFLIGHT_ONLY:-false}"
# shellcheck source=lib/user-systemd-context.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/user-systemd-context.sh"

if [[ "${PREFLIGHT_ONLY}" == true ]]; then
  prepare_user_systemd_context
  printf 'Gem user systemd preflight passed (XDG_RUNTIME_DIR=%s)\n' "${XDG_RUNTIME_DIR}"
  exit 0
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP
readonly BACKUP_DIR="${GEM_ROOT}/state/backups/gem-pr-rehabilitation-${STAMP}"

readonly -a RELATIVE_SOURCES=(
  scripts/symphony/gem-priority-gate.py
  scripts/symphony/closure_health.py
  scripts/symphony/gem-ops-hud.py
  scripts/symphony/gem_gate_contract.py
  scripts/symphony/gem-pr-drain.py
  scripts/symphony/gem-repo-drain-cycle.py
  scripts/symphony/gem_repo_registry.py
  scripts/symphony/gem_rehabilitation_policy.py
  scripts/symphony/model-router.py
  scripts/symphony/config/model-registry.json
  scripts/symphony/config/gem-repo-registry.json
  scripts/symphony/systemd/gem-pr-drain.service
  scripts/symphony/systemd/gem-pr-drain.timer
)
readonly -a TARGETS=(
  "${GEM_ROOT}/scripts/gem-priority-gate.py"
  "${GEM_ROOT}/scripts/closure_health.py"
  "${HOME}/.local/bin/gem-ops-hud"
  "${GEM_ROOT}/scripts/gem_gate_contract.py"
  "${GEM_ROOT}/scripts/gem-pr-drain.py"
  "${GEM_ROOT}/scripts/gem-repo-drain-cycle.py"
  "${GEM_ROOT}/scripts/gem_repo_registry.py"
  "${GEM_ROOT}/scripts/gem_rehabilitation_policy.py"
  "${GEM_ROOT}/scripts/model-router.py"
  "${GEM_ROOT}/config/model-registry.json"
  "${GEM_ROOT}/config/gem-repo-registry.json"
  "${UNIT_ROOT}/gem-pr-drain.service"
  "${UNIT_ROOT}/gem-pr-drain.timer"
)

for relative in "${RELATIVE_SOURCES[@]}"; do
  [[ -f "${SOURCE_ROOT}/${relative}" ]] || {
    printf 'missing rehabilitation source: %s\n' "${relative}" >&2
    exit 2
  }
done

git -C "${SOURCE_ROOT}" diff --quiet -- "${RELATIVE_SOURCES[@]}"
git -C "${SOURCE_ROOT}" diff --cached --quiet -- "${RELATIVE_SOURCES[@]}"
SOURCE_REVISION="$(git -C "${SOURCE_ROOT}" rev-parse HEAD)"
if [[ -n "${EXPECTED_SOURCE_REVISION}" ]]; then
  [[ "${EXPECTED_SOURCE_REVISION}" =~ ^[0-9a-f]{40}$ ]] || {
    printf 'GEM_CONTROLLER_EXPECTED_REVISION must be a full lowercase SHA\n' >&2
    exit 2
  }
  [[ "${SOURCE_REVISION}" == "${EXPECTED_SOURCE_REVISION}" ]] || {
    printf 'refusing install from %s; expected %s\n' \
      "${SOURCE_REVISION}" "${EXPECTED_SOURCE_REVISION}" >&2
    exit 3
  }
fi

python3 -m py_compile \
  "${SOURCE_ROOT}/scripts/symphony/gem-priority-gate.py" \
  "${SOURCE_ROOT}/scripts/symphony/closure_health.py" \
  "${SOURCE_ROOT}/scripts/symphony/gem-ops-hud.py" \
  "${SOURCE_ROOT}/scripts/symphony/gem_gate_contract.py" \
  "${SOURCE_ROOT}/scripts/symphony/gem-pr-drain.py" \
  "${SOURCE_ROOT}/scripts/symphony/gem-repo-drain-cycle.py" \
  "${SOURCE_ROOT}/scripts/symphony/gem_repo_registry.py" \
  "${SOURCE_ROOT}/scripts/symphony/gem_rehabilitation_policy.py" \
  "${SOURCE_ROOT}/scripts/symphony/model-router.py"
python3 -m json.tool "${SOURCE_ROOT}/scripts/symphony/config/model-registry.json" >/dev/null
python3 -m json.tool "${SOURCE_ROOT}/scripts/symphony/config/gem-repo-registry.json" >/dev/null

if [[ "${VERIFY_ONLY}" == true ]]; then
  printf 'Gem PR rehabilitation install sources verified at %s\n' "${SOURCE_REVISION}"
  sha256sum "${RELATIVE_SOURCES[@]/#/${SOURCE_ROOT}/}"
  exit 0
fi

prepare_user_systemd_context

mkdir -p "${BACKUP_DIR}" "${GEM_ROOT}/scripts" "${GEM_ROOT}/config" "${UNIT_ROOT}"
# Enablement survives host restarts; activity describes the current user-systemd
# session. Preserve and restore the two timer states independently on rollback.
timer_was_active=false
timer_was_enabled=false
install_started=false
install_complete=false
if [[ -e "${UNIT_ROOT}/${TIMER}" ]]; then
  systemctl --user is-active --quiet "${TIMER}" && timer_was_active=true
  systemctl --user is-enabled --quiet "${TIMER}" && timer_was_enabled=true
fi

for index in "${!TARGETS[@]}"; do
  if [[ -e "${TARGETS[$index]}" ]]; then
    cp -p "${TARGETS[$index]}" "${BACKUP_DIR}/${index}"
    : >"${BACKUP_DIR}/${index}.existed"
  fi
done

restore_atomic() {
  local source="$1" target="$2" temporary
  temporary="${target}.rollback.$$"
  cp -p "${source}" "${temporary}"
  mv "${temporary}" "${target}"
}

finish_or_rollback() {
  local status="$?"
  if [[ "${install_complete}" != true && "${install_started}" == true ]]; then
    systemctl --user stop "${TIMER}" >/dev/null 2>&1 || true
    for index in "${!TARGETS[@]}"; do
      if [[ -e "${BACKUP_DIR}/${index}.existed" ]]; then
        restore_atomic "${BACKUP_DIR}/${index}" "${TARGETS[$index]}"
      else
        rm -f "${TARGETS[$index]}"
      fi
    done
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    if [[ "${timer_was_enabled}" == true ]]; then
      systemctl --user enable "${TIMER}" >/dev/null 2>&1 || true
    else
      systemctl --user disable "${TIMER}" >/dev/null 2>&1 || true
    fi
    if [[ "${timer_was_active}" == true ]]; then
      systemctl --user start "${TIMER}" >/dev/null 2>&1 || true
    fi
    printf 'Gem PR rehabilitation install rolled back; backup=%s\n' "${BACKUP_DIR}" >&2
  fi
  exit "${status}"
}
trap finish_or_rollback EXIT

install_started=true
systemctl --user stop "${TIMER}"
for _ in $(seq 1 20); do
  systemctl --user is-active --quiet "${SERVICE}" || break
  sleep 1
done
systemctl --user is-active --quiet "${SERVICE}" && {
  printf '%s is still active; refusing mixed-source install\n' "${SERVICE}" >&2
  exit 3
}

install_atomic() {
  local source="$1" target="$2" mode="$3" temporary
  temporary="${target}.tmp.$$"
  install -m "${mode}" "${source}" "${temporary}"
  mv "${temporary}" "${target}"
}

for index in "${!TARGETS[@]}"; do
  mode=0644
  case "${RELATIVE_SOURCES[$index]}" in
    *.py|*.sh) mode=0755 ;;
  esac
  install_atomic "${SOURCE_ROOT}/${RELATIVE_SOURCES[$index]}" "${TARGETS[$index]}" "${mode}"
done

python3 -m py_compile \
  "${GEM_ROOT}/scripts/gem-priority-gate.py" \
  "${GEM_ROOT}/scripts/closure_health.py" \
  "${HOME}/.local/bin/gem-ops-hud" \
  "${GEM_ROOT}/scripts/gem_gate_contract.py" \
  "${GEM_ROOT}/scripts/gem-pr-drain.py" \
  "${GEM_ROOT}/scripts/gem-repo-drain-cycle.py" \
  "${GEM_ROOT}/scripts/gem_repo_registry.py" \
  "${GEM_ROOT}/scripts/gem_rehabilitation_policy.py" \
  "${GEM_ROOT}/scripts/model-router.py"
systemctl --user daemon-reload
systemctl --user enable --now "${TIMER}"
systemctl --user start "${SERVICE}"
[[ "$(systemctl --user show "${SERVICE}" --property=Result --value)" == success ]]
systemctl --user is-enabled --quiet "${TIMER}"
systemctl --user is-active --quiet "${TIMER}"

RECEIPT="${GEM_ROOT}/state/gem-pr-rehabilitation-attestation.json"
export RECEIPT SOURCE_REVISION SOURCE_ROOT GEM_ROOT UNIT_ROOT
python3 - <<'PY'
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

source_root = Path(os.environ["SOURCE_ROOT"])
gem_root = Path(os.environ["GEM_ROOT"])
unit_root = Path(os.environ["UNIT_ROOT"])
pairs = {
    "gate": (source_root / "scripts/symphony/gem-priority-gate.py", gem_root / "scripts/gem-priority-gate.py"),
    "closureHealth": (source_root / "scripts/symphony/closure_health.py", gem_root / "scripts/closure_health.py"),
    "hud": (source_root / "scripts/symphony/gem-ops-hud.py", Path.home() / ".local/bin/gem-ops-hud"),
    "contract": (source_root / "scripts/symphony/gem_gate_contract.py", gem_root / "scripts/gem_gate_contract.py"),
    "drain": (source_root / "scripts/symphony/gem-pr-drain.py", gem_root / "scripts/gem-pr-drain.py"),
    "cycle": (source_root / "scripts/symphony/gem-repo-drain-cycle.py", gem_root / "scripts/gem-repo-drain-cycle.py"),
    "registryModule": (source_root / "scripts/symphony/gem_repo_registry.py", gem_root / "scripts/gem_repo_registry.py"),
    "policy": (source_root / "scripts/symphony/gem_rehabilitation_policy.py", gem_root / "scripts/gem_rehabilitation_policy.py"),
    "modelRouter": (source_root / "scripts/symphony/model-router.py", gem_root / "scripts/model-router.py"),
    "modelRegistry": (source_root / "scripts/symphony/config/model-registry.json", gem_root / "config/model-registry.json"),
    "repoRegistry": (source_root / "scripts/symphony/config/gem-repo-registry.json", gem_root / "config/gem-repo-registry.json"),
    "service": (source_root / "scripts/symphony/systemd/gem-pr-drain.service", unit_root / "gem-pr-drain.service"),
    "timer": (source_root / "scripts/symphony/systemd/gem-pr-drain.timer", unit_root / "gem-pr-drain.timer"),
}

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

artifacts = {
    name: {
        "sourceSha256": digest(source),
        "installedSha256": digest(target),
        "matches": digest(source) == digest(target),
    }
    for name, (source, target) in pairs.items()
}
if not all(item["matches"] for item in artifacts.values()):
    raise SystemExit("refusing stale Gem rehabilitation attestation")
receipt = {
    "schema": "gem-pr-rehabilitation-attestation/v1",
    "observedAt": datetime.now(timezone.utc).isoformat(),
    "sourceRevision": os.environ["SOURCE_REVISION"],
    "timerEnabled": True,
    "timerActive": True,
    "lastCycleResult": "success",
    "artifacts": artifacts,
}
destination = Path(os.environ["RECEIPT"])
temporary = destination.with_suffix(".json.tmp")
temporary.write_text(json.dumps(receipt, sort_keys=True) + "\n", encoding="utf-8")
temporary.replace(destination)
PY

install_complete=true
trap - EXIT
printf 'installed and attested Gem PR rehabilitation from %s backup=%s\n' \
  "${SOURCE_REVISION}" "${BACKUP_DIR}"
