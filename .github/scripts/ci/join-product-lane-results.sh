#!/usr/bin/env bash
set -euo pipefail
RISK_LEVEL="${RISK_LEVEL:-unknown}" RISK_SMOKE="${RISK_SMOKE:-true}" RISK_PREVIEW="${RISK_PREVIEW:-true}" RISK_BLOCKS="${RISK_BLOCKS:-true}"
lane_result() { [ "$1" = true ] && printf '%s' "$2" || printf skipped; }
root="$RUNNER_TEMP/product-lane-receipt"
if [[ "$GITHUB_EVENT_NAME" == merge_group && "$BLOG_CONTENT_ONLY" == true ]]; then
  web_results="[\"$BLOG\",\"$FAST\"]"
else
  web_results="[\"$(lane_result "$RUN_WEB" "$WEB_UNIT")\",\"$(lane_result "$RUN_WEB" "$WEB_BUILD")\",\"$(lane_result "$RUN_WEB" "$WEB_OVIE")\",\"$(lane_result "$RUN_WEB" "$WEB_OVIE_TYPECHECK")\",\"$(lane_result "$RUN_WEB" "$FAST")\"]"
fi
jq -n \
  --argjson ios "[\"$(lane_result "$RUN_IOS" "$IOS")\",\"$(lane_result "$RUN_IOS" "$FAST")\"]" \
  --argjson mac "[\"$(lane_result "$RUN_MAC" "$MAC")\",\"$(lane_result "$RUN_MAC" "$FAST")\"]" \
  --argjson web "$web_results" \
  --argjson operations "[\"$(lane_result "$RUN_OPERATIONS" "$FAST")\"]" \
  --argjson cross "[\"$(lane_result "$RUN_CROSS" "$CROSS")\"]" \
  --arg receipt "product-lane-final-${GITHUB_SHA}-${GITHUB_RUN_ATTEMPT}" \
  --arg run "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" \
  --arg risk_level "$RISK_LEVEL" --arg rules "$RISK_RULES" \
  --argjson requires_smoke "$RISK_SMOKE" --argjson requires_preview "$RISK_PREVIEW" --argjson blocks_unattended "$RISK_BLOCKS" \
  '{lanes: {ios: $ios, mac: $mac, web: $web, operations: $operations, "cross-product": $cross}, receiptArtifact: $receipt, run: $run, riskReceipt: {schema: "jovie-ci-risk-receipt/v1", sha: env.GITHUB_SHA, run_id: env.GITHUB_RUN_ID, run_attempt: env.GITHUB_RUN_ATTEMPT, risk_level: $risk_level, requires_smoke: $requires_smoke, requires_preview: $requires_preview, blocks_unattended: $blocks_unattended, matched_rule_ids: ($rules | split(",") | map(select(length > 0)))}}' \
  > "$root/results.json"
node scripts/lib/product-lane-finalize.mjs \
  "$root/receipt.json" "$root/results.json" \
  "$root/final.json" "$root/final.md"
cat "$root/final.md" >> "$GITHUB_STEP_SUMMARY"
