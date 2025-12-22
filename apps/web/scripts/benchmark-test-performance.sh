#!/bin/bash

# Test Performance Benchmarking Script
# Compares original vs optimized test performance

echo "=== Test Suite Performance Benchmark ==="
echo ""
echo "This script measures test performance improvements"
echo "Run this before and after migration to track progress"
echo ""

RESULTS_DIR="test-results"
mkdir -p "$RESULTS_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BASELINE_FILE="$RESULTS_DIR/baseline_${TIMESTAMP}.txt"
OPTIMIZED_FILE="$RESULTS_DIR/optimized_${TIMESTAMP}.txt"

# Function to extract duration from test output
extract_duration() {
  grep "Duration:" | sed 's/.*Duration: \([0-9.]*s\).*/\1/' | sed 's/s//'
}

# Function to run and time tests
time_test() {
  local test_file=$1
  local output_file=$2

  echo "Running: $test_file"
  { time npm test -- "$test_file" --reporter=verbose 2>&1; } 2>&1 | tee "$output_file"
}

echo "Phase 1: Benchmarking Individual Tests"
echo "========================================"
echo ""

# Test 1: ProblemSolutionSection
echo "1. ProblemSolutionSection"
echo "   Original:"
time_test "tests/unit/ProblemSolutionSection.test.tsx" "$RESULTS_DIR/original_problem_${TIMESTAMP}.txt" > /dev/null 2>&1
ORIG_PROB_TIME=$(grep "Duration:" "$RESULTS_DIR/original_problem_${TIMESTAMP}.txt" | sed 's/.*Duration: //')

echo "   Optimized:"
time_test "tests/unit/ProblemSolutionSection.optimized.test.tsx" "$RESULTS_DIR/optimized_problem_${TIMESTAMP}.txt" > /dev/null 2>&1
OPT_PROB_TIME=$(grep "Duration:" "$RESULTS_DIR/optimized_problem_${TIMESTAMP}.txt" | sed 's/.*Duration: //')

echo "   Results: $ORIG_PROB_TIME → $OPT_PROB_TIME"
echo ""

# Test 2: ClaimHandleForm
echo "2. ClaimHandleForm"
echo "   Original:"
time_test "tests/unit/ClaimHandleForm.test.tsx" "$RESULTS_DIR/original_claim_${TIMESTAMP}.txt" > /dev/null 2>&1
ORIG_CLAIM_TIME=$(grep "Duration:" "$RESULTS_DIR/original_claim_${TIMESTAMP}.txt" | sed 's/.*Duration: //')

echo "   Optimized:"
time_test "tests/unit/ClaimHandleForm.optimized.test.tsx" "$RESULTS_DIR/optimized_claim_${TIMESTAMP}.txt" > /dev/null 2>&1
OPT_CLAIM_TIME=$(grep "Duration:" "$RESULTS_DIR/optimized_claim_${TIMESTAMP}.txt" | sed 's/.*Duration: //')

echo "   Results: $ORIG_CLAIM_TIME → $OPT_CLAIM_TIME"
echo ""

# Test 3: Health Checks
echo "3. Health Checks"
echo "   Original:"
time_test "tests/lib/health-checks.test.ts" "$RESULTS_DIR/original_health_${TIMESTAMP}.txt" > /dev/null 2>&1
ORIG_HEALTH_TIME=$(grep "Duration:" "$RESULTS_DIR/original_health_${TIMESTAMP}.txt" | sed 's/.*Duration: //')

echo "   Optimized:"
time_test "tests/lib/health-checks.optimized.test.ts" "$RESULTS_DIR/optimized_health_${TIMESTAMP}.txt" > /dev/null 2>&1
OPT_HEALTH_TIME=$(grep "Duration:" "$RESULTS_DIR/optimized_health_${TIMESTAMP}.txt" | sed 's/.*Duration: //')

echo "   Results: $ORIG_HEALTH_TIME → $OPT_HEALTH_TIME"
echo ""

echo "Phase 2: Full Suite Benchmark"
echo "=============================="
echo ""

echo "Running full test suite (this may take several minutes)..."
echo ""

# Run a subset of tests to demonstrate
echo "Testing subset of unit tests..."
{ time npm test -- tests/unit --reporter=verbose 2>&1; } 2>&1 | tee "$RESULTS_DIR/full_suite_${TIMESTAMP}.txt"

SUITE_TIME=$(grep "Duration:" "$RESULTS_DIR/full_suite_${TIMESTAMP}.txt" | sed 's/.*Duration: //')
SUITE_TESTS=$(grep "Tests " "$RESULTS_DIR/full_suite_${TIMESTAMP}.txt" | head -1)

echo ""
echo "=== Summary ==="
echo ""
echo "Individual Test Results:"
echo "  1. ProblemSolutionSection: $ORIG_PROB_TIME → $OPT_PROB_TIME"
echo "  2. ClaimHandleForm:        $ORIG_CLAIM_TIME → $OPT_CLAIM_TIME"
echo "  3. Health Checks:          $ORIG_HEALTH_TIME → $OPT_HEALTH_TIME"
echo ""
echo "Full Suite:"
echo "  $SUITE_TESTS"
echo "  Total Duration: $SUITE_TIME"
echo ""
echo "Detailed results saved to: $RESULTS_DIR/"
echo ""
echo "=== Performance Insights ==="
echo ""
echo "Key metrics to track:"
echo "  - Setup time (should be <10% of total)"
echo "  - Test time (actual test execution)"
echo "  - Environment time (jsdom initialization)"
echo ""
echo "Target breakdown:"
echo "  Setup:       <50ms per test file"
echo "  Tests:       <200ms per test file (unit tests)"
echo "  Environment: <500ms (amortized across all tests)"
echo ""
echo "Run this script periodically to track improvements over time."
