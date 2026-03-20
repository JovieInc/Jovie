import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardToTikTok } from '@/lib/tracking/forwarding/tiktok';
import type {
  NormalizedEvent,
  PlatformConfig,
} from '@/lib/tracking/forwarding/types';

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: 'evt-001',
    eventType: 'page_view',
    eventTime: 1700000000,
    sourceUrl: 'https://jov.ie/artist',
    ipHash: 'hash123',
    clientIp: '1.2.3.4',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  return {
    pixelId: 'tt-pixel-123',
    accessToken: 'tt-access-token',
    enabled: true,
    ...overrides,
  };
}

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when API returns code=0', async () => {
    const result = await forwardToTikTok(makeEvent(), makeConfig());

    expect(result.platform).toBe('tiktok');
    expect(result.success).toBe(true);
    expect(result.responseId).toBe('req-abc');
  });

  it('sends access token in headers, not URL', async () => {
    await forwardToTikTok(makeEvent(), makeConfig());

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = fetchCall[0];
    const options = fetchCall[1];

    // Token must NOT be in URL
    expect(url).not.toContain('tt-access-token');
    // Token must be in header
    expect(options.headers['Access-Token']).toBe('tt-access-token');
  });

  it('sends correct event payload', async () => {
    const event = makeEvent({
      eventType: 'link_click',
      referrer: 'https://google.com',
      linkId: 'link-42',
      utmSource: 'meta',
    });
    await forwardToTikTok(event, makeConfig());

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );

    expect(body.pixel_code).toBe('tt-pixel-123');
    expect(body.event).toBe('ClickButton');
    expect(body.event_id).toBe('evt-001');
    expect(body.context.page.url).toBe('https://jov.ie/artist');
    expect(body.context.page.referrer).toBe('https://google.com');
    expect(body.context.ip).toBe('1.2.3.4');
    expect(body.context.user_agent).toBe('TestAgent/1.0');
    expect(body.properties.content_id).toBe('link-42');
    expect(body.properties.utm_source).toBe('meta');
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      })
    );

    const result = await forwardToTikTok(makeEvent(), makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 403');
  });

  it('returns error on network/timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('The operation was aborted'))
    );

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
    expect(result.error).toContain('Missing');
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

        const body = JSON.parse(
          (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
        );
        expect(body.event).toBe(expected);
      });
    }
  });

  it('sends to TikTok Events API URL', async () => {
    await forwardToTikTok(makeEvent(), makeConfig());

    const url: string = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('business-api.tiktok.com');
    expect(url).toContain('/event/track/');
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
