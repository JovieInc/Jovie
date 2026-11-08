#!/usr/bin/env bash
# Sourced by scan-secrets.sh. An unverified SonarCloud hit with no file is the
# commit message: Dependabot compare URLs repeat the previous action pin, and
# path excludes cannot suppress commit messages. Drop it only when this commit
# or its first parent still records that exact value as a uses: pin.

is_recorded_workflow_pin() {
  local rev="$1" raw="$2" path line
  local pin_re="uses:[[:space:]]+[[:alnum:]_.-]+/[[:alnum:]_./-]+@${raw}([[:space:]]|#|$)"
  [[ "$raw" =~ ^[0-9a-f]{40}$ ]] || return 1
  for path in .github/workflows .github/actions; do
    while IFS= read -r line; do
      [[ "$line" =~ $pin_re ]] && return 0
    done < <(git grep -F -h -e "@${raw}" "$rev" -- "$path" 2>/dev/null || true)
  done
  return 1
}

skip_recorded_sonar_pin() {
  local source="$1" file="$2" raw="$3" commit="$4" finding="$5"
  [[ "$source" == Git && -z "$file" && "$raw" =~ ^[0-9a-f]{40}$ ]] || return 1
  jq -e '.Verified == false and .DetectorName == "SonarCloud"' <<<"$finding" >/dev/null \
    || return 1
  is_recorded_workflow_pin "$commit" "$raw" \
    || is_recorded_workflow_pin "${commit}^" "$raw"
}
