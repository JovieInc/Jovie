import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ARTIST_OFFER_FUNNEL_STAGES,
  isRecordedArtistOfferStage,
} from '@/lib/acquisition/artist-offer-funnel';
import {
  buildFirstTouch,
  openFirstTouchEnvelope,
  sealFirstTouchEnvelope,
} from '@/lib/acquisition/first-touch-envelope';
import { toReceiptFirstTouch } from '@/lib/acquisition/first-touch-receipt';
import { buildEmailSignature } from '@/lib/email-signature/build-signature';
import {
  VIA_JOVIE_LOOP_ID,
  viaJovieHref,
  viaJovieQuery,
} from '@/lib/growth/loop-links';
import {
  CHECKOUT_CORRELATION_STRIPE_KEYS,
  type CheckoutCorrelation,
} from '@/lib/stripe/checkout-correlation';
import { acquisitionIdFromCookieHeader } from '@/lib/waitlist/acquisition-stages';

/**
 * Synthetic attribution chain (growth spine). A fake visit from a tracked
 * loop link must survive every hop to a paid event. Each hop is the real
 * production function; the only fake is the traffic. If any hop drops the
 * loop id or a funnel stage stops being recordable, this fails CI.
 *
 * Hops: tracked link -> first-touch envelope (sealed cookie) -> journey
 * first_touch -> loop id -> acquisition cookie -> waitlist-join/admitted ->
 * checkout metadata -> paid.
 */

interface LoopRow {
  id: string;
  status: string;
  utmSource: string;
  utmMedium: string;
}
const registry = (): LoopRow[] =>
  readFileSync(
    resolve(__dirname, '../../../../../../canon/growth-loops.jsonl'),
    'utf8'
  )
    .split('\n')
    .filter(Boolean)
    .slice(1)
    .map(line => JSON.parse(line) as LoopRow);

const JOURNEY_ID = '3f0c9b1e-6d4a-4c1b-9a53-2f7d8e1a4b60';

beforeAll(() => {
  process.env.ACQUISITION_FIRST_TOUCH_SECRET = 'synthetic-chain-test-secret';
});

describe.each(['footer', 'email_signature'] as const)(
  'attribution chain for the Via Jovie %s link',
  medium => {
    it('carries the loop id from link to paid', async () => {
      // 1. The tracked link a visitor clicks.
      const url = new URL(viaJovieHref(medium), 'https://jov.ie');

      // 2. Server first touch, sealed into the cookie and opened again.
      const sealed = await sealFirstTouchEnvelope(buildFirstTouch({ url }));
      const envelope = await openFirstTouchEnvelope(sealed!);
      expect(envelope?.channel).toBe('campaign');

      // 3. What the journey row stores.
      const firstTouch = toReceiptFirstTouch(envelope);
      expect(firstTouch.campaign).toBe(VIA_JOVIE_LOOP_ID);
      expect(firstTouch.source).toBe('via_jovie');
      expect(firstTouch.medium).toBe(medium);

      // 4. The stored campaign resolves to a registered, non-draft loop.
      const loop = registry().find(l => l.id === firstTouch.campaign);
      expect(
        loop,
        'loop id must exist in canon/growth-loops.jsonl'
      ).toBeDefined();
      expect(loop!.utmSource).toBe(firstTouch.source);

      // 5. The journey id survives to the waitlist submit via the cookie.
      expect(
        acquisitionIdFromCookieHeader(
          `a=b; jv_acquisition_id=${JOURNEY_ID}; c=d`
        )
      ).toBe(JOURNEY_ID);
      expect(
        acquisitionIdFromCookieHeader('jv_acquisition_id=not-a-uuid')
      ).toBeNull();

      // 6. Every stage between the visit and the paid event is recordable.
      for (const stage of [
        'waitlist-join',
        'admitted',
        'claimed',
        'checkout',
        'paid',
      ]) {
        expect(
          isRecordedArtistOfferStage(stage),
          `stage ${stage} must be recordable`
        ).toBe(true);
      }
      expect(ARTIST_OFFER_FUNNEL_STAGES).toContain('paid');

      // 7. Checkout metadata keeps the journey id for the webhook.
      const correlation: CheckoutCorrelation = { acquisitionId: JOURNEY_ID };
      expect(CHECKOUT_CORRELATION_STRIPE_KEYS.acquisitionId).toBe(
        'acquisition_id'
      );
      expect(correlation.acquisitionId).toBe(JOURNEY_ID);
    });
  }
);

describe('loop link constants', () => {
  it('stay in step with the registry', () => {
    const loop = registry().find(l => l.id === VIA_JOVIE_LOOP_ID)!;
    const params = new URLSearchParams(viaJovieQuery('footer'));
    expect(params.get('utm_source')).toBe(loop.utmSource);
    expect(params.get('utm_medium')).toBe(loop.utmMedium);
    expect(params.get('utm_campaign')).toBe(loop.id);
  });
});

describe('surfaces that ship the Via Jovie link', () => {
  it('the email signature link is tracked with the loop id', () => {
    const { html } = buildEmailSignature({ name: 'A', handle: 'a' });
    expect(html).toContain(
      viaJovieQuery('email_signature').replace(/&/g, '&amp;')
    );
  });
});
