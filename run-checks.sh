#!/bin/bash
# Run all checks: typecheck, lint, and tests

set -e  # Exit on first error

echo "================================"
echo "Running TypeScript type check..."
echo "================================"
pnpm typecheck 2>&1 | tee typecheck.log

echo ""
echo "================================"
echo "Running Biome linter..."
echo "================================"
pnpm biome check 2>&1 | tee lint.log

echo ""
echo "================================"
echo "Running tests..."
echo "================================"
pnpm test 2>&1 | tee test.log

echo ""
echo "================================"
echo "✅ All checks passed!"
echo "================================"
