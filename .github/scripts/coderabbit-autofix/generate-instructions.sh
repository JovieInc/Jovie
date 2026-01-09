#!/usr/bin/env bash
# ==============================================================================
# generate-instructions.sh - Generate agent instructions from CodeRabbit review
#
# PURPOSE:
# Takes review body and inline comments (base64 encoded) and generates a
# structured markdown instruction file for the AI agent.
#
# USAGE:
#   ./generate-instructions.sh <review_body_b64> <inline_comments_b64> <output_file>
#
# INPUTS:
#   - review_body_b64: Base64 encoded review body text
#   - inline_comments_b64: Base64 encoded JSON array of inline comments
#   - output_file: Path to write the instruction file
#
# OUTPUT:
#   Writes a markdown file with structured agent instructions
# ==============================================================================

set -euo pipefail

# Validate arguments
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <review_body_b64> <inline_comments_b64> <output_file>" >&2
  exit 1
fi

REVIEW_BODY_B64="$1"
INLINE_COMMENTS_B64="$2"
OUTPUT_FILE="$3"

# Decode inputs
REVIEW_BODY=$(echo "$REVIEW_BODY_B64" | base64 -d)
INLINE_COMMENTS=$(echo "$INLINE_COMMENTS_B64" | base64 -d)

# Generate the instruction file
cat > "$OUTPUT_FILE" << 'HEADER_EOF'
# CodeRabbit Autofix Instructions

You are fixing issues identified by CodeRabbit code review.

## CRITICAL CONSTRAINTS

1. **Minimal diff**: Make the smallest possible changes to fix the issues
2. **Only modify referenced files**: Only touch files explicitly mentioned by CodeRabbit or required by the fix
3. **Preserve formatting**: Do not reformat or restructure unrelated code
4. **No speculation**: Do not add features, refactor, or "improve" beyond the fix
5. **No dead code**: Do not introduce unused imports, variables, or functions
6. **No lint silencing**: Never use biome-ignore or similar comments to silence errors

## REVIEW SUMMARY

HEADER_EOF

# Add review body
if [[ -n "$REVIEW_BODY" ]]; then
  echo "$REVIEW_BODY" >> "$OUTPUT_FILE"
else
  echo "_No review summary provided._" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "## INLINE COMMENTS (file-specific issues)" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Check if there are inline comments
COMMENT_COUNT=$(echo "$INLINE_COMMENTS" | jq 'length')

if [[ "$COMMENT_COUNT" -eq 0 ]]; then
  echo "_No inline comments._" >> "$OUTPUT_FILE"
else
  # Format each inline comment
  echo "$INLINE_COMMENTS" | jq -r '.[] | "### `\(.path)`:\(.line)\n\n\(.body)\n\n---\n"' >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
cat >> "$OUTPUT_FILE" << 'FOOTER_EOF'
## TASK

Fix ONLY the issues described above. Follow these steps:

1. Read and understand each issue
2. Make the minimal fix required
3. Run validation:
   - `pnpm biome check . --write` (auto-fix formatting)
   - `pnpm biome check .` (verify no remaining issues)
   - `pnpm turbo typecheck --filter=@jovie/web` (verify types)
4. If validation fails, fix the errors
5. Do NOT commit - the workflow will commit after successful validation
FOOTER_EOF

echo "Generated instructions at: $OUTPUT_FILE" >&2
echo "Review summary: $(echo "$REVIEW_BODY" | wc -c) chars" >&2
echo "Inline comments: $COMMENT_COUNT" >&2
