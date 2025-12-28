# Auth & User Lifecycle Audit - Findings Report

> **Audit Date:** 2025-12-28
> **Auditor:** Claude (Opus 4.5)
> **Status:** Read-Only Audit Complete - Awaiting Approval for Implementation

---

## Executive Summary

This audit examined the complete auth flow from sign-up through admin operations. The codebase has **solid fundamentals** but contains **several critical gaps** that can lead to user lockouts, state mismatches, and operational challenges.

### Risk Rating Summary

| Risk Level | Count | Description |
|------------|-------|-------------|
| **CRITICAL** | 3 | Can cause user lockouts or security issues |
| **HIGH** | 4 | Significant operational or UX issues |
| **MEDIUM** | 5 | Edge cases or missing features |
| **LOW** | 3 | Nice-to-have improvements |

---

## 1. CURRENT STATE INVENTORY

### 1.1 Authentication Entry Points

| File | Purpose | Key Finding |
|------|---------|-------------|
| `apps/web/proxy.ts:397-411` | Clerk middleware wrapper | Extracts `userId`, handles route protection |
| `apps/web/components/providers/ClientProviders.tsx:317-330` | ClerkProvider setup | Proper appearance config, proxy URL support |
| `apps/web/lib/auth/cached.ts` | Deduped auth calls | `getCachedAuth()`, `getCachedCurrentUser()` |
| `apps/web/lib/auth/session.ts` | RLS session setup | Sets `app.clerk_user_id` for Postgres RLS |

### 1.2 User Creation Paths

**Path 1: Claim Flow** (`apps/web/app/claim/[token]/page.tsx:132-143`)
```typescript
// Creates minimal user row without email
const [createdUser] = await db
  .insert(users)
  .values({
    clerkId: userId,
    email: null,  // <-- ISSUE: Email not captured
  })
  .returning({ id: users.id });
```

**Path 2: Onboarding** (`apps/web/app/onboarding/actions.ts:292-301`)
```typescript
// Uses stored function to create user + profile atomically
SELECT create_profile_with_user(
  ${clerkUserId},
  ${userEmail ?? null},
  ${normalizedUsername},
  ${trimmedDisplayName}
) AS profile_id
```

**Finding:** Two separate user creation paths with different data capture behavior.

### 1.3 Waitlist Flow

| Step | File | Status |
|------|------|--------|
| Submission | `apps/web/app/waitlist/page.tsx` | 3-step form, session-persisted |
| Storage | `waitlist_entries` table | status: new/invited/claimed/rejected |
| Approval | `apps/web/app/app/admin/waitlist/approve/route.ts` | Creates profile + invite |
| Invite Send | `apps/web/app/api/cron/waitlist-invites/route.ts` | Cron-based email delivery |
| Claim | `apps/web/app/claim/[token]/page.tsx` | Atomic claim with race protection |

### 1.4 Authorization Gating

**App Shell Gate** (`apps/web/app/app/layout.tsx:15-53`):
```typescript
async function ensureWaitlistAccess(): Promise<void> {
  const user = await getCachedCurrentUser();
  const emailRaw = user?.emailAddresses?.[0]?.emailAddress ?? null;

  if (!emailRaw) {
    redirect('/waitlist');  // <-- ISSUE: Blocks users without Clerk email
  }

  const access = await getWaitlistAccessByEmail(emailRaw);
  if (!access.status || access.status === 'new' || access.status === 'rejected') {
    redirect('/waitlist');  // <-- ISSUE: Email-only lookup
  }
}
```

**Admin Gate** (`apps/web/lib/admin/roles.ts:20-51`):
```typescript
export async function isAdmin(userId: string): Promise<boolean> {
  // Database-backed with 5-minute cache
  // Fails closed (returns false on error)
}
```

### 1.5 Current Data Model

**users table:**
```sql
- id (uuid, PK)
- clerk_id (text, unique, NOT NULL)
- email (text, unique)           -- Can be NULL
- is_admin (boolean, default false)
- is_pro (boolean, default false)
- stripe_customer_id (text, unique)
- deleted_at (timestamp)         -- Soft delete
- created_at, updated_at
```

