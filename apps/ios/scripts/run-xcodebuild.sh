#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-test}"
if [[ $# -gt 0 ]]; then
  shift
fi
if [[ "${1:-}" == "--" ]]; then
  shift
fi
CODE_SIGNING_ALLOWED_VALUE="${CODE_SIGNING_ALLOWED:-NO}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$IOS_DIR/Jovie.xcodeproj"
SCHEME="${JOVIE_IOS_SCHEME:-Jovie}"

ios_now() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

caller_has_errexit() {
  case $- in
    *e*) return 0 ;;
    *) return 1 ;;
  esac
}

run_phase() {
  local phase_name="$1"
  shift

  local caller_errexit=0
  if caller_has_errexit; then
    caller_errexit=1
  fi

  local started_at
  local start_seconds
  started_at="$(ios_now)"
  start_seconds="$(date +%s)"

  echo "::group::iOS phase: $phase_name"
  echo "iOS phase started_at=$started_at name=\"$phase_name\""

  set +e
  "$@"
  local status=$?
  if [[ "$caller_errexit" -eq 1 ]]; then
    set -e
  fi

  local end_seconds
  end_seconds="$(date +%s)"
  echo "iOS phase finished_at=$(ios_now) name=\"$phase_name\" status=$status duration_seconds=$((end_seconds - start_seconds))"
  echo "::endgroup::"

  return "$status"
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  local start_time
  start_time="$(date +%s)"

  "$@" &
  local command_pid=$!

  while kill -0 "$command_pid" 2>/dev/null; do
    local now
    now="$(date +%s)"
    if ((now - start_time >= timeout_seconds)); then
      terminate_timed_out_pid "$command_pid"
      return 124
    fi

    sleep 1
  done

  wait "$command_pid"
}

terminate_timed_out_pid() {
  local command_pid="$1"
  kill "$command_pid" 2>/dev/null || true
  sleep 1
  kill -9 "$command_pid" 2>/dev/null || true
  wait "$command_pid" 2>/dev/null || true
}

terminate_timed_out_pids() {
  local command_pid
  for command_pid in "$@"; do
    kill "$command_pid" 2>/dev/null || true
  done
  sleep 1
  for command_pid in "$@"; do
    kill -9 "$command_pid" 2>/dev/null || true
    wait "$command_pid" 2>/dev/null || true
  done
}

# xcodebuild prints these on their own line when the test or build phase is
# done and only result-bundle finalization remains.
xcodebuild_terminal_result_line() {
  local line="$1"
  line="${line//$'\r'/}"
  while [[ "$line" == *$'\033'* ]]; do
    local before="${line%%$'\033'*}"
    local after="${line#*$'\033'}"
    if [[ "$after" == '['* ]]; then
      after="${after#[}"
      while [[ "$after" == [0-9\;]* ]]; do
        after="${after:1}"
      done
      if [[ "$after" == [[:alpha:]]* ]]; then
        after="${after:1}"
      fi
    fi
    line="${before}${after}"
  done
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  case "$line" in
    "** TEST SUCCEEDED **" | "** TEST FAILED **" | "** TEST EXECUTE FAILED **" | "** BUILD SUCCEEDED **" | "** BUILD FAILED **")
      return 0
      ;;
  esac
  return 1
}

# Relays xcodebuild output and records when a terminal result line appears.
# The parent applies the finalization budget from that moment; this loop must
# keep reading so a full pipe cannot stall xcodebuild.
relay_xcodebuild_output() {
  local line
  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ ! -f "$XCODEBUILD_RESULT_FLAG" ]] && xcodebuild_terminal_result_line "$line"; then
      : >"$XCODEBUILD_RESULT_FLAG"
    fi
  done
}

