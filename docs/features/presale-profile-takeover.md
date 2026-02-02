# Presale Profile Takeover Feature

## Executive Summary

Artists can set an **announcement date** for upcoming releases. On that date, three things happen simultaneously:

1. **Profile Takeover** - The artist's main profile (`/{username}`) transforms to showcase the upcoming release
2. **Smart Link Goes Live** - The release page (`/{username}/{slug}`) becomes publicly accessible
3. **Announcement Email** - Existing subscribers receive an email about the upcoming release

The default announcement date is **2 weeks before the release date**.

---

## The Announcement Date Model

```
                    ANNOUNCEMENT DATE                    RELEASE DATE
                           │                                  │
    ───────────────────────┼──────────────────────────────────┼───────────────►
                           │                                  │
                           │  ┌─────────────────────────────┐ │
                           │  │   PRESALE WINDOW            │ │
                           │  │   (default: 14 days)        │ │
                           │  └─────────────────────────────┘ │
                           │                                  │
                           ▼                                  ▼

              • Profile takeover activates      • Takeover ends
              • Smart link goes live            • Normal profile returns
              • Announcement email sent         • Release day email sent
              • Countdown begins                • "Out Now" state
```

### Key Dates

| Field | Description | Default |
|-------|-------------|---------|
| `release_date` | When the music drops on DSPs | Required |
| `announcement_date` | When presale campaign begins | `release_date - 14 days` |

### What Happens on Each Date

**On Announcement Date:**
- Profile takeover activates (replaces normal profile view)
- Release smart link (`/{username}/{slug}`) becomes publicly accessible
- Announcement email sent to all existing subscribers
- Countdown timer starts (counting down to release date)

**On Release Date:**
- Profile takeover automatically ends
- Normal profile returns (with release in discography)
- Release day notification sent to presale subscribers
- Smart link shows "Out Now" with streaming links

---

## Problem Statement

Currently:
1. Artists create releases with future `releaseDate`
2. Smart links exist but there's no coordinated "announcement" moment
3. No way to feature an upcoming release prominently on the profile
4. No automated email to existing subscribers when a new release is announced
5. Artists manually share links at arbitrary times

**Goal:** A single "announcement date" that triggers profile takeover, makes the link live, and notifies existing fans—all at once.

---

## Feature Requirements

### Core Requirements

1. **Announcement Date Field**
   - New `announcement_date` field on releases
   - Default: 14 days before `release_date`
   - Artist can customize (any date before release)
   - Must be in the future when set

2. **Profile Takeover (on announcement date)**
   - Replace standard profile with release-focused layout
   - Show release artwork prominently
   - Display countdown to release date
   - Primary CTA: "Get notified when it drops"
   - Secondary: Pre-save links (Spotify, Apple Music)
   - Link to view full profile

3. **Smart Link Activation (on announcement date)**
   - Release page (`/{username}/{slug}`) becomes accessible
   - Before announcement: 404 or redirect to profile
   - After announcement: Shows presale page with countdown
   - After release: Shows streaming links

4. **Announcement Email (on announcement date)**
   - Triggered automatically at announcement time
   - Sent to all existing subscribers of the artist
   - Contains: artwork, title, release date, link to presale page
   - "Be the first to hear [title] when it drops [date]"

5. **Release Day Email (on release date)**
   - Sent to subscribers who signed up during presale window
   - Contains: artwork, title, streaming links
   - "It's here! [title] is out now"

---

## Technical Design

### 1. Database Schema Changes

