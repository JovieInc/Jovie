#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/../.." && pwd)"
RETENTION_SCRIPT="$REPO_ROOT/scripts/performance-artifact-retention.mjs"
PROJECT_PATH="$IOS_DIR/Jovie.xcodeproj"
SCHEME="Jovie"
BUNDLE_ID="ie.jov.Jovie"
CODE_SIGNING_ALLOWED_VALUE="${CODE_SIGNING_ALLOWED:-YES}"
DEFAULT_RESULTS_DIR="$REPO_ROOT/artifacts/ios-test-results/memory-baseline"
RESULTS_DIR="${JOVIE_IOS_MEMORY_RESULTS_DIR:-$DEFAULT_RESULTS_DIR}"
DERIVED_DATA_PATH="${JOVIE_IOS_MEMORY_DERIVED_DATA:-$REPO_ROOT/.build/ios-memory-baseline}"
LAUNCH_ARGUMENTS="${JOVIE_IOS_MEMORY_LAUNCH_ARGUMENTS:--ui-testing-ready}"
SETTLE_SECONDS="${JOVIE_IOS_MEMORY_SETTLE_SECONDS:-5}"
TIMESTAMP="$(date +%Y.%m.%d_%H-%M-%S-%z)"
RUN_DIR="$RESULTS_DIR/Jovie-memory-baseline-$TIMESTAMP"
REQUIRE_MEMGRAPH="${JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH:-0}"

if [[ "$RESULTS_DIR" == "$DEFAULT_RESULTS_DIR" ]]; then
  node "$RETENTION_SCRIPT" retain ios-memory --repo-root "$REPO_ROOT" --apply
fi

mkdir -p "$RUN_DIR"
: >"$RUN_DIR/.jovie-run-in-progress"

finalize_run() {
  local status=$?
  rm -f "$RUN_DIR/.jovie-run-in-progress"
  if [[ "$status" -eq 0 ]]; then
    : >"$RUN_DIR/.jovie-run-completed"
    if [[ "$RESULTS_DIR" == "$DEFAULT_RESULTS_DIR" ]] &&
      ! node "$RETENTION_SCRIPT" retain ios-memory --repo-root "$REPO_ROOT" --apply; then
      status=1
    fi
  else
    : >"$RUN_DIR/.jovie-run-failed"
  fi
  trap - EXIT
  exit "$status"
}
trap finalize_run EXIT

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  "$@" &
  local command_pid=$!
  local elapsed=0

  while kill -0 "$command_pid" >/dev/null 2>&1; do
    if ((elapsed >= timeout_seconds)); then
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

wait_for_boot() {
  local udid="$1"
  local timeout_seconds="${JOVIE_IOS_MEMORY_BOOT_TIMEOUT:-180}"
  local boot_log="$RUN_DIR/bootstatus-$udid.log"
  local elapsed=0

  xcrun simctl bootstatus "$udid" -b >"$boot_log" 2>&1 &
  local boot_pid=$!

  while kill -0 "$boot_pid" >/dev/null 2>&1; do
    if ((elapsed >= timeout_seconds)); then
      kill "$boot_pid" >/dev/null 2>&1 || true
      wait "$boot_pid" >/dev/null 2>&1 || true
      cat "$boot_log"
      echo "Simulator $udid did not finish booting within ${timeout_seconds}s."
      return 1
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  if ! wait "$boot_pid"; then
    cat "$boot_log"
    echo "Simulator $udid bootstatus failed." >&2
    return 1
  fi
}

