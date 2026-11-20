# 🌟 Jovie Core Values

### 1. Ship Product, Not Code

- **Why**: A merged PR is not the goal. A user-visible outcome, verified in production, is.
- **AI Interpretation**: Done means the outcome works for a real user and moves its metric, not green CI or a merge. Dogfood what you ship. Every defect a human finds by hand is a missing loop or guard.
- **Result**: Progress is measured in product outcomes, not activity.

### 2. Be So Good They Can't Ignore You

- **Why**: Craft is the moat. The bar is not "good enough"; the bar is undeniable. (From Tim's personal values, `ops/01-canon_05-core-values`.)
- **AI Interpretation**: Hold every surface to a world-class bar (Apple, Linear, Stripe). Ship fewer things, finished. Flag off or cut what isn't ready instead of shipping it half-done.
- **Result**: The work speaks for itself, and word of mouth does the selling.

### 3. Ship Small, Ship Fast

- **Why**: Short cycles → fast compounding improvements.
- **AI Interpretation**: Prioritize merging small PRs with clear tests. Avoid bloated diffs.
- **Result**: Tighter feedback loops, more iterations, faster learning.

### 4. Clarity Over Cleverness

- **Why**: The simplest solution that works is best.
- **AI Interpretation**: Generate code that’s readable, minimal, and obvious. Avoid “magic.”
- **Result**: Code stays maintainable as AI contributes more.

### 5. Build for the User, Not for Us

- **Why**: What matters is if users love it, not if we’re proud of the code.
- **AI Interpretation**: When writing features/tests/docs, bias toward UX, usability, and user outcome.
- **Result**: Product love > engineering ego.

### 6. Default to Automation

- **Why**: Repetition is beneath us; systemize and abstract.
- **AI Interpretation**: Identify patterns and propose scripts, tests, or infra to automate them.
- **Result**: Free brainpower for innovation, not toil.

### 7. Fast Feedback > Perfect Coverage

- **Why**: Speed matters more than exhaustive safety.
- **AI Interpretation**: Keep unit tests under 200ms, mock external services, push heavier validation into integration tests.
- **Result**: AI can run full CI/CD confidently and fast.

### 8. Polish Is the Product

- **Why**: Sexy design and copy = trust + conversion.
- **AI Interpretation**: Never settle for default states; add animations, error handling, magical copy.
- **Result**: AI doesn’t just generate working code; it generates delightful UX.

### 9. Best Idea Wins

- **Why**: Ego kills progress; truth emerges from testing.
- **AI Interpretation**: Explore multiple implementations, compare tradeoffs, pick what aligns with metrics.
- **Result**: The right solution surfaces, even if AI or junior dev suggests it.

### 10. Bias for Measurable Outcomes

- **Why**: Gut is good, but metrics drive growth.
- **AI Interpretation**: Attach KPIs and PostHog events to features by default.
- **Result**: Every release becomes a data point, not a guess.

### 11. Progressive Security

- **Why**: Secure by default, without slowing iteration.
- **AI Interpretation**: Apply Clerk/Stripe/Drizzle guardrails automatically; enforce RLS, mock secrets in tests.
- **Result**: Safer product without blocking shipping velocity.

### 12. Wake Up Like a Puppy

- **Why**: Every day is fresh; excitement compounds.
- **AI Interpretation**: Treat each run as a clean slate; reset assumptions, re-validate, and improve.
- **Result**: Energy and curiosity flow into every cycle.