# Test execution and xcresult finalization have separate budgets. A passing
# suite that has already printed a terminal result must not be killed by the
# execution budget while xcodebuild writes the result bundle. A hang on either
# side still exits 124.
run_with_split_timeout() {
  local timeout_seconds="$1"
  local finalization_timeout_seconds="$2"
  shift 2

  local start_time work_dir output_fifo reader_pid command_pid result_at now elapsed status spins
  start_time="$(date +%s)"
  result_at=""
  XCODEBUILD_TIMEOUT_REASON=""
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/jovie-xcodebuild-timeout.XXXXXX")" || return 1
  output_fifo="$work_dir/output"
  XCODEBUILD_RESULT_FLAG="$work_dir/result"
  mkfifo "$output_fifo" || return 1

  relay_xcodebuild_output <"$output_fifo" &
  reader_pid=$!
  "$@" >"$output_fifo" 2>&1 &
  command_pid=$!

  while true; do
    if [[ -z "$result_at" && -f "$XCODEBUILD_RESULT_FLAG" ]]; then
      result_at="$(date +%s)"
      elapsed=$((result_at - start_time))
      echo "iOS xcodebuild reported a terminal result after ${elapsed}s; finalization budget ${finalization_timeout_seconds}s" >&2
    fi

    if ! kill -0 "$command_pid" 2>/dev/null; then
      break
    fi

    now="$(date +%s)"
    if [[ -n "$result_at" ]]; then
      if ((now - result_at >= finalization_timeout_seconds)); then
        XCODEBUILD_TIMEOUT_REASON="finalization"
        terminate_timed_out_pids "$command_pid" "$reader_pid"
        rm -rf "$work_dir"
        return 124
      fi
    elif ((now - start_time >= timeout_seconds)); then
      XCODEBUILD_TIMEOUT_REASON="execution"
      terminate_timed_out_pids "$command_pid" "$reader_pid"
      rm -rf "$work_dir"
      return 124
    fi

    sleep 1
  done

  set +e
  wait "$command_pid"
  status=$?

  spins=0
  while kill -0 "$reader_pid" 2>/dev/null && ((spins < 5)); do
    sleep 1
    spins=$((spins + 1))
  done
  if kill -0 "$reader_pid" 2>/dev/null; then
    terminate_timed_out_pid "$reader_pid"
  else
    wait "$reader_pid" 2>/dev/null || true
  fi
  rm -rf "$work_dir" || true
  return "$status"
}

run_phase_with_optional_timeout() {
  local phase_name="$1"
  local timeout_seconds="$2"
  shift 2

  local finalization_timeout_seconds="${JOVIE_IOS_XCODEBUILD_FINALIZATION_TIMEOUT_SECONDS:-}"
  local caller_errexit=0
  if caller_has_errexit; then
    caller_errexit=1
  fi

  if [[ -n "$timeout_seconds" ]]; then
    if [[ ! "$timeout_seconds" =~ ^[0-9]+$ ]]; then
      echo "Invalid timeout for $phase_name: $timeout_seconds" >&2
      return 2
    fi

    if [[ -n "$finalization_timeout_seconds" ]]; then
      if [[ ! "$finalization_timeout_seconds" =~ ^[0-9]+$ ]] || [[ "$finalization_timeout_seconds" -eq 0 ]]; then
        echo "Invalid finalization timeout for $phase_name: $finalization_timeout_seconds" >&2
        return 2
      fi
    fi

    set +e
    if [[ -n "$finalization_timeout_seconds" ]]; then
      XCODEBUILD_TIMEOUT_REASON=""
      run_phase "$phase_name" run_with_split_timeout "$timeout_seconds" "$finalization_timeout_seconds" "$@"
    else
      run_phase "$phase_name" run_with_timeout "$timeout_seconds" "$@"
    fi
    local status=$?
    if [[ "$status" -eq 124 ]]; then
      if [[ "${XCODEBUILD_TIMEOUT_REASON:-}" == "finalization" ]]; then
        echo "iOS xcodebuild finalization timed out after ${finalization_timeout_seconds}s after a reported test result: $phase_name" >&2
        echo "::error::iOS xcodebuild finalization timed out after ${finalization_timeout_seconds}s after a reported test result: $phase_name" >&2
      else
        echo "iOS phase timed out after ${timeout_seconds}s: $phase_name" >&2
        echo "::error::iOS phase timed out after ${timeout_seconds}s: $phase_name" >&2
      fi
    fi
    if [[ "$caller_errexit" -eq 1 ]]; then
      set -e
    fi
    return "$status"
  fi

  run_phase "$phase_name" "$@"
}

