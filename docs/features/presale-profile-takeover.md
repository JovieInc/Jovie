# Presale Profile Takeover Feature

## Executive Summary

When an artist has an upcoming release with presale notifications enabled, their main profile page (`/{username}`) should automatically "takeover" to prominently display the presale content. This eliminates the need to share a separate presale page URL—fans visiting the artist's profile will immediately see the upcoming release and can subscribe for notifications.

---

## Problem Statement

Currently:
1. Artists create releases with future `releaseDate` in `discog_releases`
2. Fans can subscribe to notifications via `ArtistNotificationsCTA` on the profile
3. But there's no way to feature an **upcoming** release prominently on the profile
4. Artists must share separate smart link URLs (`/{username}/{slug}`) for presales
5. This fragments the artist's online presence and reduces conversion

**Goal:** When visiting `/{username}`, if there's an active presale campaign, the profile should transform to showcase that release with a clear notification signup CTA.

---

## Feature Requirements

### Core Requirements

1. **Automatic Takeover Activation**
   - Detect when artist has an upcoming release with `releaseDate > now()`
   - Only activate if presale is explicitly enabled (new flag)
   - Support a configurable "takeover window" (e.g., 14 days before release)
   - Auto-deactivate after release date passes

2. **Takeover Experience**
   - Replace standard profile CTA with presale-focused layout
   - Show release artwork prominently
   - Display release title, type, and release date countdown
   - Primary CTA: "Get notified when it drops" (email/SMS signup)
   - Secondary: Pre-save links if available (Spotify, Apple Music, etc.)
   - Maintain artist branding (avatar, name, bio visible but de-emphasized)

3. **Artist Control**
   - Toggle presale takeover on/off per release
   - Set custom takeover start date (or use default window)
   - Preview takeover before it goes live
   - Override with different release if multiple upcoming

4. **Fan Experience**
   - Seamless subscription flow (reuse `ArtistNotificationsCTA`)
   - Clear countdown to release date
   - Option to pre-save on streaming platforms
   - After subscribing, show confirmation + share CTA

5. **Analytics & Tracking**
   - Track takeover impressions vs normal profile views
   - Track notification signups attributed to takeover
   - Conversion funnel: view → signup → release day notification

---

## Technical Design

### 1. Database Schema Changes

```sql
-- Add presale-specific fields to discog_releases
ALTER TABLE discog_releases ADD COLUMN presale_enabled BOOLEAN DEFAULT false;
ALTER TABLE discog_releases ADD COLUMN presale_start_date TIMESTAMP;
ALTER TABLE discog_releases ADD COLUMN presale_end_date TIMESTAMP; -- defaults to release_date
ALTER TABLE discog_releases ADD COLUMN presale_message TEXT; -- custom CTA text
ALTER TABLE discog_releases ADD COLUMN presale_spotify_presave_url TEXT;
ALTER TABLE discog_releases ADD COLUMN presale_apple_presave_url TEXT;

-- Index for efficient upcoming release queries
CREATE INDEX idx_discog_releases_presale_active
ON discog_releases (creator_profile_id, presale_enabled, release_date)
WHERE presale_enabled = true AND release_date > NOW();

-- Track presale-specific subscriptions
ALTER TABLE notification_subscriptions ADD COLUMN release_id UUID REFERENCES discog_releases(id);
ALTER TABLE notification_subscriptions ADD COLUMN subscription_source TEXT; -- 'profile_takeover', 'release_page', 'direct'
```

**Drizzle Schema Updates:**

```typescript
// In apps/web/lib/db/schema/content.ts

export const discogReleases = pgTable('discog_releases', {
  // ... existing fields ...

  // Presale takeover fields
  presaleEnabled: boolean('presale_enabled').default(false).notNull(),
  presaleStartDate: timestamp('presale_start_date'),
  presaleEndDate: timestamp('presale_end_date'), // defaults to releaseDate
  presaleMessage: text('presale_message'), // "Be the first to hear my new single!"
  presaleSpotifyPresaveUrl: text('presale_spotify_presave_url'),
  presaleApplePresaveUrl: text('presale_apple_presave_url'),
});
```

