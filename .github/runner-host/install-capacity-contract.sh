#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_TASKS_MAX=2048
readonly EXPECTED_MAX_RUNNERS=10
readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" != "--apply" ]]; then
  echo "Dry run: no host state changed."
  echo "Would install $SOURCE_DIR/ci-runners.slice"
  echo "Would set ci-runners.slice TasksMax=$EXPECTED_TASKS_MAX"
  exit 0
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: --apply must run as root" >&2
  exit 2
fi

service_environment="$(
  systemctl show ci-runner-autoscaler.service --property Environment --value
)"
if ! grep -Eq \
  "(^| )AUTOSCALER_MAX_RUNNERS=$EXPECTED_MAX_RUNNERS( |$)" \
  <<< "$service_environment"; then
  echo "ERROR: live service must keep max runners at $EXPECTED_MAX_RUNNERS" >&2
  exit 3
fi

install -m 0644 "$SOURCE_DIR/ci-runners.slice" /etc/systemd/system/ci-runners.slice
systemctl daemon-reload

# The live host may have a systemctl-generated control drop-in. Updating the
# property keeps that higher-precedence drop-in aligned with the versioned unit.
# TasksMax is mutable at runtime, so runner jobs are not interrupted.
systemctl set-property ci-runners.slice "TasksMax=$EXPECTED_TASKS_MAX"

actual="$(systemctl show ci-runners.slice --property TasksMax --value)"
if [[ "$actual" != "$EXPECTED_TASKS_MAX" ]]; then
  echo "ERROR: effective TasksMax=$actual; expected $EXPECTED_TASKS_MAX" >&2
  exit 4
fi

echo "Installed runner host contract; TasksMax=$actual, max runners=$EXPECTED_MAX_RUNNERS"
echo "Autoscaler was not restarted."
