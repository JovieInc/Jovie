import type { Page, Route } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  NAVIGATION_TELEMETRY_ENDPOINT,
  type NavigationTelemetryPayload,
} from '@/lib/tracking/navigation-telemetry-contract';
import { interceptGoldenPathTrackingCalls } from '../../e2e/helpers/golden-path-tracking';

const origin = 'http://localhost:3250';
const activation = {
  schema_version: 1,
  event_id: 'golden-path-navigation:activation',
  event: 'activation',
  item_id: 'library',
  source_route: 'chat',
  destination_route: 'library',
  input_method: 'pointer',
  platform: 'web_desktop',
  nav_variant: 'canonical_identity_work_v1',
  consent_mode: 'explicit',
  latency_bucket: 'na',
  success: false,
} satisfies NavigationTelemetryPayload;
const ready = {
  ...activation,
  event_id: 'golden-path-navigation:destination_ready',
  event: 'destination_ready',
  latency_bucket: 'le_500ms',
  success: true,
} satisfies NavigationTelemetryPayload;

type Matcher = string | ((url: URL) => boolean);
type Handler = (route: Route) => Promise<void>;

async function trackingFixture() {
  const registrations = new Map<Matcher, Handler>();
  const page = {
    route: vi.fn(async (matcher: Matcher, handler: Handler) => {
      registrations.set(matcher, handler);
    }),
    url: () => `${origin}${APP_ROUTES.CHAT}`,
  } as unknown as Page;
  const telemetry = await interceptGoldenPathTrackingCalls(page);
  const navigation = [...registrations].find(
    ([matcher]) => typeof matcher === 'function'
  );
  if (!navigation || typeof navigation[0] !== 'function') {
    throw new Error('Expected the navigation telemetry fixture');
  }
  return {
    registrations,
    matches: navigation[0],
    handle: navigation[1],
    telemetry,
  };
}

function requestFixture({
  method = 'POST',
  url = `${origin}${NAVIGATION_TELEMETRY_ENDPOINT}`,
  body = JSON.stringify(activation),
}: {
  method?: string;
  url?: string;
  body?: string | null;
} = {}) {
  const readBody = vi.fn(() => (body === null ? null : Buffer.from(body)));
  const fulfill = vi.fn().mockResolvedValue(undefined);
  const fallback = vi.fn().mockResolvedValue(undefined);
  const route = {
    request: () => ({
      method: () => method,
      url: () => url,
      postDataBuffer: readBody,
    }),
    fulfill,
    fallback,
  } as unknown as Route;
  return { route, readBody, fulfill, fallback };
}

