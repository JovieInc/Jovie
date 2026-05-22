#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-test}"
if [[ $# -gt 0 ]]; then
  shift
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$IOS_DIR/Jovie.xcodeproj"
SCHEME="Jovie"

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
      kill "$command_pid" 2>/dev/null || true
      sleep 1
      kill -9 "$command_pid" 2>/dev/null || true
      wait "$command_pid" 2>/dev/null || true
      return 124
    fi

    sleep 1
  done

  wait "$command_pid"
}

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
          "os_parts" => os.split(".").map(&:to_i)
        }
      end
    end

    if candidates.any?
      selected = candidates.max_by do |candidate|
        [
          candidate.fetch("os_parts"),
          candidate.fetch("name") == "iPhone 17" ? 1 : 0,
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
      "os_parts" => os.split(".").map(&:to_i)
    }
    END {
      if candidates.any?
        selected = candidates.max_by do |candidate|
          [
            candidate.fetch("os_parts"),
            candidate.fetch("name") == "iPhone 17" ? 1 : 0,
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

DESTINATION_ID="${DESTINATION#*id=}"
DESTINATION_ID="${DESTINATION_ID%%,*}"

if [[ "$ACTION" == "test" && "${JOVIE_IOS_RESET_SIMULATOR:-1}" != "0" ]]; then
  xcrun simctl shutdown "$DESTINATION_ID" >/dev/null 2>&1 || true
  xcrun simctl boot "$DESTINATION_ID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$DESTINATION_ID" -b
  xcrun simctl terminate "$DESTINATION_ID" ie.jov.Jovie >/dev/null 2>&1 || true
fi

xcodebuild "$ACTION" \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  "$@" \
  CODE_SIGNING_ALLOWED=NO
