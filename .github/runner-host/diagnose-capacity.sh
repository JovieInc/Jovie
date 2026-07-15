#!/usr/bin/env bash
set -euo pipefail

current="${RUNNER_TASKS_CURRENT:-}"
maximum="${RUNNER_TASKS_MAX:-}"

if [[ -z "$current" || -z "$maximum" ]]; then
  current="$(systemctl show ci-runners.slice --property TasksCurrent --value)"
  maximum="$(systemctl show ci-runners.slice --property TasksMax --value)"
fi

if ! [[ "$current" =~ ^[0-9]+$ && "$maximum" =~ ^[1-9][0-9]*$ ]]; then
  echo "runner_tasks_status=unknown"
  echo "runner_tasks_detail=invalid TasksCurrent/TasksMax: current=$current max=$maximum"
  exit 2
fi

ratio=$((current * 100 / maximum))
status=ok
if (( ratio >= 90 )); then
  status=critical
elif (( ratio >= 80 )); then
  status=warning
fi

echo "runner_tasks_status=$status"
echo "runner_tasks_current=$current"
echo "runner_tasks_max=$maximum"
echo "runner_tasks_ratio_pct=$ratio"
echo "runner_failure_class=dependency-or-environment-drift"

if [[ "$status" != "ok" ]]; then
  echo "runner_tasks_remediation=ci-runners.slice is saturated; verify the versioned TasksMax contract before retrying CI"
  exit 1
fi
