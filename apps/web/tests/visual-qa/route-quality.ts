import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Route } from '@playwright/test';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';
import type {
  VisualQaCoverageEntry,
  VisualQaPlaywrightRouteSource,
} from '@/lib/agent-os/visual-qa/coverage';
import {
  formatLayoutShiftAttribution,
  measureBufferedLayoutShifts,
} from '../helpers/cls-measurement';
import {
  classifySameOriginRequestFailure,
  formatRequestFailure,
} from './aborted-image-request';

export type RouteCoverageEntry = VisualQaCoverageEntry & {
  readonly source: VisualQaPlaywrightRouteSource;
};

export function isRouteCoverageEntry(
  entry: VisualQaCoverageEntry
): entry is RouteCoverageEntry {
  return entry.source.kind === 'playwright-route';
}

export interface BrowserErrorCollection {
  /**
   * Same-origin image loads cancelled with `net::ERR_ABORTED`. Full-page
   * screenshots resize the viewport, and Chromium aborts the superseded
   * `srcset` candidate. Decoded pixels are checked separately, so these
   * cancellations stay observable without failing the request-failure gate.
   */
  readonly abortedImageRequests: string[];
  readonly consoleErrors: string[];
  readonly failedRequests: string[];
  readonly failedResponses: string[];
  readonly pageErrors: string[];
}

export interface FocusVisualStyle {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly boxShadow: string;
  readonly outlineColor: string;
  readonly outlineStyle: string;
  readonly outlineWidth: string;
}

/**
 * A text control inside a composite field (prefix/suffix, search pill, claim
 * field) paints no focus of its own: the CompositeField container owns the
 * ring. The check accepts a visible change on the control OR on its closest
 * composite-field ancestor.
 */
export function hasVisibleCompositeFocusChange(
  focused: { readonly composite?: FocusVisualStyle | null },
  blurred: { readonly composite?: FocusVisualStyle | null }
): boolean {
  if (!focused.composite || !blurred.composite) return false;
  return hasVisibleFocusStyleChange(focused.composite, blurred.composite);
}

export function hasVisibleFocusStyleChange(
  focused: FocusVisualStyle,
  blurred: FocusVisualStyle
): boolean {
  const outlineChanged =
    focused.outlineStyle !== 'none' &&
    focused.outlineWidth !== '0px' &&
    (focused.outlineStyle !== blurred.outlineStyle ||
      focused.outlineWidth !== blurred.outlineWidth ||
      focused.outlineColor !== blurred.outlineColor);
  const shadowChanged =
    focused.boxShadow !== 'none' && focused.boxShadow !== blurred.boxShadow;
  const borderChanged = focused.borderColor !== blurred.borderColor;
  const backgroundChanged = focused.backgroundColor !== blurred.backgroundColor;

  return outlineChanged || shadowChanged || borderChanged || backgroundChanged;
}

/**
 * Required handoff evidence for the two isolated promotion entrypoints. The
 * original capture stays on the source page. Only the destination response is
 * controlled: a red auth/claim runtime cannot hide a broken source CTA or make
 * a valid page inherit an unrelated golden-path failure.
 */
