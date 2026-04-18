import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardToFacebook } from '@/lib/tracking/forwarding/facebook';
import type { NormalizedEvent } from '@/lib/tracking/forwarding/types';
import {
  getFetchBody,
  getFetchUrl,
  makeConfig,
  makeEvent,
  mockFetchError,
  mockFetchNetworkError,
  mockFetchOk,
} from './test-helpers';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('forwardToFacebook', () => {
  beforeEach(() => mockFetchOk({ events_received: 1 }));
  afterEach(() => vi.restoreAllMocks());

  it('returns success when API returns ok', async () => {
    const result = await forwardToFacebook(makeEvent(), makeConfig());
    expect(result.platform).toBe('facebook');
    expect(result.success).toBe(true);
    expect(result.responseId).toBe('1');
  });

  it('sends access_token in request body, not URL', async () => {
    await forwardToFacebook(makeEvent(), makeConfig());
    expect(getFetchUrl()).not.toContain('access_token');
    expect((getFetchBody() as Record<string, unknown>).access_token).toBe(
      'token-secret'
    );
  });

  it('sends correct event payload', async () => {
    const event = makeEvent({
      eventType: 'subscribe',
      linkId: 'link-42',
      utmSource: 'meta',
    });
    await forwardToFacebook(event, makeConfig());
    const body = getFetchBody() as Record<string, unknown>;
    const data = (body.data as Record<string, unknown>[])[0];
    expect(data.event_name).toBe('Subscribe');
    expect(data.event_time).toBe(1700000000);
    expect(data.event_id).toBe('evt-001');
    expect(data.action_source).toBe('website');
    expect((data.user_data as Record<string, unknown>).client_ip_address).toBe(
      '1.2.3.4'
    );
    expect((data.custom_data as Record<string, unknown>).content_ids).toEqual([
      'link-42',
    ]);
    expect((data.custom_data as Record<string, unknown>).utm_source).toBe(
      'meta'
    );
  });

  it('returns error on HTTP failure', async () => {
    mockFetchError(400, 'Bad request');
    const result = await forwardToFacebook(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 400');
  });

  it('returns error on network/abort', async () => {
    mockFetchNetworkError('The operation was aborted');
    const result = await forwardToFacebook(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });

  it('returns error when pixelId is missing', async () => {
    const result = await forwardToFacebook(
      makeEvent(),
      makeConfig({ pixelId: '' })
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns error when accessToken is missing', async () => {
    const result = await forwardToFacebook(
      makeEvent(),
      makeConfig({ accessToken: '' })
    );
    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('event type mapping', () => {
    const mappings: Array<[NormalizedEvent['eventType'], string]> = [
      ['page_view', 'PageView'],
      ['link_click', 'ViewContent'],
      ['form_submit', 'Lead'],
      ['subscribe', 'Subscribe'],
      ['scroll_depth', 'ViewContent'],
      ['tip_page_view', 'ViewContent'],
      ['tip_intent', 'InitiateCheckout'],
    ];

    for (const [input, expected] of mappings) {
      it(`maps "${input}" to "${expected}"`, async () => {
        await forwardToFacebook(makeEvent({ eventType: input }), makeConfig());
        const body = getFetchBody() as Record<string, unknown>;
        const data = (body.data as Record<string, unknown>[])[0];
        expect(data.event_name).toBe(expected);
      });
    }
  });

  it('includes hashed email and phone when provided', async () => {
    await forwardToFacebook(
      makeEvent({ hashedEmail: 'abc123hash', hashedPhone: 'def456hash' }),
      makeConfig()
    );
    const body = getFetchBody() as Record<string, unknown>;
    const data = (body.data as Record<string, unknown>[])[0];
    expect((data.user_data as Record<string, unknown>).em).toEqual([
      'abc123hash',
    ]);
    expect((data.user_data as Record<string, unknown>).ph).toEqual([
      'def456hash',
    ]);
  });

  it('sends to correct URL with pixel ID', async () => {
    await forwardToFacebook(makeEvent(), makeConfig({ pixelId: 'my-pixel' }));
    expect(getFetchUrl()).toContain('/my-pixel/events');
    expect(getFetchUrl()).toContain('graph.facebook.com');
  });
});
