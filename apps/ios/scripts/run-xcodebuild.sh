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

DESTINATIONS="$(
  xcodebuild -showdestinations \
    -project "$PROJECT_PATH" \
    -scheme "$SCHEME" \
    2>/dev/null || true
)"

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

DESTINATION="$(
  PREFER_IOS_PREFIX="$PREFERRED_IOS_PREFIX" PREFER_NAME_PATTERN="^iPhone" pick_destination
)"

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
