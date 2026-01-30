#!/usr/bin/env bash

set -e

OUTPUT_DIR="apps/web/.issues"
mkdir -p "$OUTPUT_DIR"

TIMESTAMP=$(date +%Y-%m-%dT%H-%M-%S)
OUTPUT_FILE="$OUTPUT_DIR/sonar-issues-$TIMESTAMP.json"
LATEST_FILE="$OUTPUT_DIR/sonar-issues-latest.json"

echo "🔍 Fetching SonarCloud issues..."

# Fetch all issues (handling pagination)
ALL_ISSUES="[]"
PAGE=1
TOTAL_PAGES=3  # 1158 / 500 = 3 pages

while [ $PAGE -le $TOTAL_PAGES ]; do
  echo "   Fetching page $PAGE..."

  RESPONSE=$(curl -s "https://sonarcloud.io/api/issues/search?componentKeys=JovieInc_Jovie&resolved=false&ps=500&p=$PAGE&s=SEVERITY&asc=false" \
    -H "Authorization: Bearer $SONAR_TOKEN")

  PAGE_ISSUES=$(echo "$RESPONSE" | jq '.issues')
  ALL_ISSUES=$(echo "$ALL_ISSUES" | jq ". + $PAGE_ISSUES")

  PAGE=$((PAGE + 1))
done

echo "✅ Fetched $(echo "$ALL_ISSUES" | jq 'length') issues"

# Save to file
echo "$ALL_ISSUES" | jq '.' > "$OUTPUT_FILE"
echo "💾 Saved to: $OUTPUT_FILE"

# Create latest symlink
cp "$OUTPUT_FILE" "$LATEST_FILE"
echo "💾 Latest: $LATEST_FILE"

# Print summary by severity
echo ""
echo "📊 Issues by severity:"
echo "$ALL_ISSUES" | jq -r 'group_by(.severity) | map({severity: .[0].severity, count: length}) | sort_by(.count) | reverse | .[] | "   \(.severity): \(.count)"'

echo ""
echo "📊 Issues by type:"
echo "$ALL_ISSUES" | jq -r 'group_by(.type) | map({type: .[0].type, count: length}) | sort_by(.count) | reverse | .[] | "   \(.type): \(.count)"'

echo ""
echo "📊 Top 10 rules:"
echo "$ALL_ISSUES" | jq -r 'group_by(.rule) | map({rule: .[0].rule, count: length}) | sort_by(.count) | reverse | .[0:10] | .[] | "   \(.rule): \(.count)"'
