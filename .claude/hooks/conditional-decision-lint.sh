#!/usr/bin/env bash
# conditional-decision-lint.sh
#
# Enforces the conditional-decision rule (CLAUDE.md → Operating Principles, added 2026-05-18).
# Scans the agent's final-answer text for phrases that defer work without a trigger
# (Linear ID) or an EVENT: tag. Same shape as `.claude/rules/linear.md` follow-up rule,
# promoted to a runtime hook.
#
# Mode: warn through 2026-06-01, then error (controlled by CONDITIONAL_DECISION_LINT_MODE).
#
# Input: agent transcript text on STDIN (or in $CLAUDE_PROJECT_DIR/.claude/last-output if set).
# Exit codes:
#   0 — clean OR warn-mode hit
#   1 — error-mode hit (blocks task completion)

set -euo pipefail

MODE="${CONDITIONAL_DECISION_LINT_MODE:-warn}"
# Auto-promote to error after 2026-06-01 unless explicitly overridden
TODAY="$(date +%Y-%m-%d)"
if [[ "$MODE" == "warn" && "$TODAY" > "2026-06-01" ]]; then
  MODE="error"
fi

INPUT="${1:-/dev/stdin}"

# Phrases that indicate deferred work
DEFER_PATTERNS=(
  "future work"
  "follow-up"
  "follow up"
  "consider later"
  "consider after"
  "deferred"
  "not in scope"
  "out of scope for now"
  "revisit later"
  "we should later"
  "when we grow"
  "too early"
  "premature"
)

# Build a single grep alternation
PATTERN=""
for p in "${DEFER_PATTERNS[@]}"; do
  if [[ -z "$PATTERN" ]]; then
    PATTERN="$p"
  else
    PATTERN="$PATTERN|$p"
  fi
done

# Read input
if [[ "$INPUT" == "/dev/stdin" ]]; then
  TEXT="$(cat)"
else
  TEXT="$(cat "$INPUT")"
fi

# Empty input is a pass
[[ -z "$TEXT" ]] && exit 0

# Find candidate lines (case-insensitive)
HITS="$(printf '%s\n' "$TEXT" | grep -niE "$PATTERN" || true)"
[[ -z "$HITS" ]] && exit 0

# For each hit, check if it has an adjacent Linear ID (JOV-NNNN), an EVENT: tag,
# or an explicit-trigger phrase (Ship now / Re-evaluate when / Then).
VIOLATIONS=""
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # Match Linear ID, EVENT: tag, or conditional-decision-format markers in the same line
  if echo "$line" | grep -qiE '(JOV-[0-9]+|EVENT:|Re-evaluate when|Ship now|trigger:)'; then
    continue
  fi
  VIOLATIONS="${VIOLATIONS}${line}"$'\n'
done <<< "$HITS"

[[ -z "$VIOLATIONS" ]] && exit 0

# Report
echo "============================================================"
echo "conditional-decision-lint: deferred work without trigger or Linear ID"
echo "============================================================"
echo "Rule (CLAUDE.md → Operating Principles): every deferred SYSTEM decision must"
echo "include either a Linear issue ID (JOV-NNNN), an EVENT: tag for permanent/taste"
echo "decisions, or an explicit Ship-now/Re-evaluate-when/Then format."
echo ""
echo "Violations:"
echo "$VIOLATIONS"
echo "Fix one of:"
echo "  - File a Linear issue using the shape in .claude/rules/linear.md and cite the ID"
echo "  - Tag the decision EVENT: <one-line reason it's permanent>"
echo "  - Reformat as Ship now / Re-evaluate when / Then with a measurable trigger"
echo "============================================================"

if [[ "$MODE" == "error" ]]; then
  exit 1
fi
echo "(warn mode — not blocking; promotes to error on 2026-06-02)"
exit 0
