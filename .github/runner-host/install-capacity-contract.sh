#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_TASKS_MAX=2048
readonly EXPECTED_MAX_RUNNERS=10
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_DIR
readonly INSTALL_ROOT="${RUNNER_HOST_INSTALL_ROOT:-}"

install_contract_files() {
  local install_root="$1"

  install -d -m 0755 "$install_root/etc/systemd/system"
  install -m 0644 \
    "$SOURCE_DIR/ci-runners.slice" \
    "$install_root/etc/systemd/system/ci-runners.slice"
  install -d -m 0755 "$install_root/usr/local/libexec/jovie-runner-host"
  install -m 0755 \
    "$SOURCE_DIR/diagnose-capacity.sh" \
    "$SOURCE_DIR/reconcile-capacity.sh" \
    "$install_root/usr/local/libexec/jovie-runner-host/"
  install -m 0644 \
    "$SOURCE_DIR/ci-runner-capacity-reconcile.service" \
    "$SOURCE_DIR/ci-runner-capacity-reconcile.timer" \
    "$install_root/etc/systemd/system/"
}

apply_live_contract() {
  local install_root="${1:-}"
  local reconcile_status=0
  local timer_status=0

  # Validate the live host before the first file write or systemd mutation.
  "$SOURCE_DIR/reconcile-capacity.sh" --preflight
  install_contract_files "$install_root"
  systemctl daemon-reload

  # Enable without starting so the immediate proof and timer cannot reconcile
  # concurrently. Start the timer even when the proof reports saturation, so
  # the failed condition is retried and remains visible until it clears.
  systemctl enable ci-runner-capacity-reconcile.timer
  "$install_root/usr/local/libexec/jovie-runner-host/reconcile-capacity.sh" || reconcile_status=$?
  systemctl start ci-runner-capacity-reconcile.timer || timer_status=$?

  if [[ "$reconcile_status" -ne 0 ]]; then
    return "$reconcile_status"
  fi
  if [[ "$timer_status" -ne 0 ]]; then
    return "$timer_status"
  fi

  echo "Installed runner host contract; TasksMax=$EXPECTED_TASKS_MAX, max runners=$EXPECTED_MAX_RUNNERS"
  echo "Autoscaler was not restarted."
}

main() {
  if [[ "${1:-}" != "--apply" ]]; then
    echo "Dry run: no host state changed."
    echo "Would install $SOURCE_DIR/ci-runners.slice"
    echo "Would install the root-owned capacity reconciler and timer"
    echo "Would reconcile ci-runners.slice TasksMax=$EXPECTED_TASKS_MAX"
    return 0
  fi

  # A staging root is packaging-only. It never reads or mutates live systemd
  # state and is intentionally available to unprivileged verification.
  if [[ -n "$INSTALL_ROOT" ]]; then
    install_contract_files "$INSTALL_ROOT"
    echo "Staged runner host contract at $INSTALL_ROOT; live host unchanged."
    return 0
  fi

  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: --apply must run as root" >&2
    return 2
  fi

  apply_live_contract ""
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