```sql
-- Add announcement date to releases
ALTER TABLE discog_releases ADD COLUMN announcement_date TIMESTAMP;
ALTER TABLE discog_releases ADD COLUMN announcement_message TEXT; -- custom email/CTA text
ALTER TABLE discog_releases ADD COLUMN announcement_email_sent_at TIMESTAMP; -- track if sent
ALTER TABLE discog_releases ADD COLUMN presale_spotify_url TEXT;
ALTER TABLE discog_releases ADD COLUMN presale_apple_url TEXT;

-- Index for finding releases to announce (cron job)
CREATE INDEX idx_releases_pending_announcement
ON discog_releases (announcement_date, announcement_email_sent_at)
WHERE announcement_date IS NOT NULL
  AND announcement_email_sent_at IS NULL;

-- Index for active takeovers
CREATE INDEX idx_releases_active_takeover
ON discog_releases (creator_profile_id, announcement_date, release_date)
WHERE announcement_date IS NOT NULL;

-- Track which release a subscriber signed up for
ALTER TABLE notification_subscriptions ADD COLUMN release_id UUID REFERENCES discog_releases(id);
ALTER TABLE notification_subscriptions ADD COLUMN source TEXT; -- 'profile_takeover', 'release_page', 'announcement_email'
```

**Drizzle Schema:**

```typescript
// apps/web/lib/db/schema/content.ts

export const discogReleases = pgTable('discog_releases', {
  // ... existing fields ...

  // Announcement/Presale fields
  announcementDate: timestamp('announcement_date'),        // When takeover starts + email sends
  announcementMessage: text('announcement_message'),       // Custom message for email/CTA
  announcementEmailSentAt: timestamp('announcement_email_sent_at'), // Null until sent
  presaleSpotifyUrl: text('presale_spotify_url'),          // Pre-save link
  presaleAppleUrl: text('presale_apple_url'),              // Pre-add link
});
```

### 2. Query: Get Active Takeover Release

```typescript
// apps/web/lib/db/queries/presale.ts

export interface ActiveTakeoverRelease {
  id: string;
  title: string;
  slug: string;
  releaseType: 'single' | 'album' | 'ep' | 'compilation';
  releaseDate: Date;
  announcementDate: Date;
  artworkUrl: string | null;
  announcementMessage: string | null;
  presaleSpotifyUrl: string | null;
  presaleAppleUrl: string | null;
  daysUntilRelease: number;
}

/**
 * Get the active takeover release for a creator.
 * Returns a release if:
 * - announcement_date <= now (announced)
 * - release_date > now (not yet released)
 */
export async function getActiveTakeoverRelease(
  creatorProfileId: string
): Promise<ActiveTakeoverRelease | null> {
  const now = new Date();

  const [release] = await db
    .select({
      id: discogReleases.id,
      title: discogReleases.title,
      slug: discogReleases.slug,
      releaseType: discogReleases.releaseType,
      releaseDate: discogReleases.releaseDate,
      announcementDate: discogReleases.announcementDate,
      artworkUrl: discogReleases.artworkUrl,
      announcementMessage: discogReleases.announcementMessage,
      presaleSpotifyUrl: discogReleases.presaleSpotifyUrl,
      presaleAppleUrl: discogReleases.presaleAppleUrl,
    })
    .from(discogReleases)
    .where(
      and(
        eq(discogReleases.creatorProfileId, creatorProfileId),
        isNotNull(discogReleases.announcementDate),
        lte(discogReleases.announcementDate, now),  // Announced
        gt(discogReleases.releaseDate, now)          // Not yet released
      )
    )
    .orderBy(asc(discogReleases.releaseDate)) // Soonest release first
    .limit(1);

  if (!release?.releaseDate || !release?.announcementDate) return null;

  const daysUntilRelease = Math.ceil(
    (release.releaseDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    ...release,
    releaseType: release.releaseType as ActiveTakeoverRelease['releaseType'],
    daysUntilRelease,
  };
}
```

### 3. Query: Check if Release is Announced (for Smart Links)

```typescript
// apps/web/lib/db/queries/presale.ts

export type ReleaseVisibility = 'not_announced' | 'presale' | 'released';

/**
 * Determine the visibility state of a release.
 */
export async function getReleaseVisibility(
  releaseId: string
): Promise<ReleaseVisibility> {
  const now = new Date();

  const [release] = await db
    .select({
      announcementDate: discogReleases.announcementDate,
      releaseDate: discogReleases.releaseDate,
    })
    .from(discogReleases)
    .where(eq(discogReleases.id, releaseId))
    .limit(1);

  if (!release) return 'not_announced';

  const { announcementDate, releaseDate } = release;

  // No announcement date set = not announced
  if (!announcementDate) return 'not_announced';

  // Before announcement date = not announced
  if (now < announcementDate) return 'not_announced';

  // After release date = released
  if (releaseDate && now >= releaseDate) return 'released';

  // Between announcement and release = presale
  return 'presale';
}
```

