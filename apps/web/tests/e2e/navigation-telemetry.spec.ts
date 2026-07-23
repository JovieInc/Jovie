/**
 * Browser acceptance for JOV-4377: one click-to-ready pair, no raw or identity
 * fields, and no layout shift introduced by the invisible instrumentation.
 *
 * @smoke
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  NAVIGATION_TELEMETRY_ENDPOINT,
  type NavigationTelemetryPayload,
} from '@/lib/tracking/navigation-telemetry-contract';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
  'Requires E2E_USE_TEST_AUTH_BYPASS=1'
);

async function installConsentAndClsObserver(page: Page) {
  await page.addInitScript(endpoint => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: false })
    );
    localStorage.setItem('jovie_tracking_consent', 'accepted');
    window.__JOVIE_NAV_TELEMETRY_CLS__ = 0;
    window.__JOVIE_NAV_TELEMETRY_OBSERVATIONS__ = [];

    let sequence = 0;
    const isNavigationTelemetryUrl = (value: unknown) =>
      String(value).includes(endpoint);
    const capture = (
      body: BodyInit | null | undefined,
      librarySurfaceVisible: boolean,
      observationSequence: number
    ) => {
      const append = (raw: string) => {
        try {
          window.__JOVIE_NAV_TELEMETRY_OBSERVATIONS__?.push({
            payload: JSON.parse(raw) as NavigationTelemetryPayload,
            librarySurfaceVisible,
            sequence: observationSequence,
          });
        } catch {
          // The route schema owns payload validation; malformed bodies are
          // irrelevant to this browser-ordering assertion.
        }
      };

      if (typeof body === 'string') {
        append(body);
      } else if (body instanceof Blob) {
        void body.text().then(append);
      }
    };

    const originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      const librarySurfaceVisible = Boolean(
        document.querySelector('[data-testid="library-surface"]')
      );
      const observationSequence = sequence++;
      const sent = originalSendBeacon(url, data);
      if (sent && isNavigationTelemetryUrl(url)) {
        capture(data, librarySurfaceVisible, observationSequence);
      }
      return sent;
    };

    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : input;
      if (isNavigationTelemetryUrl(url)) {
        capture(
          init?.body,
          Boolean(document.querySelector('[data-testid="library-surface"]')),
          sequence++
        );
      }
      return originalFetch(input, init);
    };

    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as LayoutShift;
        if (!shift.hadRecentInput) {
          window.__JOVIE_NAV_TELEMETRY_CLS__ += shift.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }, NAVIGATION_TELEMETRY_ENDPOINT);
}

test('desktop navigation emits exactly one redacted activation-to-ready pair', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  await installConsentAndClsObserver(page);
  await page.route('**/api/analytics/navigation', async route => {
    await route.fulfill({ status: 204, body: '' });
  });
  await setTestAuthBypassSession(page, 'creator-ready', 'e2e-nav-telemetry');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_ROUTES.CHAT, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('navigation', { name: 'Dashboard Navigation' })
  ).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    window.__JOVIE_NAV_TELEMETRY_CLS__ = 0;
    window.__JOVIE_NAV_TELEMETRY_OBSERVATIONS__ = [];
  });
  await page
    .getByRole('navigation', { name: 'Dashboard Navigation' })
    .getByRole('link', { name: 'Library' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.LIBRARY}$`));
  await expect(page.getByTestId('library-surface')).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__JOVIE_NAV_TELEMETRY_OBSERVATIONS__?.filter(
              observation =>
                observation.payload.item_id === 'library' &&
                ['activation', 'destination_ready'].includes(
                  observation.payload.event
                )
            ).length ?? 0
        ),
      { timeout: 10_000 }
    )
    .toBe(2);

  const observations = await page.evaluate(
    () => window.__JOVIE_NAV_TELEMETRY_OBSERVATIONS__ ?? []
  );
  const clickToReady = observations
    .filter(
      observation =>
        observation.payload.item_id === 'library' &&
        ['activation', 'destination_ready'].includes(observation.payload.event)
    )
    .toSorted((left, right) => left.sequence - right.sequence);
  expect(clickToReady.map(({ payload }) => payload.event)).toEqual([
    'activation',
    'destination_ready',
  ]);
  expect(clickToReady[0]?.payload).toMatchObject({
    source_route: 'chat',
    destination_route: 'library',
    input_method: 'pointer',
    platform: 'web_desktop',
    nav_variant: 'canonical_customer_ia_v1',
    consent_mode: 'explicit',
  });
  expect(clickToReady[0]?.librarySurfaceVisible).toBe(false);
  expect(clickToReady[1]?.librarySurfaceVisible).toBe(true);
  expect(clickToReady[1]?.payload.latency_bucket).not.toBe('na');

  const payloads = observations.map(({ payload }) => payload);
  const serialized = JSON.stringify(payloads);
  for (const forbidden of [
    'pathname',
    'query',
    'title',
    'content',
    'message',
    'search',
    'artist_id',
    'user_id',
    'fingerprint',
    'ip',
    'user_agent',
    'e2e-nav-telemetry',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }

  const cls = await page.evaluate(
    () => window.__JOVIE_NAV_TELEMETRY_CLS__ ?? Number.POSITIVE_INFINITY
  );
  expect(cls).toBeLessThanOrEqual(0.01);
  await testInfo.attach('navigation-telemetry-payloads', {
    body: JSON.stringify(payloads, null, 2),
    contentType: 'application/json',
  });
  await testInfo.attach('navigation-telemetry-library', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

declare global {
  interface LayoutShift extends PerformanceEntry {
    readonly hadRecentInput: boolean;
    readonly value: number;
  }

  interface Window {
    __JOVIE_NAV_TELEMETRY_CLS__?: number;
    __JOVIE_NAV_TELEMETRY_OBSERVATIONS__?: BrowserTelemetryObservation[];
  }

  interface BrowserTelemetryObservation {
    readonly payload: NavigationTelemetryPayload;
    readonly librarySurfaceVisible: boolean;
    readonly sequence: number;
  }
}
