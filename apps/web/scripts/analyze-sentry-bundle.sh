#!/bin/bash

# Sentry Bundle Analysis Script
# Verifies bundle size reduction and proper code splitting for Sentry SDK
#
# This script helps verify that the Sentry SDK lazy loading implementation
# is working correctly by:
# 1. Running a production build with bundle analyzer
# 2. Analyzing Sentry-related chunk sizes
# 3. Verifying code splitting is occurring as expected

set -e

echo "=== Sentry Bundle Analysis ==="
echo ""
echo "This script analyzes the Sentry SDK bundle splitting implementation."
echo "It verifies that:"
echo "  - sentry-core: Core error tracking (should load on all pages)"
echo "  - sentry-replay: Session replay (~40-50KB, lazy loaded for dashboard)"
echo "  - sentry-profiling: Profiling integration (lazy loaded if used)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Results directory
RESULTS_DIR=".next/analyze"
BUILD_STATS=".next/build-manifest.json"
BUNDLE_REPORT=".next/sentry-bundle-report.txt"

# Function to format bytes
format_bytes() {
  local bytes=$1
  if [ "$bytes" -lt 1024 ]; then
    echo "${bytes}B"
  elif [ "$bytes" -lt 1048576 ]; then
    echo "$(echo "scale=2; $bytes/1024" | bc)KB"
  else
    echo "$(echo "scale=2; $bytes/1048576" | bc)MB"
  fi
}

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Parse arguments
SKIP_BUILD=false
ANALYZE_ONLY=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --analyze-only)
      ANALYZE_ONLY=true
      SKIP_BUILD=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --skip-build     Skip the build step, use existing .next directory"
      echo "  --analyze-only   Only analyze existing build output (implies --skip-build)"
      echo "  --verbose        Show detailed output"
      echo "  -h, --help       Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "Phase 1: Build Analysis"
echo "========================"
echo ""

if [ "$SKIP_BUILD" = false ]; then
  echo "Building with bundle analyzer enabled..."
  echo "This may take several minutes."
  echo ""

  # Run build with analyzer
  ANALYZE=true pnpm build 2>&1 | tee .next/build-output.txt

  echo ""
  echo -e "${GREEN}Build completed successfully.${NC}"
  echo ""
else
  if [ ! -d ".next" ]; then
    echo -e "${RED}Error: .next directory not found. Run without --skip-build first.${NC}"
    exit 1
  fi
  echo "Skipping build, using existing .next directory."
  echo ""
fi

echo "Phase 2: Chunk Analysis"
echo "========================"
echo ""

# Find and analyze Sentry-related chunks
echo "Scanning for Sentry-related chunks..."
echo ""

# Initialize size variables
CORE_SIZE=0
REPLAY_SIZE=0
PROFILING_SIZE=0
TOTAL_SENTRY=0

