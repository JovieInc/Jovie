# Unified Avatar Component Integration Guide

This guide shows how to migrate from existing avatar components to the new unified Avatar system.

## Components Overview

### `Avatar` (Atom)
- **Purpose**: Display-only avatar for public profiles, featured creators, previews
- **Features**: Multiple sizes, fallback initials, optimized loading, accessibility
- **Usage**: Replace `ArtistAvatar`, `OptimizedAvatar` for read-only contexts

### `AvatarUploadable` (Organism) 
- **Purpose**: Interactive avatar with upload functionality for dashboard contexts
- **Features**: Radial progress, drag & drop, file validation, analytics tracking
- **Usage**: Replace `AvatarUpload`, `AvatarUploader` for editable contexts

## Migration Path

### 1. Replace Display-Only Usages

**Before:**
```tsx
import { ArtistAvatar } from '@/components/atoms/ArtistAvatar';

<ArtistAvatar 
  src={user.avatar}
  name={user.name}
  size="lg"
/>
```

**After:**
```tsx
import { Avatar } from '@/components/atoms/Avatar';

<Avatar 
  src={user.avatar}
  alt={`${user.name}'s profile`}
  name={user.name}
  size="lg"
/>
```

### 2. Replace Upload Functionality

**Before:**
```tsx
import { AvatarUpload } from '@/components/ui/AvatarUpload';

<AvatarUpload
  currentAvatarUrl={user.avatar}
  artistName={user.name}
  onUploadSuccess={handleSuccess}
  onUploadError={handleError}
/>
```

**After:**
```tsx
import { AvatarUploadable } from '@/components/molecules/AvatarUploadable';

<AvatarUploadable
  src={user.avatar}
  alt={`${user.name}'s profile`}
  name={user.name}
  size="xl"
  uploadable={featureFlags.avatarUploaderEnabled}
  onUpload={handleUpload}
  onSuccess={handleSuccess}
  onError={handleError}
  progress={uploadProgress}
/>
```

### 3. Feature Flag Integration

```tsx
import { useFeatureGate } from '@statsig/react-bindings';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

