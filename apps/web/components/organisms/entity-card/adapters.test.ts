import { describe, expect, it } from 'vitest';
import type { PublicMerchCard } from '@/lib/merch/types';
import {
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
