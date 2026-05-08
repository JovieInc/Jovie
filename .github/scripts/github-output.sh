#!/usr/bin/env bash

write_output() {
  local name="$1"
  local value="${2-}"
  local delimiter="jovie_output_${RANDOM}_${RANDOM}"

  {
    printf '%s<<%s\n' "$name" "$delimiter"
    printf '%s\n' "$value"
    printf '%s\n' "$delimiter"
  } >> "$GITHUB_OUTPUT"
}
