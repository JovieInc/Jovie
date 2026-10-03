#!/usr/bin/env bash
# Reads the newest durable staging-lineage receipt for STAGING_RECEIPT_SHA and
# prints one terminal decision for the production staging-receipt wait:
#   action=wait                          the generation may still deploy
#   action=rebind replacement=<sha>      superseded by an ancestor-or-equal of
#                                       EXPECTED_SHA; wait on that receipt
#   action=yield                         superseded by newer main; this
#                                       controller generation is stale
# Any malformed or terminal non-deploy evidence exits non-zero.
set -euo pipefail

[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] &&
  [[ "$STAGING_RECEIPT_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::Staging generation lineage requires exact EXPECTED_SHA and STAGING_RECEIPT_SHA."
  exit 1
}

artifact_id="$(gh api \
  "repos/$REPOSITORY/actions/artifacts?name=staging-lineage-${STAGING_RECEIPT_SHA}&per_page=100" \
  --jq '[.artifacts[] | select(.expired == false)] | sort_by(.created_at, .id) | last | .id // empty')"
if [[ ! "$artifact_id" =~ ^[1-9][0-9]*$ ]]; then
  echo "action=wait"
  exit 0
fi

lineage_dir="$RUNNER_TEMP/staging-lineage-$STAGING_RECEIPT_SHA"
mkdir -p "$lineage_dir"
gh api "repos/$REPOSITORY/actions/artifacts/$artifact_id/zip" \
  > "$lineage_dir/lineage.zip"
unzip -q -o "$lineage_dir/lineage.zip" -d "$lineage_dir"
jq -e --arg sha "$STAGING_RECEIPT_SHA" '
  .schema == "jovie-staging-lineage/v1" and
  .sha == $sha and
  (.outcome | type == "string" and length > 0)
' "$lineage_dir/staging-lineage.json" >/dev/null || {
  echo "::error::Staging lineage receipt for $STAGING_RECEIPT_SHA is malformed. Proof: artifact $artifact_id."
  exit 1
}

outcome="$(jq -r '.outcome' "$lineage_dir/staging-lineage.json")"
case "$outcome" in
  proceed)
    echo "action=wait"
    ;;
  superseded)
    replacement="$(jq -er '
      .replacementSha | select(type == "string" and test("^[0-9a-f]{40}$"))
    ' "$lineage_dir/staging-lineage.json")" || {
      echo "::error::Staging lineage for $STAGING_RECEIPT_SHA carries no exact replacement. Proof: artifact $artifact_id."
      exit 1
    }
    if [ "$replacement" = "$STAGING_RECEIPT_SHA" ]; then
      echo "::error::Staging lineage for $STAGING_RECEIPT_SHA superseded itself. Proof: artifact $artifact_id."
      exit 1
    fi
    relation="$(gh api \
      "repos/$REPOSITORY/compare/${replacement}...${EXPECTED_SHA}" \
      --jq '.status // empty')"
    if [[ "$relation" =~ ^(ahead|identical)$ ]]; then
      echo "::notice::Staging generation $STAGING_RECEIPT_SHA was superseded by $replacement on this release lineage; rebinding the exact receipt wait."
      echo "action=rebind replacement=$replacement"
    elif [ "$(gh api \
      "repos/$REPOSITORY/compare/${EXPECTED_SHA}...${replacement}" \
      --jq '.status // empty')" = "ahead" ]; then
      echo "::notice::Staging generation $STAGING_RECEIPT_SHA was superseded by newer main $replacement; this controller generation yields."
      echo "action=yield"
    else
      echo "::error::Staging replacement $replacement is not on the release lineage of $EXPECTED_SHA. Proof: artifact $artifact_id."
      exit 1
    fi
    ;;
  *)
    echo "::error::Staging generation $STAGING_RECEIPT_SHA ended as $outcome and can never produce a deployment receipt. Proof: artifact $artifact_id."
    exit 1
    ;;
esac