list_devices() {
  local name_pattern="$1"
  local devices_file
  devices_file="$(mktemp)"

  if ! run_with_timeout "${JOVIE_IOS_MEMORY_SIMCTL_LIST_TIMEOUT:-30}" xcrun simctl list devices available -j >"$devices_file"; then
    echo "Timed out listing available simulators."
    rm -f "$devices_file"
    return 1
  fi

  RUBYOPT= ruby -rjson -e '
    pattern = Regexp.new(ARGV.fetch(0))
    devices_by_runtime = JSON.parse(STDIN.read).fetch("devices", {})
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
        name == "iPhone 17" ? 0 : 1,
        device.fetch("state") == "Booted" ? 0 : 1,
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

write_metadata() {
  local path="$RUN_DIR/metadata.txt"

  {
    echo "date: $(date)"
    echo "git_head: $(git -C "$REPO_ROOT" rev-parse HEAD)"
    echo "udid: $IPHONE_UDID"
    echo "bundle_id: $BUNDLE_ID"
    echo "code_signing_allowed: $CODE_SIGNING_ALLOWED_VALUE"
    echo "launch_arguments: $LAUNCH_ARGUMENTS"
    echo "settle_seconds: $SETTLE_SECONDS"
    echo "require_memgraph: $REQUIRE_MEMGRAPH"
    echo "devtools_security_status: $DEVTOOLS_SECURITY_STATUS"
    echo "pid: $PID"
    echo "pid_source: $PID_SOURCE"
    echo "process_label: $PROCESS_LABEL"
    echo "memgraph: $MEMGRAPH_PATH"
    echo "memgraph_created: $MEMGRAPH_CREATED"
    echo "leaks_output: $LEAKS_OUTPUT"
    echo "leaks_list_output: $LEAKS_LIST_OUTPUT"
    echo "leaks_group_output: $LEAKS_GROUP_OUTPUT"
    echo "leaks_trace_output: ${LEAKS_TRACE_OUTPUT:-}"
    echo "sample_output: $SAMPLE_OUTPUT"
    echo "sample_status: $SAMPLE_STATUS"
    echo "leaks_capture_status: $LEAKS_CAPTURE_STATUS"
    echo "leaks_list_status: $LEAKS_LIST_STATUS"
    echo "leaks_group_status: $LEAKS_GROUP_STATUS"
    echo "app_owned_leak_count: $APP_OWNED_LEAK_COUNT"
  } >"$path"
}

render_summary() {
  local total_line
  local leak_entry_count
  local physical_footprint
  total_line="$(grep -E "Process .*: [0-9]+ leaks? for [0-9]+ total leaked bytes" "$LEAKS_LIST_OUTPUT" | tail -n 1 || true)"
  leak_entry_count="$(grep -c "^Leak:" "$LEAKS_LIST_OUTPUT" || true)"
  physical_footprint="$(grep -E "^Physical footprint:" "$SAMPLE_OUTPUT" | head -n 1 || true)"

  {
    echo "# iOS Memory Baseline"
    echo
    echo "- Date: $(date)"
    echo "- Git head: $(git -C "$REPO_ROOT" rev-parse --short HEAD)"
    echo "- Simulator UDID: $IPHONE_UDID"
    echo "- Bundle ID: $BUNDLE_ID"
    echo "- Code signing allowed: $CODE_SIGNING_ALLOWED_VALUE"
    echo "- Launch arguments: \`$LAUNCH_ARGUMENTS\`"
    echo "- Settle seconds: $SETTLE_SECONDS"
    echo "- Require memgraph: $REQUIRE_MEMGRAPH"
    echo "- Developer Tools security: $DEVTOOLS_SECURITY_STATUS"
    echo "- PID: $PID"
    echo "- PID source: $PID_SOURCE"
    echo "- Memgraph created: $MEMGRAPH_CREATED"
    echo "- Memgraph: \`$MEMGRAPH_PATH\`"
    echo "- Raw leaks output: \`$LEAKS_OUTPUT\`"
    echo "- List output: \`$LEAKS_LIST_OUTPUT\`"
    echo "- Grouped output: \`$LEAKS_GROUP_OUTPUT\`"
    echo "- Sample output: \`$SAMPLE_OUTPUT\`"
    echo
    echo "## Leak Totals"
    echo
    echo "- sample status: $SAMPLE_STATUS"
    echo "- sample footprint: ${physical_footprint:-not found}"
    echo "- leaks capture status: $LEAKS_CAPTURE_STATUS"
    echo "- leaks list status: $LEAKS_LIST_STATUS"
    echo "- leaks group status: $LEAKS_GROUP_STATUS"
    echo "- reported total: ${total_line:-not found}"
    echo "- parsed leak entries: $leak_entry_count"
    echo "- app-owned leak entries containing Jovie: $APP_OWNED_LEAK_COUNT"
    echo

    if [[ "$MEMGRAPH_CREATED" != "yes" ]]; then
      echo "## Memgraph Capture"
      echo
      echo "\`\`\`text"
      sed -n "1,80p" "$LEAKS_OUTPUT"
      echo "\`\`\`"
      echo
    fi

    echo "## Sample Output"
    echo
    echo "\`\`\`text"
    sed -n "1,80p" "$SAMPLE_OUTPUT"
    echo "\`\`\`"
    echo

    if [[ -n "${LEAKS_TRACE_OUTPUT:-}" ]]; then
      echo "## First App-Owned Trace"
      echo
      echo "\`\`\`text"
      sed -n "1,80p" "$LEAKS_TRACE_OUTPUT"
      echo "\`\`\`"
      echo
    fi

    echo "## Grouped Leak Output"
    echo
    echo "\`\`\`text"
    sed -n "1,120p" "$LEAKS_GROUP_OUTPUT"
    echo "\`\`\`"
    echo
    echo "## Raw Commands"
    echo
    echo "\`\`\`bash"
    echo "leaks --list $MEMGRAPH_PATH"
    echo "leaks --groupByType $MEMGRAPH_PATH"
    if [[ -n "$FIRST_APP_OWNED_LEAK_ADDRESS" ]]; then
      echo "leaks --traceTree=$FIRST_APP_OWNED_LEAK_ADDRESS $MEMGRAPH_PATH"
    fi
    echo "\`\`\`"
  } >"$SUMMARY_PATH"
}

"$SCRIPT_DIR/ensure-configuration.sh"

CURRENT_GIT_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
BUILD_STAMP_PATH="$DERIVED_DATA_PATH/.memory-baseline-build-stamp"
APP_PATH="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/Jovie.app"
if [[ -d "$APP_PATH" &&
  "${JOVIE_IOS_MEMORY_REUSE_BUILD:-0}" == "1" &&
  -f "$BUILD_STAMP_PATH" &&
  "$(cat "$BUILD_STAMP_PATH")" == "$CURRENT_GIT_HEAD" ]]; then
  echo "Using existing built app at $APP_PATH"
else
  node "$RETENTION_SCRIPT" reset ios-memory-derived-data "$DERIVED_DATA_PATH" \
    --repo-root "$REPO_ROOT" --apply
  if ! run_with_timeout "${JOVIE_IOS_MEMORY_BUILD_TIMEOUT:-300}" xcodebuild build \
    -project "$PROJECT_PATH" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -destination "generic/platform=iOS Simulator" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    CODE_SIGNING_ALLOWED="$CODE_SIGNING_ALLOWED_VALUE" \
    ENABLE_DEBUG_DYLIB=NO >"$RUN_DIR/build.log" 2>&1; then
    tail -n 200 "$RUN_DIR/build.log"
    exit 1
  fi
  echo "Build log: $RUN_DIR/build.log"
  printf "%s\n" "$CURRENT_GIT_HEAD" >"$BUILD_STAMP_PATH"
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "Built app not found at $APP_PATH"
  exit 1
fi

IPHONE_UDID="$(pick_device "^iPhone")"
if [[ -z "$IPHONE_UDID" ]]; then
  echo "Unable to find an available iPhone simulator."
  xcrun simctl list devices available
  exit 1
fi

echo "Preparing simulator $IPHONE_UDID"
run_with_timeout "${JOVIE_IOS_MEMORY_BOOT_COMMAND_TIMEOUT:-120}" xcrun simctl boot "$IPHONE_UDID" >/dev/null 2>&1 || true
if ! wait_for_boot "$IPHONE_UDID"; then
  echo "Failed to boot simulator $IPHONE_UDID." >&2
  exit 1
fi
run_with_timeout "${JOVIE_IOS_MEMORY_UI_TIMEOUT:-10}" xcrun simctl ui "$IPHONE_UDID" appearance dark >/dev/null 2>&1 || true
run_with_timeout "${JOVIE_IOS_MEMORY_UNINSTALL_TIMEOUT:-30}" xcrun simctl uninstall "$IPHONE_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
run_with_timeout "${JOVIE_IOS_MEMORY_INSTALL_TIMEOUT:-60}" xcrun simctl install "$IPHONE_UDID" "$APP_PATH"
run_with_timeout "${JOVIE_IOS_MEMORY_TERMINATE_TIMEOUT:-15}" xcrun simctl terminate "$IPHONE_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true

LAUNCH_ARGS=()
if [[ "$LAUNCH_ARGUMENTS" =~ [^[:space:]] ]]; then
  read -r -a LAUNCH_ARGS <<<"$LAUNCH_ARGUMENTS"
fi

echo "Launching $BUNDLE_ID with arguments: $LAUNCH_ARGUMENTS"
LAUNCH_OUTPUT="$RUN_DIR/launch.txt"
set +e
if [[ "${#LAUNCH_ARGS[@]}" -gt 0 ]]; then
  run_with_timeout "${JOVIE_IOS_MEMORY_LAUNCH_TIMEOUT:-30}" xcrun simctl launch "$IPHONE_UDID" "$BUNDLE_ID" "${LAUNCH_ARGS[@]}" >"$LAUNCH_OUTPUT" 2>&1
  LAUNCH_STATUS=$?
else
  run_with_timeout "${JOVIE_IOS_MEMORY_LAUNCH_TIMEOUT:-30}" xcrun simctl launch "$IPHONE_UDID" "$BUNDLE_ID" >"$LAUNCH_OUTPUT" 2>&1
  LAUNCH_STATUS=$?
fi
set -e

if [[ "$LAUNCH_STATUS" -ne 0 ]]; then
  cat "$LAUNCH_OUTPUT"
  echo "Failed to launch $BUNDLE_ID on $IPHONE_UDID"
  exit 1
fi

sleep "$SETTLE_SECONDS"

SIMCTL_LAUNCH_PID="$(
  awk -F": " -v bundle_id="$BUNDLE_ID" '
    $1 == bundle_id && $2 ~ /^[0-9]+$/ {
      pid = $2
    }
    END {
      print pid
    }
  ' "$LAUNCH_OUTPUT"
)"