**creator_profiles table:**
```sql
- id (uuid, PK)
- user_id (uuid, FK users.id, SET NULL on delete)
- username (text, NOT NULL)
- username_normalized (text, NOT NULL, unique)
- is_claimed (boolean, default false)
- claim_token (text)
- claim_token_expires_at (timestamp)
- onboarding_completed_at (timestamp)
- ...
```

**waitlist_entries table:**
```sql
- id (uuid, PK)
- email (text, NOT NULL)
- status (enum: new/invited/claimed/rejected)
- ...
```

**Missing Tables:**
- No `admin_audit_log` table
- No invite tracking separate from `waitlist_invites`

---

## 2. CRITICAL FINDINGS

### 2.1 [CRITICAL] Waitlist Gate Blocks Legitimate Users

**Location:** `apps/web/app/app/layout.tsx:15-53`, `apps/web/app/onboarding/page.tsx:32-46`

**Problem:** The app shell and onboarding page check waitlist access by email. Users can be blocked from their own dashboard if:
1. Their email changed in Clerk
2. Their email isn't in `waitlist_entries` (direct invite, admin-created)
3. They claimed a profile before waitlist system existed

**Impact:** User lockouts with no recovery path.

**Reproduction:**
1. Admin creates a user directly in DB with a profile
2. User signs in with Clerk
3. User blocked at waitlist gate (email not in waitlist_entries)

### 2.2 [CRITICAL] No Centralized Auth Gate Function

**Problem:** Authorization logic is scattered across:
- `proxy.ts` (route protection)
- `apps/web/app/app/layout.tsx` (waitlist gate)
- `apps/web/app/onboarding/page.tsx` (waitlist gate duplicate)
- `apps/web/app/claim/[token]/page.tsx` (claim gate)
- `apps/web/lib/admin/middleware.ts` (admin gate)

Each has slightly different logic, leading to:
- Code duplication
- Inconsistent behavior
- Difficult maintenance
- Potential bypass if one is updated but not others

### 2.3 [CRITICAL] Clerk User Exists But DB User Missing Not Fully Handled

**Location:** `apps/web/app/app/dashboard/actions.ts:146-163`

**Current Behavior:**
```typescript
if (!userData?.id) {
  // No user row yet - send to onboarding
  return { needsOnboarding: true, ... };
}
```

**Problem:** This path only triggers if user passes the waitlist gate first. But the waitlist gate checks by email, not by DB user existence.

**Scenario:**
1. User signs up in Clerk (no DB row yet)
2. User's email is NOT in waitlist_entries
3. User is redirected to `/waitlist` instead of being allowed to onboard

### 2.4 [HIGH] No Admin Impersonation Capability

**Finding:** No impersonation code exists (`grep` returned zero matches).

**Impact:**
- Admins cannot debug user issues
- Support requires asking users to share screens
- No way to reproduce user-specific bugs

### 2.5 [HIGH] Admin Bootstrap Not Documented or Repeatable

**Finding:** Admin role is granted via:
1. Direct DB update: `UPDATE users SET is_admin = true WHERE clerk_id = '...'`
2. API endpoint: `POST /api/admin/roles` (requires existing admin)

**Problem:** No seed script, no bootstrap command, no environment-specific configuration.

**Impact:** First admin must be manually SQL-injected per environment.

### 2.6 [HIGH] DB User Creation Path Inconsistency

**Finding:** Two creation paths with different behavior:

| Path | Email Captured? | Profile Created? |
|------|-----------------|------------------|
| Claim page | NO | Links to existing |
| Onboarding | YES | Creates new |

**Problem:** Users who claim first may never have their email in the `users` table.

### 2.7 [HIGH] Waitlist Status Not Updated After Claim (Edge Case)

**Location:** `apps/web/app/claim/[token]/page.tsx:212-231`

**Current Code:**
```typescript
if (waitlistInvite) {
  try {
    await db.update(waitlistEntries)
      .set({ status: 'claimed', updatedAt: now })
      .where(and(
        eq(waitlistEntries.id, waitlistInvite.waitlistEntryId),
        eq(waitlistEntries.status, 'invited')  // Only updates if 'invited'
      ));
  } catch (error) {
    // Silently ignores errors in production
  }
}
```

**Problem:** If `waitlistInvite` is null (profile claimed without invite), waitlist entry stays as 'invited' forever.

### 2.8 [MEDIUM] No Clerk Metadata Mirroring

