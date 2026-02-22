# Entitlements Skill

Use this skill whenever you touch plan gating, feature flags, limits, billing-derived access, or admin authorization behavior.

## Canonical Sources (in priority order)

1. `apps/web/lib/entitlements/registry.ts`
   - Single source of truth for plan-level capabilities and limits.
   - Keep this file client-safe (`NO server-only imports`).
2. `apps/web/lib/entitlements/server.ts`
   - Runtime resolver for current-user entitlements.
   - Handles auth state, admin role lookup, billing lookup, and fallback/error behavior.
3. `apps/web/types/index.ts` (`UserPlan`, `UserEntitlements`)
   - Shared contract consumed by API routes, server actions, and UI.
4. `AGENTS.md` (root)
   - Agent-facing guardrails and required patterns.

## How Entitlements Work

### 1) Definition

- Plans are `free | pro | growth`.
- Plan booleans + limits are defined once in `ENTITLEMENT_REGISTRY`.
- Registry helpers (`getEntitlements`, `checkBoolean`, `getLimit`, `isProPlan`, `hasAdvancedFeatures`) must stay deterministic and side-effect free.

### 2) Resolution

`getCurrentUserEntitlements()` resolves in this order:

1. Auth check (`getCachedAuth`)
2. Optional Clerk identity resolution (`getCachedCurrentUser`)
3. Concurrently:
   - Admin role check (`isAdmin`) — canonical admin source
   - Billing lookup (`getUserBillingInfo`) — canonical plan/subscription source
4. Merge into `UserEntitlements`

### 3) Enforcement

- Gate access in API routes/actions via `getCurrentUserEntitlements()`.
- Never infer paid access from plan string alone in call-sites; rely on resolved booleans and limits.
- Admin authorization must rely on `isAdmin` from entitlements (backed by role check), not billing row fields.

## Non-Negotiable Guardrails

- Do **not** duplicate plan constants or entitlement matrices in route handlers/components.
- Do **not** silently downgrade authenticated users to free when billing lookup fails.
  - `BillingUnavailableError` exists to force explicit error handling.
- Do **not** bypass `getCurrentUserEntitlements()` by reading billing rows directly for access checks.
- Do **not** add ad-hoc feature gates that skip the registry.

## Required Test Coverage for Entitlement Changes

When modifying entitlement behavior, include or update tests for:

1. **Boundaries**
   - Unknown/null/empty plan handling
   - Free/pro/growth limits and boolean matrix invariants
2. **State transitions**
   - Free → pro → growth and downgrade/cancel paths
   - Mismatch cases (`isPro=false` with stale paid plan value)
3. **Concurrent access**
   - Multiple entitlement resolutions in flight
   - No state leakage across concurrent calls

## Implementation Checklist

- [ ] Update registry/types/server consistently (no drift).
- [ ] Add/adjust unit tests for boundaries, transitions, and concurrency.
- [ ] Keep call-sites using `getCurrentUserEntitlements()` as the gateway.
- [ ] Update `AGENTS.md` if the global policy changes.
