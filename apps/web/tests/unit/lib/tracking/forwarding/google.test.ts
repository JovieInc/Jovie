import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardToGoogle } from '@/lib/tracking/forwarding/google';
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
    ipHash: 'abcdef1234567890abcdef1234567890abcdef12',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  return {
    pixelId: 'G-XXXXX',
    accessToken: 'google-api-secret',
    enabled: true,
    ...overrides,
  };
}

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    const url: string = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('api_secret=google-api-secret');
    expect(url).toContain('measurement_id=G-XXXXX');
  });

  it('sends correct event payload', async () => {
    const event = makeEvent({
      eventType: 'link_click',
      referrer: 'https://google.com',
      linkId: 'link-42',
      utmSource: 'meta',
    });
    await forwardToGoogle(event, makeConfig());

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );

    expect(body.events[0].name).toBe('click');
    expect(body.events[0].params.page_location).toBe('https://jov.ie/artist');
    expect(body.events[0].params.page_referrer).toBe('https://google.com');
    expect(body.events[0].params.link_id).toBe('link-42');
    expect(body.events[0].params.campaign_source).toBe('meta');
    expect(body.timestamp_micros).toBe(1700000000 * 1000000);
  });

  it('returns error on HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      })
    );

    const result = await forwardToGoogle(makeEvent(), makeConfig());

    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 500');
  });

  it('returns error on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network timeout'))
    );

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
    expect(result.error).toContain('Missing');
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

        const body = JSON.parse(
          (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
        );
        expect(body.events[0].name).toBe(expected);
      });
    }
  });

  it('uses ipHash substring as client_id', async () => {
    const event = makeEvent({
      ipHash: 'abcdef1234567890abcdef1234567890abcdef12',
    });
    await forwardToGoogle(event, makeConfig());

    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    // substring(0, 36) takes first 36 chars
    expect(body.client_id).toBe('abcdef1234567890abcdef1234567890abcd');
  });
});
