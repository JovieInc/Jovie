#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/../.." && pwd)"
PROJECT_PATH="$IOS_DIR/Jovie.xcodeproj"
SCHEME="Jovie"
BUNDLE_ID="ie.jov.Jovie"
OUTPUT_DIR="${IOS_SCREENSHOT_DIR:-$REPO_ROOT/artifacts/ios-screenshots}"
DERIVED_DATA_PATH="${IOS_SCREENSHOT_DERIVED_DATA:-$REPO_ROOT/.build/ios-screenshots}"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  "$@" &
  local command_pid=$!
  local elapsed=0

  while kill -0 "$command_pid" >/dev/null 2>&1; do
    if (( elapsed >= timeout_seconds )); then
      kill "$command_pid" >/dev/null 2>&1 || true
      sleep 1
      kill -9 "$command_pid" >/dev/null 2>&1 || true
      wait "$command_pid" >/dev/null 2>&1 || true
      echo "Command timed out after ${timeout_seconds}s: $*"
      return 124
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  wait "$command_pid"
}

"$SCRIPT_DIR/ensure-configuration.sh"

APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/Jovie.app"
if [[ -d "$APP_PATH" ]]; then
  echo "Using existing built app at $APP_PATH"
else
  run_with_timeout "${IOS_SCREENSHOT_BUILD_TIMEOUT:-300}" xcodebuild build \
    -project "$PROJECT_PATH" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -destination "generic/platform=iOS Simulator" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    CODE_SIGNING_ALLOWED=NO
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "Built app not found at $APP_PATH"
  exit 1
fi

pick_device() {
  local name_pattern="$1"
  local devices_file
  devices_file="$(mktemp)"

  if ! run_with_timeout "${IOS_SCREENSHOT_SIMCTL_LIST_TIMEOUT:-30}" xcrun simctl list devices available -j >"$devices_file"; then
    echo "Timed out listing available simulators."
    rm -f "$devices_file"
    return 1
  fi

  RUBYOPT= ruby -rjson -e '
    pattern = Regexp.new(ARGV.fetch(0))
    input = STDIN.read
    devices_by_runtime = JSON.parse(input).fetch("devices", {})
    candidates = []

    devices_by_runtime.each do |runtime, devices|
      next unless runtime.include?("com.apple.CoreSimulator.SimRuntime.iOS")

      devices.each do |device|
        next unless device["isAvailable"]
        next unless device["name"].to_s.match?(pattern)

        candidates << {
          "udid" => device["udid"].to_s,
          "name" => device["name"].to_s,
          "state" => device["state"].to_s
        }
      end
    end

    picked = candidates.max_by do |device|
      [
        device.fetch("state") == "Booted" ? 1 : 0,
        device.fetch("name") == "iPhone 17" ? 1 : 0,
        device.fetch("name") == "iPad Pro 11-inch (M5)" ? 1 : 0,
        device.fetch("name")
      ]
    end

    print(picked&.fetch("udid") || "")
  ' "$name_pattern" <"$devices_file"

  rm -f "$devices_file"
}

prepare_device() {
  local udid="$1"

  echo "Preparing simulator $udid"
  run_with_timeout "${IOS_SCREENSHOT_BOOT_COMMAND_TIMEOUT:-120}" xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  wait_for_boot "$udid"
  run_with_timeout "${IOS_SCREENSHOT_UI_TIMEOUT:-10}" xcrun simctl ui "$udid" appearance dark >/dev/null 2>&1 || true
  run_with_timeout "${IOS_SCREENSHOT_UNINSTALL_TIMEOUT:-30}" xcrun simctl uninstall "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  run_with_timeout "${IOS_SCREENSHOT_INSTALL_TIMEOUT:-60}" xcrun simctl install "$udid" "$APP_PATH"
}

wait_for_boot() {
  local udid="$1"
  local timeout_seconds="${IOS_SCREENSHOT_BOOT_TIMEOUT:-180}"
  local boot_log="$OUTPUT_DIR/bootstatus-$udid.log"
  local elapsed=0

  xcrun simctl bootstatus "$udid" -b >"$boot_log" 2>&1 &
  local boot_pid=$!

  while kill -0 "$boot_pid" >/dev/null 2>&1; do
    if (( elapsed >= timeout_seconds )); then
      kill "$boot_pid" >/dev/null 2>&1 || true
      wait "$boot_pid" >/dev/null 2>&1 || true

      local devices_file
      devices_file="$(mktemp)"
      if run_with_timeout "${IOS_SCREENSHOT_SIMCTL_LIST_TIMEOUT:-30}" xcrun simctl list devices >"$devices_file" &&
        grep -F "$udid)" "$devices_file" | grep -q "(Booted)"; then
        rm -f "$devices_file"
        echo "Simulator $udid is booted; continuing after bootstatus timeout."
        return 0
      fi
      rm -f "$devices_file"

      cat "$boot_log"
      echo "Simulator $udid did not finish booting within ${timeout_seconds}s."
      return 1
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  wait "$boot_pid"
}

capture() {
  local udid="$1"
  local name="$2"
  shift 2

  run_with_timeout "${IOS_SCREENSHOT_TERMINATE_TIMEOUT:-15}" xcrun simctl terminate "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  run_with_timeout "${IOS_SCREENSHOT_LAUNCH_TIMEOUT:-20}" xcrun simctl launch "$udid" "$BUNDLE_ID" "$@"
  sleep 2
  run_with_timeout "${IOS_SCREENSHOT_CAPTURE_TIMEOUT:-20}" xcrun simctl io "$udid" screenshot "$OUTPUT_DIR/$name.png"
  echo "Captured $OUTPUT_DIR/$name.png"
}

IPHONE_UDID="$(pick_device "^iPhone")"
if [[ -z "$IPHONE_UDID" ]]; then
  echo "Unable to find an available iPhone simulator."
  xcrun simctl list devices available
  exit 1
fi

prepare_device "$IPHONE_UDID"
capture "$IPHONE_UDID" "00-loading" "-ui-testing-splash"
capture "$IPHONE_UDID" "01-signed-out" "-ui-testing-signed-out"
capture "$IPHONE_UDID" "02-dashboard" "-ui-testing-ready"
capture "$IPHONE_UDID" "03-fullscreen-qr" "-ui-testing-venue-mode"
capture "$IPHONE_UDID" "04-settings" "-ui-testing-settings"
capture "$IPHONE_UDID" "05-needs-onboarding" "-ui-testing-needs-onboarding"

IPAD_UDID="$(pick_device "^iPad")"
if [[ -n "$IPAD_UDID" ]]; then
  prepare_device "$IPAD_UDID"
  capture "$IPAD_UDID" "06-ipad-shell" "-ui-testing-ready"
else
  echo "No iPad simulator available; skipped iPad shell screenshot."
fi

echo "Screenshots written to $OUTPUT_DIR"
