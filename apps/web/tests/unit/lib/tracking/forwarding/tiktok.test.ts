import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardToTikTok } from '@/lib/tracking/forwarding/tiktok';
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

describe('forwardToTikTok', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ code: 0, message: 'OK', request_id: 'req-abc' }),
        text: () => Promise.resolve(''),
      })
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns success when API returns code=0', async () => {
    const result = await forwardToTikTok(makeEvent(), makeConfig());
    expect(result.platform).toBe('tiktok');
    expect(result.success).toBe(true);
    expect(result.responseId).toBe('req-abc');
  });

  it('sends access token in headers, not URL', async () => {
    await forwardToTikTok(makeEvent(), makeConfig());
    const url = getFetchUrl();
    const options = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(url).not.toContain('token-secret');
    expect(options.headers['Access-Token']).toBe('token-secret');
  });

  it('sends correct event payload', async () => {
    const event = makeEvent({
      eventType: 'link_click',
      referrer: 'https://google.com',
      linkId: 'link-42',
      utmSource: 'meta',
    });
    await forwardToTikTok(event, makeConfig());
    const body = getFetchBody() as Record<string, unknown>;
    expect(body.pixel_code).toBe('pixel-123');
    expect(body.event).toBe('ClickButton');
    expect(body.event_id).toBe('evt-001');
    const ctx = body.context as Record<string, unknown>;
    expect((ctx.page as Record<string, unknown>).url).toBe(
      'https://jov.ie/artist'
    );
    expect((ctx.page as Record<string, unknown>).referrer).toBe(
      'https://google.com'
    );
    expect(ctx.ip).toBe('1.2.3.4');
    const props = body.properties as Record<string, unknown>;
    expect(props.content_id).toBe('link-42');
    expect(props.utm_source).toBe('meta');
  });

  it('returns error when API returns non-zero code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ code: 40001, message: 'Invalid pixel code' }),
        text: () => Promise.resolve(''),
      })
    );
    const result = await forwardToTikTok(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid pixel code');
  });

  it('returns error on HTTP failure', async () => {
    mockFetchError(403, 'Forbidden');
    const result = await forwardToTikTok(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 403');
  });

  it('returns error on network/timeout', async () => {
    mockFetchNetworkError('The operation was aborted');
    const result = await forwardToTikTok(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });

  it('returns error when pixelId is missing', async () => {
    const result = await forwardToTikTok(
      makeEvent(),
      makeConfig({ pixelId: '' })
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns error when accessToken is missing', async () => {
    const result = await forwardToTikTok(
      makeEvent(),
      makeConfig({ accessToken: '' })
    );
    expect(result.success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('event type mapping', () => {
    const mappings: Array<[NormalizedEvent['eventType'], string]> = [
      ['page_view', 'ViewContent'],
      ['link_click', 'ClickButton'],
      ['form_submit', 'SubmitForm'],
      ['scroll_depth', 'ViewContent'],
      ['tip_page_view', 'ViewContent'],
      ['tip_intent', 'InitiateCheckout'],
    ];

    for (const [input, expected] of mappings) {
      it(`maps "${input}" to "${expected}"`, async () => {
        await forwardToTikTok(makeEvent({ eventType: input }), makeConfig());
        const body = getFetchBody() as Record<string, unknown>;
        expect(body.event).toBe(expected);
      });
    }
  });

  it('sends to TikTok Events API URL', async () => {
    await forwardToTikTok(makeEvent(), makeConfig());
    expect(getFetchUrl()).toContain('business-api.tiktok.com');
  });

  it('handles missing message in error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ code: 99999 }),
        text: () => Promise.resolve(''),
      })
    );
    const result = await forwardToTikTok(makeEvent(), makeConfig());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown TikTok API error');
  });
});
