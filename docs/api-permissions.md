# API Permissions Matrix (Admin vs User Separation)

Last audited: 2026-04-05.

This document tracks required privilege levels by API namespace so new routes are categorized consistently during review.

## Route Namespace Matrix

| Namespace / Pattern | Required privilege | Notes |
|---|---|---|
| `/api/admin/**` | Admin-only | Must explicitly verify `isAuthenticated` and `isAdmin` (or `requireAdmin`) in handler. |
| `/api/dashboard/**` | Authenticated user | Must scope all reads/writes to the current authenticated user. |
| `/api/account/**` | Authenticated user | User self-service only; never accept arbitrary target user IDs without ownership checks. |
| `/api/billing/**` | Authenticated user | Return only caller billing context; no cross-user lookup by untrusted input. |
| `/api/dev/**` | Authenticated user (dev-only behavior where applicable) | Non-production test and developer utilities. |
| `/api/cron/**` | Cron secret | Must validate `CRON_SECRET` before execution. |
| `/api/webhooks/**` | Signed provider webhook | Must validate provider signature/token. |
| `/api/**` public endpoints (trackers, opt-ins, status probes, etc.) | Public | Must avoid exposing private user/admin data. |

## Audit Findings (JOV-1692)

### P0/P1 security findings fixed

1. **Admin namespace endpoint without admin gate**
   - Route: `/api/admin/test-user/set-plan`
   - Finding: endpoint previously relied on test-user checks but did not enforce admin role.
   - Fix: route now requires authenticated admin and returns `410` with migration guidance.
   - Replacement: E2E/test-user plan mutation moved to `/api/dev/test-user/set-plan`.

### Additional manual review checklist

Use this checklist for human review before closing JOV-1692:

- Confirm every `/api/admin/**` handler enforces admin authorization in-route.
- Confirm every `/api/dashboard/**`, `/api/account/**`, `/api/billing/**`, and `/api/dev/**` handler scopes data access to current user identity.
- Confirm no admin settings/actions are rendered in non-admin UI contexts.
- Confirm newly added API routes are added to this matrix and `docs/API_ROUTE_MAP.md`.
