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
APP_PATH=""

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

# main calls each iPhone capture directly, so the first non-zero capture
# stops the script under set -e. Caps keep that one exhausted capture inside
# the 15-minute screenshot step after prepare_device's existing boot.
readonly IOS_SCREENSHOT_LAUNCH_TIMEOUT_CAP=60
readonly IOS_SCREENSHOT_LAUNCH_ATTEMPTS_CAP=3
readonly IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT_CAP=45
readonly IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT_CAP=30
readonly IOS_SCREENSHOT_LAUNCH_TERMINATE_TIMEOUT_CAP=20
readonly IOS_SCREENSHOT_LAUNCH_RETRY_DELAY_CAP=5

require_bounded_integer() {
  local label="$1"
  local value="$2"
  local minimum="$3"
  local maximum="$4"

  if ! [[ "$value" =~ ^(0|[1-9][0-9]*)$ ]] || (( value < minimum || value > maximum )); then
    echo "${label} must be an integer from ${minimum} to ${maximum} (got ${value})."
    return 1
  fi
}

ensure_booted_for_launch() {
  local udid="$1"
  local timeout_seconds="${IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT:-30}"
  local boot_command_timeout="${IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT:-15}"
  local boot_log

  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT \
    "$timeout_seconds" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT_CAP" || return 1
  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT \
    "$boot_command_timeout" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT_CAP" || return 1

  # `simctl boot` is idempotent and exits non-zero when the device is already up.
  # This is shorter than prepare_device's boot command; bootstatus is the wait.
  run_with_timeout "$boot_command_timeout" xcrun simctl boot "$udid" >/dev/null 2>&1 || true

  mkdir -p "$OUTPUT_DIR"
  boot_log="$OUTPUT_DIR/launch-bootstatus-$udid.log"
  if ! run_with_timeout "$timeout_seconds" xcrun simctl bootstatus "$udid" -b >"$boot_log" 2>&1; then
    cat "$boot_log" || true
    echo "Simulator $udid did not report booted via 'simctl bootstatus -b' within ${timeout_seconds}s."
    return 1
  fi
}

launch_for_capture() {
  local udid="$1"
  local name="$2"
  shift 2
  local attempts="${IOS_SCREENSHOT_LAUNCH_ATTEMPTS:-3}"
  local timeout_seconds="${IOS_SCREENSHOT_LAUNCH_TIMEOUT:-45}"
  local retry_delay="${IOS_SCREENSHOT_LAUNCH_RETRY_DELAY:-2}"
  local terminate_timeout="${IOS_SCREENSHOT_LAUNCH_TERMINATE_TIMEOUT:-15}"
  local boot_timeout="${IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT:-30}"
  local boot_command_timeout="${IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT:-15}"
  local attempt=1
  local launch_status=0

  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_ATTEMPTS \
    "$attempts" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_ATTEMPTS_CAP" || return 1
  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_TIMEOUT \
    "$timeout_seconds" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_TIMEOUT_CAP" || return 1
  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_RETRY_DELAY \
    "$retry_delay" \
    0 \
    "$IOS_SCREENSHOT_LAUNCH_RETRY_DELAY_CAP" || return 1
  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_TERMINATE_TIMEOUT \
    "$terminate_timeout" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_TERMINATE_TIMEOUT_CAP" || return 1
  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT \
    "$boot_timeout" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_BOOT_TIMEOUT_CAP" || return 1
  require_bounded_integer \
    IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT \
    "$boot_command_timeout" \
    1 \
    "$IOS_SCREENSHOT_LAUNCH_BOOT_COMMAND_TIMEOUT_CAP" || return 1

  while (( attempt <= attempts )); do
    echo "Launch attempt ${attempt}/${attempts} for ${name} (timeout ${timeout_seconds}s)."
    if ! ensure_booted_for_launch "$udid"; then
      echo "Simulator was not booted before launch attempt ${attempt}/${attempts} for ${name}."
    else
      local errexit=0
      case $- in
        *e*) errexit=1 ;;
      esac
      set +e
      run_with_timeout "$timeout_seconds" xcrun simctl launch "$udid" "$BUNDLE_ID" "$@"
      launch_status=$?
      if (( errexit == 1 )); then
        set -e
      fi
      if (( launch_status == 0 )); then
        return 0
      fi
      echo "simctl launch failed on attempt ${attempt}/${attempts} for ${name} (status ${launch_status}, bound ${timeout_seconds}s)."
    fi

    run_with_timeout "$terminate_timeout" xcrun simctl terminate "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
    if (( attempt < attempts )); then
      sleep "$retry_delay"
    fi
    attempt=$((attempt + 1))
  done

  echo "Unable to launch ${BUNDLE_ID} on ${udid} for ${name} after ${attempts} attempts."
  return 1
}

capture() {
  local udid="$1"
  local name="$2"
  shift 2

  run_with_timeout "${IOS_SCREENSHOT_TERMINATE_TIMEOUT:-15}" xcrun simctl terminate "$udid" "$BUNDLE_ID" >/dev/null 2>&1 || true
  if ! launch_for_capture "$udid" "$name" "$@"; then
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

main() {
  node "$RETENTION_SCRIPT" reset ios-screenshots "$OUTPUT_DIR" \
    --repo-root "$REPO_ROOT" --apply

  "$SCRIPT_DIR/ensure-configuration.sh"

  local app_path="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/Jovie.app"
  if [[ -d "$app_path" && "${IOS_SCREENSHOT_REUSE_BUILD:-0}" == "1" ]]; then
    echo "Using existing built app at $app_path"
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

  if [[ ! -d "$app_path" ]]; then
    echo "Built app not found at $app_path"
    exit 1
  fi

  # prepare_device and capture read APP_PATH from the environment of this process.
  APP_PATH="$app_path"

  local iphone_udid
  iphone_udid="$(pick_device "^iPhone")"
  if [[ -z "$iphone_udid" ]]; then
    echo "Unable to find an available iPhone simulator."
    xcrun simctl list devices available
    exit 1
  fi

  prepare_device "$iphone_udid"
  capture "$iphone_udid" "00-loading" "-ui-testing-splash"
  capture "$iphone_udid" "01-signed-out" "-ui-testing-signed-out"
  capture "$iphone_udid" "02-profile" "-ui-testing-ready"
  capture "$iphone_udid" "03-fullscreen-qr" "-ui-testing-venue-mode"
  capture "$iphone_udid" "04-settings" "-ui-testing-settings"
  capture "$iphone_udid" "05-needs-onboarding" "-ui-testing-needs-onboarding"
  capture "$iphone_udid" "06-chat" "-ui-testing-chat"

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
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main
fi