async function assertMarketingClaimHandoff(
  page: Page,
  entry: RouteCoverageEntry,
  timeout?: number
): Promise<void> {
  const proofExpect =
    timeout === undefined ? expect : expect.configure({ timeout });
  const sourcePath = entry.source.sourcePath;
  const about = sourcePath === 'apps/web/app/(marketing)/about/page.tsx';
  const artist =
    sourcePath === 'apps/web/app/(marketing)/artist-profiles/page.tsx';
  if (!about && !artist) return;
  const sourceUrl = new URL(page.url());
  proofExpect(sourceUrl.pathname, `${entry.id} source route`).toBe(
    about ? '/about' : '/artist-profiles'
  );
  const expectedHref = MARKETING_CTA_INTENTS.claimProfile.href;
  const destination = new URL(expectedHref, sourceUrl);
  proofExpect(destination.origin, `${entry.id} claim origin`).toBe(
    sourceUrl.origin
  );

  const selectors = about
    ? ['[data-testid="marketing-section-cta"] a']
    : [
        '[data-testid="artist-profile-section-hero"] a[data-testid="homepage-primary-cta"]',
        'a[data-testid="final-cta-action"]',
      ];
  const context = page.context();
  const existingPages = new Set(context.pages());
  const probe = await context.newPage();
  const popups = new Set<Page>();
  const trackPopup = (created: Page) => {
    if (created !== probe && !existingPages.has(created)) popups.add(created);
  };
  context.on('page', trackPopup);
  let active = false;
  let shuttingDown = false;
  let navigations: string[] = [];
  const intercept = async (route: Route) => {
    const request = route.request();
    let owner: Page;
    try {
      owner = request.frame().page();
    } catch {
      await route.abort('blockedbyclient');
      return;
    }
    if (existingPages.has(owner)) {
      await route.fallback();
      return;
    }
    if (owner !== probe) {
      popups.add(owner);
      await route.abort('blockedbyclient');
      return;
    }
    if (shuttingDown) {
      await route.abort('blockedbyclient');
      return;
    }
    const document =
      request.isNavigationRequest() && request.frame() === probe.mainFrame();
    const targetDocument = document && request.url() !== sourceUrl.href;
    const rsc = request.headers().rsc === '1';
    if (!active || (!targetDocument && !rsc)) {
      await route.fallback();
      return;
    }
    if (targetDocument) navigations.push(new URL(request.url()).href);
    // Next falls back to a document navigation for a non-Flight response.
    // Control wrong destinations too, including RSC requests and popups, so
    // a broken source handler cannot execute an unrelated target's runtime.
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Claim handoff</title><main data-testid="marketing-claim-handoff">Browser handoff received</main>',
    });
  };
  await context.route('**/*', intercept);
  try {
    const viewport = page.viewportSize();
    if (viewport) await probe.setViewportSize(viewport);
    await probe.emulateMedia({ reducedMotion: 'reduce' });
    for (const selector of selectors)
      for (const activation of ['mouse', 'keyboard'] as const) {
        active = false;
        navigations = [];
        await probe.goto(sourceUrl.href, { waitUntil: 'load' });
        await proofExpect(probe, `${entry.id} source identity`).toHaveURL(
          sourceUrl.href
        );
        const primary = probe.locator(selector);
        await proofExpect(primary, `${entry.id} primary CTA`).toHaveCount(1);
        await proofExpect(primary).toBeVisible();
        // The pinned Next/React DOM renderer attaches callable host props during
        // hydration. DOM-ready SSR anchors are insufficient: delayed handlers can
        // still block or redirect activation. Unknown renderer behavior fails closed.
        await proofExpect
          .poll(
            () =>
              primary.evaluate(element =>
                Object.keys(element).some(key => {
                  if (!key.startsWith('__reactProps$')) return false;
                  const props = (element as unknown as Record<string, unknown>)[
                    key
                  ];
                  return (
                    !!props &&
                    typeof props === 'object' &&
                    'onClick' in props &&
                    typeof props.onClick === 'function'
                  );
                })
              ),
            { message: `${entry.id} hydrated primary CTA` }
          )
          .toBe(true);
        await proofExpect(primary).toHaveAttribute('href', expectedHref);
        active = true;
        if (activation === 'keyboard') {
          await primary.focus({ timeout });
          await proofExpect(primary).toBeFocused();
          await primary.press('Enter', { timeout });
        } else {
          await primary.click({ timeout });
        }
        await proofExpect(probe, `${entry.id} ${activation} handoff`).toHaveURL(
          destination.href
        );
        await proofExpect(
          probe.getByTestId('marketing-claim-handoff')
        ).toBeVisible();
        proofExpect(
          navigations,
          `${entry.id} ${activation} document request`
        ).toEqual([destination.href]);
        proofExpect(popups.size, `${entry.id} same-frame handoff`).toBe(0);
      }
  } finally {
    shuttingDown = true;
    try {
      await Promise.all([probe, ...popups].map(owned => owned.close()));
    } finally {
      context.off('page', trackPopup);
      await context.unroute('**/*', intercept);
    }
  }
}

