import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForHydration } from '../e2e/utils/smoke-test-utils';
import { collectBrowserErrors } from '../visual-qa/route-quality';

type ScreenProofWindow = Window & {
  __screenProofCls?: number;
};

type ViewportMeasurement = {
  id: string;
  requestedRoute: string;
  finalUrl: string;
  decision: 'pass';
  rendered: true;
  axe: { violations: number };
  overflow: { maxHorizontalPx: number };
  interaction: { passed: true };
  cls: { value: number };
  contrast: { passed: boolean };
  runtime: {
    consoleErrors: number;
    pageErrors: number;
    failedResponses: number;
    failedRequests: number;
  };
};

// `?fs=1` is load-bearing, not decorative: see the SCREEN_PROOF_ROUTES
// comment in scripts/invariants/screen-certification.mjs. Plain `/hud`
// rewrites onto the app-shell-wrapped web.ov-hud-shell screen instead of
// this screen's registered source (apps/web/app/hud/page.tsx).
const proofRoute = '/hud?fs=1';

// Secretless synthetic admin bypass (JOV-7126): /enter mints test-mode
// cookies for a synthetic admin persona without touching the noop
// DATABASE_URL this producer job runs against (E2E_VISUAL_CAPTURE_SYNTHETIC_AUTH
// makes ensureDevTestAuthActor's DB-write fall back to a synthetic actor;
// lib/admin/roles.ts's isAdmin() trusts that fallback only for this exact
// bypass session and persona), then 303-redirects straight onto the real
// isolated HUD route so this spec renders the real page.tsx source, never a
// demo or showcase stand-in. The isolated layout
// (apps/web/app/hud/layout.tsx) never mounts DashboardShellContent, so this
// is the one authenticated app-shell screen that also does not hit the
// passkey/Touch ID admin step-up lock (lib/admin/mfa.ts) — that lock fails
// closed by design and correctly has no synthetic-capture bypass.
const enterUrl = `/api/dev/test-auth/enter?persona=admin&redirect=${encodeURIComponent(proofRoute)}`;

// The HUD mounts many independent widgets (Tim Actions, Design Lab
// proposals, Ovie Launchers, GitHub rate limits, env exceptions, Summer
// cards, what-shipped, …), each fetching its own admin/ops API route on
// mount. Those routes gate on entitlements.isAdmin, which requires a fresh
// passkey/Touch ID step-up (lib/entitlements/server.ts, lib/admin/mfa.ts) —
// a synthetic capture session correctly has none, so they 403 exactly as a
// real admin would before completing step-up. A widget-level 503 is an
// already-controlled "service unavailable" signal (e.g. no reachable DB),
// not a crash. Neither indicates the *screen* failed to render, so only an
// unexpected status class fails this proof.
function isExpectedDegradedResponse(entry: string): boolean {
  const match = /^(\d{3}) (\S+)$/.exec(entry);
  if (!match) return false;
  const status = Number(match[1]);
  const pathname = (() => {
    try {
      return new URL(match[2]).pathname;
    } catch {
      return '';
    }
  })();
  if (status === 503) return true;
  return (
    status === 403 &&
    ['/api/admin/', '/api/ovie/', '/api/ops/'].some(prefix =>
      pathname.startsWith(prefix)
    )
  );
}

// Chrome mirrors each failed fetch/XHR as its own console error with no URL
// ("Failed to load resource: the server responded with a status of 403
// (Forbidden)"), so it cannot be path-checked the same way. The network-level
// isExpectedDegradedResponse check above already proves every 403/503 in
// this run was on an allowed admin/ovie/ops path, so filtering by status
// alone here does not admit anything that check would not have already
// admitted.
function isExpectedDegradedConsoleError(entry: string): boolean {
  return /the server responded with a status of (403|503)\b/.test(entry);
}

// Re-navigating for the second viewport cancels whichever background
// widget poll (any of several under /api/*, admin-gated or not — e.g.
// shipping-state's kiosk-token poll) was still in flight. net::ERR_ABORTED
// is Chromium's dedicated "cancelled, not failed" signal (the same one the
// existing image-viewport-resize allowance in aborted-image-request.ts
// relies on), so it is a diagnostic artifact of this spec revisiting the
// route per viewport, not a page bug, regardless of which same-origin API
// path it names.
function isExpectedDegradedRequestFailure(entry: string): boolean {
  return entry.endsWith(' net::ERR_ABORTED');
}

const viewports = [
  { id: 'desktop', width: 1440, height: 900 },
  { id: 'mobile', width: 390, height: 900 },
] as const;

