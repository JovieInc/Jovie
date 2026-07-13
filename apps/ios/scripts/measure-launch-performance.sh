#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RESULTS_DIR="${JOVIE_IOS_PERFORMANCE_RESULTS_DIR:-$PROJECT_ROOT/artifacts/ios-test-results/launch-performance}"
TIMESTAMP="$(date +%Y.%m.%d_%H-%M-%S%z)"
RESULT_BUNDLE="$RESULTS_DIR/Test-Jovie-launch-performance-$TIMESTAMP.xcresult"
LOG_PATH="$RESULTS_DIR/Test-Jovie-launch-performance-$TIMESTAMP.log"

mkdir -p "$RESULTS_DIR"

export JOVIE_IOS_LAUNCH_PERFORMANCE=1
export JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS="${JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS:-4}"

echo "Running iOS signed-out launch performance test with ${JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS}s readiness timeout..."
echo "Result bundle: $RESULT_BUNDLE"
echo "Log: $LOG_PATH"

"$SCRIPT_DIR/run-xcodebuild.sh" test \
  -only-testing:JovieUITests/JovieUITests/testSignedOutLaunchPerformance \
  -resultBundlePath "$RESULT_BUNDLE" | tee "$LOG_PATH"
