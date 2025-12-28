# Auth & User Lifecycle Audit Prompt

> **Canonical prompt for comprehensive authentication and user lifecycle audits**
>
> This document contains the complete prompt used to initiate security and correctness audits of the Jovie authentication system.

---

You are an expert staff-level Next.js + Clerk + Drizzle/Neon engineer and security reviewer. You have full read access to this repository AND the ability to open pull requests. The app is Next.js 16 (uses proxy.ts, not middleware.ts), Drizzle + DrizzleKit, Neon, Turborepo, GitHub CI with E2E tests using Clerk test users. Auth is fully passwordless (OTP and/or OAuth: Google + Spotify). We have a custom waitlist + onboarding flow (not using Clerk waitlist). We have an admin panel that can accept users off the waitlist and email invites.

IMPORTANT PROCESS CONSTRAINTS (MANDATORY)
1) You MUST begin in **read-only mode**:
   - Perform a full audit and produce a written plan FIRST.
   - Do NOT open or modify any PRs until the audit + target spec + implementation plan are approved.
2) As part of your FIRST deliverable, you MUST:
   - Create and commit a new file at `/docs/agent-auth-audit-prompt.md`
   - Populate it with THIS ENTIRE PROMPT verbatim.
   - Open a PR containing ONLY this documentation change.
   - Title the PR: `docs: add canonical auth & user lifecycle audit prompt`
   - Do not bundle any code changes in this PR.

Only after that PR is merged should you proceed with implementation PRs (PR1, PR2, etc.).

GOAL
Audit the entire auth → waitlist → acceptance → onboarding → active usage → admin flows for correctness, security, and environment repeatability. Identify every edge case or mismatch between Clerk identity state and Neon application state. Produce a concrete implementation plan and (where feasible) a PR-style set of changes:
- Centralize routing/gating logic so users never loop or end up in impossible states.
- Ensure "Clerk user exists but DB user missing" is handled deterministically.
- Define canonical sources of truth (DB vs Clerk metadata) and implement read-only mirroring into Clerk.
- Implement secure admin impersonation (no backdoor).
- Make preview environments reproducible (Neon branches + Clerk separation).
- Make E2E tests stable and environment-agnostic.
- Document operational procedures (admin bootstrap, env creation, reset, test users).

CONSTRAINTS / REQUIREMENTS
- Source of truth for authorization and product state must be Neon (DB). Clerk is identity provider only.
- You may mirror a limited set of read-only flags into Clerk (e.g., role, status) but enforcement must remain server-side.
- Must not introduce security backdoors. Any dev/test-only helpers must be hard-gated to non-prod and impossible to enable in prod by mistake.
- Must support: sign-up, sign-in, OTP, OAuth, sign-out, account linking (if applicable), email verification behavior, and passwordless "reset" semantics.
- Must support E2E: ability to run full flows including admin features across preview environments.
- Next.js 16 + proxy.ts means you must account for Clerk integration patterns for that setup.

DELIVERABLES

1) CURRENT STATE INVENTORY (repo audit)
   - Identify all entry points and flow control code for:
     - auth callbacks / session retrieval
     - "create user in DB" logic (if any)
     - waitlist submission, waitlist status checks
     - acceptance/invite flow and email sending
     - onboarding steps and completion markers
     - admin panel authz and capabilities
     - any redirect logic in pages, layouts, server actions, route handlers
     - sign-out, OTP/OAuth callback edge cases
   - Map current data model:
     - tables, columns, enums, constraints, relations
     - which fields represent: role, status, onboarding state, waitlist state, invite tokens
   - List all known or likely failure modes:
     - loops, state mismatches, missing rows, stale users after DB resets, etc.
   - Provide a state diagram of current behavior (even if flawed).

2) TARGET ARCHITECTURE SPEC

   A. CANONICAL DATA MODEL (Neon / Drizzle)
   Propose/adjust schema to support a clean state machine:
     - users table:
       - id (uuid), clerk_user_id (unique), primary_email, created_at
       - role (enum: user/admin)
       - status (enum: waitlisted/accepted/active/banned)
       - onboarding_state or onboarding_completed_at
       - updated_at
     - waitlist table (or embedded structure):
       - submission answers, submitted_at, verified_at
     - invites table:
       - token, email, issued_by_user_id, issued_at, accepted_at, expires_at, revoked_at
     - admin_audit_log table:
       - admin_user_id, target_user_id, action, metadata, timestamp, ip/user_agent
   Ensure constraints prevent impossible states.

   B. CENTRALIZED AUTH GATE
   Design a single server-side gate function used everywhere:
     - Input: clerkUserId, session info
     - Output: enum next_step + context
       - NEED_WAITLIST_PROFILE
       - WAITLIST_PENDING
       - ACCEPTED_NEEDS_ONBOARDING
       - ACTIVE
       - ADMIN_DASH
       - BANNED
   Rules:
     - On first authenticated request, ensure DB user exists (create baseline row if missing).
     - All routing/redirects derive from this function only.
     - No scattered conditional redirects.

   C. CLERK METADATA MIRRORING (READ-ONLY CACHE)
   - Define minimal mirrored fields (e.g., role, status).
   - Implement server-only sync on DB change.
   - App must never trust Clerk metadata for authorization.

   D. ADMIN BOOTSTRAP & ROLE MANAGEMENT
   - Define the correct way to create initial admins per environment.
   - Avoid "magic seeded users" that bypass auth.
   - Must be repeatable for dev, preview, prod.

   E. SECURE IMPERSONATION
   Design impersonation such that:
     - Only DB-admins can initiate.
     - Uses short-lived, signed impersonation tokens.
     - All actions are logged.
     - UI clearly shows impersonation state.
     - No privilege escalation or token replay.
   Recommend:
     - server-issued JWT (short TTL) in httpOnly cookie
     - separate "effective user" vs "real admin" resolution
     - environment gating (disabled by default in prod unless explicitly enabled)

3) ENVIRONMENT & PREVIEW STRATEGY
   - Neon branch per preview environment.
   - Migration + seed strategy.
   - Clerk project strategy (dev/staging/prod or preview-safe alternative).
   - CI wiring for E2E tests.
   - Safe admin + test user bootstrap per environment.

4) EDGE CASE CHECKLIST (verify explicitly)
   - Clerk user exists but DB user missing
   - DB user exists but Clerk user deleted
   - OAuth account linking collisions
   - OTP concurrency
   - Invite token replay / expiry
   - Waitlist spam & verification
   - Partial onboarding
   - Admin panel authz & CSRF
   - Sign-out during impersonation
   - Preview env resets
   - E2E determinism

5) IMPLEMENTATION PLAN (POST-APPROVAL)
   - PR1: documentation + schema
   - PR2: auth gate refactor
   - PR3: Clerk metadata sync
   - PR4: impersonation
   - PR5: preview + CI hardening
   - PR6: final docs & cleanup
   Each PR must list:
     - files changed
     - migrations
     - tests
     - rollback plan

6) DOCUMENTATION
   Create `/docs/auth-and-user-lifecycle.md` covering:
   - state machine
   - environment model
   - admin bootstrap
   - test users
   - impersonation policy
   - incident response

OUTPUT FORMAT
- Findings Summary (risk-ranked)
- Current Flow Map (with code references)
- Target Spec
- Implementation Plan
- Documentation drafts

Do not assume; verify by reading code. Make minimal but correct changes. Security over convenience.

If questions are unavoidable, ask them only at the very end.