LAUNCHCTL_LIST="$RUN_DIR/launchctl-list.txt"
if ! run_with_timeout "${JOVIE_IOS_MEMORY_PROCESS_TIMEOUT:-30}" xcrun simctl spawn "$IPHONE_UDID" launchctl list >"$LAUNCHCTL_LIST"; then
  echo "Failed to list simulator processes."
  exit 1
fi

MATCHING_PROCESSES="$(
  awk -v bundle_id="$BUNDLE_ID" '
    $1 == "-" {
      next
    }
    $3 == bundle_id {
      print $1 "\t" $3
      next
    }
    index($3, "UIKitApplication:" bundle_id "[") == 1 {
      print $1 "\t" $3
    }
  ' "$LAUNCHCTL_LIST"
)"

SIMCTL_PROCESS_LINE=""
if [[ -n "$SIMCTL_LAUNCH_PID" ]]; then
  SIMCTL_PROCESS_LINE="$(
    printf "%s\n" "$MATCHING_PROCESSES" | awk -v pid="$SIMCTL_LAUNCH_PID" '
      $1 == pid {
        print
        exit
      }
    '
  )"
fi

if [[ -n "$SIMCTL_PROCESS_LINE" ]]; then
  PID="$SIMCTL_LAUNCH_PID"
  PID_SOURCE="simctl launch"
  PROCESS_LABEL="$(printf "%s\n" "$SIMCTL_PROCESS_LINE" | cut -f2-)"