**Finding:** App never writes `role` or `status` to Clerk metadata.

**Impact:**
- Clerk dashboard shows no app-specific info
- No way to query users by role in Clerk
- Customer support tools (Clerk dashboard) less useful

### 2.9 [MEDIUM] DB User Deleted But Clerk User Exists

**Finding:** Soft delete sets `users.deleted_at` but:
- Clerk user continues to exist
- No webhook to sync deletion
- Deleted user can still sign in

**Location:** `apps/web/app/claim/[token]/page.tsx:122-130` has a check but only for claim flow.

### 2.10 [MEDIUM] No Admin Audit Log Table

**Finding:** Admin actions are logged to console/Sentry but no persistent audit trail.

**Impact:**
- No accountability trail
- Cannot answer "who did what when"
- Compliance gaps

### 2.11 [MEDIUM] Preview Environment Strategy Undocumented

**Finding:**
- Neon branching mentioned but not automated
- Clerk keys per environment exist (inferred from `.env.example`)
- No seed script for preview environments

### 2.12 [MEDIUM] E2E Tests Depend on External Clerk State

**Location:** `apps/web/tests/helpers/clerk-auth.ts:52-55`

```typescript
// If sign-in fails, create a new user
const signUp = await clerk.signUp?.create({
  emailAddress: targetEmail,
});
```

**Problem:** E2E tests create real Clerk users, polluting the Clerk instance.

---

