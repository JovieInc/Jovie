# Shared Gem/GHA user-systemd preflight.
# Sourced by fleet + rehabilitation installers. Not executable on its own.
# Establishes XDG_RUNTIME_DIR + DBUS_SESSION_BUS_ADDRESS for the lingering
# user manager, then fail-closes (exit 4) if systemctl --user cannot talk.
# Does not write controller files.

prepare_user_systemd_context() {
  if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
    XDG_RUNTIME_DIR="/run/user/$(id -u)"
    export XDG_RUNTIME_DIR
  fi
  DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
  export DBUS_SESSION_BUS_ADDRESS
  if [[ "${GEM_SYSTEMD_REQUIRE_BUS_SOCKET:-}" == "1" && ! -S "${XDG_RUNTIME_DIR}/bus" ]]; then
    printf 'Gem user systemd preflight failed; missing bus socket %s (enable linger)\n' \
      "${XDG_RUNTIME_DIR}/bus" >&2
    return 4
  fi
  if ! systemctl --user show-environment >/dev/null; then
    printf 'Gem user systemd preflight failed; refusing controller writes (XDG_RUNTIME_DIR=%s bus=%s)\n' \
      "${XDG_RUNTIME_DIR}" "${XDG_RUNTIME_DIR}/bus" >&2
    return 4
  fi
}
