import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  expectCenteredPhoneColumn,
  expectDesktopSurfaceBuildMatches,
  PROFILE_DESKTOP_SURFACE_SHIPPED,
} from '../utils/profile-desktop-surface';
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
      await mkdir(testInfo.outputPath('profile-cta-public'), {
        recursive: true,
      });
      const capture = async (name: string) => {
        // Reuse the root Inter contract: observe readiness and the actual label's
        // computed binding, not just whether some font has loaded elsewhere.
        const fontBinding = await page.evaluate(async () => {
          await document.fonts.ready;
          const firstFamily = (value: string) =>
            value
              .split(',')[0]
              .trim()
              .replace(/^['"]|['"]$/g, '');
          const rootInter = firstFamily(
            getComputedStyle(document.documentElement).getPropertyValue(
              '--font-inter'
            )
          );
          const desktop =
            document
              .querySelector('[data-testid="public-profile-layout-shell"]')
              ?.getAttribute('data-layout') === 'desktop';
          const target = desktop
            ? document.querySelector(
                '[data-testid="profile-desktop-surface"] [data-testid="profile-header"] span'
              )
            : document.querySelector(
                '[data-testid="profile-identity-link"] span'
              );
          if (!target) throw new Error('Profile font evidence target missing');
          const style = getComputedStyle(target);
          return {
            rootInter,
            requestedFamily: firstFamily(style.fontFamily),
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStatus: document.fonts.status,
            matchingFaces: Array.from(document.fonts)
              .filter(face => firstFamily(face.family) === rootInter)
              .map(face => ({
                family: firstFamily(face.family),
                status: face.status,
                weight: face.weight,
                display: face.display,
              })),
            evidenceKind:
              'computed-binding-and-loaded-face-not-platform-glyph-proof',
          };
        });
        const fontPath = testInfo.outputPath(
          'profile-cta-public',
          `${name}-font-binding.json`
        );
        await writeFile(fontPath, JSON.stringify(fontBinding));
        await testInfo.attach(`${name}-font-binding.json`, {
          path: fontPath,
          contentType: 'application/json',
        });
        expect(fontBinding.rootInter).not.toBe('');
        expect(fontBinding.requestedFamily).toBe(fontBinding.rootInter);
        expect(fontBinding.fontStatus).toBe('loaded');
        expect(
          fontBinding.matchingFaces.some(
            face => face.status === 'loaded' && face.display === 'swap'
          )
        ).toBe(true);
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

      // The flagged wide surface is distinct from the default CSS-only
      // desktop composition; both keep the compact mobile layout below 1024px.
      const desktop =
        viewport.width === 1440 && PROFILE_DESKTOP_SURFACE_SHIPPED;
      const layout = page.getByTestId('public-profile-layout-shell');
      await expect(layout).toHaveAttribute(
        'data-layout',
        desktop ? 'desktop' : 'compact'
      );
      await expectDesktopSurfaceBuildMatches(page);
      if (viewport.width === 1440 && !desktop) {
        await expectCenteredPhoneColumn(page);
      }
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
          surface
            .getByRole('navigation', { name: 'Profile Navigation' })
            .getByRole('button', { name: 'Home', exact: true })
        ).toHaveAttribute('aria-current', 'page');
      } else {
        const identity = page.getByTestId('profile-identity-header');
        const name = page.getByTestId('profile-identity-link');
        const handle = page.getByTestId('profile-identity-handle');
        await expect(identity).toBeVisible();
        await expect(name).toBeVisible();
        await expect(name).toHaveText('Tim White');
        await expect(handle).toHaveText(/\/tim$/);

        const metrics = await identity.evaluate(element => {
          const nameElement = element.querySelector<HTMLElement>(
            '[data-testid="profile-identity-link"]'
          );
          const handleElement = element.querySelector<HTMLElement>(
            '[data-testid="profile-identity-handle"]'
          );
          const portraitElement = element.querySelector<HTMLElement>(
            '[data-testid="profile-identity-portrait"]'
          );
          // Claimed profiles lead with Get Updates (the fan subscribe flow).
          const primaryElement = element.querySelector<HTMLElement>(
            '[data-testid="profile-identity-get-updates"]'
          );
          if (
            !nameElement ||
            !handleElement ||
            !portraitElement ||
            !primaryElement
          ) {
            return null;
          }

          const nameRect = nameElement.getBoundingClientRect();
          const handleRect = handleElement.getBoundingClientRect();
          const portraitRect = portraitElement.getBoundingClientRect();
          const primaryRect = primaryElement.getBoundingClientRect();
          return {
            portraitSize: portraitRect.width,
            nameTargetHeight: nameRect.height,
            handleHeight: handleRect.height,
            renderedGap: handleRect.top - nameRect.bottom,
            primaryTargetHeight: primaryRect.height,
          };
        });

        expect(metrics).not.toBeNull();
        const metricsReceipt = JSON.stringify(metrics);
        const desktopComposition =
          viewport.width >= 1024 && !PROFILE_DESKTOP_SURFACE_SHIPPED;
        expect(metrics?.portraitSize, metricsReceipt).toBe(
          desktopComposition ? 160 : 80
        );
        expect(metrics?.nameTargetHeight).toBeGreaterThanOrEqual(44);
        expect(metrics?.handleHeight).toBeLessThanOrEqual(
          desktopComposition ? 24 : 20
        );
        expect(metrics?.primaryTargetHeight).toBeGreaterThanOrEqual(44);
        expect(metrics?.renderedGap, metricsReceipt).toBeGreaterThanOrEqual(0);
        expect(metrics?.renderedGap, metricsReceipt).toBeLessThanOrEqual(4);
        await expect(
          page.getByRole('button', { name: 'Events', exact: true })
        ).toBeVisible();
      }
      await capture(`${viewport.id}-identity.png`);

      // JOV-14241: empty Events is hidden (nav + section), not an empty card.
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
        const navigation = surface.getByRole('navigation', {
          name: 'Profile Navigation',
        });
        await expect(navigation).toBeVisible();
        await expect(
          navigation.getByRole('button', { name: 'Events', exact: true })
        ).toHaveCount(0);
        await expect(
          navigation.getByRole('button', { name: 'Home', exact: true })
        ).toHaveAttribute('aria-current', 'page');
        const overview = surface.getByTestId('profile-desktop-home-overview');
        await expect(overview).toBeVisible();
        await expect(
          overview.getByRole('heading', { name: 'Events', exact: true })
        ).toHaveCount(0);
        await capture(`${viewport.id}-events-hidden.png`);
        return;
      }
      await expect(page.getByTestId('profile-identity-link')).toBeVisible();
      await expect(page.getByTestId('profile-identity-link')).toHaveText(
        'Edge Case Empty'
      );
      await expect(
        page
          .getByTestId('profile-bottom-nav')
          .getByRole('button', { name: 'Events', exact: true })
      ).toHaveCount(0);
      await expect(
        page.getByTestId('profile-primary-tab-events-empty')
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Get Updates', exact: true })
      ).toBeVisible();
      await capture(`${viewport.id}-events-hidden.png`);
    });
  }
});
