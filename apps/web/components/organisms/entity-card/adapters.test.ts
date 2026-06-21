import { describe, expect, it } from 'vitest';
import type { PublicMerchCard } from '@/lib/merch/types';
import {
  chatReleaseContextToEntityCard,
  chatTourDateContextToEntityCard,
  merchToEntityCard,
  releaseToEntityCard,
  showToEntityCard,
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

  it('omits the CTA when there is no ticket url', () => {
    const model = showToEntityCard({
      id: 's2',
      venueName: 'Club',
      startDate: null,
    });
    expect(model.cta).toBeNull();
    expect(model.datePill).toBeNull();
  });
});