## 3. CURRENT STATE DIAGRAM

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                      SIGN UP/IN                              │
                                    │  User → Clerk (OTP/OAuth) → Session Cookie                  │
                                    └─────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                    proxy.ts                                  │
                                    │  Extract userId from Clerk session                          │
                                    │  Route protection for /app/*, /waitlist, /billing, etc.    │
                                    └─────────────────────────────────────────────────────────────┘
                                                              │
                              ┌────────────────┬──────────────┴───────────────┬─────────────────┐
                              ▼                ▼                              ▼                 ▼
                    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐ ┌─────────────────┐
                    │   /waitlist     │ │  /claim/[token] │ │    /onboarding      │ │    /app/*       │
                    │                 │ │                 │ │                     │ │                 │
                    │ Submit waitlist │ │ Claim profile   │ │ Complete profile    │ │ App shell gate  │
                    │ entry           │ │                 │ │ setup               │ │                 │
                    └─────────────────┘ └─────────────────┘ └─────────────────────┘ └─────────────────┘
                              │                │                      │                     │
                              │                │                      │                     │
                              ▼                ▼                      ▼                     ▼
                    ┌─────────────────────────────────────────────────────────────────────────────────┐
                    │                           WAITLIST GATE (BY EMAIL)                              │
                    │  Get email from Clerk → Query waitlist_entries by email                        │
                    │  If status = 'new'/'rejected'/null → redirect /waitlist                        │
                    │  If status = 'invited' → redirect /claim/{token}                               │
                    │  If status = 'claimed' → proceed                                               │
                    └─────────────────────────────────────────────────────────────────────────────────┘
                                                              │
                    ┌────────────────────────────────────────┴────────────────────────────────────────┐
                    │                          GAPS / EDGE CASES                                      │
                    │  - DB user may not exist yet (Clerk user exists but no users row)              │
                    │  - User email changed in Clerk → can't find waitlist entry                     │
                    │  - Profile claimed but waitlist entry not updated                              │
                    │  - Admin-created users bypass waitlist entirely                                │
                    └─────────────────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
                    ┌─────────────────────────────────────────────────────────────────────────────────┐
                    │                         DASHBOARD DATA CHECK                                    │
                    │  Query users by clerk_id → if no row → needsOnboarding: true                   │
                    │  Query creator_profiles by user.id → if none → needsOnboarding: true           │
                    │  Check profileIsPublishable() → if false → needsOnboarding: true               │
                    └─────────────────────────────────────────────────────────────────────────────────┘
                                                              │
                              ┌───────────────────────────────┴───────────────────────────────┐
                              │                                                               │
                    needsOnboarding: true                                         needsOnboarding: false
                              │                                                               │
                              ▼                                                               ▼
                    ┌─────────────────────┐                                       ┌─────────────────────┐
                    │   /onboarding       │                                       │  /app/dashboard     │
                    │                     │                                       │                     │
                    │ Create user + profile│                                       │ Show dashboard      │
                    │ via stored function │                                       │                     │
                    └─────────────────────┘                                       └─────────────────────┘
```

---

## 4. TARGET ARCHITECTURE SPEC

### 4.1 Centralized Auth Gate Function

**Proposed Design:**

```typescript
// lib/auth/gate.ts

export enum UserState {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  NEEDS_DB_USER = 'NEEDS_DB_USER',
  NEEDS_WAITLIST_SUBMISSION = 'NEEDS_WAITLIST_SUBMISSION',
  WAITLIST_PENDING = 'WAITLIST_PENDING',
  WAITLIST_INVITED = 'WAITLIST_INVITED',
  NEEDS_ONBOARDING = 'NEEDS_ONBOARDING',
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
  ADMIN = 'ADMIN',
}

export interface AuthGateResult {
  state: UserState;
  clerkUserId: string | null;
  dbUserId: string | null;
  profileId: string | null;
  redirectTo: string | null;
  context: {
    isAdmin: boolean;
    isPro: boolean;
    claimToken?: string;
    email?: string;
  };
}

export async function resolveUserState(clerkUserId: string | null): Promise<AuthGateResult> {
  // 1. If no clerkUserId → UNAUTHENTICATED
  // 2. Query DB user by clerk_id
  //    - If no DB user → NEEDS_DB_USER (create baseline row)
  //    - If banned → BANNED
  // 3. Query creator_profiles by user_id
  //    - If no profile → check waitlist by email OR clerk_id
  //    - If invited → WAITLIST_INVITED
  //    - If profile exists but incomplete → NEEDS_ONBOARDING
  // 4. If profile complete → ACTIVE or ADMIN

  // Single source of truth - all redirects derive from this
}
```

### 4.2 Proposed Schema Adjustments

**users table additions:**
```sql
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'banned', 'pending'));
ALTER TABLE users ADD COLUMN waitlist_entry_id UUID REFERENCES waitlist_entries(id);
```

**New admin_audit_log table:**
```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_audit_admin_id ON admin_audit_log(admin_user_id);
CREATE INDEX idx_audit_target_id ON admin_audit_log(target_user_id);
CREATE INDEX idx_audit_created ON admin_audit_log(created_at DESC);
```

### 4.3 Clerk Metadata Mirroring

**Mirror these fields to Clerk publicMetadata (read-only cache):**
- `jovie_role`: 'user' | 'admin'
- `jovie_status`: 'active' | 'pending' | 'banned'
- `jovie_has_profile`: boolean

**Implementation:**
```typescript
// Sync on DB change - server-only
async function syncClerkMetadata(userId: string, data: {
  role?: string;
  status?: string;
  hasProfile?: boolean;
}) {
  await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: {
      jovie_role: data.role,
      jovie_status: data.status,
      jovie_has_profile: data.hasProfile,
    },
  });
}
```

### 4.4 Secure Admin Impersonation Design

```typescript
// API: POST /api/admin/impersonate
// Creates short-lived JWT stored in httpOnly cookie

interface ImpersonationToken {
  realAdminUserId: string;
  effectiveUserId: string;
  issuedAt: number;
  expiresAt: number;  // 15 minutes max
}

// Resolution logic:
function getCurrentUser(request: Request): { userId: string; isImpersonating: boolean } {
  const impersonationCookie = request.cookies.get('jovie_impersonate');
  if (impersonationCookie) {
    const token = verifyImpersonationToken(impersonationCookie.value);
    if (token && token.expiresAt > Date.now()) {
      return { userId: token.effectiveUserId, isImpersonating: true };
    }
  }
  return { userId: clerkUserId, isImpersonating: false };
}
```

### 4.5 Admin Bootstrap Procedure

```bash
# scripts/bootstrap-admin.ts
# Usage: pnpm admin:bootstrap <clerk_user_id>

# 1. Ensure DB user exists
# 2. Set is_admin = true
# 3. Sync to Clerk metadata
# 4. Log the action
```

---

## 5. IMPLEMENTATION PLAN

### PR0: Documentation (THIS PR)
- [x] Create `/docs/agent-auth-audit-prompt.md`
- [ ] Create `/docs/auth-lifecycle-audit-findings.md` (this file)

### PR1: Schema Hardening
**Files:**
- `apps/web/drizzle/migrations/00XX_auth_hardening.sql`
- `apps/web/lib/db/schema.ts`

**Changes:**
- Add `status` column to users table
- Add `waitlist_entry_id` FK to users table
- Create `admin_audit_log` table
- Add appropriate indexes

**Tests:** Migration rollback test
**Rollback:** Down migration script

### PR2: Centralized Auth Gate
**Files:**
- `apps/web/lib/auth/gate.ts` (NEW)
- `apps/web/app/app/layout.tsx`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/claim/[token]/page.tsx`

**Changes:**
- Implement `resolveUserState()` function
- Replace scattered auth checks with single gate
- Ensure DB user creation on first auth request

**Tests:**
- Unit tests for each UserState transition
- E2E test for user lockout scenarios

**Rollback:** Feature flag to fall back to old logic

### PR3: Clerk Metadata Sync
**Files:**
- `apps/web/lib/auth/clerk-sync.ts` (NEW)
- `apps/web/app/api/clerk/webhook/route.ts`
- `apps/web/app/onboarding/actions.ts`
- `apps/web/lib/admin/roles.ts`

**Changes:**
- Sync role/status to Clerk on DB change
- Add webhook handler for Clerk → DB sync (user.deleted)

**Tests:** Integration tests for sync bidirectionality

### PR4: Admin Impersonation
**Files:**
- `apps/web/lib/admin/impersonation.ts` (NEW)
- `apps/web/app/api/admin/impersonate/route.ts` (NEW)
- `apps/web/components/admin/ImpersonationBanner.tsx` (NEW)

**Changes:**
- Impersonation token generation/verification
- httpOnly cookie management
- UI banner when impersonating
- Audit logging for all impersonation sessions

**Tests:** Security tests for token validation, expiry, privilege escalation

### PR5: Preview Environment Hardening
**Files:**
- `scripts/bootstrap-preview.sh` (NEW)
- `scripts/bootstrap-admin.ts` (NEW)
- `.github/workflows/preview.yml`

**Changes:**
- Neon branch creation automation
- Admin bootstrap script
- E2E test user isolation

### PR6: Documentation & Cleanup
**Files:**
- `docs/auth-and-user-lifecycle.md` (NEW)
- `docs/admin-operations.md` (NEW)

**Contents:**
- State machine diagram
- Admin bootstrap procedures
- Impersonation policy
- Incident response runbook

---

## 6. EDGE CASE CHECKLIST

| Edge Case | Current Handling | Proposed Fix |
|-----------|-----------------|--------------|
| Clerk user exists, DB user missing | Partial (blocked at waitlist gate if email not found) | Create DB user on first authenticated request |
| DB user exists, Clerk user deleted | Not handled | Webhook to soft-delete DB user |
| OAuth account linking collisions | Clerk handles | Document expected behavior |
| OTP concurrency | Clerk handles | Document expected behavior |
| Invite token replay | Handled (token nulled after use) | Add to audit log |
| Invite token expiry | Handled (30-day expiry) | OK |
| Waitlist spam | Rate limited | OK |
| Partial onboarding | Redirects to onboarding | OK |
| Admin panel CSRF | Not verified | Add CSRF tokens |
| Sign-out during impersonation | Not applicable | Clear impersonation cookie |
| Preview env resets | Not automated | PR5 |
| E2E determinism | Flaky (shared Clerk state) | PR5 |

---

## 7. QUESTIONS FOR STAKEHOLDERS

Before proceeding with implementation, please clarify:

1. **Multi-profile support:** Current code enforces 1 user : 1 claimed profile. Should this change?

2. **Admin impersonation in prod:** Should this be enabled by default or require explicit opt-in?

3. **Waitlist bypass:** Should admins be able to create users who bypass waitlist entirely?

4. **Email change handling:** If a user changes their email in Clerk, should we:
   - a) Update the DB user email automatically?
   - b) Keep them matched to their original waitlist entry?
   - c) Something else?

5. **Soft delete behavior:** When a user is soft-deleted:
   - Should their profile remain visible but uneditable?
   - Should their profile be hidden?
   - Should their Clerk account be deleted?

---

*End of Audit Report*
