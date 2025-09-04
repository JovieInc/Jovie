---
trigger: always_on
---
## Testing Strategy
- Pyramid: Unit > Integration > E2E golden paths.
- Speed budgets: unit <200ms; integration <30s; E2E smoke <3m total.
- Mock external deps; flags define owner/expiry/killswitch; CI fails past expiry.
- CI fast checks: typecheck, lint, unit; PR checks add E2E smoke.
