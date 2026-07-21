#!/usr/bin/env bash
set -euo pipefail

# Check staged files for leftover merge conflict markers.
# Uses git's built-in conflict marker detector, fails fast before lint/typecheck.
output=$(LC_ALL=C git diff --cached --check 2>&1 || true)

if echo "$output" | LC_ALL=C grep -q "leftover conflict marker"; then
  echo "ERROR: Merge conflict markers found in staged files."
  echo ""
  echo "Affected files:"
  echo "$output" | grep "leftover conflict marker" | cut -d: -f1 | sort -u | awk '{printf "  %d. %s\n", NR, $0}'
  echo ""
  echo "Details:"
  echo "$output" | grep "leftover conflict marker"
  echo ""
  echo "Remove the <<<<<<< / ======= / >>>>>>> markers before committing."
  exit 1
fi

echo "PASS: conflict-marker check completed with no findings"
exit 0