elif [[ -n "$SIMCTL_LAUNCH_PID" && -z "$MATCHING_PROCESSES" ]]; then
  echo "Launch reported PID $SIMCTL_LAUNCH_PID, but $BUNDLE_ID is no longer running on $IPHONE_UDID." >&2
  exit 1
elif [[ -z "$MATCHING_PROCESSES" ]]; then
  echo "Could not find a running PID for $BUNDLE_ID on $IPHONE_UDID."
  exit 1
elif [[ "$(printf "%s\n" "$MATCHING_PROCESSES" | wc -l | tr -d " ")" -ne 1 ]]; then
  echo "Found multiple running PIDs for $BUNDLE_ID on $IPHONE_UDID:"
  printf "%s\n" "$MATCHING_PROCESSES"
  exit 1
else
  PID="$(printf "%s\n" "$MATCHING_PROCESSES" | awk "{ print \$1 }")"
  PID_SOURCE="launchctl list"
  PROCESS_LABEL="$(printf "%s\n" "$MATCHING_PROCESSES" | cut -f2-)"
fi

SAFE_BUNDLE="$(printf "%s" "$BUNDLE_ID" | tr -c "A-Za-z0-9_.-" "_")"
MEMGRAPH_PATH="$RUN_DIR/$SAFE_BUNDLE-$PID-$TIMESTAMP.memgraph"
LEAKS_OUTPUT="$RUN_DIR/$SAFE_BUNDLE-$PID-$TIMESTAMP.leaks.txt"
LEAKS_LIST_OUTPUT="$RUN_DIR/$SAFE_BUNDLE-$PID-$TIMESTAMP.list.txt"
LEAKS_GROUP_OUTPUT="$RUN_DIR/$SAFE_BUNDLE-$PID-$TIMESTAMP.grouped.txt"
SAMPLE_OUTPUT="$RUN_DIR/$SAFE_BUNDLE-$PID-$TIMESTAMP.sample.txt"
SUMMARY_PATH="$RUN_DIR/summary.md"
DEVTOOLS_SECURITY_STATUS="$(DevToolsSecurity -status 2>&1 || true)"

