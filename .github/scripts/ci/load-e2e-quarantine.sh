#!/usr/bin/env bash
node .github/scripts/quarantine-ledger.mjs validate
FILE="apps/web/tests/quarantine.json"
QUARANTINED=()

if [ -f "$FILE" ]; then
  mapfile -t QUARANTINED < <(jq -r '.entries[]? | select(.kind == "e2e") | .path' "$FILE")
fi

mapfile -t ALL_SPECS < <(git ls-files "apps/web/tests/e2e/**/*.spec.ts" "apps/web/tests/smoke/**/*.spec.ts")

ALLOWED_SPECS=()
for spec in "${ALL_SPECS[@]}"; do
  skip=false
  for quarantined in "${QUARANTINED[@]}"; do
    if [[ "$spec" == "$quarantined" ]]; then
      skip=true
      break
    fi
  done
  if [[ "$skip" == "false" ]]; then
    ALLOWED_SPECS+=("$spec")
  fi
done

echo "allowed_specs=${ALLOWED_SPECS[*]}" >> "$GITHUB_OUTPUT"
echo "quarantined_specs=${QUARANTINED[*]}" >> "$GITHUB_OUTPUT"

if [ ${#QUARANTINED[@]} -gt 0 ]; then
  echo "has_quarantine=true" >> "$GITHUB_OUTPUT"
else
  echo "has_quarantine=false" >> "$GITHUB_OUTPUT"
fi
