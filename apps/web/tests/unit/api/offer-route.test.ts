import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/offer/route';
import { offerSnapshot } from '@/lib/billing/offer';

// /api/offer is cached at the CDN by header (the legacy `revalidate` export is
// banned by the Cache Components ratchet), so the header is the contract.
describe('/api/offer caching', () => {
  it('is CDN-cacheable for 60s and carries the offer hash', async () => {
    const res = GET();
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
    );
    const snap = offerSnapshot();
    expect(res.headers.get('x-offer-hash')).toBe(snap.hash);
    expect((await res.json()).hash).toBe(snap.hash);
  });
});
