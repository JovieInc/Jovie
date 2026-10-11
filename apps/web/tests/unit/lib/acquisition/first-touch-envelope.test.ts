import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildFirstTouch,
  FIRST_TOUCH_TTL_MS,
  type FirstTouchEnvelope,
  openFirstTouchEnvelope,
  sealFirstTouchEnvelope,
} from '@/lib/acquisition/first-touch-envelope';

const SECRET = 'a'.repeat(32);

function url(input: string): URL {
  return new URL(input, 'https://jov.ie');
}

async function seal(envelope: FirstTouchEnvelope): Promise<string> {
  const sealed = await sealFirstTouchEnvelope(envelope);
  expect(sealed).toBeTruthy();
  return sealed as string;
}

describe('first-touch envelope', () => {
  beforeEach(() => {
    process.env.LEAD_ATTRIBUTION_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.ACQUISITION_FIRST_TOUCH_SECRET;
    delete process.env.LEAD_ATTRIBUTION_SECRET;
    delete process.env.URL_ENCRYPTION_KEY;
  });

  describe('buildFirstTouch', () => {
    it('keeps only allowlisted UTM fields', () => {
      const touch = buildFirstTouch({
        url: url(
          '/signup?utm_source=chatgpt&utm_medium=ai&utm_campaign=launch&fbclid=abc&token=secret&email=a@b.co'
        ),
      });

      expect(touch.channel).toBe('campaign');
      expect(touch.utm).toEqual({
        utm_source: 'chatgpt',
        utm_medium: 'ai',
        utm_campaign: 'launch',
      });
      expect(JSON.stringify(touch)).not.toContain('fbclid');
      expect(JSON.stringify(touch)).not.toContain('secret');
    });

    it('drops UTM values that look like email addresses', () => {
      const touch = buildFirstTouch({
        url: url('/?utm_source=fan%40example.com&utm_medium=email'),
      });

      expect(touch.utm).toEqual({ utm_medium: 'email' });
    });

    it('stores only the external referrer host', () => {
      const touch = buildFirstTouch({
        url: url('/waitlist'),
        referer: 'https://chat.openai.com/c/abc?token=xyz#frag',
      });

      expect(touch.channel).toBe('referral');
      expect(touch.ref).toBe('chat.openai.com');
      expect(JSON.stringify(touch)).not.toContain('/c/abc');
    });

    it('drops self, localhost, and non-http referrers', () => {
      for (const referer of [
        'https://jov.ie/pricing?utm_source=x',
        'https://www.jov.ie/',
        'https://app.jov.ie/app',
        'https://meetjovie.com/',
        'http://localhost:3000/',
        'file:///etc/passwd',
        'not a url',
      ]) {
        const touch = buildFirstTouch({ url: url('/'), referer });
        expect(touch.ref).toBeUndefined();
      }
    });

    it('classifies direct traffic explicitly', () => {
      const touch = buildFirstTouch({ url: url('/') });
      expect(touch.channel).toBe('direct');
      expect(touch.utm).toBeUndefined();
      expect(touch.ref).toBeUndefined();
    });

    it('classifies the originating route kind and profile slug', () => {
      expect(buildFirstTouch({ url: url('/') }).route).toEqual({
        kind: 'home',
      });
      expect(buildFirstTouch({ url: url('/signup') }).route).toEqual({
        kind: 'signup',
      });
      expect(buildFirstTouch({ url: url('/waitlist') }).route).toEqual({
        kind: 'waitlist',
      });
      expect(buildFirstTouch({ url: url('/someartist/tip') }).route).toEqual({
        kind: 'profile',
        slug: 'someartist',
      });
    });

    it('never stores query strings or fragments in the landing route', () => {
      const touch = buildFirstTouch({
        url: url('/someartist?session=abc#frag'),
      });
      expect(touch.route?.slug).toBe('someartist');
      expect(JSON.stringify(touch)).not.toContain('session');
    });

    it('caps field length', () => {
      const touch = buildFirstTouch({
        url: url(`/?utm_source=${'x'.repeat(500)}`),
      });
      expect(touch.utm?.utm_source).toHaveLength(128);
    });
  });

  describe('seal/open', () => {
    it('round-trips an envelope', async () => {
      const envelope = buildFirstTouch({
        url: url('/?utm_source=chatgpt'),
        referer: 'https://chatgpt.com/',
      });
      const opened = await openFirstTouchEnvelope(await seal(envelope));
      expect(opened).toEqual(envelope);
    });

    it('rejects a tampered payload', async () => {
      const sealed = await seal(
        buildFirstTouch({ url: url('/?utm_source=chatgpt') })
      );
      const [body, signature] = sealed.split('.');
      const tampered = `${body.slice(0, -2)}xx.${signature}`;
      expect(await openFirstTouchEnvelope(tampered)).toBeNull();
      expect(
        await openFirstTouchEnvelope(`${body}.${'0'.repeat(64)}`)
      ).toBeNull();
    });

    it('rejects an expired envelope', async () => {
      const now = Date.now();
      const envelope = buildFirstTouch({ url: url('/') }, now);
      const sealed = await seal(envelope);
      expect(
        await openFirstTouchEnvelope(sealed, now + FIRST_TOUCH_TTL_MS + 1)
      ).toBeNull();
    });

    it('rejects malformed values', async () => {
      for (const value of ['', 'abc', 'abc.def', 'abc.1234', '.abc']) {
        expect(await openFirstTouchEnvelope(value)).toBeNull();
      }
      expect(await openFirstTouchEnvelope(undefined)).toBeNull();
    });

    it('returns null when no signing secret is configured', async () => {
      delete process.env.LEAD_ATTRIBUTION_SECRET;
      const envelope = buildFirstTouch({ url: url('/') });
      expect(await sealFirstTouchEnvelope(envelope)).toBeNull();
      expect(await openFirstTouchEnvelope('a.b')).toBeNull();
    });
  });
});