```typescript
// In apps/web/lib/db/schema/analytics.ts

export const notificationSubscriptions = pgTable('notification_subscriptions', {
  // ... existing fields ...

  // Presale attribution
  releaseId: uuid('release_id').references(() => discogReleases.id, { onDelete: 'set null' }),
  subscriptionSource: text('subscription_source'), // 'profile_takeover' | 'release_page' | 'direct' | 'qr_code'
});
```

### 2. New Query: Get Active Presale Release

```typescript
// apps/web/lib/db/queries/presale.ts

import { and, eq, gte, lte, or, isNull, desc } from 'drizzle-orm';

export interface ActivePresaleRelease {
  id: string;
  title: string;
  slug: string;
  releaseType: 'single' | 'album' | 'ep' | 'compilation';
  releaseDate: Date;
  artworkUrl: string | null;
  presaleMessage: string | null;
  presaleSpotifyPresaveUrl: string | null;
  presaleApplePresaveUrl: string | null;
  daysUntilRelease: number;
}

export async function getActivePresaleForCreator(
  creatorProfileId: string
): Promise<ActivePresaleRelease | null> {
  const now = new Date();

  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      presaleMessage: discogReleases.presaleMessage,
      presaleSpotifyPresaveUrl: discogReleases.presaleSpotifyPresaveUrl,
      presaleApplePresaveUrl: discogReleases.presaleApplePresaveUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        eq(discogReleases.presaleEnabled, true),
        gte(discogReleases.releaseDate, now), // Not yet released
        or(
          lte(discogReleases.presaleStartDate, now), // Presale has started
          isNull(discogReleases.presaleStartDate) // Or no start date (always active)
        ),
        or(
          gte(discogReleases.presaleEndDate, now), // Presale hasn't ended
          isNull(discogReleases.presaleEndDate) // Or defaults to release date
        )
      )
    )
    .orderBy(desc(discogReleases.releaseDate)) // Most recent upcoming release
    .limit(1);

  if (!release || !release.releaseDate) return null;

  const daysUntilRelease = Math.ceil(
    (release.releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    ...release,
    releaseType: release.releaseType as ActivePresaleRelease['releaseType'],
    daysUntilRelease,
  };
}
```

### 3. Profile Page Changes

**File: `apps/web/app/[username]/page.tsx`**

```typescript
// Add to imports
import { getActivePresaleForCreator } from '@/lib/db/queries/presale';
import { PresaleTakeoverPage } from '@/components/profile/PresaleTakeoverPage';

// In the page component, after fetching profile:
export default async function ArtistPage({ params, searchParams }: Props) {
  // ... existing code to fetch profile ...

  // Check for active presale takeover
  const activePresale = await getActivePresaleForCreator(profile.id);

  // If presale is active and no explicit mode override, show takeover
  const showPresaleTakeover = activePresale && mode === 'profile';

  if (showPresaleTakeover) {
    return (
      <>
        {/* Structured data for presale */}
        <Script id="presale-schema" type="application/ld+json" ... />

        <PresaleTakeoverPage
          artist={artist}
          release={activePresale}
          socialLinks={socialLinks}
          enableDynamicEngagement={dynamicEnabled}
        />
      </>
    );
  }

  // ... rest of existing profile rendering ...
}
```

### 4. Presale Takeover Component

**File: `apps/web/components/profile/PresaleTakeoverPage.tsx`**

