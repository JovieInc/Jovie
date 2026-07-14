#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RETENTION_SCRIPT="$PROJECT_ROOT/scripts/performance-artifact-retention.mjs"
DEFAULT_RESULTS_DIR="$PROJECT_ROOT/artifacts/ios-test-results/runtime-performance"
RESULTS_DIR="${JOVIE_IOS_RUNTIME_RESULTS_DIR:-$DEFAULT_RESULTS_DIR}"
TIMESTAMP="$(date +%Y.%m.%d_%H-%M-%S%z)"
RUN_DIR="$RESULTS_DIR/Test-Jovie-runtime-performance-$TIMESTAMP"
RESULT_BUNDLE="$RUN_DIR/Test-Jovie-runtime-performance.xcresult"
LOG_PATH="$RUN_DIR/xcodebuild.log"
SUMMARY_PATH="$RUN_DIR/summary.md"

if [[ "$RESULTS_DIR" == "$DEFAULT_RESULTS_DIR" ]]; then
  node "$RETENTION_SCRIPT" retain ios-runtime --repo-root "$PROJECT_ROOT" --apply
fi

mkdir -p "$RUN_DIR"
: >"$RUN_DIR/.jovie-run-in-progress"

finalize_run() {
  local status=$?
  rm -f "$RUN_DIR/.jovie-run-in-progress"
  if [[ "$status" -eq 0 ]]; then
    : >"$RUN_DIR/.jovie-run-completed"
    if [[ "$RESULTS_DIR" == "$DEFAULT_RESULTS_DIR" ]] &&
      ! node "$RETENTION_SCRIPT" retain ios-runtime --repo-root "$PROJECT_ROOT" --apply; then
      status=1
    fi
  else
    : >"$RUN_DIR/.jovie-run-failed"
  fi
  trap - EXIT
  exit "$status"
}
trap finalize_run EXIT

export JOVIE_IOS_RUNTIME_PERFORMANCE=1
export JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS="${JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS:-3}"

echo "Running iOS shell runtime performance test with ${JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS}s transition timeout..."
echo "Result bundle: $RESULT_BUNDLE"
echo "Log: $LOG_PATH"
echo "Summary: $SUMMARY_PATH"

set +e
"$SCRIPT_DIR/run-xcodebuild.sh" test \
  -only-testing:JovieUITests/JovieUITests/testShellNavigationRuntimePerformance \
  -resultBundlePath "$RESULT_BUNDLE" | tee "$LOG_PATH"
PIPE_STATUSES=("${PIPESTATUS[@]}")
XCODEBUILD_STATUS="${PIPE_STATUSES[0]}"
TEE_STATUS="${PIPE_STATUSES[1]}"
set -e

if [[ "$XCODEBUILD_STATUS" -eq 0 && "$TEE_STATUS" -eq 0 ]]; then
  STATUS_DESCRIPTION="passed"
elif [[ "$XCODEBUILD_STATUS" -ne 0 ]]; then
  STATUS_DESCRIPTION="failed with xcodebuild status $XCODEBUILD_STATUS"
else
  STATUS_DESCRIPTION="failed with tee status $TEE_STATUS"
fi

{
  echo "# iOS Runtime Performance Baseline"
  echo
  echo "- Status: $STATUS_DESCRIPTION"
  echo "- Flow: deterministic \`-ui-testing-chat\` shell, Chat to Profile to Chat bottom navigation transition."
  echo "- Timeout: ${JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS}s per measured transition."
  echo "- Requested metrics: \`XCTClockMetric\`, \`XCTCPUMetric(application:)\`, \`XCTMemoryMetric(application:)\`, and \`XCTHitchMetric(application:)\` on iOS 26+ simulator runtimes."
  echo "- Emitted metrics:"
  if grep -F " measured [" "$LOG_PATH" >/dev/null 2>&1; then
    grep -F " measured [" "$LOG_PATH" | while IFS= read -r line; do
      metric="${line#* measured [}"
      metric="${metric%%] average:*}"
      average="${line#* average: }"
      average="${average%%,*}"
      echo "  - ${metric}: average ${average}"
    done
  else
    echo "  - No XCTest metric lines found in the log."
  fi
  if grep -F " measured [" "$LOG_PATH" | grep -Eiq "hitch|frame"; then
    echo "- Hitch metrics emitted: yes."
  else
    echo "- Hitch metrics emitted: no measured hitch or frame metric lines found in the xcodebuild log."
  fi
  echo "- Result bundle: \`$RESULT_BUNDLE\`"
  echo "- Log: \`$LOG_PATH\`"
} > "$SUMMARY_PATH"

if [[ "$XCODEBUILD_STATUS" -ne 0 ]]; then
  exit "$XCODEBUILD_STATUS"
fi

exit "$TEE_STATUS"