# Tests source this file to exercise the timeout watcher without launching
# xcodebuild. Execution continues into the real action when the variable is unset.
if [[ "${JOVIE_IOS_XCODEBUILD_SOURCE_ONLY:-}" == "1" ]]; then
  return 0 2>/dev/null || exit 0
fi

if [[ "$ACTION" == "-resolvePackageDependencies" ]]; then
  echo "Resolving Swift package dependencies without a simulator destination..." >&2
  run_phase "Resolve Swift package dependencies" \
    xcodebuild "$ACTION" \
      -project "$PROJECT_PATH" \
      -scheme "$SCHEME" \
      "$@" \
      CODE_SIGNING_ALLOWED=NO
  exit 0
fi

run_phase "Ensure iOS local configuration" "$SCRIPT_DIR/ensure-configuration.sh"

pick_destination_from_simctl() {
  local prefer_ios_prefix="${1:-}"
  local prefer_name_pattern="${2:-}"
  local devices_json
  local simctl_stderr
  simctl_stderr="$(mktemp)"

  devices_json="$(xcrun simctl list devices available -j 2>"$simctl_stderr" || true)"
  if [[ -z "$devices_json" ]]; then
    if [[ -s "$simctl_stderr" ]]; then
      cat "$simctl_stderr" >&2
    fi
    rm -f "$simctl_stderr"
    return 0
  fi

  rm -f "$simctl_stderr"

  printf '%s\n' "$devices_json" | PREFER_IOS_PREFIX="$prefer_ios_prefix" PREFER_NAME_PATTERN="$prefer_name_pattern" RUBYOPT= ruby -rjson -e '
    prefer_ios_prefix = ENV.fetch("PREFER_IOS_PREFIX", "")
    prefer_name_pattern = ENV.fetch("PREFER_NAME_PATTERN", "")
    candidates = []

    JSON.parse($stdin.read).fetch("devices", {}).each do |runtime, devices|
      runtime_version = runtime.to_s[/iOS-([0-9-]+)/, 1]
      next if runtime_version.nil?

      os = runtime_version.tr("-", ".")

      devices.each do |device|
        next if device["isAvailable"] == false

        name = device["name"].to_s
        id = device["udid"].to_s
        next if id.empty?
        next unless prefer_ios_prefix.empty? || os.start_with?(prefer_ios_prefix)
        next unless prefer_name_pattern.empty? || name.match?(Regexp.new(prefer_name_pattern))

        candidates << {
          "destination" => "platform=iOS Simulator,id=#{id}",
          "name" => name,
          "os_parts" => os.split(".").map(&:to_i),
          # Prefer a conventional iPhone over a named form factor. The latter
          # can be present during an Xcode migration but fail to create a
          # usable test process (for example, a migrated iPhone Air).
          "model_rank" => case name
                          when /\AiPhone \d+\z/ then 3
                          when /\AiPhone \d+ Pro(?: Max)?\z/ then 2
                          when /\AiPhone \d+[ec]\z/ then 1
                          else 0
                          end,
          "state_rank" => device["state"] == "Booted" ? 1 : 0
        }
      end
    end

    if candidates.any?
      selected = candidates.max_by do |candidate|
          [
            candidate.fetch("os_parts"),
            candidate.fetch("model_rank"),
            candidate.fetch("state_rank"),
            candidate.fetch("name")
          ]
      end

      puts selected.fetch("destination")
    end
  ' || true
}

DESTINATIONS=""

load_xcodebuild_destinations() {
  local destinations_file
  local destinations_stderr
  destinations_file="$(mktemp)"
  destinations_stderr="$(mktemp)"

  if run_with_timeout "${JOVIE_IOS_DESTINATIONS_TIMEOUT:-30}" \
    xcodebuild -showdestinations \
      -project "$PROJECT_PATH" \
      -scheme "$SCHEME" \
      >"$destinations_file" 2>"$destinations_stderr"; then
    DESTINATIONS="$(cat "$destinations_file")"
  else
    echo "Failed or timed out resolving xcodebuild destinations." >&2
    if [[ -s "$destinations_stderr" ]]; then
      cat "$destinations_stderr" >&2
    fi
    DESTINATIONS=""
  fi

  rm -f "$destinations_file" "$destinations_stderr"
}

