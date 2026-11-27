#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$RUNNER_TEMP/ci-harness"
RISK_JSON="$RUNNER_TEMP/ci-harness/risk.json"
ARTIFACT_JSON="$RUNNER_TEMP/ci-harness/ci-harness.v1.json"

risk_level="${RISK_LEVEL:-low}"
requires_smoke="${RISK_REQUIRES_SMOKE:-false}"
requires_preview="${RISK_REQUIRES_PREVIEW:-false}"
blocks_unattended="${RISK_BLOCKS_UNATTENDED:-false}"
risk_rules="${RISK_RULES:-}"

jq -n \
  --arg riskLevel "$risk_level" \
  --arg rules "$risk_rules" \
  --argjson requiresSmoke "$requires_smoke" \
  --argjson requiresPreview "$requires_preview" \
  --argjson blocksUnattended "$blocks_unattended" \
  '{
    schemaVersion: 1,
    riskLevel: $riskLevel,
    requiresSmoke: $requiresSmoke,
    requiresPreview: $requiresPreview,
    blocksUnattendedAutoMerge: $blocksUnattended,
    matchedRules: ($rules | split(",") | map(select(length > 0) | {id: ., title: ., level: $riskLevel, files: []})),
    recommendedLabels: []
  }' > "$RISK_JSON"

node scripts/ci-harness.mjs emit-artifact \
  --risk "$RISK_JSON" \
  --out "$ARTIFACT_JSON"

{
  echo "### CI harness artifact"
  echo
  echo "- Artifact: \`ci-harness.v1.json\`"
  echo "- Risk level: $risk_level"
  echo "- Preview URL: ${PR_PREVIEW_URL:-none}"
  echo
  echo "Next local command:"
  echo
  echo '```bash'
  echo "pnpm ci:harness:check"
  echo '```'
} >> "$GITHUB_STEP_SUMMARY"
