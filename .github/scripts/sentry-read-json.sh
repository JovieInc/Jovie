#!/usr/bin/env bash

# Bounded read transport only. The caller still validates the successful body
# and decides the gate result. Exhausted/definitive failures remain unknown.
sentry_read_json() (
  set -euo pipefail
  response_file="$(mktemp)"
  trap 'rm -f "$response_file"' EXIT
  status=0
  # Retry-After can extend curl's delay. An outer deadline bounds all retries
  # and response reads to 55s, plus at most 1s before forced termination.
  timeout --signal=TERM --kill-after=1s 55s \
    curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 15 \
    --retry 2 --retry-delay 1 --retry-max-time 40 \
    --output "$response_file" "$@" || status=$?
  if [ "$status" -ne 0 ]; then
    echo "::error::Bounded Sentry read failed; observation remains unknown." >&2
    exit "$status"
  fi
  if ! jq -se 'length == 1' "$response_file" >/dev/null; then
    echo "::error::Sentry response must contain exactly one JSON document; observation remains unknown." >&2
    exit 1
  fi
  # No partial response or failed-attempt body becomes numeric evidence.
  cat "$response_file"
)

# A complete zero-filled minute series is evidence of zero errors; absent,
# stale, partial, duplicate or malformed buckets are uncertainty, not zero.
sentry_error_count() (
  set -euo pipefail
  response="$1"
  start_epoch="$2"
  end_epoch="$3"
  jq -ser --argjson start "$start_epoch" --argjson end "$end_epoch" '
    (if length == 1 then .[0]
     else error("Sentry response must contain exactly one JSON document") end) |
    (has("start") and has("end") and .start == $start and .end == $end) as $bounds_match |
    if (
      $start >= 0 and $end > $start and
      ($start % 60) == 0 and ($end % 60) == 0 and
      type == "object" and (.data | type == "array") and
      (((has("start") or has("end")) | not) or $bounds_match) and
      (.data | length) == (($end - $start) / 60) and
      all(.data | to_entries[];
        (.value | type == "array") and (.value | length) == 2 and
        .value[0] == ($start + .key * 60) and
        (.value[1] | type == "array") and
        ((.value[1] | length) > 0 or $bounds_match) and
        all(.value[1][];
          (.count | type == "number") and .count >= 0 and
          .count == (.count | floor)
        )
      )
    ) then .data | map(
      if (.[1] | length) == 0 then 0 else ([.[1][].count] | add) end
    ) | add
    else error("Sentry minute series is incomplete or invalid; observation remains unknown")
    end
  ' <<<"$response"
)
