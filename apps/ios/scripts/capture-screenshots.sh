#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/../.." && pwd)"
RETENTION_SCRIPT="$REPO_ROOT/scripts/performance-artifact-retention.mjs"
PROJECT_PATH="$IOS_DIR/Jovie.xcodeproj"
SCHEME="Jovie"
BUNDLE_ID="ie.jov.Jovie"
OUTPUT_DIR="${IOS_SCREENSHOT_DIR:-$REPO_ROOT/artifacts/ios-screenshots}"
DERIVED_DATA_PATH="${IOS_SCREENSHOT_DERIVED_DATA:-$REPO_ROOT/.build/ios-screenshots}"

node "$RETENTION_SCRIPT" reset ios-screenshots "$OUTPUT_DIR" \
  --repo-root "$REPO_ROOT" --apply

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
if [[ -d "$APP_PATH" && "${IOS_SCREENSHOT_REUSE_BUILD:-0}" == "1" ]]; then
  echo "Using existing built app at $APP_PATH"
else
  node "$RETENTION_SCRIPT" reset ios-screenshot-derived-data "$DERIVED_DATA_PATH" \
    --repo-root "$REPO_ROOT" --apply
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

list_devices() {
  local name_pattern="$1"
  local devices_file
  devices_file="$(mktemp)"

  if ! run_with_timeout "${IOS_SCREENSHOT_SIMCTL_LIST_TIMEOUT:-30}" xcrun simctl list devices available -j >"$devices_file"; then
    echo "Timed out listing available simulators."
    rm -f "$devices_file"
    return 1
  fi

  RUBYOPT='' ruby -rjson -e '
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

    ranked = candidates.sort_by do |device|
      name = device.fetch("name")
      [
        device.fetch("state") == "Booted" ? 0 : 1,
        name == "iPhone 17" ? 0 : 1,
        name == "iPad (A16)" ? 0 : 1,
        name
      ]
    end

    puts(ranked.map { |device| device.fetch("udid") })
  ' "$name_pattern" <"$devices_file"

  rm -f "$devices_file"
}

pick_device() {
  local devices=""

  if ! devices="$(list_devices "$1")"; then
    return 1
  fi

  if [[ -z "$devices" ]]; then
    return 1
  fi

  printf '%s\n' "${devices%%$'\n'*}"
}

prepare_device() {
  local udid="$1"

  echo "Preparing simulator $udid"
  run_with_timeout "${IOS_SCREENSHOT_BOOT_COMMAND_TIMEOUT:-120}" xcrun simctl boot "$udid" >/dev/null 2>&1 || true
  wait_for_boot "$udid" || return 1
  run_with_timeout "${IOS_SCREENSHOT_UI_TIMEOUT:-10}" xcrun simctl ui "$udid" appearance dark >/dev/null 2>&1 || true
  run_with_timeout "${IOS_SCREENSHOT_UNINSTALL_TIMEOUT:-30}" xcrun simctl uninstall "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  run_with_timeout "${IOS_SCREENSHOT_INSTALL_TIMEOUT:-60}" xcrun simctl install "$udid" "$APP_PATH" || return 1
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
  if ! run_with_timeout "${IOS_SCREENSHOT_LAUNCH_TIMEOUT:-20}" xcrun simctl launch "$udid" "$BUNDLE_ID" "$@"; then
    echo "Unable to launch $BUNDLE_ID on $udid for $name."
    return 1
  fi

  sleep 2
  if ! run_with_timeout "${IOS_SCREENSHOT_CAPTURE_TIMEOUT:-45}" xcrun simctl io "$udid" screenshot "$OUTPUT_DIR/$name.png"; then
    echo "Retrying screenshot capture for $name after simulator settle."
    sleep 5
    if ! run_with_timeout "${IOS_SCREENSHOT_CAPTURE_TIMEOUT:-45}" xcrun simctl io "$udid" screenshot "$OUTPUT_DIR/$name.png"; then
      echo "Unable to capture screenshot $name from simulator $udid."
      return 1
    fi
  fi

  if [[ ! -s "$OUTPUT_DIR/$name.png" ]]; then
    echo "Screenshot $OUTPUT_DIR/$name.png was not created."
    return 1
  fi

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
capture "$IPHONE_UDID" "02-profile" "-ui-testing-ready"
capture "$IPHONE_UDID" "03-fullscreen-qr" "-ui-testing-venue-mode"
capture "$IPHONE_UDID" "04-settings" "-ui-testing-settings"
capture "$IPHONE_UDID" "05-needs-onboarding" "-ui-testing-needs-onboarding"
capture "$IPHONE_UDID" "06-chat" "-ui-testing-chat"

if [[ "${IOS_SCREENSHOT_CAPTURE_IPAD:-1}" != "1" ]]; then
  echo "Skipped iPad shell screenshot because IOS_SCREENSHOT_CAPTURE_IPAD=${IOS_SCREENSHOT_CAPTURE_IPAD:-0}."
elif IPAD_UDID="$(pick_device "^iPad")" && [[ -n "$IPAD_UDID" ]]; then
  captured_ipad=false
  while IFS= read -r candidate_udid; do
    [[ -z "$candidate_udid" ]] && continue

    if IOS_SCREENSHOT_BOOT_TIMEOUT="${IOS_SCREENSHOT_IPAD_BOOT_TIMEOUT:-90}" prepare_device "$candidate_udid" &&
      capture "$candidate_udid" "07-ipad-shell" "-ui-testing-ready"; then
      captured_ipad=true
      break
    fi

    echo "iPad simulator $candidate_udid did not complete screenshot capture; trying the next available iPad."
  done < <(list_devices "^iPad")

  if [[ "$captured_ipad" != true ]]; then
    if [[ "${IOS_SCREENSHOT_REQUIRE_IPAD:-1}" == "1" ]]; then
      echo "Unable to capture the iPad shell screenshot."
      exit 1
    fi

    echo "No iPad simulator completed screenshot capture; continuing after core iPhone screenshots."
  fi
else
  echo "No iPad simulator available; skipped iPad shell screenshot."
fi

echo "Screenshots written to $OUTPUT_DIR"
