#!/usr/bin/env bash
# ==============================================================================
# validate-fixes.sh - Validate fixes with Biome and TypeScript
#
# PURPOSE:
# Runs the validation pipeline (Biome lint/format + TypeScript typecheck)
# and captures output for potential retry with error context.
#
# USAGE:
#   ./validate-fixes.sh [output_dir]
#
# OUTPUTS:
#   - Exit code 0 if all validations pass
#   - Exit code 1 if any validation fails
#   - Writes log files to output_dir (default: /tmp)
#   - Outputs VALIDATION_PASSED=true|false and VALIDATION_ERRORS_B64 to stdout
# ==============================================================================

set -uo pipefail

OUTPUT_DIR="${1:-/tmp}"

echo "Running validation pipeline..." >&2
echo "Output directory: $OUTPUT_DIR" >&2

# Initialize tracking variables
BIOME_EXIT=0
TYPECHECK_EXIT=0

# Step 1: Run Biome auto-fix (best effort, don't fail on this)
echo "=== Step 1: Biome auto-fix ===" >&2
pnpm biome check . --write 2>&1 | tee "$OUTPUT_DIR/biome-write.log" || true

# Step 2: Run Biome check (strict)
echo "=== Step 2: Biome check ===" >&2
pnpm biome check . 2>&1 | tee "$OUTPUT_DIR/biome-check.log"
BIOME_EXIT=${PIPESTATUS[0]}

if [[ $BIOME_EXIT -eq 0 ]]; then
  echo "✅ Biome check passed" >&2
else
  echo "❌ Biome check failed (exit code: $BIOME_EXIT)" >&2
fi

# Step 3: Run TypeScript typecheck
echo "=== Step 3: TypeScript typecheck ===" >&2
pnpm turbo typecheck --filter=@jovie/web 2>&1 | tee "$OUTPUT_DIR/typecheck.log"
TYPECHECK_EXIT=${PIPESTATUS[0]}

if [[ $TYPECHECK_EXIT -eq 0 ]]; then
  echo "✅ TypeScript check passed" >&2
else
  echo "❌ TypeScript check failed (exit code: $TYPECHECK_EXIT)" >&2
fi

# Aggregate results
if [[ $BIOME_EXIT -eq 0 && $TYPECHECK_EXIT -eq 0 ]]; then
  echo "VALIDATION_PASSED=true"
  exit 0
else
  echo "VALIDATION_PASSED=false"
  
  # Capture error output for retry context
  {
    echo "## Biome Check Output"
    echo '```'
    cat "$OUTPUT_DIR/biome-check.log"
    echo '```'
    echo ""
    echo "## TypeScript Check Output"
    echo '```'
    cat "$OUTPUT_DIR/typecheck.log"
    echo '```'
  } > "$OUTPUT_DIR/validation-errors.md"
  
  # Output base64 encoded errors for easy passing between steps
  echo "VALIDATION_ERRORS_B64=$(cat "$OUTPUT_DIR/validation-errors.md" | base64 -w0)"
  
  exit 1
fi
