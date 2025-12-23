# Plan: Fix Public Profile Link Visibility

## Problem Statement
Users add links in the dashboard expecting them to be visible on their public profile, but most link types are hidden. Only 8 hardcoded social network platforms appear as icons.

## Design Principles
1. **Single primary CTA** - The subscribe/listen button remains the focused conversion action
2. **Categorized display** - Links appear in appropriate sections based on type
3. **Clean, focused UX** - Don't clutter the profile with every possible link

## Link Category Rules

| Category | Where Displayed | Format |
|----------|-----------------|--------|
| **Social Networks** | Social bar on profile | Small icons (current behavior) |
| **Music/DSP** | Listen mode only (`?mode=listen`) | Full buttons |
| **Tipping** | Tip mode only (`?mode=tip`) | Venmo only for now |
| **Websites/Other** | New section on main profile | Link buttons with titles |

### Social Networks (Icons in social bar)
- instagram, twitter/x, tiktok, youtube, facebook, linkedin, discord, twitch, snapchat, threads

### Music/DSP (Listen mode only)
- spotify, apple_music, youtube_music, soundcloud, bandcamp, tidal, deezer, amazon_music, pandora

### Tipping (Tip mode only)
- venmo (only platform supported currently)

### Websites/Other Links (New section - buttons on main profile)
- website, blog, portfolio, linktree, beacons, press_kit, booking
- patreon, kofi, buymeacoffee (creator support)
- shopify, etsy, amazon (merch/commerce)
- substack, medium (content)
- Other custom links

---

## Implementation Plan

### Step 1: Define Link Category Constants
**File:** `constants/links.ts` (new file)

Create centralized constants for link categorization:
```typescript
export const SOCIAL_ICON_PLATFORMS = [
  'instagram', 'twitter', 'x', 'tiktok', 'youtube', 'facebook',
  'linkedin', 'discord', 'twitch', 'snapchat', 'threads'
] as const;

export const DSP_PLATFORMS = [
  'spotify', 'apple_music', 'youtube_music', 'soundcloud',
  'bandcamp', 'tidal', 'deezer', 'amazon_music', 'pandora'
] as const;

export const TIP_PLATFORMS = ['venmo'] as const;

export const PROFILE_BUTTON_PLATFORMS = [
  'website', 'blog', 'portfolio', 'press_kit', 'booking',
  'patreon', 'kofi', 'buymeacoffee',
  'shopify', 'etsy',
  'substack', 'medium',
  'linktree', 'beacons',
  'other'
] as const;
```

Add helper functions:
```typescript
export function getLinkCategory(platform: string): 'social' | 'dsp' | 'tip' | 'button' | 'hidden'
export function shouldShowOnProfile(platform: string): boolean
export function shouldShowAsIcon(platform: string): boolean
export function shouldShowAsButton(platform: string): boolean
```

---

### Step 2: Create ProfileLinkButtons Component
**File:** `components/profile/ProfileLinkButtons.tsx` (new file)

A new component that renders "button" category links as clickable buttons:

```typescript
interface ProfileLinkButtonsProps {
  links: LegacySocialLink[];
  artistHandle: string;
  artistName: string;
  maxLinks?: number; // default 5
}
```

Features:
- Renders links as full-width buttons with platform icon + display text
- Uses `displayText` field if set, otherwise platform name
- Tracks clicks via existing `/api/track` endpoint
- Respects `is_visible` field
- Sorted by `sort_order`

Visual design:
- Similar styling to DSP buttons in StaticListenInterface
- Consistent with existing button patterns
- Platform-specific colors on hover

---

### Step 3: Update ProfileShell to Show Button Links
**File:** `components/organisms/ProfileShell.tsx`

Changes:
1. Replace hardcoded `SOCIAL_NETWORK_PLATFORMS` with imported constant
2. Add filtering for button-category links
3. Render `ProfileLinkButtons` component below the primary CTA (in profile mode only)

```tsx
// Filter links by category
const socialIconLinks = socialLinks.filter(
  link => SOCIAL_ICON_PLATFORMS.includes(link.platform.toLowerCase())
);

const buttonLinks = socialLinks.filter(
  link => PROFILE_BUTTON_PLATFORMS.includes(link.platform.toLowerCase())
);
```

Layout (profile mode):
```
┌─────────────────────────────┐
│        [Avatar]             │
│      Display Name           │
│         Bio                 │
├─────────────────────────────┤
│   [Primary CTA Button]      │  ← Subscribe/Listen (unchanged)
├─────────────────────────────┤
│   [Website Button]          │  ← NEW: ProfileLinkButtons
│   [Merch Store Button]      │
│   [Patreon Button]          │
├─────────────────────────────┤
│  [tw] [ig] [tt] [yt]        │  ← Social icons (existing)
│      [Contact]              │
└─────────────────────────────┘
```

---

### Step 4: Update StaticArtistPage Integration
**File:** `components/profile/StaticArtistPage.tsx`

- Pass button links to ProfileShell/ArtistPageShell
- Ensure button links section only appears in `mode=profile`
- Don't show in listen/tip/subscribe modes

---

### Step 5: Update Dashboard Link Management
**File:** `components/dashboard/organisms/EnhancedDashboardLinks.tsx`

Update `getPlatformCategory` to align with new constants:
- Import from `constants/links.ts` instead of inline definitions
- Add visual indicator in dashboard showing where each link will appear

Optional: Add tooltip/label showing "Shows on profile" vs "Shows in listen mode"

---

### Step 6: Database/Schema Considerations

No schema changes required. Existing fields support this:
- `platform` - determines category
- `displayText` - custom button label
- `sortOrder` - ordering within section
- `isActive` / `is_visible` - visibility control

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `constants/links.ts` | Create | Link category constants and helpers |
| `components/profile/ProfileLinkButtons.tsx` | Create | Button links component |
| `components/organisms/ProfileShell.tsx` | Modify | Add button links section |
| `components/profile/StaticArtistPage.tsx` | Modify | Pass button links through |
| `components/dashboard/organisms/EnhancedDashboardLinks.tsx` | Modify | Align category logic |

---

## Testing Checklist

- [ ] Social icons still appear correctly
- [ ] DSP links only appear in listen mode
- [ ] Venmo tip still works in tip mode
- [ ] New button links appear on main profile
- [ ] Button links respect `is_visible` and `sort_order`
- [ ] Click tracking works for button links
- [ ] Mobile responsive layout
- [ ] Dark/light mode styling
- [ ] Links with custom `displayText` show correct label
- [ ] Profile without button links renders cleanly

---

## Out of Scope

- Adding new payment platforms beyond Venmo
- Changing the primary CTA behavior
- Bio editing UI (separate issue)
- Theme customization (separate issue)
