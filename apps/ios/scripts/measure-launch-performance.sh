#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RETENTION_SCRIPT="$PROJECT_ROOT/scripts/performance-artifact-retention.mjs"
DEFAULT_RESULTS_DIR="$PROJECT_ROOT/artifacts/ios-test-results/launch-performance"
RESULTS_DIR="${JOVIE_IOS_PERFORMANCE_RESULTS_DIR:-$DEFAULT_RESULTS_DIR}"
TIMESTAMP="$(date +%Y.%m.%d_%H-%M-%S%z)"
RUN_DIR="$RESULTS_DIR/Test-Jovie-launch-performance-$TIMESTAMP"
RESULT_BUNDLE="$RUN_DIR/Test-Jovie-launch-performance.xcresult"
LOG_PATH="$RUN_DIR/xcodebuild.log"

if [[ "$RESULTS_DIR" == "$DEFAULT_RESULTS_DIR" ]]; then
  node "$RETENTION_SCRIPT" retain ios-launch --repo-root "$PROJECT_ROOT" --apply
fi

mkdir -p "$RUN_DIR"
: >"$RUN_DIR/.jovie-run-in-progress"

finalize_run() {
  local status=$?
  rm -f "$RUN_DIR/.jovie-run-in-progress"
  if [[ "$status" -eq 0 ]]; then
    : >"$RUN_DIR/.jovie-run-completed"
    if [[ "$RESULTS_DIR" == "$DEFAULT_RESULTS_DIR" ]] &&
      ! node "$RETENTION_SCRIPT" retain ios-launch --repo-root "$PROJECT_ROOT" --apply; then
      status=1
    fi
  else
    : >"$RUN_DIR/.jovie-run-failed"
  fi
  trap - EXIT
  exit "$status"
}
trap finalize_run EXIT

export JOVIE_IOS_LAUNCH_PERFORMANCE=1
export JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS="${JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS:-4}"

echo "Running iOS signed-out launch performance test with ${JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS}s readiness timeout..."
echo "Result bundle: $RESULT_BUNDLE"
echo "Log: $LOG_PATH"

"$SCRIPT_DIR/run-xcodebuild.sh" test \
  -only-testing:JovieUITests/JovieUITests/testSignedOutLaunchPerformance \
  -resultBundlePath "$RESULT_BUNDLE" | tee "$LOG_PATH"