### 4. Profile Page Integration

```typescript
// apps/web/app/[username]/page.tsx

import { getActiveTakeoverRelease } from '@/lib/db/queries/presale';
import { PresaleTakeoverPage } from '@/components/profile/PresaleTakeoverPage';

export default async function ArtistPage({ params, searchParams }: Props) {
  // ... existing profile fetch ...

  // Check for active takeover
  const activeTakeover = await getActiveTakeoverRelease(profile.id);

  // Show takeover if active and user isn't explicitly viewing another mode
  if (activeTakeover && mode === 'profile') {
    return (
      <PresaleTakeoverPage
        artist={artist}
        release={activeTakeover}
        socialLinks={socialLinks}
      />
    );
  }

  // ... normal profile rendering ...
}
```

### 5. Smart Link Page Integration

```typescript
// apps/web/app/[username]/[slug]/page.tsx

import { redirect } from 'next/navigation';
import { getReleaseVisibility } from '@/lib/db/queries/presale';

export default async function ReleasePage({ params }: Props) {
  const { username, slug } = params;
  const release = await getRelease(username, slug);

  // Invalid slug → redirect to artist profile (never 404)
  if (!release) {
    redirect(`/${username}?ref=invalid_link`);
  }

  const visibility = await getReleaseVisibility(release.id);

  switch (visibility) {
    case 'not_announced':
      // Release exists but not announced → redirect (don't leak existence)
      redirect(`/${username}`);

    case 'presale':
      // Show presale page with countdown and notification signup
      return <ReleasePresalePage release={release} />;

    case 'released':
      // Show normal smart link with streaming buttons
      return <ReleaseSmartLinkPage release={release} />;
  }
}
```

### 6. Announcement Email Cron Job

```typescript
// apps/web/lib/cron/send-announcement-emails.ts

import { db } from '@/lib/db';
import { discogReleases, notificationSubscriptions, creatorProfiles } from '@/lib/db/schema';
import { sendAnnouncementEmail } from '@/lib/email/announcement';

/**
 * Cron job: Find releases that need announcement emails and send them.
 * Run every 15 minutes.
 */
export async function sendPendingAnnouncementEmails() {
  const now = new Date();

  // Find releases where:
  // - announcement_date has passed
  // - announcement_email_sent_at is null (not yet sent)
  const pendingReleases = await db
    .select({
      releaseId: discogReleases.id,
      releaseTitle: discogReleases.title,
      releaseSlug: discogReleases.slug,
      releaseDate: discogReleases.releaseDate,
      artworkUrl: discogReleases.artworkUrl,
      announcementMessage: discogReleases.announcementMessage,
      creatorProfileId: discogReleases.creatorProfileId,
      artistName: creatorProfiles.displayName,
      artistHandle: creatorProfiles.username,
    })
    .from(discogReleases)
    .innerJoin(creatorProfiles, eq(discogReleases.creatorProfileId, creatorProfiles.id))
    .where(
      and(
        isNotNull(discogReleases.announcementDate),
        lte(discogReleases.announcementDate, now),
        isNull(discogReleases.announcementEmailSentAt)
      )
    );

  for (const release of pendingReleases) {
    // Get all subscribers for this artist
    const subscribers = await db
      .select({
        email: notificationSubscriptions.email,
        phone: notificationSubscriptions.phone,
        channel: notificationSubscriptions.channel,
      })
      .from(notificationSubscriptions)
      .where(
        and(
          eq(notificationSubscriptions.creatorProfileId, release.creatorProfileId),
          isNull(notificationSubscriptions.unsubscribedAt)
        )
      );

    // Send announcement emails
    for (const subscriber of subscribers) {
      if (subscriber.channel === 'email' && subscriber.email) {
        await sendAnnouncementEmail({
          to: subscriber.email,
          artistName: release.artistName || release.artistHandle,
          releaseTitle: release.releaseTitle,
          releaseDate: release.releaseDate,
          artworkUrl: release.artworkUrl,
          presaleUrl: `https://jovie.fm/${release.artistHandle}/${release.releaseSlug}`,
          customMessage: release.announcementMessage,
        });
      }
      // TODO: SMS announcements
    }

    // Mark as sent
    await db
      .update(discogReleases)
      .set({ announcementEmailSentAt: now })
      .where(eq(discogReleases.id, release.releaseId));
  }
}
```

### 7. Dashboard: Set Announcement Date

```typescript
// apps/web/components/dashboard/organisms/release-announcement-settings.tsx

