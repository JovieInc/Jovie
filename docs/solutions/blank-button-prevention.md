# Blank-Button Prevention

## Problem
`<button>{variable}</button>` renders an invisible, interactive blank button when
the variable is null, undefined, or empty string. `toBeVisible()` in Playwright
passes for empty buttons, creating a test gap.

## Solution
Added fallback text to 3 risky `<button>{variable}</button>` patterns:
- EntityCard.tsx: `{cta?.label || 'Action'}`
- ProfilePrimaryActionCard.tsx: `{children || 'Submit'}`
- LibrarySurface.tsx: `{label || 'Untitled'}`

## Prevention
- Lint rule recommendation: flag `<button>{variable}</button>` without fallback
- Test pattern: `expect(button).not.toHaveTextContent('')`
