import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardToFacebook } from '@/lib/tracking/forwarding/facebook';
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
    pixelId: 'fb-pixel-123',
    accessToken: 'fb-token-secret',
    enabled: true,
    ...overrides,
  };
}

describe('forwardToFacebook', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events_received: 1 }),
        text: () => Promise.resolve(''),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when API returns ok', async () => {
    const result = await forwardToFacebook(makeEvent(), makeConfig());

    expect(result.platform).toBe('facebook');
    expect(result.success).toBe(true);
    expect(result.responseId).toBe('1');
  });

  it('sends access_token in request body, not URL', async () => {
    await forwardToFacebook(makeEvent(), makeConfig());

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const url: string = fetchCall[0];
    const options = fetchCall[1];
    const body = JSON.parse(options.body);

    // Token must NOT be in URL
    expect(url).not.toContain('access_token');
    // Token must be in body
    expect(body.access_token).toBe('fb-token-secret');
  });

  it('sends correct event payload', async () => {
    const event = makeEvent({
      eventType: 'subscribe',
      linkId: 'link-42',
      utmSource: 'meta',
    });
    await forwardToFacebook(event, makeConfig());

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    const data = body.data[0];

    expect(data.event_name).toBe('Subscribe');
    expect(data.event_time).toBe(1700000000);
    expect(data.event_id).toBe('evt-001');
    expect(data.action_source).toBe('website');
    expect(data.user_data.client_ip_address).toBe('1.2.3.4');
    expect(data.custom_data.content_ids).toEqual(['link-42']);
    expect(data.custom_data.utm_source).toBe('meta');
  });

  it('returns error on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      })
    );

    const result = await forwardToFacebook(makeEvent(), makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 400');
    expect(result.error).toContain('Bad request');
  });

  it('returns error on network/abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('The operation was aborted'))
    );

    const result = await forwardToFacebook(makeEvent(), makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  });

  it('returns error immediately when pixelId is missing', async () => {
    const result = await forwardToFacebook(
      makeEvent(),
      makeConfig({ pixelId: '' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns error immediately when accessToken is missing', async () => {
    const result = await forwardToFacebook(
      makeEvent(),
      makeConfig({ accessToken: '' })
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing');
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

        const body = JSON.parse(
          (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
        );
        expect(body.data[0].event_name).toBe(expected);
      });
    }
  });

  it('includes hashed email and phone when provided', async () => {
    const event = makeEvent({
      hashedEmail: 'abc123hash',
      hashedPhone: 'def456hash',
    });
    await forwardToFacebook(event, makeConfig());

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.data[0].user_data.em).toEqual(['abc123hash']);
    expect(body.data[0].user_data.ph).toEqual(['def456hash']);
  });

  it('sends to correct URL with pixel ID', async () => {
    await forwardToFacebook(makeEvent(), makeConfig({ pixelId: 'my-pixel' }));

    const url: string = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/my-pixel/events');
    expect(url).toContain('graph.facebook.com');
  });
});
