#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RESULTS_DIR="${JOVIE_IOS_RUNTIME_RESULTS_DIR:-$PROJECT_ROOT/artifacts/ios-test-results/runtime-performance}"
TIMESTAMP="$(date +%Y.%m.%d_%H-%M-%S%z)"
RESULT_BUNDLE="$RESULTS_DIR/Test-Jovie-runtime-performance-$TIMESTAMP.xcresult"
LOG_PATH="$RESULTS_DIR/Test-Jovie-runtime-performance-$TIMESTAMP.log"
SUMMARY_PATH="$RESULTS_DIR/Test-Jovie-runtime-performance-$TIMESTAMP-summary.md"

mkdir -p "$RESULTS_DIR"

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
XCODEBUILD_STATUS="${PIPESTATUS[0]}"
set -e

{
  echo "# iOS Runtime Performance Baseline"
  echo
  echo "- Status: $([[ "$XCODEBUILD_STATUS" -eq 0 ]] && echo "passed" || echo "failed with status $XCODEBUILD_STATUS")"
  echo "- Flow: deterministic \`-ui-testing-chat\` shell, Chat to Profile to Chat bottom navigation transition."
  echo "- Timeout: ${JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS}s per measured transition."
  echo "- Requested metrics: \`XCTClockMetric\`, \`XCTCPUMetric(application:)\`, and \`XCTMemoryMetric(application:)\`."
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
  echo "- Result bundle: \`$RESULT_BUNDLE\`"
  echo "- Log: \`$LOG_PATH\`"
} > "$SUMMARY_PATH"

exit "$XCODEBUILD_STATUS"