```typescript
'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { ArtistPageShell } from './ArtistPageShell';
import { ArtistNotificationsCTA } from './artist-notifications-cta';
import { CountdownTimer } from './CountdownTimer';
import { PresaveButtons } from './PresaveButtons';
import type { Artist, LegacySocialLink } from '@/types/db';
import type { ActivePresaleRelease } from '@/lib/db/queries/presale';

interface PresaleTakeoverPageProps {
  artist: Artist;
  release: ActivePresaleRelease;
  socialLinks: LegacySocialLink[];
  enableDynamicEngagement?: boolean;
}

export function PresaleTakeoverPage({
  artist,
  release,
  socialLinks,
  enableDynamicEngagement = false,
}: PresaleTakeoverPageProps) {
  const releaseTypeLabel = {
    single: 'New Single',
    album: 'New Album',
    ep: 'New EP',
    compilation: 'New Release',
  }[release.releaseType];

  const defaultMessage = `Be the first to hear "${release.title}"`;
  const presaleMessage = release.presaleMessage || defaultMessage;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900">
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        contacts={[]}
        subtitle={releaseTypeLabel}
        showSocialBar={false}
        showTipButton={false}
        showBackButton={false}
        showFooter={true}
        showNotificationButton={false}
      >
        <div className="space-y-6 py-4">
          {/* Release Artwork - Hero */}
          <div className="relative mx-auto w-full max-w-sm aspect-square overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className="object-cover"
                sizes="(max-width: 384px) 100vw, 384px"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-1">
                <span className="text-6xl">🎵</span>
              </div>
            )}

            {/* Release type badge */}
            <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/60 backdrop-blur-sm text-xs font-semibold text-white">
              {releaseTypeLabel}
            </div>
          </div>

          {/* Release Title */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-primary-token tracking-tight">
              {release.title}
            </h1>
            <p className="text-secondary-token">by {artist.name}</p>
          </div>

          {/* Countdown Timer */}
          <CountdownTimer
            targetDate={release.releaseDate}
            label="Drops in"
          />

          {/* Presale Message */}
          <p className="text-center text-lg text-secondary-token px-4">
            {presaleMessage}
          </p>

          {/* Primary CTA: Get Notified */}
          <div className="space-y-4">
            <ArtistNotificationsCTA
              artist={artist}
              variant="button"
              autoOpen={true}
              presaleContext={{
                releaseId: release.id,
                releaseTitle: release.title,
                source: 'profile_takeover',
              }}
            />
          </div>

          {/* Pre-save Links */}
          {(release.presaleSpotifyPresaveUrl || release.presaleApplePresaveUrl) && (
            <div className="pt-4 border-t border-subtle">
              <p className="text-center text-sm text-tertiary-token mb-3">
                Or pre-save now
              </p>
              <PresaveButtons
                spotifyUrl={release.presaleSpotifyPresaveUrl}
                appleMusicUrl={release.presaleApplePresaveUrl}
                releaseTitle={release.title}
              />
            </div>
          )}

          {/* Link to regular profile */}
          <div className="pt-4 text-center">
            <a
              href={`/${artist.handle}?mode=listen`}
              className="text-sm text-tertiary-token hover:text-secondary-token transition-colors"
            >
              View full profile →
            </a>
          </div>
        </div>
      </ArtistPageShell>
    </div>
  );
}
```

### 5. Countdown Timer Component

**File: `apps/web/components/profile/CountdownTimer.tsx`**

```typescript
'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  targetDate: Date;
  label?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(targetDate: Date): TimeLeft {
  const difference = targetDate.getTime() - Date.now();

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

export function CountdownTimer({ targetDate, label = 'Releases in' }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetDate));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(targetDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-tertiary-token mb-2">{label}</p>
        <div className="flex justify-center gap-3">
          {['days', 'hours', 'mins', 'secs'].map((unit) => (
            <div key={unit} className="flex flex-col items-center">
              <span className="text-3xl font-bold text-primary-token tabular-nums">
                --
              </span>
              <span className="text-xs text-tertiary-token uppercase tracking-wider">
                {unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isReleased = timeLeft.days === 0 && timeLeft.hours === 0 &&
                     timeLeft.minutes === 0 && timeLeft.seconds === 0;

  if (isReleased) {
    return (
      <div className="text-center py-4">
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 text-green-400 font-semibold">
          🎉 Out Now!
        </span>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <p className="text-sm text-tertiary-token mb-2">{label}</p>
      <div className="flex justify-center gap-3">
        <TimeUnit value={timeLeft.days} label="days" />
        <TimeUnit value={timeLeft.hours} label="hours" />
        <TimeUnit value={timeLeft.minutes} label="mins" />
        <TimeUnit value={timeLeft.seconds} label="secs" />
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center min-w-[3.5rem] p-2 rounded-lg bg-surface-1">
      <span className="text-3xl font-bold text-primary-token tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs text-tertiary-token uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
```

### 6. Pre-save Buttons Component

**File: `apps/web/components/profile/PresaveButtons.tsx`**