describe('Golden Path tracking fixtures', () => {
  it.each([
    ['legacy event', activation],
    [
      'activation-to-ready batch',
      { schema_version: 1, events: [activation, ready] },
    ],
  ])(
    'acknowledges a valid %s without a Redis server',
    async (_name, payload) => {
      const fixture = await trackingFixture();
      const request = requestFixture({ body: JSON.stringify(payload) });
      expect(fixture.telemetry.getAcceptedNavigationPostCount()).toBe(0);
      await fixture.handle(request.route);
      expect(request.fulfill).toHaveBeenCalledExactlyOnceWith({
        status: 204,
        body: '',
      });
      expect(request.fallback).not.toHaveBeenCalled();
      expect(fixture.telemetry.getAcceptedNavigationPostCount()).toBe(1);
    }
  );

  it.each([
    ['missing body', null, 'missing or too large'],
    ['malformed JSON', '{"events":[', 'must be JSON'],
    [
      'identity field',
      JSON.stringify({ ...activation, user_id: 'PRIVATE_TEST_ID' }),
      'production payload contract',
    ],
    [
      'raw batch content',
      JSON.stringify({
        schema_version: 1,
        events: [activation],
        text: 'PRIVATE_TEST_TEXT',
      }),
      'production payload contract',
    ],
    [
      'empty batch',
      JSON.stringify({ schema_version: 1, events: [] }),
      'production payload contract',
    ],
    [
      'oversized batch',
      JSON.stringify({
        schema_version: 1,
        events: Array.from({ length: 9 }, () => activation),
      }),
      'production payload contract',
    ],
    [
      'invalid outcome',
      JSON.stringify({ ...ready, success: false }),
      'production payload contract',
    ],
    [
      'oversized bytes',
      JSON.stringify({ text: '界'.repeat(3000) }),
      'missing or too large',
    ],
  ] as const)(
    'fails clearly for %s without echoing the body',
    async (_name, body, reason) => {
      const fixture = await trackingFixture();
      const request = requestFixture({ body });
      const failure = await fixture.handle(request.route).then(
        () => null,
        (error: unknown) => error
      );
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain(reason);
      expect((failure as Error).message).not.toContain('PRIVATE_TEST_');
      expect(request.fulfill).not.toHaveBeenCalled();
      expect(request.fallback).not.toHaveBeenCalled();
      expect(fixture.telemetry.getAcceptedNavigationPostCount()).toBe(0);
    }
  );

  it.each(['GET', 'PUT', 'DELETE'])(
    'leaves %s and its authorization to the server',
    async method => {
      const fixture = await trackingFixture();
      const request = requestFixture({ method });
      await fixture.handle(request.route);
      expect(request.fallback).toHaveBeenCalledExactlyOnceWith();
      expect(request.fulfill).not.toHaveBeenCalled();
      expect(request.readBody).not.toHaveBeenCalled();
      expect(fixture.telemetry.getAcceptedNavigationPostCount()).toBe(0);
    }
  );

  it.each([
    `https://external.test${NAVIGATION_TELEMETRY_ENDPOINT}`,
    `http://localhost:3251${NAVIGATION_TELEMETRY_ENDPOINT}`,
    `https://localhost:3250${NAVIGATION_TELEMETRY_ENDPOINT}`,
    `${origin}${NAVIGATION_TELEMETRY_ENDPOINT}?token=PRIVATE_TEST_QUERY`,
  ])('does not intercept an out-of-scope destination', async url => {
    const fixture = await trackingFixture();
    const request = requestFixture({ url });
    await fixture.handle(request.route);
    expect(request.fallback).toHaveBeenCalledExactlyOnceWith();
    expect(request.fulfill).not.toHaveBeenCalled();
    expect(request.readBody).not.toHaveBeenCalled();
    expect(fixture.telemetry.getAcceptedNavigationPostCount()).toBe(0);
  });

  it('leaves credential-bearing destinations untouched', async () => {
    const fixture = await trackingFixture();
    const url = new URL(NAVIGATION_TELEMETRY_ENDPOINT, origin);
    url.username = 'PRIVATE_TEST_USER';
    url.password = 'PRIVATE_TEST_PASS';
    const request = requestFixture({ url: url.href });
    await fixture.handle(request.route);
    expect(request.fallback).toHaveBeenCalledExactlyOnceWith();
    expect(request.fulfill).not.toHaveBeenCalled();
    expect(request.readBody).not.toHaveBeenCalled();
  });

  it('matches only the navigation endpoint and preserves the existing tracking fixtures', async () => {
    const fixture = await trackingFixture();
    expect(
      fixture.matches(new URL(NAVIGATION_TELEMETRY_ENDPOINT, origin))
    ).toBe(true);
    for (const path of [
      '/api/auth/get-session',
      '/api/analytics/navigation/extra',
      '/api/chat',
    ]) {
      expect(fixture.matches(new URL(path, origin))).toBe(false);
    }
    for (const pattern of [
      '**/api/profile/view',
      '**/api/audience/visit',
      '**/api/track',
    ]) {
      const request = requestFixture();
      const handler = fixture.registrations.get(pattern);
      expect(handler).toBeDefined();
      await handler?.(request.route);
      expect(request.fulfill).toHaveBeenCalledExactlyOnceWith({
        status: 200,
        body: '{}',
      });
    }
    expect(fixture.registrations.size).toBe(4);
  });
});
