import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlanIntent,
  getBillingInterval,
  getBillingIntervalFromCookies,
  getOfferIntentFromCookies,
  getPlanIntent,
  getPlanIntentRecord,
  parseAuthOfferArtist,
  persistOfferIntentFromSearchParams,
  setPlanIntent,
} from './plan-intent';

describe('normalized plan intent persistence', () => {
  beforeEach(() => {
    clearPlanIntent();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    clearPlanIntent();
  });
  it('reads both setter contracts and server-readable interval aliases', () => {
    setPlanIntent('pro', 'monthly');
    expect(getBillingIntervalFromCookies(document.cookie)).toBe('month');
    setPlanIntent('pro', { interval: 'annual', artist: '  Tim\u0000 White ' });
    expect(getPlanIntentRecord()).toEqual({
      plan: 'pro',
      interval: 'year',
      artist: 'Tim White',
    });
    expect(getOfferIntentFromCookies(document.cookie)).toEqual({
      plan: 'pro',
      interval: 'year',
      artist: null,
    });
  });
  it('does not attach an old session artist or interval to a different cookie plan', () => {
    setPlanIntent('pro', { interval: 'annual', artist: 'Old artist' });
    document.cookie = 'jovie_plan_intent=free; path=/';
    document.cookie = 'jovie_billing_interval=; max-age=0; path=/';
    expect(getPlanIntentRecord()).toEqual({
      plan: 'free',
      interval: null,
      artist: null,
    });
  });
  it('replaces extras and clears both cookies on completion', () => {
    setPlanIntent('pro', { interval: 'year', artist: 'Tim' });
    setPlanIntent('free');
    expect(getPlanIntentRecord()).toEqual({
      plan: 'free',
      interval: null,
      artist: null,
    });
    expect(getBillingInterval()).toBe('month');
    clearPlanIntent();
    expect(getPlanIntent()).toBeNull();
    expect(document.cookie).not.toContain('jovie_billing_interval');
  });
  it('uses session backup when cookies are blocked and cookies when storage is blocked', () => {
    const blocked = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(() => {
        throw Error('blocked');
      });
    setPlanIntent('pro', { interval: 'monthly', artist: 'Tim' });
    expect(getPlanIntentRecord()?.artist).toBe('Tim');
    blocked.mockRestore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('quota');
    });
    setPlanIntent('enterprise', 'year');
    expect(getPlanIntentRecord()).toEqual({
      plan: 'enterprise',
      interval: 'year',
      artist: null,
    });
  });
  it.each([undefined, -1, Date.now() + 3600000, 'invalid'])(
    'rejects missing, expired, future and invalid timestamp %s',
    ts => {
      sessionStorage.setItem(
        'jovie_plan_intent',
        JSON.stringify({ plan: 'pro', artist: 'Stale', ts })
      );
      expect(getPlanIntentRecord()).toBeNull();
    }
  );
  it('expires extras at the same 30-minute boundary as cookies', () => {
    setPlanIntent('pro', { artist: 'Tim' });
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30 * 60 * 1000);
    expect(getPlanIntentRecord()).toBeNull();
  });
  it.each(['null', '[]', '{', '{"plan":"fake","ts":1}'])(
    'ignores corrupt payload %s',
    raw => {
      sessionStorage.setItem('jovie_plan_intent', raw);
      expect(getPlanIntentRecord()).toBeNull();
    }
  );
  it('keeps legacy identities as data without accepting unknown plans', () => {
    setPlanIntent('max', 'yearly');
    setPlanIntent('unknown');
    expect(getPlanIntent()).toBe('max');
    expect(getBillingInterval()).toBe('year');
  });
  it('persists normalized aliases from params and recovers only absent intent', () => {
    expect(
      persistOfferIntentFromSearchParams(
        new URLSearchParams('plan=pro&billing=monthly&artist=Tim')
      )
    ).toEqual({ plan: 'pro', interval: 'month', artist: 'Tim' });
    expect(
      persistOfferIntentFromSearchParams(new URLSearchParams())?.artist
    ).toBe('Tim');
    expect(
      persistOfferIntentFromSearchParams(new URLSearchParams('plan=bad'))
    ).toBeNull();
  });
  it('sanitizes artist text without converting it into a handle', () => {
    expect(parseAuthOfferArtist(' The Artist ')).toBe('The Artist');
    expect(parseAuthOfferArtist('https://evil.test')).toBeNull();
    expect(parseAuthOfferArtist('//evil.test')).toBeNull();
    expect(parseAuthOfferArtist(42)).toBeNull();
    expect(parseAuthOfferArtist('a'.repeat(100))).toHaveLength(80);
  });
});