```typescript
'use client';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';

interface PresaveButtonsProps {
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  releaseTitle: string;
}

export function PresaveButtons({
  spotifyUrl,
  appleMusicUrl,
  releaseTitle,
}: PresaveButtonsProps) {
  const handlePresaveClick = (platform: 'spotify' | 'apple_music') => {
    track('presave_clicked', {
      platform,
      releaseTitle,
      source: 'profile_takeover',
    });
  };

  return (
    <div className="flex justify-center gap-3">
      {spotifyUrl && (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => handlePresaveClick('spotify')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1DB954]/10 hover:bg-[#1DB954]/20 text-[#1DB954] transition-colors"
        >
          <SocialIcon platform="spotify" className="w-5 h-5" />
          <span className="text-sm font-medium">Pre-save</span>
        </a>
      )}

      {appleMusicUrl && (
        <a
          href={appleMusicUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => handlePresaveClick('apple_music')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FA243C]/10 hover:bg-[#FA243C]/20 text-[#FA243C] transition-colors"
        >
          <SocialIcon platform="applemusic" className="w-5 h-5" />
          <span className="text-sm font-medium">Pre-add</span>
        </a>
      )}
    </div>
  );
}
```

### 7. Dashboard: Enable Presale Takeover

**File: `apps/web/components/dashboard/organisms/release-presale-settings.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { Switch } from '@/components/atoms/Switch';
import { Input } from '@/components/atoms/Input';
import { Label } from '@/components/atoms/Label';
import { Button } from '@/components/atoms/Button';
import { Calendar } from 'lucide-react';

interface PresaleSettingsProps {
  releaseId: string;
  releaseTitle: string;
  releaseDate: Date;
  initialSettings: {
    presaleEnabled: boolean;
    presaleStartDate: Date | null;
    presaleMessage: string | null;
    presaleSpotifyPresaveUrl: string | null;
    presaleApplePresaveUrl: string | null;
  };
  onSave: (settings: PresaleSettings) => Promise<void>;
}

interface PresaleSettings {
  presaleEnabled: boolean;
  presaleStartDate: Date | null;
  presaleMessage: string | null;
  presaleSpotifyPresaveUrl: string | null;
  presaleApplePresaveUrl: string | null;
}

export function ReleasePresaleSettings({
  releaseId,
  releaseTitle,
  releaseDate,
  initialSettings,
  onSave,
}: PresaleSettingsProps) {
  const [settings, setSettings] = useState<PresaleSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  // Calculate default start date (14 days before release)
  const defaultStartDate = new Date(releaseDate);
  defaultStartDate.setDate(defaultStartDate.getDate() - 14);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(settings);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-surface-0 rounded-xl border border-subtle">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-primary-token">
            Profile Takeover
          </h3>
          <p className="text-sm text-secondary-token mt-1">
            Feature this release on your main profile until release day
          </p>
        </div>
        <Switch
          checked={settings.presaleEnabled}
          onCheckedChange={(checked) =>
            setSettings(prev => ({ ...prev, presaleEnabled: checked }))
          }
        />
      </div>

      {settings.presaleEnabled && (
        <div className="space-y-4 pt-4 border-t border-subtle">
          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="presale-start">Start showing takeover</Label>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-tertiary-token" />
              <Input
                id="presale-start"
                type="date"
                value={settings.presaleStartDate?.toISOString().split('T')[0] ?? ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  presaleStartDate: e.target.value ? new Date(e.target.value) : null
                }))}
                max={releaseDate.toISOString().split('T')[0]}
              />
            </div>
            <p className="text-xs text-tertiary-token">
              Leave empty to start immediately. Default: 14 days before release.
            </p>
          </div>

          {/* Custom Message */}
          <div className="space-y-2">
            <Label htmlFor="presale-message">Custom message (optional)</Label>
            <Input
              id="presale-message"
              type="text"
              placeholder={`Be the first to hear "${releaseTitle}"`}
              value={settings.presaleMessage ?? ''}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                presaleMessage: e.target.value || null
              }))}
              maxLength={140}
            />
          </div>

          {/* Pre-save URLs */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-primary-token">
              Pre-save Links (optional)
            </p>

            <div className="space-y-2">
              <Label htmlFor="spotify-presave">Spotify Pre-save URL</Label>
              <Input
                id="spotify-presave"
                type="url"
                placeholder="https://distrokid.com/hyperfollow/..."
                value={settings.presaleSpotifyPresaveUrl ?? ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  presaleSpotifyPresaveUrl: e.target.value || null
                }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apple-presave">Apple Music Pre-add URL</Label>
              <Input
                id="apple-presave"
                type="url"
                placeholder="https://music.apple.com/album/..."
                value={settings.presaleApplePresaveUrl ?? ''}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  presaleApplePresaveUrl: e.target.value || null
                }))}
              />
            </div>
          </div>

          {/* Preview Link */}
          <div className="pt-4 flex items-center justify-between">
            <a
              href={`?preview_presale=${releaseId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent-bright hover:underline"
            >
              Preview takeover →
            </a>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              variant="primary"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 8. API Endpoint: Update Presale Settings

**File: `apps/web/app/api/releases/[id]/presale/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { discogReleases, creatorProfiles } from '@/lib/db/schema';
import { revalidateTag } from 'next/cache';

const presaleSettingsSchema = z.object({
  presaleEnabled: z.boolean(),
  presaleStartDate: z.string().datetime().nullable(),
  presaleMessage: z.string().max(140).nullable(),
  presaleSpotifyPresaveUrl: z.string().url().nullable().or(z.literal('')),
  presaleApplePresaveUrl: z.string().url().nullable().or(z.literal('')),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await getCachedAuth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const releaseId = params.id;

  // Verify release belongs to user
  const [release] = await db
    .select({
      id: discogReleases.id,
      creatorProfileId: discogReleases.creatorProfileId,
      username: creatorProfiles.username,
    })
    .from(discogReleases)
    .innerJoin(creatorProfiles, eq(discogReleases.creatorProfileId, creatorProfiles.id))
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(creatorProfiles.userId, userId)
      )
    )
    .limit(1);

  if (!release) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = presaleSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }

  const { presaleEnabled, presaleStartDate, presaleMessage, presaleSpotifyPresaveUrl, presaleApplePresaveUrl } = parsed.data;

  await db
    .update(discogReleases)
    .set({
      presaleEnabled,
      presaleStartDate: presaleStartDate ? new Date(presaleStartDate) : null,
      presaleMessage: presaleMessage || null,
      presaleSpotifyPresaveUrl: presaleSpotifyPresaveUrl || null,
      presaleApplePresaveUrl: presaleApplePresaveUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, releaseId));

  // Invalidate profile cache so takeover shows/hides immediately
  revalidateTag(`public-profile:${release.username}`);

  return NextResponse.json({ success: true });
}
```

### 9. Enhanced Notification Subscription with Release Attribution

**Updates to `apps/web/lib/notifications/domain.ts`:**

```typescript
interface SubscribeOptions {
  // ... existing options ...
  releaseId?: string;
  subscriptionSource?: 'profile_takeover' | 'release_page' | 'direct' | 'qr_code';
}

export async function subscribeToNotificationsDomain(
  options: SubscribeOptions
): Promise<SubscriptionResult> {
  // ... existing validation logic ...

  // Add release attribution when inserting
  const insertData = {
    // ... existing fields ...
    releaseId: options.releaseId ?? null,
    source: options.subscriptionSource ?? 'direct',
  };

  // ... rest of function ...
}
```

---

## User Flows

### Artist Flow: Enable Presale Takeover

```
1. Artist navigates to Dashboard → Releases
2. Finds upcoming release, clicks "Edit" or settings icon
3. Sees "Profile Takeover" section with toggle
4. Enables takeover, optionally sets:
   - Start date (when to begin showing takeover)
   - Custom message
   - Pre-save URLs (Spotify, Apple Music)
5. Clicks "Preview" to see how it looks
6. Saves settings
7. Profile now shows takeover to visitors
```

### Fan Flow: Subscribe via Takeover

```
1. Fan visits artist profile: /{username}
2. Sees release artwork, title, countdown timer
3. Reads "Be the first to hear [title]"
4. Enters email/phone in subscription form
5. Submits → sees confirmation
6. Option to pre-save on Spotify/Apple Music
7. Option to share with friends
8. On release day, receives notification
```

---

## Analytics Events

| Event | Properties | Description |
|-------|------------|-------------|
| `presale_takeover_impression` | `handle`, `releaseId`, `releaseTitle`, `daysUntilRelease` | Takeover page viewed |
| `presale_subscribe_attempt` | `handle`, `releaseId`, `channel`, `source` | User started subscription |
| `presale_subscribe_success` | `handle`, `releaseId`, `channel`, `source` | Subscription completed |
| `presale_presave_clicked` | `handle`, `releaseId`, `platform` | Pre-save link clicked |
| `presale_share_clicked` | `handle`, `releaseId`, `shareMethod` | Share button clicked |
| `presale_ended` | `handle`, `releaseId`, `totalSubscribers` | Takeover period ended |

---

## Edge Cases & Considerations

### Multiple Upcoming Releases
- If artist has multiple releases with presale enabled, show the **soonest** one
- Future: Allow artist to manually pin a specific release

### Release Date Passes
- Automatically disable takeover when `releaseDate` passes
- Redirect to normal profile with the release featured in discography
- Send scheduled notifications to subscribers

### Timezone Handling
- Store all dates in UTC
- Display countdown in user's local timezone
- Release "drops" at midnight artist's timezone (or a configurable time)

### Cache Invalidation
- Profile cache (ISR 1 hour) needs immediate invalidation when:
  - Presale is enabled/disabled
  - Presale settings change
  - Release date passes
- Use `revalidateTag('public-profile:${username}')` on changes

### Mobile Responsiveness
- Artwork: Full width on mobile, max-w-sm on desktop
- Countdown: Horizontal on all sizes, slightly smaller on mobile
- Buttons: Full width, stacked vertically

### SEO Considerations
- Update OG tags to show release artwork + title when takeover active
- Add structured data for MusicRelease with datePublished in future
- Ensure crawlers see appropriate content (no JS-dependent critical content)

### Accessibility
- Countdown has aria-live region for screen readers
- All buttons have proper labels
- Color contrast meets WCAG AA
- Focus states visible

---

## Implementation Phases

### Phase 1: Core Infrastructure (Foundation)
1. Database schema migrations
2. `getActivePresaleForCreator` query
3. Basic `PresaleTakeoverPage` component
4. Profile page integration (conditional rendering)

### Phase 2: Countdown & UI Polish
1. `CountdownTimer` component with animations
2. `PresaveButtons` component
3. Responsive styling and dark mode
4. Loading states and error handling

### Phase 3: Dashboard Controls
1. Presale settings panel in release edit
2. API endpoint for saving settings
3. Preview functionality
4. Cache invalidation on changes

### Phase 4: Analytics & Attribution
1. Presale-specific analytics events
2. Release attribution on subscriptions
3. Dashboard analytics view for presale performance
4. Conversion tracking

### Phase 5: Advanced Features
1. Custom release time (not just midnight)
2. Multiple presale support (queue system)
3. A/B testing different CTA messages
4. Share modal with pre-populated social posts

---

## Files to Create/Modify

### New Files
- `apps/web/lib/db/queries/presale.ts` - Presale query functions
- `apps/web/components/profile/PresaleTakeoverPage.tsx` - Main takeover component
- `apps/web/components/profile/CountdownTimer.tsx` - Countdown component
- `apps/web/components/profile/PresaveButtons.tsx` - Pre-save CTAs
- `apps/web/components/dashboard/organisms/release-presale-settings.tsx` - Dashboard settings
- `apps/web/app/api/releases/[id]/presale/route.ts` - API endpoint
- `apps/web/lib/db/migrations/XXXX_add_presale_fields.ts` - DB migration

### Modified Files
- `apps/web/lib/db/schema/content.ts` - Add presale fields to discogReleases
- `apps/web/lib/db/schema/analytics.ts` - Add releaseId to notificationSubscriptions
- `apps/web/app/[username]/page.tsx` - Add presale takeover logic
- `apps/web/components/profile/artist-notifications-cta/types.ts` - Add presale context
- `apps/web/components/profile/artist-notifications-cta/useSubscriptionForm.ts` - Handle presale attribution
- `apps/web/lib/notifications/domain.ts` - Add release attribution

---

## Success Metrics

1. **Conversion Rate**: % of takeover views that result in subscriptions
2. **Subscriber Growth**: Subscribers gained via takeover vs. normal profile
3. **Pre-save Rate**: % of subscribers who also pre-save
4. **Time on Page**: Engagement with takeover vs. normal profile
5. **Share Rate**: % of subscribers who share the presale

**Target Goals:**
- 15%+ conversion rate on takeover views to subscriptions
- 2x subscriber growth compared to non-takeover releases
- 30%+ pre-save rate when links are available
