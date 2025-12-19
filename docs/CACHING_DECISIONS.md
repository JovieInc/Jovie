# Caching Decisions

## Public profile routes

**Scope:** `app/[username]/page.tsx`

- The profile loader is a Cache Component (`"use cache"`) so repeat visits stay fast and consistent.
- Tags: `public-profile` and `public-profile:<username>`.
- Cache lifetime uses the `hours` profile to keep profiles snappy while still refreshing in the background.
- Mutations call `updateTag()` and `revalidateTag(..., 'max')` via `invalidateProfileCache()` to keep read-your-write behavior immediate.

## Dashboard data

**Scope:** `app/app/dashboard/actions.ts`

- User-specific dashboard reads remain request-time to protect privacy and avoid cross-user bleed.
- Mutations call `updateTag('dashboard-data')` and `revalidateTag('dashboard-data', 'max')` so any future Cache Components can safely opt in.

## Featured creators

**Scope:** `lib/featured-creators.ts`, `app/api/revalidate/featured-creators/route.ts`

- The featured creator list is cached with a weekly horizon and tagged as `featured-creators`.
- The revalidate endpoint uses `updateTag()` + `revalidateTag(..., 'max')` for immediate freshness when admins trigger updates.
