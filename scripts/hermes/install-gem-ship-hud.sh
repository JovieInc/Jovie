#!/usr/bin/env bash
set -euo pipefail

readonly SERVICE="gem-ship-hud.service"
readonly VERIFY_ONLY="${GEM_SHIP_HUD_VERIFY_ONLY:-false}"
readonly PREFLIGHT_ONLY="${GEM_SHIP_HUD_PREFLIGHT_ONLY:-false}"
readonly EXPECTED_SOURCE_REVISION="${GEM_SHIP_HUD_EXPECTED_REVISION:-}"
SOURCE_ROOT="${1:-$(git rev-parse --show-toplevel)}"
SOURCE_ROOT="$(cd "${SOURCE_ROOT}" && pwd -P)"
readonly SOURCE_ROOT
readonly UNIT_TEMPLATE_SOURCE="${SOURCE_ROOT}/scripts/hermes/systemd/gem-ship-hud.service.template"
readonly HUD_SOURCE="${SOURCE_ROOT}/scripts/hermes/gem-checkin-hud.py"
readonly HUD_WRAPPER="${SOURCE_ROOT}/scripts/hermes/gem-checkin-tty1.sh"
readonly UNIT_TARGET="${HOME}/.config/systemd/user/${SERVICE}"
readonly ATTESTATION_TARGET="${HOME}/.local/state/gem-checkin-hud/gem-ship-hud-attestation.json"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
readonly STAMP

SYSTEMCTL_USER=()

choose_systemctl_user() {
  if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
  export DBUS_SESSION_BUS_ADDRESS
  if systemctl --user show-environment >/dev/null 2>&1; then
    SYSTEMCTL_USER=(systemctl --user)
  elif systemctl --machine="$(whoami)@" --user show-environment >/dev/null 2>&1; then
    SYSTEMCTL_USER=(systemctl --machine="$(whoami)@" --user)
  else
    printf 'Gem HUD user systemd preflight failed; no reachable user manager\n' >&2
    return 4
  fi
}

render_unit() {
  local destination="$1"
  python3 - "${UNIT_TEMPLATE_SOURCE}" "${SOURCE_ROOT}" "${destination}" <<'PY'
import pathlib
import sys

template = pathlib.Path(sys.argv[1])
source_root = pathlib.Path(sys.argv[2]).resolve()
destination = pathlib.Path(sys.argv[3])
text = template.read_text(encoding="utf-8")
rendered = text.replace("{{JOVIE_REPO}}", str(source_root))
if "{{" in rendered or "}}" in rendered:
    raise SystemExit("unrendered placeholder remains in gem-ship-hud unit")
destination.write_text(rendered, encoding="utf-8")
PY
}

for source in "${UNIT_TEMPLATE_SOURCE}" "${HUD_SOURCE}" "${HUD_WRAPPER}"; do
  [[ -f "${source}" ]] || { printf 'missing Gem HUD install source: %s\n' "${source}" >&2; exit 2; }
done

SOURCE_REVISION="$(git -C "${SOURCE_ROOT}" rev-parse HEAD)"
readonly SOURCE_REVISION
if [[ -n "${EXPECTED_SOURCE_REVISION}" ]]; then
  [[ "${EXPECTED_SOURCE_REVISION}" =~ ^[0-9a-f]{40}$ ]] || {
    printf 'GEM_SHIP_HUD_EXPECTED_REVISION must be a full lowercase SHA\n' >&2
    exit 2
  }
  [[ "${SOURCE_REVISION}" == "${EXPECTED_SOURCE_REVISION}" ]] || {
    printf 'refusing Gem HUD install from %s; expected %s\n' \
      "${SOURCE_REVISION}" "${EXPECTED_SOURCE_REVISION}" >&2
    exit 3
  }
fi

python3 -m py_compile "${HUD_SOURCE}"
bash -n "${HUD_WRAPPER}"
tmp_check="$(mktemp)"
render_unit "${tmp_check}"
rm -f "${tmp_check}"

if [[ "${PREFLIGHT_ONLY}" == true ]]; then
  choose_systemctl_user
  printf 'Gem HUD user systemd preflight passed (%s)\n' "${SYSTEMCTL_USER[*]}"
  exit 0
fi

if [[ "${VERIFY_ONLY}" == true ]]; then
  printf 'Gem HUD install sources verified\n'
  sha256sum "${UNIT_TEMPLATE_SOURCE}" "${HUD_SOURCE}" "${HUD_WRAPPER}"
  exit 0
fi

choose_systemctl_user
mkdir -p "$(dirname "${UNIT_TARGET}")"
unit_tmp="$(mktemp "${UNIT_TARGET}.tmp.XXXXXX")"
backup=""
install_complete=false
if [[ -e "${UNIT_TARGET}" ]]; then
  backup="${UNIT_TARGET}.backup.${STAMP}"
  cp -p "${UNIT_TARGET}" "${backup}"
fi

rollback() {
  local status="$?"
  if [[ "${install_complete}" != true ]]; then
    rm -f "${unit_tmp}"
    if [[ -n "${backup}" ]]; then
      cp -p "${backup}" "${UNIT_TARGET}"
    else
      rm -f "${UNIT_TARGET}"
    fi
    "${SYSTEMCTL_USER[@]}" daemon-reload >/dev/null 2>&1 || true
    "${SYSTEMCTL_USER[@]}" restart "${SERVICE}" >/dev/null 2>&1 || true
    printf 'Gem HUD install rolled back; backup=%s\n' "${backup:-none}" >&2
  fi
  exit "${status}"
}
trap rollback EXIT

