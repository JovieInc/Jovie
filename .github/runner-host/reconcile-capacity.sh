#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_TASKS_MAX=2048
readonly EXPECTED_MAX_RUNNERS=10
readonly TARGET_WARNING_PERCENT=80
readonly TARGET_WARNING_TASKS=$((
  (EXPECTED_TASKS_MAX * TARGET_WARNING_PERCENT + 99) / 100
))
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SOURCE_DIR

validate_live_contract() {
  service_environment="$(
    systemctl show ci-runner-autoscaler.service --property Environment --value
  )"

  max_runner_entries=0
  actual_max_runners=""
  for entry in $service_environment; do
    entry="${entry#\"}"
    entry="${entry%\"}"
    if [[ "$entry" == AUTOSCALER_MAX_RUNNERS=* ]]; then
      max_runner_entries=$((max_runner_entries + 1))
      actual_max_runners="${entry#AUTOSCALER_MAX_RUNNERS=}"
    fi
  done

  if [[ "$max_runner_entries" -ne 1 || "$actual_max_runners" != "$EXPECTED_MAX_RUNNERS" ]]; then
    echo "runner_capacity_reconciliation=blocked"
    echo "runner_failure_class=dependency-or-environment-drift"
    echo "runner_capacity_detail=live AUTOSCALER_MAX_RUNNERS must be exactly $EXPECTED_MAX_RUNNERS; observed ${actual_max_runners:-missing} ($max_runner_entries entries)"
    exit 3
  fi

  actual_tasks_max="$(
    systemctl show ci-runners.slice --property TasksMax --value
  )"
  if ! [[ "$actual_tasks_max" =~ ^[1-9][0-9]*$ ]]; then
    echo "runner_capacity_reconciliation=blocked"
    echo "runner_failure_class=dependency-or-environment-drift"
    echo "runner_capacity_detail=invalid live TasksMax: $actual_tasks_max"
    exit 2
  fi

  actual_tasks_current="$(
    systemctl show ci-runners.slice --property TasksCurrent --value
  )"
  if ! [[ "$actual_tasks_current" =~ ^[0-9]+$ ]]; then
    echo "runner_capacity_reconciliation=blocked"
    echo "runner_failure_class=dependency-or-environment-drift"
    echo "runner_capacity_detail=invalid live TasksCurrent: $actual_tasks_current"
    exit 2
  fi

  # Lowering pids.max beneath a busy slice can immediately prevent every
  # runner from forking. Refuse the clamp before any file or systemd mutation
  # when the reviewed target would already be warning/critical.
  if (( actual_tasks_max > EXPECTED_TASKS_MAX && actual_tasks_current >= TARGET_WARNING_TASKS )); then
    echo "runner_capacity_reconciliation=blocked"
    echo "runner_failure_class=dependency-or-environment-drift"
    echo "runner_capacity_detail=refusing to lower TasksMax from $actual_tasks_max to $EXPECTED_TASKS_MAX with TasksCurrent=$actual_tasks_current (target warning threshold=$TARGET_WARNING_TASKS)"
    exit 5
  fi
}

if [[ "${1:-}" != "" && "${1:-}" != "--preflight" ]]; then
  echo "ERROR: usage: $0 [--preflight]" >&2
  exit 64
fi

validate_live_contract

if [[ "${1:-}" == "--preflight" ]]; then
  echo "runner_capacity_preflight=passed"
  echo "runner_capacity_preflight_tasks_max=$actual_tasks_max"
  echo "runner_capacity_preflight_tasks_current=$actual_tasks_current"
  echo "runner_capacity_preflight_max_runners=$actual_max_runners"
  exit 0
fi

if [[ "$actual_tasks_max" == "$EXPECTED_TASKS_MAX" ]]; then
  echo "runner_capacity_reconciliation=no-op"
else
  # Converge obsolete lower limits and unsafe higher limits to the reviewed
  # envelope. This never raises TasksMax beyond the versioned value.
  systemctl set-property ci-runners.slice "TasksMax=$EXPECTED_TASKS_MAX"
  reconciled_tasks_max="$(
    systemctl show ci-runners.slice --property TasksMax --value
  )"
  if [[ "$reconciled_tasks_max" != "$EXPECTED_TASKS_MAX" ]]; then
    echo "runner_capacity_reconciliation=failed"
    echo "runner_failure_class=dependency-or-environment-drift"
    echo "runner_capacity_detail=effective TasksMax=$reconciled_tasks_max after reconciliation; expected $EXPECTED_TASKS_MAX"
    exit 4
  fi
  echo "runner_capacity_reconciliation=repaired"
  echo "runner_capacity_previous_tasks_max=$actual_tasks_max"
fi

# Always rerun the diagnostic against effective live state. At the reviewed
# ceiling, >=80% usage is genuine saturation and must alert without mutation.
exec "$SOURCE_DIR/diagnose-capacity.sh"
