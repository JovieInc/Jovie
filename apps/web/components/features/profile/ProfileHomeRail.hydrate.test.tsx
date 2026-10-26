import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileVariantSeed } from '@/lib/profile/one-right-thing/variant';
import { ProfileHomeRail } from './ProfileHomeRail';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ location: null, isLoading: false, error: null }),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; src?: string | null }) => (
    <img alt='' src={props.src ?? undefined} />
  ),
}));

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const releases = [
  {
    id: 'r',
    title: 'Old Song',
    slug: 'old-song',
    releaseType: 'single',
    artworkUrl: null,
    artistNames: ['Tim White'],
    previewUrl: null,
    releaseDate: daysFromNow(-200),
  },
];

const tourDates = [
  {
    id: 'show-de',
    profileId: 'p',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: null,
    startDate: daysFromNow(6),
    startTime: null,
    timezone: null,
    venueName: 'Club',
    city: 'Berlin',
    region: null,
    country: 'DE',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://tickets.example/x',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: daysFromNow(-9),
    updatedAt: daysFromNow(-9),
  },
] as const;

function rail(featuredSeed: ProfileVariantSeed | null) {
  return (
    <ProfileHomeRail
      artist={PROFILE_STORY_ARTIST}
      releases={releases}
      tourDates={tourDates}
      hasPlayableDestinations
      renderMode='interactive'
      isSubscribed={false}
      featuredSeed={featuredSeed}
    />
  );
}

function featuredAttrs(html: string) {
  return {
    kind: /data-featured-kind="([^"]*)"/u.exec(html)?.[1] ?? null,
    reason: /data-featured-reason="([^"]*)"/u.exec(html)?.[1] ?? null,
    state: /data-state="([^"]*)"/u.exec(html)?.[1] ?? null,
  };
}

describe('no swap after first paint', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const cases: Array<[string, ProfileVariantSeed | null, string]> = [
    ['canonical (no variant)', null, 'stale_release_show_soon'],
    [
      'visitor in the show country',
      { dsp: false, returning: false, country: 'DE' },
      'show_in_visitor_country_soon',
    ],
    [
      'visitor from a streaming service elsewhere',
      { dsp: true, returning: false, country: 'US' },
      'came_from_dsp_release',
    ],
  ];

  for (const [name, seed, expectedReason] of cases) {
    it(`server HTML equals the hydrated card: ${name}`, async () => {
      const serverHtml = renderToString(rail(seed));
      const server = featuredAttrs(serverHtml);
      expect(server.reason).toBe(expectedReason);

      const container = document.createElement('div');
      container.innerHTML = serverHtml;
      document.body.appendChild(container);
      const errors: unknown[] = [];
      const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        errors.push(args);
      });
      await act(async () => {
        hydrateRoot(container, rail(seed), {
          onRecoverableError: error => errors.push(error),
        });
      });
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      spy.mockRestore();

      expect(featuredAttrs(container.innerHTML)).toEqual(server);
      expect(errors).toEqual([]);
    });
  }
});