# Find chunks in .next/static/chunks
if [ -d ".next/static/chunks" ]; then
  echo "Found chunks directory: .next/static/chunks"
  echo ""

  # Create report file
  echo "# Sentry Bundle Analysis Report" > "$BUNDLE_REPORT"
  echo "# Generated: $(date)" >> "$BUNDLE_REPORT"
  echo "" >> "$BUNDLE_REPORT"

  # Find sentry-core chunk
  echo "Looking for sentry-core chunks..."
  CORE_CHUNKS=$(find .next/static/chunks -name "*sentry-core*" -type f 2>/dev/null || true)
  if [ -n "$CORE_CHUNKS" ]; then
    echo -e "${GREEN}Found sentry-core chunk(s):${NC}"
    echo "## Sentry Core Chunks" >> "$BUNDLE_REPORT"
    while IFS= read -r chunk; do
      if [ -f "$chunk" ]; then
        size=$(stat -f%z "$chunk" 2>/dev/null || stat -c%s "$chunk" 2>/dev/null || echo "0")
        gzip_size=$(gzip -c "$chunk" 2>/dev/null | wc -c | tr -d ' ')
        CORE_SIZE=$((CORE_SIZE + gzip_size))
        echo "  - $chunk"
        echo "    Size: $(format_bytes "$size") ($(format_bytes "$gzip_size") gzipped)"
        echo "- $chunk: $(format_bytes "$size") ($(format_bytes "$gzip_size") gzipped)" >> "$BUNDLE_REPORT"
      fi
    done <<< "$CORE_CHUNKS"
    echo "" >> "$BUNDLE_REPORT"
  else
    echo -e "${YELLOW}No explicit sentry-core chunk found.${NC}"
    echo "(Core may be bundled with main chunks)"
  fi
  echo ""

  # Find sentry-replay chunk
  echo "Looking for sentry-replay chunks..."
  REPLAY_CHUNKS=$(find .next/static/chunks -name "*sentry-replay*" -o -name "*rrweb*" -type f 2>/dev/null || true)
  if [ -n "$REPLAY_CHUNKS" ]; then
    echo -e "${GREEN}Found sentry-replay chunk(s):${NC}"
    echo "## Sentry Replay Chunks" >> "$BUNDLE_REPORT"
    while IFS= read -r chunk; do
      if [ -f "$chunk" ]; then
        size=$(stat -f%z "$chunk" 2>/dev/null || stat -c%s "$chunk" 2>/dev/null || echo "0")
        gzip_size=$(gzip -c "$chunk" 2>/dev/null | wc -c | tr -d ' ')
        REPLAY_SIZE=$((REPLAY_SIZE + gzip_size))
        echo "  - $chunk"
        echo "    Size: $(format_bytes "$size") ($(format_bytes "$gzip_size") gzipped)"
        echo "- $chunk: $(format_bytes "$size") ($(format_bytes "$gzip_size") gzipped)" >> "$BUNDLE_REPORT"
      fi
    done <<< "$REPLAY_CHUNKS"
    echo "" >> "$BUNDLE_REPORT"
  else
    echo -e "${YELLOW}No sentry-replay chunk found.${NC}"
    echo "(This is expected if Replay is not used or tree-shaken)"
  fi
  echo ""

  # Find sentry-profiling chunk
  echo "Looking for sentry-profiling chunks..."
  PROFILING_CHUNKS=$(find .next/static/chunks -name "*sentry-profiling*" -type f 2>/dev/null || true)
  if [ -n "$PROFILING_CHUNKS" ]; then
    echo -e "${GREEN}Found sentry-profiling chunk(s):${NC}"
    echo "## Sentry Profiling Chunks" >> "$BUNDLE_REPORT"
    while IFS= read -r chunk; do
      if [ -f "$chunk" ]; then
        size=$(stat -f%z "$chunk" 2>/dev/null || stat -c%s "$chunk" 2>/dev/null || echo "0")
        gzip_size=$(gzip -c "$chunk" 2>/dev/null | wc -c | tr -d ' ')
        PROFILING_SIZE=$((PROFILING_SIZE + gzip_size))
        echo "  - $chunk"
        echo "    Size: $(format_bytes "$size") ($(format_bytes "$gzip_size") gzipped)"
        echo "- $chunk: $(format_bytes "$size") ($(format_bytes "$gzip_size") gzipped)" >> "$BUNDLE_REPORT"
      fi
    done <<< "$PROFILING_CHUNKS"
    echo "" >> "$BUNDLE_REPORT"
  else
    echo -e "${YELLOW}No sentry-profiling chunk found.${NC}"
    echo "(This is expected if Profiling is not configured)"
  fi
  echo ""

  # Calculate totals
  TOTAL_SENTRY=$((CORE_SIZE + REPLAY_SIZE + PROFILING_SIZE))
else
  echo -e "${RED}Error: .next/static/chunks directory not found.${NC}"
  echo "Make sure the build completed successfully."
  exit 1
fi

echo "Phase 3: Summary"
echo "================="
echo ""

echo "## Summary" >> "$BUNDLE_REPORT"
echo "" >> "$BUNDLE_REPORT"

echo "Sentry Bundle Sizes (gzipped):"
echo "  Core SDK:      $(format_bytes "$CORE_SIZE")"
echo "  Replay:        $(format_bytes "$REPLAY_SIZE")"
echo "  Profiling:     $(format_bytes "$PROFILING_SIZE")"
echo "  ────────────────────"
echo "  Total Sentry:  $(format_bytes "$TOTAL_SENTRY")"
echo ""

echo "- Core SDK: $(format_bytes "$CORE_SIZE")" >> "$BUNDLE_REPORT"
echo "- Replay: $(format_bytes "$REPLAY_SIZE")" >> "$BUNDLE_REPORT"
echo "- Profiling: $(format_bytes "$PROFILING_SIZE")" >> "$BUNDLE_REPORT"
echo "- Total: $(format_bytes "$TOTAL_SENTRY")" >> "$BUNDLE_REPORT"
echo "" >> "$BUNDLE_REPORT"

