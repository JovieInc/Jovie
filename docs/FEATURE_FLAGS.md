# Feature Flags - MVP State Audit

> Last updated: 2026-01-12
> Source: `apps/web/lib/statsig/flags.ts`

## Active Feature Gates

| Flag | Statsig Key | Used In | MVP State |
|------|-------------|---------|-----------|
| `AUTH_SPOTIFY_ONLY` | `feature_auth_spotify_only` | `MethodSelector.tsx` | **OFF** - Allow all auth methods |
| `CONTACTS` | `feature_contacts` | `DashboardNav.tsx`, `DashboardMobileTabs.tsx`, `ContactsManager.tsx`, `useArtistContacts.ts` | **Review** - Controls Contacts nav item visibility |
| `DYNAMIC_ENGAGEMENT` | `feature_dynamic_engagement` | `domain.ts` (notifications), `[username]/page.tsx`, `analytics.ts`, `useActivityFeed.ts` | **ON for Pro** - Audience member creation |
| `AUDIENCE_V2` | `feature_audience_v2` | `audience-data.ts` | **Review** - New audience features |
| `LINK_INGESTION` | `feature_link_ingestion` | `EnhancedDashboardLinks.tsx` | **Review** - Link import feature |

## Flag Details

### AUTH_SPOTIFY_ONLY
- **Purpose**: Restricts authentication to Spotify-only sign-in
- **MVP State**: Should be **OFF** to allow all auth methods (email, Google, etc.)
- **Location**: `components/auth/forms/MethodSelector.tsx`

### CONTACTS
- **Purpose**: Shows/hides the Contacts section in dashboard navigation
- **MVP State**: Set based on whether Contacts is a launch feature
- **Locations**:
  - `components/dashboard/dashboard-nav/DashboardNav.tsx`
  - `components/dashboard/organisms/DashboardMobileTabs.tsx`
  - `components/dashboard/organisms/ContactsManager.tsx`
  - `components/profile/artist-contacts-button/useArtistContacts.ts`

### DYNAMIC_ENGAGEMENT
- **Purpose**: Enables audience member creation for Pro users when fans subscribe
- **MVP State**: Should be **ON** (gated by Pro subscription)
- **Locations**:
  - `lib/notifications/domain.ts`
  - `app/[username]/page.tsx`
  - `lib/db/queries/analytics.ts`
  - `components/dashboard/organisms/dashboard-activity-feed/useActivityFeed.ts`

### AUDIENCE_V2
- **Purpose**: Enables new audience table features
- **MVP State**: Review and set based on launch readiness
- **Location**: `app/app/dashboard/audience/audience-data.ts`

### LINK_INGESTION
- **Purpose**: Enables automatic link import/ingestion from external sources
- **MVP State**: Review and set based on launch readiness
- **Location**: `components/dashboard/organisms/EnhancedDashboardLinks.tsx`

## Pre-Launch Checklist

- [ ] Verify `AUTH_SPOTIFY_ONLY` is OFF in Statsig console
- [ ] Decide on `CONTACTS` visibility for MVP
- [ ] Verify `DYNAMIC_ENGAGEMENT` is properly gated by Pro
- [ ] Set `AUDIENCE_V2` state based on feature readiness
- [ ] Set `LINK_INGESTION` state based on feature readiness

## Statsig Console

Manage flags at: https://console.statsig.com

## Adding New Flags

1. Add constant to `apps/web/lib/statsig/flags.ts`
2. Create gate in Statsig console
3. Document in this file
4. Set expiry date (max 14 days for experimental flags)
