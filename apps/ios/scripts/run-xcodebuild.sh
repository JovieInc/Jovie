#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-test}"
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

  printf '%s\n' "$DESTINATIONS" | ruby -ne '
    next unless $_ =~ /platform:iOS Simulator.*OS:([0-9.]+), name:([^}]+)/
    os = Regexp.last_match(1)
    name = Regexp.last_match(2).strip
    prefer_ios_prefix = ENV.fetch("PREFER_IOS_PREFIX", "")
    prefer_name_pattern = ENV.fetch("PREFER_NAME_PATTERN", "")

    next unless prefer_ios_prefix.empty? || os.start_with?(prefer_ios_prefix)
    next unless prefer_name_pattern.empty? || name.match?(Regexp.new(prefer_name_pattern))

    puts "platform=iOS Simulator,OS=#{os},name=#{name}"
    exit
  '
}

DESTINATION="$(
  PREFER_IOS_PREFIX="18." PREFER_NAME_PATTERN="^iPhone" pick_destination
)"

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

echo "Using destination: $DESTINATION"

xcodebuild "$ACTION" \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  CODE_SIGNING_ALLOWED=NO
