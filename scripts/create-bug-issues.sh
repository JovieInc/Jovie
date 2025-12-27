#!/bin/bash
# Script to create GitHub issues for all 25 critical bugs
# Run this script from the Jovie repository root with gh CLI installed and authenticated
# Usage: ./scripts/create-bug-issues.sh

set -e

REPO="JovieInc/Jovie"

echo "Creating 25 bug issues for $REPO..."
echo ""

# Bug 1: Silent failure in payment success webhook
gh issue create --repo "$REPO" \
  --title "[BUG] Silent failure in payment success webhook - users pay but don't get Pro status" \
  --label "bug,priority:critical,area:payments" \
  --body "## Bug Description
The \`handlePaymentSucceeded\` function catches errors but does NOT re-throw them. If any error occurs while updating the user's billing status, the webhook will still be marked as processed successfully by Stripe.

## File Location
\`apps/web/app/api/stripe/webhooks/route.ts\` (Lines 483-525)

## Code
\`\`\`typescript
catch (error) {
  await captureCriticalError('Error handling payment success webhook', error, {...});
  // BUG: No re-throw - Stripe thinks webhook succeeded
}
\`\`\`

## Impact
- **CRITICAL**: Users pay but never receive Pro status
- Revenue is collected but service not delivered
- No webhook retries from Stripe

## Suggested Fix
Add \`throw error;\` after logging to ensure Stripe retries failed webhooks.

## Priority
- Importance: CRITICAL
- Difficulty: Easy"

echo "Created issue 1/25"

# Bug 2: Payment failed webhook doesn't downgrade users
gh issue create --repo "$REPO" \
  --title "[BUG] Payment failed webhook doesn't downgrade users - failed payments keep Pro access" \
  --label "bug,priority:critical,area:payments" \
  --body "## Bug Description
The \`handlePaymentFailed\` function silently returns if subscription retrieval fails or userId is missing. Users who should be downgraded continue having Pro access.

## File Location
\`apps/web/app/api/stripe/webhooks/route.ts\` (Lines 527-617)

## Impact
- **CRITICAL**: Users with failed payments keep Pro features indefinitely
- Direct revenue loss
- No alerting or retry on failure

## Suggested Fix
Add error re-throwing and explicit handling for missing userId scenarios.

## Priority
- Importance: CRITICAL
- Difficulty: Easy"

echo "Created issue 2/25"

# Bug 3: Race condition in audience member upsert
gh issue create --repo "$REPO" \
  --title "[BUG] Race condition in audience member upsert causes data loss" \
  --label "bug,priority:critical,area:database" \
  --body "## Bug Description
When \`onConflictDoNothing\` fails to insert, the code tries to fetch the conflicting record, but another transaction could delete it in between.

## File Location
\`apps/web/app/api/audience/click/route.ts\` (Lines 256-296)

## Code
\`\`\`typescript
if (!inserted) {
  member = await findAudienceMember(tx, profileId, fingerprint);
  // Race: record could be deleted between conflict and this SELECT
}
if (!member) {
  throw new Error('Unable to resolve audience member'); // This can happen!
}
\`\`\`

## Impact
- **CRITICAL**: Analytics data loss during high-traffic periods
- API errors (500s) for end users
- Unreliable click tracking

## Suggested Fix
Use \`INSERT ... ON CONFLICT DO UPDATE\` instead of \`DO NOTHING\` to guarantee a row is returned.

## Priority
- Importance: CRITICAL
- Difficulty: Medium"

echo "Created issue 3/25"

# Bug 4: Race condition in track API upsert
gh issue create --repo "$REPO" \
  --title "[BUG] Race condition in track API upsert - same pattern as audience click" \
  --label "bug,priority:critical,area:database" \
  --body "## Bug Description
Same race condition pattern as the audience click handler. The fallback SELECT after \`onConflictDoNothing\` can return null.

## File Location
\`apps/web/app/api/track/route.ts\` (Lines 185-247)

## Impact
- **CRITICAL**: Click tracking fails
- Analytics gaps
- Potential 500 errors for users

## Suggested Fix
Use upsert pattern that guarantees row return.

## Priority
- Importance: CRITICAL
- Difficulty: Medium"

echo "Created issue 4/25"

# Bug 5: Fire-and-forget social link click update
gh issue create --repo "$REPO" \
  --title "[BUG] Fire-and-forget social link click update causes inconsistent analytics" \
  --label "bug,priority:critical,area:database" \
  --body "## Bug Description
Social link click counter is updated OUTSIDE the transaction with \`void socialLinkUpdate\` - never awaited.

## File Location
\`apps/web/app/api/track/route.ts\` (Lines 327-350)

## Code
\`\`\`typescript
const socialLinkUpdate = linkType === 'social' ? db.update(...).catch(...) : null;
if (socialLinkUpdate) {
  void socialLinkUpdate; // Fire-and-forget!
}
\`\`\`

## Impact
- **CRITICAL**: Click counts become inconsistent with actual click events
- Analytics unreliable for creators
- Silent failures

## Suggested Fix
Move update inside the transaction and await it.

## Priority
- Importance: CRITICAL
- Difficulty: Easy"

echo "Created issue 5/25"

# Bug 6: Orphaned Stripe customers on concurrent updates
gh issue create --repo "$REPO" \
  --title "[BUG] Orphaned Stripe customers created on concurrent updates" \
  --label "bug,priority:high,area:payments" \
  --body "## Bug Description
After creating a Stripe customer, if the optimistic locking update fails, the function returns success anyway. Customer is created in Stripe but not linked to database.

## File Location
\`apps/web/lib/stripe/customer-sync.ts\` (Lines 154-198)

## Impact
- **HIGH**: Orphaned Stripe customers
- Billing issues on retry
- Potential double charges

## Suggested Fix
Return error on optimistic lock failure or implement cleanup of orphaned customer.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 6/25"

# Bug 7: Module-level CRON_SECRET capture
gh issue create --repo "$REPO" \
  --title "[BUG] Module-level CRON_SECRET capture causes all cron jobs to fail" \
  --label "bug,priority:critical,area:cron" \
  --body "## Bug Description
\`\`\`typescript
const CRON_SECRET = process.env.CRON_SECRET; // Captured at module load
\`\`\`

If \`CRON_SECRET\` is undefined at cold start (before env injection), ALL cron requests fail authorization permanently for the lifetime of the Lambda function.

## File Location
\`apps/web/app/api/cron/waitlist-invites/route.ts\` (Line 14)
Also affects other cron routes.

## Impact
- **CRITICAL**: All cron jobs fail silently
- Waitlist invites never sent
- Cleanup jobs never run
- Billing reconciliation never runs

## Suggested Fix
Read \`process.env.CRON_SECRET\` inside the handler function, not at module level.

## Priority
- Importance: CRITICAL
- Difficulty: Easy"

echo "Created issue 7/25"

# Bug 8: Missing userId handling in payment success
gh issue create --repo "$REPO" \
  --title "[BUG] Missing userId handling in payment success webhook" \
  --label "bug,priority:high,area:payments" \
  --body "## Bug Description
When \`userId\` is undefined (missing metadata on subscription), the function silently returns without processing.

## File Location
\`apps/web/app/api/stripe/webhooks/route.ts\` (Lines 499-512)

## Impact
- **HIGH**: Subscriptions without proper metadata never update the user's status
- Users pay but don't get Pro
- No error alerting

## Suggested Fix
Log critical error and throw when userId is missing to trigger webhook retry/alerting.

## Priority
- Importance: HIGH
- Difficulty: Easy"

echo "Created issue 8/25"

# Bug 9: Race condition in waitlist invites rate limiting
gh issue create --repo "$REPO" \
  --title "[BUG] Race condition in waitlist invites rate limiting" \
  --label "bug,priority:high,area:cron" \
  --body "## Bug Description
Rate limit check happens OUTSIDE the database transaction. Two concurrent cron instances can both pass the rate limit check.

## File Location
\`apps/web/app/api/cron/waitlist-invites/route.ts\` (Lines 88-168)

## Impact
- **HIGH**: Exceeded rate limits
- Users may receive duplicate invites
- Email provider rate limits exceeded

## Suggested Fix
Move rate limit check inside transaction with row locking.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 9/25"

# Bug 10: Missing concurrent execution prevention in billing reconciliation
gh issue create --repo "$REPO" \
  --title "[BUG] Missing concurrent execution prevention in billing reconciliation" \
  --label "bug,priority:high,area:cron" \
  --body "## Bug Description
No distributed lock or idempotency check to prevent concurrent execution.

## File Location
\`apps/web/app/api/cron/billing-reconciliation/route.ts\` (Lines 70-141)

## Impact
- **HIGH**: Same users processed multiple times
- Unnecessary Stripe API calls
- Potential data inconsistencies

## Suggested Fix
Implement distributed locking or job status tracking.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 10/25"

# Bug 11: Admin role cache race condition
gh issue create --repo "$REPO" \
  --title "[BUG] Admin role cache race condition allows access after demotion" \
  --label "bug,priority:high,area:auth" \
  --body "## Bug Description
5-minute cache TTL means demoted admins retain access for up to 5 minutes after demotion.

## File Location
\`apps/web/lib/admin/roles.ts\` (Lines 10-27)

## Impact
- **HIGH**: Unauthorized admin access after permission revocation
- Security concern for privilege escalation

## Suggested Fix
Reduce TTL or implement cache invalidation on role change.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 11/25"

# Bug 12: Missing RLS session setup in non-transaction context
gh issue create --repo "$REPO" \
  --title "[BUG] Missing RLS session setup in non-transaction context" \
  --label "bug,priority:high,area:auth,area:database" \
  --body "## Bug Description
\`setSessionUser()\` uses \`SET LOCAL\` (transaction-scoped) inconsistently with session-scoped \`set_config()\`.

## File Location
\`apps/web/lib/db/index.ts\` (Lines 335-345)

## Impact
- **HIGH**: Potential unauthorized data access if RLS bypassed
- Security vulnerability

## Suggested Fix
Standardize on session-scoped \`set_config()\` for all RLS setup.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 12/25"

# Bug 13: Orphaned blobs on avatar update
gh issue create --repo "$REPO" \
  --title "[BUG] Orphaned blobs on avatar update - previous avatars never deleted" \
  --label "bug,priority:high,area:storage" \
  --body "## Bug Description
When users upload new avatars, previous blobs are never deleted from Vercel Blob storage.

## File Location
\`apps/web/app/api/images/upload/route.ts\` (Lines 411-481)

## Impact
- **HIGH**: Storage quota exhaustion
- Unnecessary storage costs
- Orphaned files accumulate indefinitely

## Suggested Fix
Query for existing avatar URL before update, delete old blob after successful update.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 13/25"

# Bug 14: No previous avatar cleanup on dashboard profile update
gh issue create --repo "$REPO" \
  --title "[BUG] No previous avatar cleanup on dashboard profile update" \
  --label "bug,priority:high,area:storage" \
  --body "## Bug Description
Same orphaned blob issue when updating avatar via the dashboard profile endpoint.

## File Location
\`apps/web/app/api/dashboard/profile/route.ts\` (Lines 388-405)

## Impact
- **HIGH**: Orphaned blobs
- Storage costs accumulate

## Suggested Fix
Retrieve old avatar URL before update, delete old blob after successful update.

## Priority
- Importance: HIGH
- Difficulty: Medium"

echo "Created issue 14/25"

# Bug 15: past_due/unpaid status blocks checkout
gh issue create --repo "$REPO" \
  --title "[BUG] past_due/unpaid status blocks checkout - users can't fix billing" \
  --label "bug,priority:high,area:payments" \
  --body "## Bug Description
Users with \`past_due\` or \`unpaid\` subscriptions are blocked from creating new checkout sessions to fix their billing.

## File Location
\`apps/web/app/api/stripe/checkout/route.ts\` (Lines 80-85)

## Code
\`\`\`typescript
const activeSubscriptionStatuses = new Set([
  'active', 'trialing', 'past_due', 'unpaid' // Blocks these users from checkout!
]);
\`\`\`

## Impact
- **HIGH**: Users can't pay overdue bills
- Churn increases
- Revenue lost

## Suggested Fix
Remove \`past_due\` and \`unpaid\` from blocking statuses or redirect to billing portal.

## Priority
- Importance: HIGH
- Difficulty: Easy"

echo "Created issue 15/25"

# Bug 16: Duplicate tip processing silently ignored
gh issue create --repo "$REPO" \
  --title "[BUG] Duplicate tip processing silently ignored without proper logging" \
  --label "bug,priority:medium,area:payments" \
  --body "## Bug Description
Duplicate tips are silently ignored with only \`console.log\`. No way to distinguish legitimate duplicates from system failures.

## File Location
\`apps/web/app/api/capture-tip/route.ts\` (Lines 93-112)

## Impact
- **MEDIUM**: Can't distinguish between legitimate duplicates and failures
- Missing observability

## Suggested Fix
Use structured logging with event type to distinguish scenarios.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 16/25"

# Bug 17: Missing transaction isolation for handle availability
gh issue create --repo "$REPO" \
  --title "[BUG] Missing transaction isolation for handle availability check" \
  --label "bug,priority:medium,area:database" \
  --body "## Bug Description
Handle availability check doesn't use transaction, allowing race conditions during profile creation.

## File Location
\`apps/web/app/api/handle/check/route.ts\` (Lines 205-210)

## Impact
- **MEDIUM**: Race conditions during onboarding
- Two users could claim same handle briefly

## Suggested Fix
Wrap check in serializable transaction or rely on unique constraint with proper error handling.

## Priority
- Importance: MEDIUM
- Difficulty: Medium"

echo "Created issue 17/25"

# Bug 18: Idempotency key storage failure not retried
gh issue create --repo "$REPO" \
  --title "[BUG] Idempotency key storage failure not retried" \
  --label "bug,priority:medium,area:database" \
  --body "## Bug Description
Idempotency key insert failures are only logged, never retried. This can cause duplicate operations on retry.

## File Location
\`apps/web/app/api/dashboard/social-links/route.ts\` (Lines 147-152)

## Impact
- **MEDIUM**: Lost idempotency guarantees
- Potential duplicate operations

## Suggested Fix
Consider storing idempotency key before operation, not after.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 18/25"

# Bug 19: Memory leaks - setTimeout without cleanup in onboarding
gh issue create --repo "$REPO" \
  --title "[BUG] Memory leak - setTimeout without cleanup in AppleStyleOnboardingForm" \
  --label "bug,priority:medium,area:frontend" \
  --body "## Bug Description
\`setTimeout\` used in \`goToNextStep\` and \`goToPreviousStep\` without storing timeout ID or cleanup on unmount.

## File Location
\`apps/web/components/dashboard/organisms/AppleStyleOnboardingForm.tsx\` (Lines 149-167)

## Impact
- **MEDIUM**: Memory leaks
- 'setState on unmounted component' warnings
- Potential React errors

## Suggested Fix
Store timeout IDs in refs and clear them in useEffect cleanup.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 19/25"

# Bug 20: Memory leaks - nested setTimeout in modal
gh issue create --repo "$REPO" \
  --title "[BUG] Memory leak - nested setTimeout in DashboardFeedbackModal" \
  --label "bug,priority:medium,area:frontend" \
  --body "## Bug Description
Multiple nested \`setTimeout\` calls (2000ms + 300ms) without cleanup on unmount.

## File Location
\`apps/web/components/dashboard/organisms/DashboardFeedbackModal.tsx\` (Lines 44-72)

## Impact
- **MEDIUM**: Memory leaks
- State updates on unmounted component

## Suggested Fix
Store timeout IDs and clear on unmount.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 20/25"

# Bug 21: Timer refs not cleaned on unmount
gh issue create --repo "$REPO" \
  --title "[BUG] Timer refs not cleaned on unmount in ListenNowForm" \
  --label "bug,priority:medium,area:frontend" \
  --body "## Bug Description
\`useRef\` timers stored but no \`useEffect\` cleanup function to clear them on unmount.

## File Location
\`apps/web/components/dashboard/organisms/ListenNowForm.tsx\` (Lines 29-46)

## Impact
- **MEDIUM**: Memory leaks
- Potential setState on unmounted component

## Suggested Fix
Add useEffect cleanup that clears all timers stored in ref.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 21/25"

# Bug 22: Stack trace information disclosure
gh issue create --repo "$REPO" \
  --title "[BUG] Stack trace information disclosure in health/auth endpoint" \
  --label "bug,priority:medium,area:security" \
  --body "## Bug Description
Error stack traces leaked in API responses, revealing internal file paths and system details.

## File Location
\`apps/web/app/api/health/auth/route.ts\` (Line 76)

## Impact
- **MEDIUM**: Information disclosure aids attackers
- Exposes internal file structure

## Suggested Fix
Never return \`error.stack\` in responses; log it server-side only.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 22/25"

# Bug 23: Clerk webhook returns 200 on failure
gh issue create --repo "$REPO" \
  --title "[BUG] Clerk webhook returns 200 on failure - prevents retries" \
  --label "bug,priority:medium,area:auth" \
  --body "## Bug Description
Returns HTTP 200 on processing failure, preventing Clerk from retrying failed webhooks.

## File Location
\`apps/web/app/api/clerk/webhook/route.ts\` (Lines 155-163)

## Impact
- **MEDIUM**: Failed user syncs never retried
- Users may have incomplete profiles

## Suggested Fix
Return 500 on failure to trigger webhook retry.

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 23/25"

# Bug 24: Timing attack on CRON_SECRET
gh issue create --repo "$REPO" \
  --title "[BUG] Timing attack vulnerability on CRON_SECRET validation" \
  --label "bug,priority:medium,area:security" \
  --body "## Bug Description
Multiple cron files use simple string comparison (\`===\`) instead of \`crypto.timingSafeEqual\` for secret validation.

## File Location
Multiple cron files:
- \`app/api/cron/billing-reconciliation/route.ts\`
- \`app/api/cron/cleanup-photos/route.ts\`
- \`app/api/cron/cleanup-idempotency-keys/route.ts\`
- \`app/api/cron/waitlist-invites/route.ts\`

## Impact
- **MEDIUM**: Attackers can infer secret character-by-character via timing analysis

## Suggested Fix
Use \`crypto.timingSafeEqual\` for all secret validation (see \`data-retention/route.ts\` for correct implementation).

## Priority
- Importance: MEDIUM
- Difficulty: Easy"

echo "Created issue 24/25"

# Bug 25: Non-atomic blob+DB deletion in cleanup
gh issue create --repo "$REPO" \
  --title "[BUG] Non-atomic blob+DB deletion in cleanup cron" \
  --label "bug,priority:medium,area:cron" \
  --body "## Bug Description
Blobs deleted first, then individual DB delete queries executed without transaction wrapping.

## File Location
\`apps/web/app/api/cron/cleanup-photos/route.ts\` (Lines 93-120)

## Impact
- **MEDIUM**: Orphaned records if any delete fails mid-loop
- Data inconsistency

## Suggested Fix
Delete DB records in batch transaction, then delete blobs. Or reverse order with proper error handling.

## Priority
- Importance: MEDIUM
- Difficulty: Medium"

echo "Created issue 25/25"

echo ""
echo "✅ All 25 bug issues created successfully!"
echo ""
echo "View issues at: https://github.com/$REPO/issues"
