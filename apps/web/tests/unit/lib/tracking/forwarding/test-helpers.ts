/**
 * Shared test helpers for platform forwarder tests.
 * Reduces duplication across facebook.test.ts, google.test.ts, tiktok.test.ts.
 */
import { type Mock, vi } from 'vitest';
import type {
  NormalizedEvent,
  PlatformConfig,
} from '@/lib/tracking/forwarding/types';

export function makeEvent(
  overrides: Partial<NormalizedEvent> = {}
): NormalizedEvent {
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

export function makeConfig(
  overrides: Partial<PlatformConfig> = {}
): PlatformConfig {
  return {
    pixelId: 'pixel-123',
    accessToken: 'token-secret',
    enabled: true,
    ...overrides,
  };
}

export function mockFetchOk(jsonResponse: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(jsonResponse),
      text: () => Promise.resolve(''),
    })
  );
}

export function mockFetchError(status: number, body: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(body),
    })
  );
}

export function mockFetchNetworkError(message = 'Network error'): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(message)));
}

export function getFetchBody(): unknown {
  const call = (fetch as Mock).mock.calls[0];
  return JSON.parse(call[1].body);
}

export function getFetchUrl(): string {
  return (fetch as Mock).mock.calls[0][0];
}