render_unit "${unit_tmp}"
install -m 0644 "${unit_tmp}" "${UNIT_TARGET}.next"
mv -f "${UNIT_TARGET}.next" "${UNIT_TARGET}"
rm -f "${unit_tmp}"
"${SYSTEMCTL_USER[@]}" daemon-reload
"${SYSTEMCTL_USER[@]}" restart "${SERVICE}"
for _ in $(seq 1 20); do
  if "${SYSTEMCTL_USER[@]}" is-active --quiet "${SERVICE}"; then
    break
  fi
  sleep 1
done
"${SYSTEMCTL_USER[@]}" is-active --quiet "${SERVICE}"

SOURCE_RENDERER_SHA="$(sha256sum "${HUD_SOURCE}" | awk '{print $1}')"
UNIT_TEMPLATE_SHA="$(sha256sum "${UNIT_TEMPLATE_SOURCE}" | awk '{print $1}')"
UNIT_TARGET_SHA="$(sha256sum "${UNIT_TARGET}" | awk '{print $1}')"
rendered_check="$(mktemp)"
render_unit "${rendered_check}"
RENDERED_UNIT_SHA="$(sha256sum "${rendered_check}" | awk '{print $1}')"
rm -f "${rendered_check}"
EXEC_START="$("${SYSTEMCTL_USER[@]}" show "${SERVICE}" --property=ExecStart --value --no-pager)"
STARTED_AT="$("${SYSTEMCTL_USER[@]}" show "${SERVICE}" --property=ExecMainStartTimestamp --value --no-pager)"
PID="$("${SYSTEMCTL_USER[@]}" show "${SERVICE}" --property=ExecMainPID --value --no-pager)"
ACTIVE_STATE="$("${SYSTEMCTL_USER[@]}" show "${SERVICE}" --property=ActiveState --value --no-pager)"
SUB_STATE="$("${SYSTEMCTL_USER[@]}" show "${SERVICE}" --property=SubState --value --no-pager)"
SOURCE_DIRTY="false"
if ! git -C "${SOURCE_ROOT}" diff --quiet -- "${HUD_SOURCE}" "${HUD_WRAPPER}" "${UNIT_TEMPLATE_SOURCE}" scripts/hermes/install-gem-ship-hud.sh; then
  SOURCE_DIRTY="true"
fi
export \
  ATTESTATION_TARGET \
  SOURCE_ROOT \
  SOURCE_REVISION \
  SOURCE_DIRTY \
  HUD_SOURCE \
  SOURCE_RENDERER_SHA \
  UNIT_TEMPLATE_SOURCE \
  UNIT_TEMPLATE_SHA \
  UNIT_TARGET \
  UNIT_TARGET_SHA \
  RENDERED_UNIT_SHA \
  EXEC_START \
  STARTED_AT \
  PID \
  ACTIVE_STATE \
  SUB_STATE \
  SERVICE
python3 - <<'PY'
import json
import os
import pathlib
from datetime import datetime, timezone

target = pathlib.Path(os.environ["ATTESTATION_TARGET"])
target.parent.mkdir(parents=True, exist_ok=True)
tmp = target.with_suffix(".json.tmp")
receipt = {
    "schema": "gem-ship-hud-activation/v1",
    "observedAt": datetime.now(timezone.utc).isoformat(),
    "sourceRoot": os.environ["SOURCE_ROOT"],
    "sourceRevision": os.environ["SOURCE_REVISION"],
    "sourceDirty": os.environ["SOURCE_DIRTY"] == "true",
    "service": os.environ["SERVICE"],
    "activeState": os.environ["ACTIVE_STATE"],
    "subState": os.environ["SUB_STATE"],
    "pid": int(os.environ["PID"]) if os.environ["PID"].isdigit() else None,
    "systemdStartTimestamp": os.environ["STARTED_AT"],
    "execStart": os.environ["EXEC_START"],
    "renderer": {
        "runtimeMode": "source",
        "sourcePath": os.environ["HUD_SOURCE"],
        "sourceSha256": os.environ["SOURCE_RENDERER_SHA"],
        "installedPath": os.environ["HUD_SOURCE"],
        "installedSha256": os.environ["SOURCE_RENDERER_SHA"],
        "matches": True,
    },
    "unit": {
        "templatePath": os.environ["UNIT_TEMPLATE_SOURCE"],
        "templateSha256": os.environ["UNIT_TEMPLATE_SHA"],
        "installedPath": os.environ["UNIT_TARGET"],
        "installedSha256": os.environ["UNIT_TARGET_SHA"],
        "renderedSha256": os.environ["RENDERED_UNIT_SHA"],
        "matchesRendered": os.environ["UNIT_TARGET_SHA"] == os.environ["RENDERED_UNIT_SHA"],
    },
}
tmp.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
tmp.replace(target)
print(json.dumps(receipt, sort_keys=True))
PY

install_complete=true
trap - EXIT
printf 'installed Gem HUD source-backed service; backup=%s\n' "${backup:-none}"
