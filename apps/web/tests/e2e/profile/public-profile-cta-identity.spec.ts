import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { waitForHydration } from '../utils/smoke-test-utils';

const viewports = [
  { id: '390x844', width: 390, height: 844 },
  { id: '1440x900', width: 1440, height: 900 },
] as const;

test.describe('Public profile CTA and identity evidence', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });
  test.setTimeout(120_000);

  for (const viewport of viewports) {
    test(`${viewport.id} preserves its profile identity and Events contract`, async ({
      page,
    }, testInfo) => {
      const capture = async (name: string) => {
        const screenshotPath = testInfo.outputPath('profile-cta-public', name);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        await testInfo.attach(name, {
          path: screenshotPath,
          contentType: 'image/png',
        });
      };
      await installPublicRouteMocks(page);
      await page.route('**/api/px', route =>
        route.fulfill({ status: 204, body: '' })
      );
      await page.setViewportSize(viewport);
      const response = await page.goto('/tim', {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status()).toBe(200);
      await waitForHydration(page);

      const desktop = viewport.width === 1440;
      const layout = page.getByTestId('public-profile-layout-shell');
      await expect(layout).toHaveAttribute(
        'data-layout',
        desktop ? 'desktop' : 'compact'
      );
      if (desktop) {
        const surface = page.getByTestId('profile-desktop-surface');
        await expect(surface).toBeVisible();
        await expect(surface).toHaveAttribute('data-interactive-ready', 'true');
        const name = surface.getByTestId('profile-header');
        await expect(name).toBeVisible();
        await expect(name).toHaveText('Tim White');
        await expect(name).toHaveAttribute('href', '/tim');
        await expect(
          surface.getByRole('navigation', { name: 'Profile Navigation' })
        ).toBeVisible();
        await expect(
          surface.getByRole('button', { name: 'Events', exact: true })
        ).toBeVisible();
      } else {
        const identity = page.getByTestId('profile-hero-identity-content');
        const name = page.getByTestId('profile-identity-link');
        const metadata = page.getByTestId('profile-hero-metadata-row');
        await expect(identity).toBeVisible();
        await expect(name).toBeVisible();
        await expect(name).toHaveText('Tim White');
        await expect(metadata).toBeVisible();

        const metrics = await identity.evaluate(element => {
          const nameElement = element.querySelector<HTMLElement>(
            '[data-testid="profile-identity-link"]'
          );
          const metadataElement = element.querySelector<HTMLElement>(
            '[data-testid="profile-hero-metadata-row"]'
          );
          if (!nameElement || !metadataElement) return null;

          const identityStyle = window.getComputedStyle(element);
          const nameRect = nameElement.getBoundingClientRect();
          const metadataRect = metadataElement.getBoundingClientRect();
          const headingElement = nameElement.parentElement;
          const headingRect = headingElement?.getBoundingClientRect();
          const headingStyle = headingElement
            ? window.getComputedStyle(headingElement)
            : null;
          return {
            rowGap: Number.parseFloat(identityStyle.rowGap),
            nameTargetHeight: nameRect.height,
            metadataHeight: metadataRect.height,
            renderedGap: metadataRect.top - nameRect.bottom,
            headingHeight: headingRect?.height ?? 0,
            headingMarginBottom: Number.parseFloat(
              headingStyle?.marginBottom ?? '0'
            ),
            headingDisplay: headingStyle?.display ?? '',
          };
        });

        expect(metrics).not.toBeNull();
        expect(metrics?.rowGap).toBe(4);
        expect(metrics?.nameTargetHeight).toBeGreaterThanOrEqual(44);
        expect(metrics?.metadataHeight).toBeLessThanOrEqual(20);
        const metricsReceipt = JSON.stringify(metrics);
        expect(metrics?.renderedGap, metricsReceipt).toBeGreaterThanOrEqual(0);
        expect(metrics?.renderedGap, metricsReceipt).toBeLessThanOrEqual(4);
        await expect(
          page.getByRole('button', { name: 'Events', exact: true })
        ).toBeVisible();
      }
      await capture(`${viewport.id}-identity.png`);

      // Keep founder identity checks above on /tim; exercise the empty Events
      // state using the existing claimed, empty public QA seed profile.
      const fixtureResponse = await page.goto('/edgecase-empty', {
        waitUntil: 'domcontentloaded',
      });
      expect(fixtureResponse?.status()).toBe(200);
      await waitForHydration(page);
      await expect(layout).toHaveAttribute(
        'data-layout',
        desktop ? 'desktop' : 'compact'
      );
      if (desktop) {
        const surface = page.getByTestId('profile-desktop-surface');
        await expect(surface).toBeVisible();
        await expect(surface).toHaveAttribute('data-interactive-ready', 'true');
        const name = surface.getByTestId('profile-header');
        await expect(name).toBeVisible();
        await expect(name).toHaveText('Edge Case Empty');
        await expect(name).toHaveAttribute('href', '/edgecase-empty');
        const navigation = surface.getByRole('navigation', {
          name: 'Profile Navigation',
        });
        await expect(navigation).toBeVisible();
        const eventsTab = navigation.getByRole('button', {
          name: 'Events',
          exact: true,
        });
        await eventsTab.click();
        await expect(eventsTab).toHaveAttribute('aria-current', 'page');
        // Desktop owns a separate Events card with no alert action. Do not
        // pretend the compact CTA geometry contract applies to absent content.
        const events = surface.locator(
          'section[data-testid="profile-primary-tab-tour"]'
        );
        await expect(events).toBeVisible();
        await expect(
          events.getByRole('heading', { name: 'Events', exact: true })
        ).toBeVisible();
        await expect(
          events.getByText('No upcoming shows.', { exact: true })
        ).toBeVisible();
        await expect(
          events.getByRole('button', { name: 'Turn On Event Alerts' })
        ).toHaveCount(0);
        await capture(`${viewport.id}-events.png`);
        return;
      }
      await expect(page.getByTestId('profile-identity-link')).toBeVisible();
      await expect(page.getByTestId('profile-identity-link')).toHaveText(
        'Edge Case Empty'
      );
      await page.getByRole('button', { name: 'Events', exact: true }).click();
      const emptyEvents = page.getByTestId('profile-primary-tab-events-empty');
      await expect(emptyEvents).toBeVisible();
      await expect(
        emptyEvents.getByRole('heading', { name: 'No Events' })
      ).toBeVisible();
      const canonicalCta = emptyEvents.getByRole('button', {
        name: 'Turn On Event Alerts',
      });
      await expect(canonicalCta).toBeVisible();
      await expect(canonicalCta).toBeEnabled();
      const settleCta = async () => {
        await canonicalCta.evaluate(async element => {
          const pending: Promise<unknown>[] = [];
          for (
            let node: Element | null = element;
            node;
            node = node.parentElement
          ) {
            for (const animation of node.getAnimations()) {
              if (
                animation.playState === 'running' &&
                Number.isFinite(
                  Number(animation.effect?.getComputedTiming().endTime)
                )
              ) {
                pending.push(animation.finished);
              }
            }
          }
          await Promise.all(pending);
          await new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
        });
      };
      const measureCta = async () =>
        canonicalCta.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const before = getComputedStyle(element, '::before');
          const width = Math.max(rect.width, Number.parseFloat(before.width));
          const height = Math.max(
            rect.height,
            Number.parseFloat(before.height)
          );
          const left = rect.left + (rect.width - width) / 2;
          const top = rect.top + (rect.height - height) / 2;
          const points = [
            [left + width / 2, top + 2],
            [left + width / 2, top + height - 2],
            [left + 2, top + height / 2],
            [left + width - 2, top + height / 2],
          ];
          const clientLeft = rect.left + element.clientLeft;
          const clientTop = rect.top + element.clientTop;
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT
          );
          const textRects: {
            left: number;
            right: number;
            top: number;
            bottom: number;
          }[] = [];
          const textFontSizes: number[] = [];
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent?.trim()) continue;
            const textOwner = walker.currentNode.parentElement;
            if (textOwner)
              textFontSizes.push(
                Number.parseFloat(getComputedStyle(textOwner).fontSize)
              );
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            for (const r of range.getClientRects()) {
              if (r.width > 0 && r.height > 0)
                textRects.push({
                  left: r.left,
                  right: r.right,
                  top: r.top,
                  bottom: r.bottom,
                });
            }
          }
          return {
            visibleHeight: rect.height,
            targetHeight: height,
            targetWidth: width,
            owned: points.every(([x, y]) => {
              const hit = document.elementFromPoint(x, y);
              return hit === element || (hit !== null && element.contains(hit));
            }),
            textRects,
            textFontSizes,
            clientLeft,
            clientRight: clientLeft + element.clientWidth,
            clientTop,
            clientBottom: clientTop + element.clientHeight,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
          };
        });
      const assertCta = async (enlarged = false) => {
        await expect(canonicalCta).toBeEnabled();
        await settleCta();
        const geometry = await measureCta();
        if (enlarged) expect(geometry.visibleHeight).toBeGreaterThan(28);
        else expect(geometry.visibleHeight).toBeCloseTo(28, 0);
        expect(geometry.targetHeight).toBeGreaterThanOrEqual(44);
        expect(geometry.targetWidth).toBeGreaterThanOrEqual(44);
        expect(geometry.owned, JSON.stringify(geometry)).toBe(true);
        expect(geometry.textRects.length).toBeGreaterThan(0);
        for (const rect of geometry.textRects) {
          expect(rect.left).toBeGreaterThanOrEqual(geometry.clientLeft);
          expect(rect.right).toBeLessThanOrEqual(geometry.clientRight);
          expect(rect.top).toBeGreaterThanOrEqual(geometry.clientTop);
          expect(rect.bottom).toBeLessThanOrEqual(geometry.clientBottom);
        }
        // At the normal 28px face, the intended 44px pseudo target may
        // contribute scroll overflow. Text Range containment and actual target
        // ownership above are the content oracle, not the pseudo's footprint.
        if (enlarged) {
          expect(geometry.textFontSizes.length).toBeGreaterThan(0);
          for (const fontSize of geometry.textFontSizes) {
            expect(fontSize).toBe(40);
          }
          expect(geometry.scrollHeight).toBeLessThanOrEqual(
            geometry.clientHeight
          );
          expect(geometry.scrollWidth).toBeLessThanOrEqual(
            geometry.clientWidth
          );
        }
      };
      await assertCta();
      await capture(`${viewport.id}-events.png`);

      // Observe real Tab reachability in the Events panel without forcing focus.
      const focusTrace: unknown[] = [];
      const focusIds = await page.evaluateHandle(() => ({
        ids: new WeakMap<Element, number>(),
        next: 0,
      }));
      const recordFocus = async (phase: string) => {
        const state = await canonicalCta.evaluate((element, registry) => {
          const describe = (node: Element | null) => {
            if (node && !registry.ids.has(node))
              registry.ids.set(node, registry.next++);
            return {
              ordinal: node ? registry.ids.get(node) : null,
              tag: node?.tagName ?? null,
              target: node === element,
              body: node === document.body,
              tabIndex: node instanceof HTMLElement ? node.tabIndex : null,
              inDialog: !!node?.closest('[role="dialog"], [aria-modal="true"]'),
              inert: !!node?.closest('[inert]'),
            };
          };
          return {
            active: describe(document.activeElement),
            target: describe(element),
            documentFocused: document.hasFocus(),
            focusVisible: element.matches(':focus-visible'),
            dialogs: Array.from(
              document.querySelectorAll('[role="dialog"], [aria-modal="true"]')
            ).filter(node => node.getClientRects().length > 0).length,
          };
        }, focusIds);
        focusTrace.push({ phase, ...state });
        return state.active.target;
      };
      try {
        await recordFocus('before-tab');
        for (let tab = 0; tab < 40; tab += 1) {
          await page.keyboard.press('Tab');
          const immediate = await recordFocus(`tab-${tab}-immediate`);
          await page.evaluate(
            () =>
              new Promise<void>(resolve =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve())
                )
              )
          );
          const settled = await recordFocus(`tab-${tab}-settled`);
          if (immediate && settled) break;
        }
      } finally {
        await focusIds.dispose();
        const tracePath = testInfo.outputPath(
          'profile-cta-public',
          `${viewport.id}-keyboard-traversal.json`
        );
        await writeFile(
          tracePath,
          JSON.stringify({ viewport: viewport.id, focusTrace })
        );
        await testInfo.attach('profile-keyboard-traversal.json', {
          path: tracePath,
          contentType: 'application/json',
        });
      }
      await expect(canonicalCta).toBeFocused();
      await settleCta();
      await expect(canonicalCta).toBeFocused();
      await expect
        .poll(() =>
          canonicalCta.evaluate(element => getComputedStyle(element).boxShadow)
        )
        .toContain('rgb(37, 99, 255)');
      await assertCta();
      await capture(`${viewport.id}-events-focus.png`);

      const originalFont = await canonicalCta.evaluate(element => ({
        value: element.style.getPropertyValue('font-size'),
        priority: element.style.getPropertyPriority('font-size'),
      }));
      try {
        await canonicalCta.evaluate(element => {
          element.style.fontSize = '40px';
        });
        await assertCta(true);
        await capture(`${viewport.id}-events-native-growth.png`);
      } finally {
        await canonicalCta.evaluate((element, original) => {
          if (original.value)
            element.style.setProperty(
              'font-size',
              original.value,
              original.priority
            );
          else element.style.removeProperty('font-size');
        }, originalFont);
      }
      await assertCta();
    });
  }
});
