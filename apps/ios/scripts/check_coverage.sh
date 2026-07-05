#!/usr/bin/env bash
# Gate iOS app-target line coverage: absolute floor + committed baseline ratchet.
set -euo pipefail

RESULT_BUNDLE="${1:-artifacts/ios-test-results/Jovie.xcresult}"
IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$IOS_DIR/coverage_baseline.txt"
COVERAGE_FLOOR="${JOVIE_IOS_COVERAGE_FLOOR:-0.18}"
RATCHET_TOLERANCE="${JOVIE_IOS_COVERAGE_RATCHET_TOLERANCE:-0.01}"
APP_TARGET_NAME="${JOVIE_IOS_COVERAGE_TARGET:-Jovie.app}"

if [[ ! -d "$RESULT_BUNDLE" ]]; then
  echo "::error::Missing xcresult bundle at $RESULT_BUNDLE"
  exit 1
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "::error::xcrun is required to inspect code coverage"
  exit 1
fi

REPORT_JSON="$(mktemp)"
trap 'rm -f "$REPORT_JSON"' EXIT

xcrun xccov view --report --json "$RESULT_BUNDLE" >"$REPORT_JSON"

LINE_COVERAGE="$(
  python3 - "$REPORT_JSON" "$APP_TARGET_NAME" <<'PY'
import json
import sys

report_path, target_name = sys.argv[1:3]
with open(report_path, encoding="utf-8") as handle:
    report = json.load(handle)

def walk(node):
    if isinstance(node, dict):
        name = node.get("name")
        if name == target_name and "lineCoverage" in node:
            yield float(node["lineCoverage"])
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk(item)

matches = list(walk(report))
if not matches:
    print("MISSING", file=sys.stderr)
    sys.exit(2)

print(f"{max(matches):.6f}")
PY
)"

if [[ "$LINE_COVERAGE" == "MISSING" || -z "$LINE_COVERAGE" ]]; then
  echo "::error::Could not find lineCoverage for $APP_TARGET_NAME in $RESULT_BUNDLE"
  exit 1
fi

echo "App target line coverage ($APP_TARGET_NAME): $LINE_COVERAGE"
echo "Absolute floor: $COVERAGE_FLOOR"

python3 - "$LINE_COVERAGE" "$COVERAGE_FLOOR" <<'PY'
import sys

coverage = float(sys.argv[1])
floor = float(sys.argv[2])
if coverage + 1e-9 < floor:
    print(
        f"::error::Line coverage {coverage:.4f} is below absolute floor {floor:.4f}"
    )
    sys.exit(1)
PY

if [[ -f "$BASELINE_FILE" ]]; then
  BASELINE="$(tr -d '[:space:]' <"$BASELINE_FILE")"
  if [[ -n "$BASELINE" ]]; then
    echo "Committed baseline: $BASELINE"
    python3 - "$LINE_COVERAGE" "$BASELINE" "$RATCHET_TOLERANCE" <<'PY'
import sys

coverage = float(sys.argv[1])
baseline = float(sys.argv[2])
tolerance = float(sys.argv[3])
minimum = baseline - tolerance
if coverage + 1e-9 < minimum:
    print(
        f"::error::Line coverage {coverage:.4f} dropped below baseline ratchet "
        f"({baseline:.4f} - {tolerance:.4f} = {minimum:.4f})"
    )
    sys.exit(1)
PY
  fi
else
  echo "::warning::No coverage baseline file at $BASELINE_FILE — absolute floor only"
fi

echo "Coverage gate passed."
