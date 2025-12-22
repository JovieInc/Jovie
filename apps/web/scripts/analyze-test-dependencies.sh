#!/bin/bash

# Test Suite Dependency Analyzer
# Helps identify which tests need which setup modules

echo "=== Test Suite Dependency Analysis ==="
echo ""

TESTS_DIR="tests"

echo "1. Tests requiring database setup:"
echo "   (Look for imports from @/lib/db, database queries, etc.)"
grep -l "from '@/lib/db'" "$TESTS_DIR"/**/*.test.{ts,tsx} 2>/dev/null | while read file; do
  echo "   - $file"
done
echo ""

echo "2. Tests requiring component mocks:"
echo "   (Look for @clerk/nextjs, next/navigation, etc.)"
grep -l "from '@clerk/nextjs'" "$TESTS_DIR"/**/*.test.{ts,tsx} 2>/dev/null | while read file; do
  echo "   - $file"
done
echo ""

echo "3. Tests importing analytics:"
grep -l "@/lib/analytics" "$TESTS_DIR"/**/*.test.{ts,tsx} 2>/dev/null | while read file; do
  echo "   - $file"
done
echo ""

echo "4. Tests with inline mocks (already optimized):"
grep -l "vi.mock(" "$TESTS_DIR"/**/*.test.{ts,tsx} 2>/dev/null | while read file; do
  echo "   - $file"
done
echo ""

echo "5. Pure component tests (no external dependencies):"
echo "   (Tests without mocks or database imports)"
for file in "$TESTS_DIR"/**/*.test.{ts,tsx}; do
  if [ -f "$file" ]; then
    if ! grep -q "vi.mock\|@/lib/db\|@clerk/nextjs\|next/navigation" "$file" 2>/dev/null; then
      echo "   - $file"
    fi
  fi
done
echo ""

echo "=== Optimization Recommendations ==="
echo ""
echo "1. Pure component tests → No changes needed (already fast)"
echo "2. Tests with inline mocks → Already optimized"
echo "3. Tests needing database → Add: import { setupDatabaseBeforeAll } from '../setup-db'"
echo "4. Tests needing global mocks → Consider moving mocks inline if possible"
echo ""
echo "Run this script after optimization to verify improvements:"
echo "  npm test -- --reporter=verbose | grep 'Duration'"