export async function assertRegisteredQualityChecks(
  page: Page,
  entry: RouteCoverageEntry,
  options: { handoffTimeoutMs?: number } = {}
): Promise<void> {
  await assertMarketingClaimHandoff(page, entry, options.handoffTimeoutMs);
  const checks = new Set(entry.qualityChecks ?? []);

  if (checks.has('accessibility')) {
    const results = await new AxeBuilder({ page })
      .options(wcag22AaAxeOptions())
      .analyze();
    const blockingViolations = results.violations.filter(
      violation =>
        violation.impact === 'moderate' ||
        violation.impact === 'serious' ||
        violation.impact === 'critical'
    );
    expect(blockingViolations, `${entry.id} accessibility`).toEqual([]);
  }

  if (checks.has('focus-visible')) {
    const routeControlSelector =
      'main a[href], main button:not([disabled]), main input:not([disabled]), main select:not([disabled]), main textarea:not([disabled]), main [tabindex]:not([tabindex="-1"])';
    if ((await page.locator(routeControlSelector).count()) > 0) {
      let focusedControl = page.locator('main :focus-visible').first();
      for (let tabIndex = 0; tabIndex < 64; tabIndex += 1) {
        await page.keyboard.press('Tab');
        focusedControl = page.locator('main :focus-visible').first();
        if (await focusedControl.isVisible().catch(() => false)) break;
      }
      await expect(
        focusedControl,
        `${entry.id} main keyboard focus target`
      ).toBeVisible();
      const focusedElement = await focusedControl.elementHandle();
      expect(
        focusedElement,
        `${entry.id} focused element handle`
      ).not.toBeNull();
      if (!focusedElement) return;

      const focused = await focusedElement.evaluate(element => {
        const style = globalThis.getComputedStyle(element);
        const container = element.closest('[data-component="composite-field"]');
        const cs = container ? globalThis.getComputedStyle(container) : null;
        return {
          composite: cs
            ? {
                backgroundColor: cs.backgroundColor,
                borderColor: cs.borderColor,
                boxShadow: cs.boxShadow,
                outlineColor: cs.outlineColor,
                outlineStyle: cs.outlineStyle,
                outlineWidth: cs.outlineWidth,
              }
            : null,

          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          href: element instanceof HTMLAnchorElement ? element.href : null,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          tagName: element.tagName,
          testId: element.getAttribute('data-testid'),
        };
      });
      await focusedElement.evaluate(element => (element as HTMLElement).blur());
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            globalThis.requestAnimationFrame(() => resolve());
          })
      );
      const blurred = await focusedElement.evaluate(element => {
        const style = globalThis.getComputedStyle(element);
        const container = element.closest('[data-component="composite-field"]');
        const cs = container ? globalThis.getComputedStyle(container) : null;
        return {
          composite: cs
            ? {
                backgroundColor: cs.backgroundColor,
                borderColor: cs.borderColor,
                boxShadow: cs.boxShadow,
                outlineColor: cs.outlineColor,
                outlineStyle: cs.outlineStyle,
                outlineWidth: cs.outlineWidth,
              }
            : null,

          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      });
      expect(
        hasVisibleFocusStyleChange(focused, blurred) ||
          hasVisibleCompositeFocusChange(focused, blurred),
        `${entry.id} visible focus indicator ${JSON.stringify({ focused, blurred })}`
      ).toBe(true);
    }
  }

  if (checks.has('horizontal-overflow')) {
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth
    );
    expect(overflow, `${entry.id} horizontal overflow`).toBeLessThanOrEqual(1);
  }

  if (checks.has('layout-stability')) {
    const { cls, shifts } = await measureBufferedLayoutShifts(page, 300);
    expect(
      cls,
      `${entry.id} cumulative layout shift\n${formatLayoutShiftAttribution(shifts)}`
    ).toBeLessThanOrEqual(0.05);
  }

  if (checks.has('reduced-motion')) {
    const motion = await page.evaluate(() => {
      const activeAnimations = document
        .getAnimations()
        .filter(
          animation => animation.pending || animation.playState === 'running'
        )
        .map(animation => {
          const duration = animation.effect?.getComputedTiming().duration;
          return {
            duration: typeof duration === 'number' ? duration : 0,
            playState: animation.playState,
          };
        })
        .filter(
          animation =>
            animation.duration === Infinity || animation.duration > 10
        );
      return {
        matches: globalThis.matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
        activeAnimations,
      };
    });
    expect(motion.matches, `${entry.id} reduced-motion fixture`).toBe(true);
    expect(
      motion.activeAnimations,
      `${entry.id} active reduced-motion animations`
    ).toEqual([]);
  }
}

export function collectBrowserErrors(
  page: Page,
  enabled: boolean
): BrowserErrorCollection {
  const abortedImageRequests: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  const pageErrors: string[] = [];
  const origin = new URL(
    process.env.BASE_URL?.trim() || 'http://localhost:3100'
  ).origin;
  const failures = {
    abortedImageRequests,
    consoleErrors,
    failedRequests,
    failedResponses,
    pageErrors,
  };
  if (!enabled) return failures;

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', request => {
    const url = request.url();
    const errorText = request.failure()?.errorText;
    const kind = classifySameOriginRequestFailure({
      errorText,
      headers: request.headers(),
      resourceType: request.resourceType(),
      sameOrigin: url.startsWith(origin),
      url,
    });
    if (kind === 'ignored') return;
    const detail = formatRequestFailure(url, errorText);
    if (kind === 'aborted-image') {
      abortedImageRequests.push(detail);
      return;
    }
    failedRequests.push(detail);
  });
  return failures;
}
