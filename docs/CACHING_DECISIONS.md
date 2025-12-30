# Caching Decisions

This document describes the caching strategy for the Jovie application. For implementation details, see `lib/cache/`.

## Centralized Cache Module

All caching utilities are centralized in `lib/cache/`:

- **`lib/cache/tags.ts`** - Cache tag constants and helper functions
- **`lib/cache/profile.ts`** - Server-side cache invalidation functions
- **`lib/cache/index.ts`** - Public exports

### Quick Reference

| Mutation Type | Function to Call | Tags Invalidated |
|--------------|------------------|------------------|
| Profile update | `invalidateProfileCache()` | `public-profile`, `dashboard-data` |
| Username change | `invalidateUsernameChange()` | `public-profile`, `dashboard-data`, homepage |
| Social links add/update/delete | `invalidateSocialLinksCache()` | `social-links:<profileId>`, `public-profile`, `dashboard-data` |
| Avatar upload | `invalidateAvatarCache()` | `avatar:<userId>`, `public-profile`, `dashboard-data` |

### Usage Example

```ts
import {
  CACHE_TAGS,
  invalidateProfileCache,
  invalidateSocialLinksCache,
  invalidateAvatarCache,
} from '@/lib/cache';

// After profile update
await invalidateProfileCache(usernameNormalized);

// After social links change
await invalidateSocialLinksCache(profileId, usernameNormalized);

// After avatar upload
await invalidateAvatarCache(userId, usernameNormalized);
```

## Public profile routes

**Scope:** `app/[username]/page.tsx`

- The profile loader is a Cache Component (`"use cache"`) so repeat visits stay fast and consistent.
- Tags: `public-profile` and `public-profile:<username>`.
- Cache lifetime uses the `hours` profile to keep profiles snappy while still refreshing in the background.
- Mutations call `updateTag()` and `revalidateTag(..., 'max')` via `invalidateProfileCache()` to keep read-your-write behavior immediate.

## Social links

**Scope:** `app/api/dashboard/social-links/route.ts`

- Social links mutations (PUT/DELETE) trigger `invalidateSocialLinksCache()`.
- Tags: `social-links:<profileId>`, `public-profile`, `public-profile:<username>`.
- Cache invalidation ensures public profile and dashboard show updated links immediately.

## Avatar uploads

**Scope:** `app/api/images/upload/route.ts`

- Avatar uploads trigger `invalidateAvatarCache()` after successful processing.
- Tags: `avatar:<userId>`, `public-profile`, `public-profile:<username>`.
- Cache invalidation ensures profile displays the new avatar across all views.

## Dashboard data

**Scope:** `app/app/dashboard/actions.ts`

- User-specific dashboard reads remain request-time to protect privacy and avoid cross-user bleed.
- Mutations call `updateTag('dashboard-data')` and `revalidateTag('dashboard-data', 'max')` so any future Cache Components can safely opt in.

## Featured creators

**Scope:** `lib/featured-creators.ts`, `app/api/revalidate/featured-creators/route.ts`

- The featured creator list is cached with a weekly horizon and tagged as `featured-creators`.
- The revalidate endpoint uses `updateTag()` + `revalidateTag(..., 'max')` for immediate freshness when admins trigger updates.

## Adding New Cached Data

When adding new cacheable data:

1. **Define tags in `lib/cache/tags.ts`**:
   - Add constant to `CACHE_TAGS` for fixed tags
   - Create helper function for parameterized tags (e.g., `createProfileTag`)

2. **Create invalidation function in `lib/cache/profile.ts`**:
   - Follow the pattern of existing functions
   - Call `updateTag()` then `revalidateTag(..., 'max')` for immediate freshness
   - Use `revalidatePath()` for page-level invalidation

3. **Export from `lib/cache/index.ts`**

4. **Document in this file** with scope, tags, and rationale