echo "Capturing memgraph for PID $PID"
set +e
sample "$PID" 1 1 -file "$SAMPLE_OUTPUT" >"$RUN_DIR/sample-command.txt" 2>&1
SAMPLE_STATUS=$?
set -e
[[ -f "$SAMPLE_OUTPUT" ]] || : >"$SAMPLE_OUTPUT"

set +e
leaks "--outputGraph=$MEMGRAPH_PATH" "$PID" >"$LEAKS_OUTPUT" 2>&1
LEAKS_CAPTURE_STATUS=$?
set -e

if [[ ! -f "$MEMGRAPH_PATH" ]]; then
  echo "leaks failed to create a memgraph; see $LEAKS_OUTPUT"
  MEMGRAPH_CREATED="no"
  LEAKS_LIST_STATUS="not_run"
  LEAKS_GROUP_STATUS="not_run"
  APP_OWNED_LEAK_COUNT="not_run"
  FIRST_APP_OWNED_LEAK_ADDRESS=""
  LEAKS_TRACE_OUTPUT=""
  : >"$LEAKS_LIST_OUTPUT"
  : >"$LEAKS_GROUP_OUTPUT"
  write_metadata
  render_summary

  echo "summary: $SUMMARY_PATH"
  if [[ "$REQUIRE_MEMGRAPH" == "1" ]]; then
    exit 1
  fi

  echo "Set JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1 to fail when memgraph capture is blocked."
  exit 0
fi

MEMGRAPH_CREATED="yes"

set +e
leaks --list "$MEMGRAPH_PATH" >"$LEAKS_LIST_OUTPUT" 2>&1
LEAKS_LIST_STATUS=$?
leaks --groupByType "$MEMGRAPH_PATH" >"$LEAKS_GROUP_OUTPUT" 2>&1
LEAKS_GROUP_STATUS=$?
set -e

APP_OWNED_LEAK_COUNT="$(awk '/^Leak:/ && /Jovie/ { count++ } END { print count + 0 }' "$LEAKS_LIST_OUTPUT")"
FIRST_APP_OWNED_LEAK_ADDRESS="$(awk '/^Leak:/ && /Jovie/ { print $2; exit }' "$LEAKS_LIST_OUTPUT")"
LEAKS_TRACE_OUTPUT=""

if [[ -n "$FIRST_APP_OWNED_LEAK_ADDRESS" ]]; then
  LEAKS_TRACE_OUTPUT="$RUN_DIR/$SAFE_BUNDLE-$PID-$TIMESTAMP.trace.txt"
  set +e
  leaks "--traceTree=$FIRST_APP_OWNED_LEAK_ADDRESS" "$MEMGRAPH_PATH" >"$LEAKS_TRACE_OUTPUT" 2>&1
  set -e
fi

write_metadata
render_summary

echo "Memory baseline written to $RUN_DIR"
echo "summary: $SUMMARY_PATH"
echo "memgraph: $MEMGRAPH_PATH"