'use client';

import { useState } from 'react';
import { Input } from '@jovie/ui';
import { Label } from '@/components/atoms/Label';
import { Button } from '@/components/atoms/Button';
import { Calendar, Mail, Megaphone } from 'lucide-react';
import { formatDate, addDays, subDays } from 'date-fns';

interface AnnouncementSettingsProps {
  releaseId: string;
  releaseTitle: string;
  releaseDate: Date;
  currentAnnouncementDate: Date | null;
  currentMessage: string | null;
  presaleSpotifyUrl: string | null;
  presaleAppleUrl: string | null;
  onSave: (settings: AnnouncementSettings) => Promise<void>;
}

interface AnnouncementSettings {
  announcementDate: Date | null;
  announcementMessage: string | null;
  presaleSpotifyUrl: string | null;
  presaleAppleUrl: string | null;
}

export function ReleaseAnnouncementSettings({
  releaseId,
  releaseTitle,
  releaseDate,
  currentAnnouncementDate,
  currentMessage,
  presaleSpotifyUrl: initialSpotifyUrl,
  presaleAppleUrl: initialAppleUrl,
  onSave,
}: AnnouncementSettingsProps) {
  // Default: 14 days before release
  const defaultAnnouncementDate = subDays(releaseDate, 14);

  const [announcementDate, setAnnouncementDate] = useState<Date | null>(
    currentAnnouncementDate ?? defaultAnnouncementDate
  );
  const [message, setMessage] = useState(currentMessage ?? '');
  const [spotifyUrl, setSpotifyUrl] = useState(initialSpotifyUrl ?? '');
  const [appleUrl, setAppleUrl] = useState(initialAppleUrl ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        announcementDate,
        announcementMessage: message || null,
        presaleSpotifyUrl: spotifyUrl || null,
        presaleAppleUrl: appleUrl || null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isAnnounced = announcementDate && new Date() >= announcementDate;

  return (
    <div className="space-y-6 p-6 bg-surface-0 rounded-xl border border-subtle">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-accent-bright/10">
          <Megaphone className="w-5 h-5 text-accent-bright" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-primary-token">
            Announcement Date
          </h3>
          <p className="text-sm text-secondary-token mt-1">
            On this date, your profile will feature this release, the link goes live,
            and existing subscribers get notified.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Announcement Date Picker */}
        <div className="space-y-2">
          <Label htmlFor="announcement-date">Announce on</Label>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-tertiary-token" />
            <Input
              id="announcement-date"
              type="date"
              value={announcementDate?.toISOString().split('T')[0] ?? ''}
              onChange={(e) => setAnnouncementDate(e.target.value ? new Date(e.target.value) : null)}
              min={new Date().toISOString().split('T')[0]}
              max={releaseDate.toISOString().split('T')[0]}
              disabled={isAnnounced}
            />
          </div>
          {isAnnounced ? (
            <p className="text-xs text-green-500">
              Announced on {formatDate(announcementDate!, 'MMM d, yyyy')}
            </p>
          ) : (
            <p className="text-xs text-tertiary-token">
              Default: 2 weeks before release ({formatDate(defaultAnnouncementDate, 'MMM d, yyyy')})
            </p>
          )}
        </div>

        {/* What happens */}
        <div className="p-4 rounded-lg bg-surface-1 space-y-2">
          <p className="text-sm font-medium text-primary-token">
            On {announcementDate ? formatDate(announcementDate, 'MMMM d') : 'announcement date'}:
          </p>
          <ul className="text-sm text-secondary-token space-y-1">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
              Your profile showcases "{releaseTitle}"
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
              Smart link goes live for sharing
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" />
              Email sent to your subscribers
            </li>
          </ul>
        </div>

        {/* Custom Message */}
        <div className="space-y-2">
          <Label htmlFor="announcement-message">Custom message (optional)</Label>
          <Input
            id="announcement-message"
            type="text"
            placeholder={`Be the first to hear "${releaseTitle}"`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
          />
          <p className="text-xs text-tertiary-token">
            Used in the announcement email and profile takeover
          </p>
        </div>

        {/* Pre-save URLs */}
        <div className="space-y-3 pt-2">
          <p className="text-sm font-medium text-primary-token">Pre-save Links</p>

          <div className="space-y-2">
            <Label htmlFor="spotify-presave">Spotify Pre-save URL</Label>
            <Input
              id="spotify-presave"
              type="url"
              placeholder="https://distrokid.com/hyperfollow/..."
              value={spotifyUrl}
              onChange={(e) => setSpotifyUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apple-presave">Apple Music Pre-add URL</Label>
            <Input
              id="apple-presave"
              type="url"
              placeholder="https://music.apple.com/..."
              value={appleUrl}
              onChange={(e) => setAppleUrl(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
```

---

## User Flows

### Artist Flow: Set Up Announcement

```
1. Artist goes to Dashboard → Releases
2. Clicks on upcoming release (or adds new one)
3. Sets release date (when music drops on DSPs)
4. Sets announcement date (defaults to 2 weeks before)
5. Optionally adds:
   - Custom message for email/profile
   - Spotify pre-save URL
   - Apple Music pre-add URL
6. Saves → sees confirmation with what will happen

Timeline shown:
┌────────────────────────────────────────────────────┐
│  Feb 1: Announcement                               │
│  • Profile takeover starts                         │
│  • Link goes live                                  │
│  • Email sent to 847 subscribers                   │
│                                                    │
│  Feb 15: Release                                   │
│  • Music available on streaming platforms          │
│  • Release day email to presale subscribers        │
└────────────────────────────────────────────────────┘
```

### Fan Flow: Discover via Profile Takeover

```
1. Fan visits jovie.fm/artistname
2. Instead of normal profile, sees:
   - Big release artwork
   - "New Single" badge
   - Title + artist name
   - Countdown: "Drops in 12 days, 4 hours"
   - "Be the first to hear it"
   - Email/phone signup form
   - Pre-save buttons (Spotify, Apple)
   - "View full profile →" link
3. Enters email → subscribes
4. Sees confirmation + share buttons
5. On release day, gets notification email
```

### Fan Flow: Via Announcement Email

```
1. Fan is existing subscriber of artist
2. On announcement date, receives email:
   ┌─────────────────────────────────────┐
   │  [Artwork]                          │
   │                                     │
   │  New music from Artist Name         │
   │                                     │
   │  "Song Title" drops Feb 15          │
   │                                     │
   │  [Listen First →]                   │
   │                                     │
   │  "Custom message from artist..."    │
   └─────────────────────────────────────┘
3. Clicks → goes to presale page
4. Can pre-save on Spotify/Apple
5. Already subscribed, so just confirms interest
```

---

## Notification Timeline

| Event | Who Receives | Content |
|-------|--------------|---------|
| **Announcement Date** | All existing subscribers | "New music coming! [Title] drops [Date]" |
| **Release Date** | Presale subscribers (signed up during window) | "It's here! [Title] is out now. Listen →" |

---

## Analytics Events

| Event | Properties | Trigger |
|-------|------------|---------|
| `release_announced` | `releaseId`, `artistHandle`, `subscriberCount` | Announcement date reached |
| `announcement_email_sent` | `releaseId`, `recipientCount` | Emails sent |
| `announcement_email_opened` | `releaseId`, `subscriberId` | Email opened |
| `takeover_impression` | `releaseId`, `artistHandle`, `daysUntilRelease` | Profile takeover viewed |
| `presale_page_view` | `releaseId`, `source` (profile/email/direct) | Smart link viewed |
| `presale_subscribe` | `releaseId`, `channel`, `source` | New subscriber during presale |
| `presale_presave_click` | `releaseId`, `platform` | Pre-save button clicked |
| `release_day_email_sent` | `releaseId`, `recipientCount` | Release day emails sent |

---

## Edge Cases

### Multiple Upcoming Releases
- If artist has multiple announced releases, show the **soonest** one on profile
- Each release has its own smart link that works independently
- Future: Let artist manually pin which release to feature

### Announcement Date in the Past
- If artist sets announcement date to today or earlier, takeover activates immediately
- If release date has passed, no takeover (release is already out)

### No Subscribers
- Announcement email step is skipped if artist has 0 subscribers
- Profile takeover and smart link still activate

### Changing Dates After Announcement
- Once announced (email sent), announcement date cannot be changed
- Release date can still be pushed back (countdown updates)
- If release date pushed earlier, may need to handle edge cases

### Invalid or Unannounced Smart Links
- **Always redirect to artist profile** - never 404 on `/{username}/*`
- Protects artists from typos in shared links
- Prevents leaks of unannounced releases (no confirmation slug exists)
- Old/deleted release links gracefully degrade to profile
- Optional: Show subtle toast on redirect ("Couldn't find that link")

---

## Implementation Phases

### Phase 1: Database & Core Logic
1. Add `announcement_date`, `announcement_message`, `announcement_email_sent_at` to releases
2. Add `presale_spotify_url`, `presale_apple_url` fields
3. Create `getActiveTakeoverRelease()` query
4. Create `getReleaseVisibility()` query

### Phase 2: Profile Takeover
1. `PresaleTakeoverPage` component
2. `CountdownTimer` component
3. Profile page integration (conditional rendering)
4. Notification CTA with release attribution

### Phase 3: Smart Link Visibility
1. Update `/{username}/{slug}` to check visibility
2. Create `ReleasePresalePage` component (countdown + signup)
3. Handle 404 for unannounced releases

### Phase 4: Announcement Emails
1. Create announcement email template
2. Cron job to send pending announcements
3. Track `announcement_email_sent_at`
4. Email analytics (opens, clicks)

### Phase 5: Dashboard UI
1. `ReleaseAnnouncementSettings` component
2. API endpoint to save announcement settings
3. Preview functionality
4. Timeline visualization

### Phase 6: Release Day Notifications
1. Create release day email template
2. Cron job to send on release date
3. Track presale subscribers vs general subscribers

---

## Files to Create/Modify

### New Files
```
apps/web/lib/db/queries/presale.ts
apps/web/lib/db/migrations/XXXX_add_announcement_fields.ts
apps/web/lib/cron/send-announcement-emails.ts
apps/web/lib/cron/send-release-day-emails.ts
apps/web/lib/email/templates/announcement.tsx
apps/web/lib/email/templates/release-day.tsx
apps/web/components/profile/PresaleTakeoverPage.tsx
apps/web/components/profile/CountdownTimer.tsx
apps/web/components/profile/PresaveButtons.tsx
apps/web/components/profile/ReleasePresalePage.tsx
apps/web/components/dashboard/organisms/release-announcement-settings.tsx
apps/web/app/api/releases/[id]/announcement/route.ts
```

### Modified Files
```
apps/web/lib/db/schema/content.ts - Add announcement fields
apps/web/lib/db/schema/analytics.ts - Add release_id to subscriptions
apps/web/app/[username]/page.tsx - Add takeover logic
apps/web/app/[username]/[slug]/page.tsx - Add visibility check
apps/web/lib/notifications/domain.ts - Add release attribution
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Takeover → Subscribe conversion | 15%+ |
| Announcement email open rate | 40%+ |
| Announcement email → Presave click | 20%+ |
| Pre-save rate (when links provided) | 30%+ |
| Release day email open rate | 50%+ |

---

## Summary

The **announcement date** is the single trigger that:
- Activates profile takeover
- Makes the smart link publicly accessible
- Sends announcement email to existing subscribers

Default is **2 weeks before release**, giving artists a built-in presale window. This creates a coordinated launch moment without requiring artists to manually time multiple actions.
