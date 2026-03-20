import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardToGoogle } from '@/lib/tracking/forwarding/google';
import type { NormalizedEvent } from '@/lib/tracking/forwarding/types';
import {
  getFetchBody,
  getFetchUrl,
  makeConfig,
  makeEvent,
  mockFetchError,
  mockFetchNetworkError,
} from './test-helpers';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('forwardToGoogle', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: () => Promise.resolve(''),
      })
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns success on 204 response', async () => {
    const result = await forwardToGoogle(makeEvent(), makeConfig());
    expect(result.platform).toBe('google');
    expect(result.success).toBe(true);
  });

  it('returns success on 200 ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      })
    );
    const result = await forwardToGoogle(makeEvent(), makeConfig());
    expect(result.success).toBe(true);
  });

  it('sends api_secret in URL query (by design)', async () => {
    await forwardToGoogle(makeEvent(), makeConfig());
    const url = getFetchUrl();
    expect(url).toContain('api_secret=token-secret');
    expect(url).toContain('measurement_id=pixel-123');
  });

  it('sends correct event payload', async () => {
    const event = makeEvent({
      eventType: 'link_click',
      referrer: 'https://google.com',
      linkId: 'link-42',
      utmSource: 'meta',
      ipHash: 'abcdef1234567890abcdef1234567890abcdef12',
    });
    await forwardToGoogle(event, makeConfig());
    const body = getFetchBody() as Record<string, unknown>;
    const events = body.events as Record<string, unknown>[];
    expect(events[0].name).toBe('click');
    expect((events[0].params as Record<string, unknown>).page_location).toBe(
      'https://jov.ie/artist'
    );
    expect((events[0].params as Record<string, unknown>).page_referrer).toBe(
      'https://google.com'
    );
    expect((events[0].params as Record<string, unknown>).link_id).toBe(
      'link-42'
    );
    expect((events[0].params as Record<string, unknown>).campaign_source).toBe(
      'meta'
    );
    expect(body.timestamp_micros).toBe(1700000000 * 1000000);
  });

  it('returns error on HTTP failure', async () => {
    mockFetchError(500, 'Server error');
    const result = await forwardToGoogle(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('returns error on network failure', async () => {
    mockFetchNetworkError('Network timeout');
    const result = await forwardToGoogle(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network timeout');
  });

  it('returns error when measurementId is missing', async () => {
    const result = await forwardToGoogle(
      makeEvent(),
      makeConfig({ pixelId: '' })
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns error when apiSecret is missing', async () => {
    const result = await forwardToGoogle(
      makeEvent(),
      makeConfig({ accessToken: '' })
    );
    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('event type mapping', () => {
    const mappings: Array<[NormalizedEvent['eventType'], string]> = [
      ['page_view', 'page_view'],
      ['link_click', 'click'],
      ['form_submit', 'generate_lead'],
      ['scroll_depth', 'scroll'],
      ['tip_page_view', 'view_item'],
      ['tip_intent', 'begin_checkout'],
    ];

    for (const [input, expected] of mappings) {
      it(`maps "${input}" to "${expected}"`, async () => {
        await forwardToGoogle(makeEvent({ eventType: input }), makeConfig());
        const body = getFetchBody() as Record<string, unknown>;
        expect((body.events as Record<string, unknown>[])[0].name).toBe(
          expected
        );
      });
    }
  });

  it('uses ipHash substring as client_id', async () => {
    const event = makeEvent({
      ipHash: 'abcdef1234567890abcdef1234567890abcdef12',
    });
    await forwardToGoogle(event, makeConfig());
    const body = getFetchBody() as Record<string, unknown>;
    expect(body.client_id).toBe('abcdef1234567890abcdef1234567890abcd');
  });
});
