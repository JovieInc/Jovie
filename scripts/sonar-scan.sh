#!/bin/bash
# SonarQube Local Scan Script for Claude Loop
# Usage: ./scripts/sonar-scan.sh [--export-json]

set -e

SONAR_HOST="http://localhost:9000"
SONAR_TOKEN="squ_0bae45669d27c5b5dadd97aa03fe8c0c1b25a537"
PROJECT_KEY="jovie"

# Check if SonarQube is running
if ! curl -s "$SONAR_HOST/api/system/status" | grep -q '"status":"UP"'; then
  echo "❌ SonarQube is not running. Start it with:"
  echo "   docker run -d --name sonarqube -p 9000:9000 -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true sonarqube:9.9-community"
  exit 1
fi

echo "🔍 Running SonarQube scan..."

# Run the scan
npx sonarqube-scanner \
  -Dsonar.host.url="$SONAR_HOST" \
  -Dsonar.login="$SONAR_TOKEN" \
  -Dsonar.projectKey="$PROJECT_KEY" \
  -Dsonar.sources=apps/web,packages/ui \
  -Dsonar.exclusions="**/node_modules/**,**/.next/**,**/dist/**,**/coverage/**,**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/tests/**,**/__tests__/**,**/*.stories.tsx,**/.storybook/**"

# Wait for analysis to complete
echo "⏳ Waiting for analysis to complete..."
sleep 5

# Export issues to JSON if requested
if [[ "$1" == "--export-json" ]]; then
  echo "📄 Exporting issues to JSON..."
  
  # Export issues
  curl -s -u "admin:Sonarqube123!" "$SONAR_HOST/api/issues/search?componentKeys=$PROJECT_KEY&ps=500&resolved=false" | jq '{
    summary: {
      total: .total,
      bugs: [.issues[] | select(.type == "BUG")] | length,
      code_smells: [.issues[] | select(.type == "CODE_SMELL")] | length,
      vulnerabilities: [.issues[] | select(.type == "VULNERABILITY")] | length
    },
    issues: [.issues[] | {
      key: .key,
      type: .type,
      severity: .severity,
      message: .message,
      file: .component | split(":")[1],
      line: .line,
      rule: .rule,
      effort: .effort
    }]
  }' > sonar-issues.json
  
  # Export hotspots
  curl -s -u "admin:Sonarqube123!" "$SONAR_HOST/api/hotspots/search?projectKey=$PROJECT_KEY" | jq '{
    hotspots: [.hotspots[] | {
      key: .key,
      message: .message,
      file: .component | split(":")[1],
      line: .line,
      securityCategory: .securityCategory,
      vulnerabilityProbability: .vulnerabilityProbability,
      status: .status
    }]
  }' > sonar-hotspots.json
  
  echo "✅ Exported to sonar-issues.json and sonar-hotspots.json"
fi

# Print summary
echo ""
echo "📊 Analysis Summary:"
curl -s -u "admin:Sonarqube123!" "$SONAR_HOST/api/measures/component?component=$PROJECT_KEY&metricKeys=bugs,vulnerabilities,code_smells,security_hotspots,coverage,duplicated_lines_density,ncloc" | jq -r '.component.measures[] | "\(.metric): \(.value)"'

echo ""
echo "🔗 View full results: $SONAR_HOST/dashboard?id=$PROJECT_KEY"
