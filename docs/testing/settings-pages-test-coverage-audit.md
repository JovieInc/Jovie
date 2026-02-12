# Settings Pages Test Coverage Audit

## Scope
This audit reviews route-level test coverage for all settings pages implemented under `apps/web/app/app/(shell)/settings/**/page.tsx`.

## Settings page inventory and coverage

| Settings page route | Page file | Route-level test coverage found | Evidence |
|---|---|---|---|
| `/app/settings` | `apps/web/app/app/(shell)/settings/page.tsx` | **Covered (indirect and route navigation checks)** | Referenced in e2e routing, chaos, visual, and accessibility suites. |
| `/app/settings/account` | `apps/web/app/app/(shell)/settings/account/page.tsx` | **No direct route coverage found** | No tests found that navigate to this exact route. |
| `/app/settings/ad-pixels` | `apps/web/app/app/(shell)/settings/ad-pixels/page.tsx` | **Covered (chaos navigation list)** | Referenced in authenticated chaos settings route set. |
| `/app/settings/appearance` | `apps/web/app/app/(shell)/settings/appearance/page.tsx` | **Covered (chaos navigation list)** | Referenced in authenticated chaos settings route set. |
| `/app/settings/artist-profile` | `apps/web/app/app/(shell)/settings/artist-profile/page.tsx` | **No direct route coverage found** | No tests found that navigate to this exact route. |
| `/app/settings/billing` | `apps/web/app/app/(shell)/settings/billing/page.tsx` | **Covered (chaos navigation list)** | Referenced in authenticated chaos settings route set. |
| `/app/settings/branding` | `apps/web/app/app/(shell)/settings/branding/page.tsx` | **Covered (chaos navigation list)** | Referenced in authenticated chaos settings route set. |
| `/app/settings/music-links` | `apps/web/app/app/(shell)/settings/music-links/page.tsx` | **No direct route coverage found** | No tests found that navigate to this exact route. |
| `/app/settings/notifications` | `apps/web/app/app/(shell)/settings/notifications/page.tsx` | **Covered (chaos navigation list)** | Referenced in authenticated chaos settings route set. |
| `/app/settings/profile` | `apps/web/app/app/(shell)/settings/profile/page.tsx` | **Covered (route classified in unit tests)** | Referenced by sentry route detector/init tests. |
| `/app/settings/remove-branding` | `apps/web/app/app/(shell)/settings/remove-branding/page.tsx` | **No direct route coverage found** | No tests found that navigate to this exact route. |
| `/app/settings/social-links` | `apps/web/app/app/(shell)/settings/social-links/page.tsx` | **No direct route coverage found** | No tests found that navigate to this exact route. |

## Coverage summary

- **Total settings routes audited:** 12
- **Routes with direct string-level evidence in tests:** 7
- **Routes with no direct route-level evidence:** 5

### Routes currently missing direct route-level tests

1. `/app/settings/account`
2. `/app/settings/artist-profile`
3. `/app/settings/music-links`
4. `/app/settings/remove-branding`
5. `/app/settings/social-links`

## Notes

- This is a **route-level audit** based on explicit route references in test files. Some settings functionality may still be tested indirectly through shared components.
- Main settings coverage appears strongest in broad e2e suites (`chaos-authenticated`, `dashboard-routing`, `visual-regression`, `accessibility-audit`) and route-classification unit tests for `/app/settings/profile`.
