# Statsig Feature Gates Reference

This document lists all feature gates used in the Jovie application and provides instructions for creating them in Statsig.

## Creating Feature Gates

### Using Statsig MCP (Recommended)

When you have the Statsig MCP server configured:

```bash
# Use Claude Code with Statsig MCP tools to create gates
```

Ask Claude to create the gate using the Statsig MCP, providing:
- Gate name (must match the constant in `lib/statsig/flags.ts`)
- Description
- Default value (true/false)
- Expiry date (if temporary)

### Manual Creation

1. Go to [Statsig Console](https://console.statsig.com)
2. Navigate to Feature Gates
3. Click "Create New Gate"
4. Enter the gate details
5. Set targeting rules if needed
6. Enable the gate

## Feature Gates Registry

### Core Features

#### `feature_tipping`
- **Status**: Production
- **Default**: `true`
- **Description**: Enable tipping functionality for creator profiles
- **Expiry**: None (permanent feature)
- **Used in**:
  - `app/[username]/tip/page.tsx`
  - `components/dashboard/DashboardTippingGate.tsx`

#### `feature_notifications`
- **Status**: Production
- **Default**: `true`
- **Description**: Enable notification system
- **Expiry**: None (permanent feature)
- **Used in**:
  - `app/[username]/notifications/page.tsx`

#### `feature_analytics`
- **Status**: Production
- **Default**: `true`
- **Description**: Enable Statsig analytics tracking
- **Expiry**: None (permanent feature)
- **Used in**:
  - `lib/analytics.ts`
  - `components/providers/Analytics.tsx`

### UI/UX Features

#### `feature_artist_search`
- **Status**: Production
- **Default**: `true`
- **Description**: Enable artist search functionality on homepage
- **Expiry**: None (permanent feature)
- **Used in**:
  - `components/home/FeatureFlaggedArtistSearch.tsx`

#### `feature_tip_promo`
- **Status**: Production
- **Default**: `true`
- **Description**: Show tip promotion UI elements
- **Expiry**: None (permanent feature)
- **Used in**:
  - `tests/unit/TipPromo.test.tsx`
  - `tests/e2e/tip-promo.spec.ts`

### Onboarding Features

#### `feature_progressive_onboarding`
- **Status**: Production
- **Default**: `true`
- **Description**: Multi-step onboarding with improved UX
- **Expiry**: None (permanent feature)
- **Used in**: Onboarding flow

#### `feature_minimalist_onboarding`
- **Status**: Production
- **Default**: `true`
- **Description**: Apple-inspired minimalist design for onboarding screens
- **Expiry**: None (permanent feature)
- **Used in**: Onboarding screens

#### `feature_apple_style_onboarding`
- **Status**: Production
- **Default**: `true`
- **Description**: Full-screen Apple-style onboarding with improved UX (JOV-134)
- **Expiry**: None (permanent feature)
- **Used in**: Onboarding flow
- **Jira**: JOV-134

### Profile Features

#### `feature_profile_settings`
- **Status**: Production
- **Default**: `true`
- **Description**: Enable profile settings page
- **Expiry**: None (permanent feature)
- **Used in**:
  - `components/dashboard/organisms/SettingsPolished.tsx`
  - `components/dashboard/DashboardSettings.tsx`

#### `feature_avatar_upload`
- **Status**: Beta
- **Default**: `false`
- **Description**: Enable avatar upload with Vercel Blob integration
- **Expiry**: None (requires Vercel Blob setup)
- **Used in**:
  - `components/molecules/AvatarUploadable.tsx`
  - `app/api/images/sign-upload/route.ts`

#### `feature_avatar_uploader`
- **Status**: Beta
- **Default**: `false`
- **Description**: Advanced avatar uploader component with radial progress and drag/drop
- **Expiry**: None (requires feature flag)
- **Used in**:
  - `components/molecules/AvatarUploadable.tsx`

#### `feature_contacts`
- **Status**: Development
- **Default**: `false`
- **Description**: Gate the artist contacts manager and public contacts menu
- **Expiry**: Review after pilot rollout
- **Used in**:
  - `app/dashboard/contacts/page.tsx`
  - `components/dashboard/organisms/ContactsManager.tsx`
  - `components/profile/ArtistContactsButton.tsx`

### Backend Features

#### `feature_universal_notifications`
- **Status**: Development
- **Default**: `false` (dev only)
- **Description**: Universal notifications system (dev environment only for now)
- **Expiry**: TBD when promoted to production
- **Used in**: Notification system

#### `feature_click_analytics_rpc`
- **Status**: Beta
- **Default**: `false`
- **Description**: Gate new anonymous click logging via SECURITY DEFINER RPC
- **Expiry**: None (security feature)
- **Used in**: Analytics RPC functions

#### `feature_audience_v2`
- **Status**: Development
- **Default**: `false`
- **Description**: Unlock the upgraded Audience CRM table plus the dashboard activity feed that surfaces anonymous and identified visitors.
- **Expiry**: Review after 60 days
- **Used in**:
  - `components/dashboard/DashboardAudience.tsx`
  - `components/dashboard/organisms/DashboardActivityFeed.tsx`
  - `app/api/dashboard/audience/members/route.ts`
  - `app/api/dashboard/activity/recent/route.ts`

#### `feature_link_ingestion`
- **Status**: Development
- **Default**: `false`
- **Description**: Gate link ingestion workers and suggestion surfacing (Linktree phase 1)
- **Expiry**: Review after initial rollout
- **Used in**:
  - `app/api/ingestion/jobs/route.ts`
  - `app/api/dashboard/social-links/route.ts`
  - `lib/ingestion/*`

### Integration Features

#### `feature_pricing_use_clerk`
- **Status**: Deprecated
- **Default**: `false`
- **Description**: Use Clerk for pricing (deprecated, not using Clerk Billing)
- **Expiry**: Can be removed after Q1 2025
- **Used in**: Legacy pricing code

#### `feature_discog_smart_links`
- **Status**: Development
- **Default**: `false`
- **Description**: Gate Spotify discography ingestion, multi-DSP link mapping, and smart listen routing for artist profiles (JOV-239 epic).
- **Expiry**: Review after initial internal testing
- **Used in**: Upcoming discography ingestion and smart link routing flows

## Flag Lifecycle Rules

Per `agents.md`:
- Every flag must define: owner, expiry date (≤14 days for experiments), kill-switch
- CI fails if today > expiry
- Remove code paths for expired flags within 48h

## Statsig MCP Integration

The Statsig MCP server enables:
- Programmatic gate creation
- Gate status checking
- Experiment management
- Analytics event tracking

## Best Practices

1. **Naming Convention**: Always use `feature_` prefix with snake_case
2. **Documentation**: Update this file when adding new gates
3. **Code Reference**: Add constant to `lib/statsig/flags.ts`
4. **Testing**: Add feature flag scenarios to E2E tests
5. **Cleanup**: Remove expired flags and their code within 48h
6. **Default Values**: Production flags should default to `true` when stable, `false` during beta

## Migration from Local Flags

The application previously used local feature flags in `lib/feature-flags.ts`. All flags have been migrated to Statsig for centralized management and A/B testing capabilities.

### Migration Checklist
- [x] Define all flags in `lib/statsig/flags.ts`
- [x] Create all gates in Statsig console (using MCP or manual)
- [x] Update code to use Statsig SDK instead of local flags
- [x] Remove `lib/feature-flags.ts` after full migration
- [x] Update all references to use `STATSIG_FLAGS` constants

### Consolidated Feature Flag System

The feature flag system is now unified under Statsig:

**Client-side usage:**
```typescript
import { useFeatureGate } from '@/lib/flags/client';
import { STATSIG_FLAGS } from '@/lib/flags';

const { value: isEnabled } = useFeatureGate(STATSIG_FLAGS.TIPPING);
```

**Server-side usage:**
```typescript
import { checkGateForUser } from '@/lib/flags/server';
import { STATSIG_FLAGS } from '@/lib/flags';

const isEnabled = await checkGateForUser(STATSIG_FLAGS.TIPPING, { userID: userId });
```

## Support

For questions about Statsig integration:
- Documentation: https://docs.statsig.com
- Console: https://console.statsig.com
- MCP Integration: See `agents.md` section 0
