import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import type {
  VisualQaCoverageEntry,
  VisualQaPlaywrightRouteSource,
} from '@/lib/agent-os/visual-qa/coverage';
import { measureBufferedCls } from '../helpers/cls-measurement';
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

export async function assertRegisteredQualityChecks(
  page: Page,
  entry: RouteCoverageEntry
): Promise<void> {
  const checks = new Set(entry.qualityChecks ?? []);

  if (checks.has('accessibility')) {
    const results = await new AxeBuilder({ page })
      .withTags([
        'wcag2a',
        'wcag2aa',
        'wcag21a',
        'wcag21aa',
        'wcag22a',
        'wcag22aa',
      ])
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
        return {
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
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      });
      expect(
        hasVisibleFocusStyleChange(focused, blurred),
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
    const cls = await measureBufferedCls(page, 300);
    expect(cls, `${entry.id} cumulative layout shift`).toBeLessThanOrEqual(
      0.05
    );
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
      resourceType: request.resourceType(),
      sameOrigin: url.startsWith(origin),
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
