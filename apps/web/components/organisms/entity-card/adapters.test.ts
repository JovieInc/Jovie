import { describe, expect, it, vi } from 'vitest';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import {
  chatEntityMentionToEntityCard,
  chatReleaseContextToEntityCard,
  chatTourDateContextToEntityCard,
  merchToEntityCard,
  releaseToEntityCard,
  showToEntityCard,
  tourDateToEntityCard,
} from './adapters';

const merch: PublicMerchCard = {
  id: 'm1',
  artistId: 'a1',
  status: 'live',
  title: 'Tour Tee 2026',
  description: '',
  productType: 'Premium tee',
  primaryImageUrl: 'https://cdn.test/tee.jpg',
  mockupUrls: ['https://cdn.test/alt.jpg'],
  printful: {} as PublicMerchCard['printful'],
  pricing: {
    artistPayoutPerUnitEstimateCents: 1187,
  } as PublicMerchCard['pricing'],
  retailPriceCents: 4500,
  rankScore: 0,
  position: null,
  pinned: false,
};

describe('merchToEntityCard', () => {
  it('maps title, price, profit, status and href', () => {
    const model = merchToEntityCard(merch, { handle: 'tim' });
    expect(model.kind).toBe('merch');
    expect(model.title).toBe('Tour Tee 2026');
    expect(model.href).toBe('/tim/merch/m1');
    expect(model.price?.display).toBe('$45.00');
    expect(model.price?.profit).toBe('$11.87');
    expect(model.status).toEqual({ label: 'Live', tone: 'live' });
    expect(model.cta).toEqual({ label: 'Buy', href: '/tim/merch/m1' });
  });

  it('falls back to the first mockup when no primary image', () => {
    const model = merchToEntityCard(
      { ...merch, primaryImageUrl: '' },
      { handle: 'tim' }
    );
    expect(model.imageUrl).toBe('https://cdn.test/alt.jpg');
  });

  it('drops status for archived cards', () => {
    const model = merchToEntityCard(
      { ...merch, status: 'archived' },
      { handle: 'tim' }
    );
    expect(model.status).toBeNull();
  });
});

describe('releaseToEntityCard', () => {
  const now = new Date('2026-06-18T00:00:00Z');

  it('marks a past release Out Now with a Listen CTA', () => {
    const model = releaseToEntityCard(
      {
        title: 'Midnight Pressing',
        slug: 'midnight',
        artworkUrl: 'https://cdn.test/art.jpg',
        releaseDate: '2026-01-01',
        releaseType: 'album',
      },
      { handle: 'tim', now }
    );
    expect(model.kind).toBe('music');
    expect(model.meta).toBe('Album · 2026');
    expect(model.status).toEqual({ label: 'Out Now', tone: 'live' });
    expect(model.cta).toEqual({ label: 'Listen', href: '/tim/midnight' });
  });

  it('marks a future release Scheduled with a Notify CTA (no href)', () => {
    const model = releaseToEntityCard(
      {
        title: 'Acid Test',
        slug: 'acid',
        releaseDate: '2026-12-01',
        releaseType: 'ep',
      },
      { handle: 'tim', now }
    );
    expect(model.eyebrow).toBe('Coming Soon');
    expect(model.meta).toBe('EP · 2026');
    expect(model.status).toEqual({ label: 'Scheduled', tone: 'scheduled' });
    expect(model.cta).toEqual({ label: 'Notify Me', href: null });
  });

  it('supports the video kind', () => {
    const model = releaseToEntityCard(
      { title: 'Live Set', slug: 'live', releaseType: 'video' },
      { handle: 'tim', kind: 'video', now }
    );
    expect(model.kind).toBe('video');
    expect(model.cta?.label).toBe('Watch');
  });

  it('preserves the database release id for carousel analytics', () => {
    const model = releaseToEntityCard(
      {
        id: 'release-42',
        title: 'Catalog Cut',
        slug: 'catalog-cut',
        releaseType: 'single',
      },
      { handle: 'tim', now }
    );

    expect(model.releaseId).toBe('release-42');
    expect(model.id).toBe('catalog-cut');
  });
});