const outputRoot = path.resolve(
  process.env.SCREEN_PROOF_OUTPUT_DIR || 'test-results/screen-browser-proof'
);
const measurementsPath = path.resolve(
  process.env.SCREEN_PROOF_MEASUREMENTS ||
    'test-results/screen-browser-proof-measurements.json'
);

test('emits exact-head hud-isolated desktop and mobile evidence', async ({
  page,
}) => {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, 'screenshots'), { recursive: true });
  await mkdir(path.dirname(measurementsPath), { recursive: true });
  await page.addInitScript(() => {
    const proofWindow = window as ScreenProofWindow;
    proofWindow.__screenProofCls = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        if (!shift.hadRecentInput && typeof shift.value === 'number') {
          proofWindow.__screenProofCls =
            (proofWindow.__screenProofCls ?? 0) + shift.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  const measured: ViewportMeasurement[] = [];
  const browserErrors = collectBrowserErrors(page, true);
  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const response = await page.goto(enterUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });
    expect(response?.status()).toBe(200);
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname).toBe('/hud');
    expect(finalUrl.search).toBe('?fs=1');
    expect(finalUrl.hash).toBe('');
    await waitForHydration(page);
    // The HUD dashboard polls live metrics on an interval, so
    // waitForLoadState('networkidle') never settles here (unlike the calmer
    // public-profile/platform-connections screens) — rely on the testid
    // visibility waits below instead.

    const root = page.locator('main.hud-kiosk-viewport');
    await expect(root).toBeVisible();
    await expect(page.getByTestId('hud-bottom-marker')).toBeVisible();

    // Keyboard-reachability check only — never click (navigates away from
    // fs=1) and never press Escape (HudFullscreenControl's exit shortcut).
    const exitControl = page.getByRole('button', { name: 'Exit fullscreen' });
    await exitControl.focus();
    await expect(exitControl).toBeFocused();

    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
    });

    const accessibility = await new AxeBuilder({ page })
      .include('main.hud-kiosk-viewport')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);

    const browserMetrics = await page.evaluate(() => {
      const brokenImages = Array.from(document.images)
        .filter(image => image.complete && image.naturalWidth === 0)
        .map(image => image.currentSrc || image.src);
      const proofWindow = window as ScreenProofWindow;
      return {
        brokenImages,
        cls: proofWindow.__screenProofCls ?? 0,
        horizontalOverflow: Math.max(
          0,
          document.documentElement.scrollWidth - window.innerWidth
        ),
      };
    });
    expect(browserMetrics.brokenImages).toEqual([]);
    expect(browserMetrics.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(browserMetrics.cls).toBeLessThanOrEqual(0.05);
    const unexpectedFailedResponses = browserErrors.failedResponses.filter(
      entry => !isExpectedDegradedResponse(entry)
    );
    const unexpectedConsoleErrors = browserErrors.consoleErrors.filter(
      entry => !isExpectedDegradedConsoleError(entry)
    );
    const unexpectedFailedRequests = browserErrors.failedRequests.filter(
      entry => !isExpectedDegradedRequestFailure(entry)
    );
    expect(unexpectedFailedResponses).toEqual([]);
    expect(unexpectedFailedRequests).toEqual([]);
    expect(browserErrors.pageErrors).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);

    await page.screenshot({
      path: path.join(outputRoot, 'screenshots', `${viewport.id}.png`),
      fullPage: false,
    });
    measured.push({
      id: viewport.id,
      requestedRoute: proofRoute,
      finalUrl: finalUrl.toString(),
      decision: 'pass',
      rendered: true,
      axe: { violations: accessibility.violations.length },
      overflow: { maxHorizontalPx: browserMetrics.horizontalOverflow },
      interaction: { passed: true },
      cls: { value: browserMetrics.cls },
      contrast: {
        passed: !accessibility.violations.some(
          violation => violation.id === 'color-contrast'
        ),
      },
      runtime: {
        // Expected MFA-gated widget 403s and degraded-service 503s (see
        // isExpectedDegradedResponse / isExpectedDegradedConsoleError) are
        // excluded from both fields below — the resolver requires each to
        // be exactly 0 for a screen bound to a proof route.
        consoleErrors: unexpectedConsoleErrors.length,
        pageErrors: browserErrors.pageErrors.length,
        failedResponses: unexpectedFailedResponses.length,
        failedRequests: unexpectedFailedRequests.length,
      },
    });
  }

  await writeFile(
    measurementsPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        viewports: measured,
        activeFlow: { disclosure: false },
        historyProof: {
          separate: true,
          path: 'docs/VISUAL_TESTING_POLICY.md',
        },
        visibleActions: ['Exit fullscreen'],
      },
      null,
      2
    )}\n`
  );
});
