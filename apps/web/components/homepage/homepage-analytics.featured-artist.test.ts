import { describe, expect, it, vi } from 'vitest';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('@/lib/tracking/json-beacon', () => ({ postJsonBeacon: vi.fn() }));

import { HOMEPAGE_FEATURED_ARTIST } from '@/data/demoArtists';
import { trackHomepageEvent } from './homepage-analytics';

describe('homepage events name the featured artist', () => {
  it('tags each event with the featured slot so it can rotate by conversion', async () => {
    trackHomepageEvent('homepage_viewed', { surface: 'hero' });
    await vi.dynamicImportSettled();
    expect(track).toHaveBeenCalledExactlyOnceWith('homepage_viewed', {
      featured_artist: HOMEPAGE_FEATURED_ARTIST.slug,
      surface: 'hero',
    });
  });

  it('leaves events from tracked links on other pages untagged', async () => {
    track.mockClear();
    window.history.pushState({}, '', '/artist-profiles');
    try {
      trackHomepageEvent('artist_profiles_adaptive_cta_clicked');
      await vi.dynamicImportSettled();
      expect(track).toHaveBeenCalledExactlyOnceWith(
        'artist_profiles_adaptive_cta_clicked',
        {}
      );
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('keeps the tag when a homepage link navigates before the chunk loads', async () => {
    track.mockClear();
    trackHomepageEvent('homepage_cta_clicked');
    window.history.pushState({}, '', '/signup');
    try {
      await vi.dynamicImportSettled();
      expect(track).toHaveBeenCalledExactlyOnceWith('homepage_cta_clicked', {
        featured_artist: HOMEPAGE_FEATURED_ARTIST.slug,
      });
    } finally {
      window.history.pushState({}, '', '/');
    }
  });
});
