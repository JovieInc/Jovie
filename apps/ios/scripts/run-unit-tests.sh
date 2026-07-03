#!/usr/bin/env bash
# Run JovieTests only with code coverage enabled. UI tests stay out of the PR gate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULT_BUNDLE="${1:-${JOVIE_IOS_RESULT_BUNDLE:-artifacts/ios-test-results/Jovie.xcresult}}"
DERIVED_DATA="${JOVIE_IOS_DERIVED_DATA:-.build/ios-ci}"

mkdir -p "$(dirname "$RESULT_BUNDLE")"
rm -rf "$RESULT_BUNDLE"

bash "$SCRIPT_DIR/run-xcodebuild.sh" test \
  -derivedDataPath "$DERIVED_DATA" \
  -enableCodeCoverage YES \
  -resultBundlePath "$RESULT_BUNDLE" \
  -only-testing:JovieTests

echo "Unit test result bundle: $RESULT_BUNDLE"