pick_destination() {
  local prefer_ios_prefix="${1:-}"
  local prefer_name_pattern="${2:-}"

  printf '%s\n' "$DESTINATIONS" | RUBYOPT= ruby -ne '
    BEGIN { candidates = [] }

    next unless $_ =~ /platform:iOS Simulator.*OS:([0-9.]+), name:([^}]+)/
    os = Regexp.last_match(1)
    name = Regexp.last_match(2).strip
    id = $_[/id:([^,}]+)/, 1]&.strip
    next if id.nil? || id.empty?

    prefer_ios_prefix = ENV.fetch("PREFER_IOS_PREFIX", "")
    prefer_name_pattern = ENV.fetch("PREFER_NAME_PATTERN", "")

    next unless prefer_ios_prefix.empty? || os.start_with?(prefer_ios_prefix)
    next unless prefer_name_pattern.empty? || name.match?(Regexp.new(prefer_name_pattern))

    candidates << {
      "destination" => "platform=iOS Simulator,id=#{id}",
      "name" => name,
      "os_parts" => os.split(".").map(&:to_i),
      "model_rank" => case name
                      when /\AiPhone \d+\z/ then 3
                      when /\AiPhone \d+ Pro(?: Max)?\z/ then 2
                      when /\AiPhone \d+[ec]\z/ then 1
                      else 0
                      end
    }
    END {
      if candidates.any?
        selected = candidates.max_by do |candidate|
          [
            candidate.fetch("os_parts"),
            candidate.fetch("model_rank"),
            candidate.fetch("name")
          ]
        end

        puts selected.fetch("destination")
      end
    }
  '
}

PREFERRED_IOS_PREFIX="${JOVIE_IOS_PREFER_OS_PREFIX:-26.}"

echo "Resolving iOS Simulator destination..." >&2

DESTINATION="$(
  pick_destination_from_simctl "$PREFERRED_IOS_PREFIX" "^iPhone"
)"

if [[ -z "$DESTINATION" && "$PREFERRED_IOS_PREFIX" != "18." ]]; then
  DESTINATION="$(
    pick_destination_from_simctl "18." "^iPhone"
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  DESTINATION="$(
    pick_destination_from_simctl "" "^iPhone"
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  DESTINATION="$(
    pick_destination_from_simctl "18." ""
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  DESTINATION="$(
    pick_destination_from_simctl
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  load_xcodebuild_destinations

  DESTINATION="$(
    PREFER_IOS_PREFIX="$PREFERRED_IOS_PREFIX" PREFER_NAME_PATTERN="^iPhone" pick_destination
  )"
fi

if [[ -z "$DESTINATION" && "$PREFERRED_IOS_PREFIX" != "18." ]]; then
  DESTINATION="$(
    PREFER_IOS_PREFIX="18." PREFER_NAME_PATTERN="^iPhone" pick_destination
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  DESTINATION="$(
    PREFER_NAME_PATTERN="^iPhone" pick_destination
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  DESTINATION="$(
    PREFER_IOS_PREFIX="18." pick_destination
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  DESTINATION="$(
    pick_destination
  )"
fi

if [[ -z "$DESTINATION" ]]; then
  echo "Unable to find an iOS Simulator destination."
  echo "$DESTINATIONS"
  exit 1
fi

if [[ "$ACTION" == "destination" ]]; then
  echo "$DESTINATION"
  exit 0
fi

echo "Using destination: $DESTINATION"
echo "Using CODE_SIGNING_ALLOWED=$CODE_SIGNING_ALLOWED_VALUE"

FORWARDED_TEST_RUNNER_ENV=0

