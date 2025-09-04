---
trigger: always_on
---
## Critical Module Protection
- Protected: marketing pages, Featured Creators, money path.
- No mocks/static lists; modify in place; keep existing `data-testid`s.
- CI gates: homepage smoke, no-mocks-in-prod lint, adapter contract, CODEOWNERS gate.
