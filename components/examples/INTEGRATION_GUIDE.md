# Unified Avatar Component Integration Guide

This guide shows how to migrate from existing avatar components to the new unified Avatar system.

## Components Overview

### `Avatar` (Atom)
- **Purpose**: Display-only avatar for public profiles, featured creators, previews
- **Features**: Multiple sizes, fallback initials, optimized loading, accessibility
- **Usage**: Replace `ArtistAvatar`, `OptimizedAvatar` for read-only contexts

### `AvatarUploadable` (Molecule) 
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
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';

function ProfilePage({ userOwnsProfile }) {
  const { flags } = useFeatureFlags();
  const canUpload = userOwnsProfile && flags.avatarUploaderEnabled;
  
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
- [ ] Add deprecation warnings to old components
- [ ] Update component documentation

## Rollback Plan

If issues arise:
1. Disable feature flag: `avatarUploaderEnabled: false`
2. Components gracefully fall back to display-only mode
3. Existing upload functionality remains available
4. No data loss or breaking changes