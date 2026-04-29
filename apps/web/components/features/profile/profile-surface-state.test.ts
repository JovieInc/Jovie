import { describe, expect, it } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist, LegacySocialLink } from '@/types/db';
import { resolveProfileSurfaceState } from './profile-surface-state';

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'artist',
  spotify_id: 'spotify-1',
  name: 'Test Artist',
  image_url: 'https://example.com/artist.jpg',
  tagline: 'Independent songwriter.',
  settings: { heroRoleLabel: 'Songwriter' },
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

const spotifyLink = {
  id: 'spotify',
  artist_id: artist.id,
  platform: 'spotify',
  url: 'https://open.spotify.com/artist/test',
  clicks: 0,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies LegacySocialLink;

const venmoLink = {
  id: 'venmo',
  artist_id: artist.id,
  platform: 'venmo',
  url: 'https://venmo.com/test',
  clicks: 0,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies LegacySocialLink;

const upcomingShow = {
  id: 'show-1',
  profileId: artist.id,
  externalId: null,
  provider: 'manual',
  title: null,
  venueName: 'The Echo',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  startDate: '2026-05-20',
  startTime: null,
  timezone: null,
  latitude: null,
  longitude: null,
  ticketUrl: 'https://tickets.example.com/show-1',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies TourDateViewModel;

describe('resolveProfileSurfaceState', () => {
  it('prioritizes ticketed shows over music and alerts', () => {
    const state = resolveProfileSurfaceState({
      artist,
      socialLinks: [spotifyLink],
      latestRelease: {
        title: 'New Song',
        slug: 'new-song',
        artworkUrl: null,
        releaseDate: '2026-04-01',
        releaseType: 'single',
      },
      tourDates: [upcomingShow],
      hasPlayableDestinations: true,
      activeSubtitle: 'Artist profile',
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(state.primaryAction).toMatchObject({
      kind: 'tour',
      label: 'Tickets',
      mode: 'tour',
      href: upcomingShow.ticketUrl,
    });
    expect(state.statusPill).toMatchObject({
      kind: 'tour',
      label: 'On Tour',
    });
    expect(state.hasUpcomingEvents).toBe(true);
    expect(state.primaryTabs).toEqual([
      'profile',
      'listen',
      'tour',
      'subscribe',
    ]);
    expect(state.smartCards.map(card => card.kind)).toEqual([
      'tour',
      'release',
      'listen',
    ]);
  });

  it('uses listen when music is playable and no show is upcoming', () => {
    const state = resolveProfileSurfaceState({
      artist,
      socialLinks: [spotifyLink],
      latestRelease: {
        title: 'New Song',
        slug: 'new-song',
        artworkUrl: null,
        releaseDate: '2026-04-01',
        releaseType: 'single',
      },
      tourDates: [],
      hasPlayableDestinations: true,
      activeSubtitle: 'Artist profile',
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(state.primaryAction).toMatchObject({
      kind: 'listen',
      label: 'Listen',
      mode: 'listen',
    });
    expect(state.statusPill).toMatchObject({
      kind: 'release',
      label: 'New Release',
    });
    expect(state.hasUpcomingEvents).toBe(false);
    expect(state.primaryTabs).toEqual(['profile', 'listen', 'subscribe']);
    expect(state.smartCards.map(card => card.kind)).toEqual([
      'release',
      'listen',
    ]);
  });

  it('hides events when tour dates are absent or already past', () => {
    const state = resolveProfileSurfaceState({
      artist,
      socialLinks: [spotifyLink],
      tourDates: [
        {
          ...upcomingShow,
          id: 'past-show',
          startDate: '2026-03-01',
        },
      ],
      hasPlayableDestinations: true,
      activeSubtitle: 'Artist profile',
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(state.hasUpcomingEvents).toBe(false);
    expect(state.primaryTabs).not.toContain('tour');
    expect(state.smartCards.map(card => card.kind)).not.toContain('tour');
  });

  it('falls back to alerts for sparse profiles and hides unavailable utilities', () => {
    const state = resolveProfileSurfaceState({
      artist: { ...artist, image_url: undefined, tagline: undefined },
      socialLinks: [],
      latestRelease: null,
      tourDates: [],
      releases: [],
      hasPlayableDestinations: false,
      showPayButton: true,
      activeSubtitle: 'Artist profile',
      now: new Date('2026-04-01T00:00:00.000Z'),
    });

    expect(state.heroImageUrl).toBeNull();
    expect(state.heroSubtitle).toBe('Artist profile');
    expect(state.primaryAction).toMatchObject({
      kind: 'subscribe',
      label: 'Get Alerts',
      mode: 'subscribe',
    });
    expect(state.visibleSocialLinks).toHaveLength(0);
    expect(state.hasTip).toBe(false);
    expect(state.hasReleases).toBe(false);
  });

  it('exposes Venmo support only when the pay surface is enabled', () => {
    expect(
      resolveProfileSurfaceState({
        artist,
        socialLinks: [venmoLink],
        showPayButton: true,
        hasPlayableDestinations: false,
        activeSubtitle: 'Artist profile',
      }).hasTip
    ).toBe(true);

    expect(
      resolveProfileSurfaceState({
        artist,
        socialLinks: [venmoLink],
        showPayButton: false,
        hasPlayableDestinations: false,
        activeSubtitle: 'Artist profile',
      }).hasTip
    ).toBe(false);
  });
});