describe('chatReleaseContextToEntityCard', () => {
  it('maps release artwork and type into a compact context model', () => {
    const model = chatReleaseContextToEntityCard(
      {
        id: 'release-1',
        title: 'Lost In The Light',
        artworkUrl: 'https://cdn.test/art.jpg',
        releaseType: 'single',
      },
      { fallbackTitle: 'Release' }
    );

    expect(model.kind).toBe('music');
    expect(model.title).toBe('Lost In The Light');
    expect(model.imageUrl).toBe('https://cdn.test/art.jpg');
    expect(model.meta).toBe('Single Context');
    expect(model.href).toBeUndefined();
    expect(model.cta).toBeUndefined();
  });

  it('uses loading meta while release data is unresolved', () => {
    const model = chatReleaseContextToEntityCard(null, {
      fallbackTitle: 'Lost In The Light',
      loading: true,
    });

    expect(model.title).toBe('Lost In The Light');
    expect(model.meta).toBe('Loading Release');
  });
});

describe('chatEntityMentionToEntityCard', () => {
  it('maps a resolved release mention into a compact card model', () => {
    const model = chatEntityMentionToEntityCard({
      kind: 'release',
      id: 'rel_1',
      label: 'Sober',
      thumbnail: 'https://cdn.test/sober.jpg',
      releaseType: 'single',
      totalTracks: 1,
      totalDurationMs: 210_000,
    });

    expect(model.kind).toBe('music');
    expect(model.title).toBe('Sober');
    expect(model.imageUrl).toBe('https://cdn.test/sober.jpg');
    expect(model.eyebrow).toBe('Release · Single');
    expect(model.meta).toBe('1 track · 3:30');
    expect(model.href).toBeUndefined();
    expect(model.cta).toBeNull();
  });

  it('degrades to label-only for unresolved mentions', () => {
    const model = chatEntityMentionToEntityCard({
      kind: 'artist',
      id: 'art_x',
      label: 'Unknown Artist',
    });

    expect(model.kind).toBe('music');
    expect(model.title).toBe('Unknown Artist');
    expect(model.imageUrl).toBeNull();
    expect(model.eyebrow).toBe('Artist');
    expect(model.meta).toBeNull();
  });

  it('maps events to show cards with date pills when artwork is missing', () => {
    const model = chatEntityMentionToEntityCard({
      kind: 'event',
      id: 'evt_1',
      label: 'Brooklyn Steel',
      eventType: 'tour',
      eventDate: '2026-06-12T23:30:00.000Z',
      venue: 'Brooklyn Steel',
      city: 'Brooklyn, NY',
    });

    expect(model.kind).toBe('show');
    expect(model.eyebrow).toBe('Event · Tour');
    expect(model.datePill).toEqual({ month: 'Jun', day: '12' });
    expect(model.meta).toBe('Brooklyn Steel · Brooklyn, NY');
  });

  it('attaches interactive CTAs for panel open actions', () => {
    const onClick = vi.fn();
    const model = chatEntityMentionToEntityCard(
      { kind: 'release', id: 'rel_1', label: 'Sober' },
      { interactive: true, cta: { label: 'Open Release', onClick } }
    );

    expect(model.interactive).toBe(true);
    expect(model.cta?.label).toBe('Open Release');
    model.cta?.onClick?.(
      {} as unknown as import('react').MouseEvent<HTMLElement>
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('chatTourDateContextToEntityCard', () => {
  it('maps tour dates to a date-pill context model without navigation', () => {
    const model = chatTourDateContextToEntityCard(
      {
        id: 'evt-1',
        title: 'Brooklyn Steel',
        venueName: 'Brooklyn Steel',
        city: 'Brooklyn, NY',
        startDate: '2026-06-12T23:30:00.000Z',
      },
      { fallbackTitle: 'Tour date' }
    );

    expect(model.kind).toBe('show');
    expect(model.title).toBe('Brooklyn Steel');
    expect(model.datePill).toEqual({ month: 'Jun', day: '12' });
    expect(model.meta).toBe('Tour Date Context');
    expect(model.href).toBeNull();
    expect(model.cta).toBeNull();
  });

  it('uses loading meta while event data is unresolved', () => {
    const model = chatTourDateContextToEntityCard(null, {
      fallbackTitle: 'Brooklyn Steel',
      loading: true,
    });

    expect(model.title).toBe('Brooklyn Steel');
    expect(model.meta).toBe('Loading Tour Date');
  });
});

const tourDate: TourDateViewModel = {
  id: 'td-1',
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: '2026-01-01T00:00:00.000Z',
  title: null,
  startDate: '2030-06-15T20:00:00.000Z',
  startTime: '20:00',
  timezone: 'America/New_York',
  venueName: 'The Venue',
  city: 'Brooklyn',
  region: 'NY',
  country: 'USA',
  latitude: null,
  longitude: null,
  ticketUrl: 'https://example.com/tickets',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('tourDateToEntityCard', () => {
  it('maps venue, date pill, ticket CTA, and calendar secondary action', () => {
    const model = tourDateToEntityCard(tourDate);
    expect(model.kind).toBe('show');
    expect(model.interactive).toBe(true);
    expect(model.title).toBe('Live');
    expect(model.meta).toBe('The Venue · Brooklyn, NY, USA');
    expect(model.datePill).toEqual({ month: 'Jun', day: '15' });
    expect(model.cta).toEqual({
      label: 'Get Tickets',
      href: 'https://example.com/tickets',
      external: true,
      disabled: false,
    });
    expect(model.secondaryCta).toEqual({
      label: 'Add To Calendar',
      href: null,
    });
  });

  it('marks cancelled dates disabled without a secondary action', () => {
    const model = tourDateToEntityCard({
      ...tourDate,
      ticketStatus: 'cancelled',
    });
    expect(model.cta).toEqual({
      label: 'Cancelled',
      href: null,
      external: false,
      disabled: true,
    });
    expect(model.secondaryCta).toBeNull();
  });

  it('marks sold-out dates with a status pill and Add To Calendar as primary (no secondary)', () => {
    const model = tourDateToEntityCard({
      ...tourDate,
      ticketStatus: 'sold_out',
    });
    expect(model.status).toEqual({ label: 'Sold Out', tone: 'scheduled' });
    // Primary CTA becomes Add To Calendar (no ticket purchase possible)
    expect(model.cta?.label).toBe('Add To Calendar');
    expect(model.cta?.disabled).toBe(false);
    // No secondary CTA — there is only one action for sold-out shows
    expect(model.secondaryCta).toBeNull();
  });

  it('uses a near-you eyebrow and blue accent when requested', () => {
    const model = tourDateToEntityCard(tourDate, {
      isNearYou: true,
      distanceKm: 12.4,
    });
    expect(model.eyebrow).toBe('12 km away');
    expect(model.accent).toBe('blue');
  });
});

describe('showToEntityCard', () => {
  it('builds a date pill and external tickets CTA', () => {
    const model = showToEntityCard({
      id: 's1',
      venueName: 'The Echo',
      city: 'Los Angeles',
      startDate: '2026-07-04T20:00:00Z',
      ticketUrl: 'https://tickets.test/echo',
    });
    expect(model.kind).toBe('show');
    expect(model.title).toBe('The Echo');
    expect(model.meta).toBe('The Echo · Los Angeles');
    expect(model.datePill).toEqual({ month: 'Jul', day: '4' });
    expect(model.cta).toEqual({
      label: 'Tickets',
      href: 'https://tickets.test/echo',
      external: true,
    });
  });

  it('renders a target-less No Tickets CTA when there is no ticket url', () => {
    const model = showToEntityCard({
      id: 's2',
      venueName: 'Club',
      startDate: null,
    });
    expect(model.cta).toEqual({
      label: 'No Tickets',
      href: null,
      disabled: true,
    });
    expect(model.datePill).toBeNull();
  });

  it('formats the date pill in UTC so it always matches the events list', () => {
    // 02:30 UTC is still the previous day in US timezones — the card and the
    // TourModePanel list (also UTC) must agree on "Jul 29".
    const model = showToEntityCard({
      id: 's3',
      venueName: 'The Echo',
      startDate: '2026-07-29T02:30:00.000Z',
    });
    expect(model.datePill).toEqual({ month: 'Jul', day: '29' });
  });
});