function ProfilePage({ userOwnsProfile }) {
  const { value: avatarUploaderEnabled } = useFeatureGate(
    STATSIG_FLAGS.AVATAR_UPLOADER
  );
  const canUpload = userOwnsProfile && avatarUploaderEnabled;
  
  return (
    <AvatarUploadable
      src={user.avatar}
      alt="Profile photo"
      name={user.name}
      uploadable={canUpload}
      onUpload={handleUpload}
    />
  );
}
```

**Guardrails:**
- Use Statsig gates (`STATSIG_FLAGS.AVATAR_UPLOADER`) instead of custom providers.
- Keep Avatar display-only when the gate is off; do not introduce alternate analytics SDKs.
- AvatarUploadable defaults to JPEG/PNG/WebP and a 4MB max size to match `/api/images/upload`; extend the API before allowing other formats or larger uploads.
- Use semantic tokens (e.g., `bg-surface-*`, `text-primary-token`) and avoid raw hex/RGB.

## Size Mapping

| Old Size | New Size | Dimensions |
|----------|----------|------------|
| `sm` (ArtistAvatar) | `sm` | 32x32px |
| `md` (ArtistAvatar) | `md` | 48x48px |
| `lg` (ArtistAvatar) | `lg` | 64x64px |
| `xl` (ArtistAvatar) | `xl` | 80x80px |
| 64px (OptimizedAvatar) | `lg` | 64x64px |
| 128px (OptimizedAvatar) | `2xl` | 96x96px |

## Analytics Events

The new system automatically tracks:
- `avatar_upload_start` - When upload begins
- `avatar_upload_progress` - Progress updates
- `avatar_upload_success` - Successful upload
- `avatar_upload_error` - Upload failures

## Accessibility Features

- ✅ ARIA labels and roles
- ✅ Keyboard navigation (Enter/Space)
- ✅ Screen reader announcements
- ✅ Focus management
- ✅ Progress announcements

## Progressive Enhancement

The system gracefully degrades:
1. **Feature flag OFF**: Shows display-only avatar
2. **No upload handler**: Click/drag does nothing
3. **Upload fails**: Shows error state, reverts to original
4. **Network issues**: Shows loading state, times out gracefully

## Migration Checklist

- [ ] Identify all avatar usages in codebase
- [ ] Replace display-only avatars with `Avatar` component
- [ ] Replace upload avatars with `AvatarUploadable` component  
- [ ] Test feature flag integration
- [ ] Verify analytics tracking
- [ ] Test accessibility with screen readers
- [x] Add deprecation warnings to old components
- [ ] Update component documentation

## Rollback Plan

If issues arise:
1. Disable feature flag: `avatarUploaderEnabled: false`
2. Components gracefully fall back to display-only mode
3. Existing upload functionality remains available
4. No data loss or breaking changes

# Unified Links Manager Integration Guide

This section describes how to integrate the canonical Links Manager used on the dashboard Links page.

## Components Overview

### `EnhancedDashboardLinks` (Organism)
- **Purpose**: Dashboard wrapper for managing a creator's links at `/dashboard/links`.
- **Responsibilities**:
  - Reads `initialLinks: ProfileSocialLink[]` from the server.
  - Maps database links into an internal `LinkItem[]` model.
  - Persists changes to `/api/dashboard/social-links` using a debounced save.
  - Renders the right-hand live preview via `ProfilePreview` and the profile URL + copy controls.
- **Location**: `components/dashboard/organisms/EnhancedDashboardLinks.tsx`.

### `GroupedLinksManager` (Organism / Engine)
- **Purpose**: Canonical editing surface for links inside the dashboard.
- **Responsibilities**:
  - Groups links into `social`, `dsp`, `earnings`, and `custom` sections.
  - Uses `UniversalLinkInput` for platform detection and smart defaults.
  - Supports drag-and-drop reordering within and across sections (with constraints).
  - Handles YouTube cross-section logic and Venmo/tipping enablement.
  - Emits `onLinksChange(links: DetectedLink[])` and optional `onLinkAdded` callbacks.
- **Location**: `components/dashboard/organisms/GroupedLinksManager.tsx`.

### Supporting Atoms/Molecules
- `UniversalLinkInput` (atom): URL input with platform detection and title editing.
- `LinkActions` (atom): Per-row controls for hide/show, delete, and drag handle.
- `ProfilePreview` (molecule): Uses `StaticArtistPage` to render a live profile preview.

## Dashboard Route Wiring

The dashboard Links page is implemented at `app/dashboard/links/page.tsx`.

- Authenticates the user with Clerk (`auth()` from `@clerk/nextjs/server`).
- Loads dashboard data via `getDashboardData()`.
- Redirects to onboarding if `needsOnboarding` is true.
- Fetches `initialLinks` with `getProfileSocialLinks(profileId)`.
- Renders `<EnhancedDashboardLinks initialLinks={initialLinks} />`.

All link editing happens client-side inside `EnhancedDashboardLinks` + `GroupedLinksManager`; the route remains a server component.

## Data Flow

1. **Server → Client**
   - `ProfileSocialLink[]` (from `getProfileSocialLinks`) is passed into `EnhancedDashboardLinks` as `initialLinks`.
   - `EnhancedDashboardLinks` converts these into `LinkItem[]` with normalized URLs, platform metadata, and visibility flags.
2. **Client Editing**
   - `EnhancedDashboardLinks` passes the current `LinkItem[]` (as `DetectedLink[]`) to `GroupedLinksManager` via `initialLinks`.
   - Users add, hide/show, reorder, and remove links inside `GroupedLinksManager`.
   - `GroupedLinksManager` calls `onLinksChange(updatedLinks)` whenever the underlying list changes.
3. **Persistence**
   - `EnhancedDashboardLinks` maps `DetectedLink[]` back into a payload compatible with the dashboard API:
     - `platform.id` → `platform` string in the payload.
     - `normalizedUrl` → `url`.
     - Index position → `sortOrder`.
     - Visibility flag → `isActive`.
   - A debounced save function performs `PUT /api/dashboard/social-links` with `{ profileId, links }`.
   - Success/failure is surfaced via `saveStatus` state and toast notifications.

## Migration Notes

- The dashboard should use **only** `EnhancedDashboardLinks` on the `/dashboard/links` route.
- `GroupedLinksManager` is the single canonical engine for link management; avoid introducing new ad-hoc link editors.
- Any future templates (for example, a reusable `LinksManager` under `packages/ui/templates`) should be built by extracting logic from `GroupedLinksManager` rather than duplicating it.

## Checklist

- [ ] Route `/dashboard/links` renders `EnhancedDashboardLinks` with server-fetched `initialLinks`.
- [ ] `GroupedLinksManager` is the only component responsible for link editing UX.
- [ ] All saves go through `/api/dashboard/social-links` with the normalized payload.
- [ ] Live preview (`ProfilePreview`) reflects the same set of links as the manager.
- [ ] Legacy link managers are no longer imported by dashboard routes.