forward_test_runner_env() {
  local source_key="$1"
  local value="${!source_key:-}"

  if [[ -n "$value" ]]; then
    export "TEST_RUNNER_${source_key}=$value"
    FORWARDED_TEST_RUNNER_ENV=1
  fi
}

for source_key in \
  API_BASE_URL \
  JOVIE_IOS_API_BASE_URL \
  JOVIE_IOS_DOGFOOD_EVENTS_PATH \
  JOVIE_IOS_LAUNCH_PERFORMANCE \
  JOVIE_IOS_LAUNCH_TIMEOUT_SECONDS \
  JOVIE_IOS_LIVE_AUTH \
  JOVIE_IOS_LIVE_AUTH_UI \
  JOVIE_IOS_RUNTIME_PERFORMANCE \
  JOVIE_IOS_RUNTIME_TIMEOUT_SECONDS \
  JOVIE_IOS_SCREENSHOT_DIR
do
  forward_test_runner_env "$source_key"
done

if [[ "$FORWARDED_TEST_RUNNER_ENV" -eq 1 ]]; then
  echo "Forwarding XCTest environment via TEST_RUNNER_*"
fi

DESTINATION_ID="${DESTINATION#*id=}"
DESTINATION_ID="${DESTINATION_ID%%,*}"

if [[ "$ACTION" == "test" && "${JOVIE_IOS_RESET_SIMULATOR:-1}" != "0" ]]; then
  run_phase "Reset iOS Simulator" bash -c '
    set -euo pipefail
    destination_id="$1"
    xcrun simctl shutdown "$destination_id" >/dev/null 2>&1 || true
    xcrun simctl boot "$destination_id" >/dev/null 2>&1 || true
    xcrun simctl bootstatus "$destination_id" -b
    xcrun simctl terminate "$destination_id" ie.jov.Jovie >/dev/null 2>&1 || true
  ' bash "$DESTINATION_ID"
fi

# Preserve an xcresult for the test action and, on failure, surface the
# failing test names as GitHub annotations (check-run annotations stay
# readable without admin-gated job-log access - JOV-5371 CI remediation).
RESULT_BUNDLE_ARGS=()
RESULT_BUNDLE_PATH=""
if [[ "$ACTION" == "test" ]]; then
  RESULT_BUNDLE_PATH="${JOVIE_IOS_RESULT_BUNDLE_PATH:-.build/ios-ci/ios-test-results.xcresult}"
  rm -rf "$RESULT_BUNDLE_PATH"
  RESULT_BUNDLE_ARGS=(-resultBundlePath "$RESULT_BUNDLE_PATH")
fi

set +e
run_phase_with_optional_timeout "xcodebuild $ACTION" "${JOVIE_IOS_XCODEBUILD_TIMEOUT_SECONDS:-}" \
  xcodebuild "$ACTION" \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  ${RESULT_BUNDLE_ARGS[@]+"${RESULT_BUNDLE_ARGS[@]}"} \
  "$@" \
  CODE_SIGNING_ALLOWED="$CODE_SIGNING_ALLOWED_VALUE"
XCODEBUILD_STATUS=$?
set -e

if [[ -n "$RESULT_BUNDLE_PATH" && "$XCODEBUILD_STATUS" -ne 0 && -d "$RESULT_BUNDLE_PATH" ]]; then
  echo "::group::xcresult summary (xcodebuild exit $XCODEBUILD_STATUS)"
  xcrun xcresulttool get test-results summary --path "$RESULT_BUNDLE_PATH" 2>/dev/null | head -c 8000 || true
  echo
  echo "::endgroup::"
  echo "::group::xcresult failing tests"
  xcrun xcresulttool get test-results tests --path "$RESULT_BUNDLE_PATH" 2>/dev/null | head -c 16000 || true
  echo
  echo "::endgroup::"
  echo "::error::iOS test action failed (xcodebuild exit $XCODEBUILD_STATUS); see xcresult groups above and result bundle $RESULT_BUNDLE_PATH"
fi

if [[ "$XCODEBUILD_STATUS" -ne 0 ]]; then
  exit "$XCODEBUILD_STATUS"
fi
