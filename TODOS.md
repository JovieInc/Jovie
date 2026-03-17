# TODOs

## Admin-gated items in user-facing menus

**What:** Add `isAdmin`-gated admin actions (refresh ingest, verify, feature, marketing toggle) to dashboard profile action builders so admins can manage their own profile without navigating to admin tables.

**Why:** Currently admins must switch to the admin creator profiles table to perform actions like refresh ingest or verify on their own profile. This breaks the "same actions everywhere" pattern established in the action menu consolidation PR.

**Context:** `useDashboardData().isAdmin` is already available client-side in all dashboard contexts. Server endpoints for admin actions already have auth checks. The gap is identifying which dashboard views show the user's own creator profile and wiring an `isAdmin` option into the action builder for those views.

**Depends on:** Action menu consolidation PR (Phases 1-3) must land first.
