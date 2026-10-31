import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: lookup }) }) }),
  },
}));
beforeEach(() => lookup.mockReset());
describe('uncached public tracking authority', () => {
  it('reads changed artist state on every request regardless of a warm page', async () => {
    lookup
      .mockResolvedValueOnce([{ youngAudience: false }])
      .mockResolvedValueOnce([{ youngAudience: true }]);
    const request = new NextRequest(
      'https://jov.ie/api/tracking/eligibility?pathname=/synthetic/alerts'
    );
    const first = await GET(request);
    expect((await first.json()).eligibility.facebook).toBe(true);
    const second = await GET(request);
    expect((await second.json()).eligibility).toEqual({
      facebook: false,
      google: false,
      tiktok: false,
      ga: false,
      vercel: false,
    });
    expect(second.headers.get('cache-control')).toContain('no-store');
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it.each<Record<string, string>>([
    { 'sec-gpc': '1' },
    { cookie: 'jv_tracking_consent=rejected' },
    { 'x-vercel-ip-country': 'DE' },
  ])('honors server visitor signals %j', async headers => {
    lookup.mockResolvedValue([{ youngAudience: false }]);
    const response = await GET(
      new NextRequest(
        'https://jov.ie/api/tracking/eligibility?pathname=/synthetic',
        { headers }
      )
    );
    expect(Object.values((await response.json()).eligibility)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
  it('denies unknown artist routes and fails closed on database errors', async () => {
    lookup
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('offline'));
    const request = new NextRequest(
      'https://jov.ie/api/tracking/eligibility?pathname=/synthetic'
    );
    expect((await (await GET(request)).json()).eligibility.ga).toBe(false);
    expect((await GET(request)).status).toBe(503);
  });
  it('allows platform pages but checks reserved artist fixtures before applying that fallback', async () => {
    lookup
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ youngAudience: true }]);
    const request = new NextRequest(
      'https://jov.ie/api/tracking/eligibility?pathname=/about'
    );
    expect((await (await GET(request)).json()).eligibility.ga).toBe(true);
    expect((await (await GET(request)).json()).eligibility.ga).toBe(false);
    expect(
      (
        await GET(
          new NextRequest(
            'https://jov.ie/api/tracking/eligibility?pathname=bad'
          )
        )
      ).status
    ).toBe(400);
  });
});