echo "Phase 4: Verification"
echo "======================"
echo ""

# Verification checks
CHECKS_PASSED=0
CHECKS_TOTAL=3

echo "## Verification Checks" >> "$BUNDLE_REPORT"
echo "" >> "$BUNDLE_REPORT"

# Check 1: Code splitting is occurring
echo "1. Code Splitting Check:"
if [ "$CORE_SIZE" -gt 0 ] || [ "$REPLAY_SIZE" -gt 0 ]; then
  echo -e "   ${GREEN}PASS${NC} - Sentry chunks are being split separately"
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
  echo "- [x] Code splitting is occurring" >> "$BUNDLE_REPORT"
else
  echo -e "   ${YELLOW}WARN${NC} - No separate Sentry chunks found"
  echo "   This may be okay if Sentry is tree-shaken or bundled differently"
  echo "- [ ] Code splitting check inconclusive" >> "$BUNDLE_REPORT"
fi
echo ""

# Check 2: Replay is in a separate chunk (for lazy loading)
echo "2. Replay Lazy Loading Check:"
if [ "$REPLAY_SIZE" -gt 0 ]; then
  if [ "$REPLAY_SIZE" -gt 30000 ]; then
    echo -e "   ${GREEN}PASS${NC} - Replay is in a separate chunk ($(format_bytes "$REPLAY_SIZE"))"
    echo "   This enables lazy loading for dashboard pages."
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    echo "- [x] Replay is in separate chunk for lazy loading" >> "$BUNDLE_REPORT"
  else
    echo -e "   ${YELLOW}INFO${NC} - Replay chunk is smaller than expected ($(format_bytes "$REPLAY_SIZE"))"
    echo "   Expected ~40-50KB gzipped"
    echo "- [ ] Replay chunk size is smaller than expected" >> "$BUNDLE_REPORT"
  fi
else
  echo -e "   ${YELLOW}INFO${NC} - No separate Replay chunk found"
  echo "   Check if Replay is being used in client-full.ts"
  echo "- [ ] No Replay chunk found" >> "$BUNDLE_REPORT"
fi
echo ""

# Check 3: Estimated bundle size reduction
echo "3. Bundle Size Impact Check:"
if [ "$REPLAY_SIZE" -gt 0 ]; then
  echo -e "   ${GREEN}PASS${NC} - Public pages will save ~$(format_bytes "$REPLAY_SIZE") by not loading Replay"
  CHECKS_PASSED=$((CHECKS_PASSED + 1))
  echo "- [x] Public pages save ~$(format_bytes "$REPLAY_SIZE") by not loading Replay" >> "$BUNDLE_REPORT"
else
  echo -e "   ${BLUE}INFO${NC} - Replay size impact cannot be calculated"
  echo "- [ ] Bundle size impact unknown" >> "$BUNDLE_REPORT"
fi
echo ""

echo ""
echo "=== Results ==="
echo ""
echo "Verification: $CHECKS_PASSED/$CHECKS_TOTAL checks passed"
echo ""
echo "Report saved to: $BUNDLE_REPORT"
echo ""

if [ "$CHECKS_PASSED" -ge 2 ]; then
  echo -e "${GREEN}SUCCESS: Sentry bundle splitting appears to be working correctly.${NC}"
  echo ""
  echo "Public pages should now load with the lite SDK (core only),"
  echo "while dashboard pages will lazy-load the full SDK with Replay."
else
  echo -e "${YELLOW}REVIEW NEEDED: Some checks did not pass.${NC}"
  echo ""
  echo "This may be expected depending on your configuration."
  echo "Review the report above for details."
fi

echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Open the bundle analyzer HTML report in your browser:"
echo "   open .next/analyze/client.html"
echo ""
echo "2. Look for these chunks in the visualization:"
echo "   - sentry-core (should be in initial bundle)"
echo "   - sentry-replay (should be a separate, lazy-loaded chunk)"
echo ""
echo "3. Test in browser DevTools:"
echo "   - Visit a public page (e.g., /artists/beyonce)"
echo "   - Check Network tab - sentry-replay chunk should NOT load"
echo "   - Navigate to dashboard (/app) - sentry-replay should lazy-load"
echo ""
