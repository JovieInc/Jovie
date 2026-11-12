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
});
