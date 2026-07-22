import { expect, type Locator, type Page, test } from '@playwright/test';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';

const VIEWPORTS = [
  { label: 'mobile-375', width: 375, height: 812 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 900 },
] as const;

async function enterPersona(
  page: Page,
  persona: 'admin' | 'creator-ready',
  redirect: string
): Promise<void> {
  await page.goto(
    `/api/dev/test-auth/enter?persona=${persona}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 60_000 });
}

async function visibleHrefSet(navigation: Locator) {
  return navigation.locator('a[href]').evaluateAll(links =>
    links
      .filter(link => {
        const style = globalThis.getComputedStyle(link);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(link => link.getAttribute('href'))
      .filter((href): href is string => href !== null)
      .sort()
  );
}

async function customerNavigationContract(
  navigation: Locator,
  mobile: boolean
) {
  const stableMarkup = mobile
    ? await navigation.evaluate(element => element.outerHTML)
    : await navigation
        .locator('[data-nav-section]')
        .evaluateAll(sections =>
          sections.map(section => section.outerHTML).join('')
        );
  const accessibility = await navigation
    .locator('a[href], button')
    .evaluateAll(elements =>
      elements.map(element => ({
        role: element.tagName.toLowerCase(),
        name: element.getAttribute('aria-label') ?? element.textContent?.trim(),
        href: element.getAttribute('href'),
        current: element.getAttribute('aria-current'),
      }))
    );

  return { stableMarkup, accessibility };
}

test.describe('OV responsive navigation exclusivity', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'dev-auth bypass not enabled — set E2E_USE_TEST_AUTH_BYPASS=1'
  );

  for (const viewport of VIEWPORTS) {
    test(`${viewport.label}: OV exposes only canonical operator navigation with stable keyboard and touch geometry`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      await enterPersona(page, 'admin', APP_ROUTES.OV);
      await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.OV}/?$`));

      const mobileNavigation = page.getByRole('navigation', {
        name: 'OV Mobile Navigation',
      });
      const desktopNavigation = page.getByRole('navigation', {
        name: 'OV Navigation',
      });

      if (viewport.width < 1024) {
        await expect(mobileNavigation).toBeVisible();
        await expect(desktopNavigation).not.toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'Dashboard Tabs' })
        ).toHaveCount(0);

        const bottomControls = mobileNavigation.locator(':is(a, button)');
        await expect(bottomControls).toHaveCount(5);
        const controlBoxes = await bottomControls.evaluateAll(controls =>
          controls.map(control => {
            const box = control.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              width: box.width,
              height: box.height,
            };
          })
        );
        expect(controlBoxes.every(box => box.width >= 44)).toBe(true);
        expect(controlBoxes.every(box => box.height >= 44)).toBe(true);
        expect(
          Math.min(...controlBoxes.map(box => box.left))
        ).toBeGreaterThanOrEqual(0);
        expect(
          Math.max(...controlBoxes.map(box => box.right))
        ).toBeLessThanOrEqual(viewport.width);

        const mainBefore = await page.locator('#main-content').boundingBox();
        const more = page.getByRole('button', { name: 'More options' });
        await more.focus();
        await page.keyboard.press('Enter');

        const expanded = page.getByRole('navigation', {
          name: 'OV Navigation Menu',
        });
        await expect(expanded).toBeVisible();
        await expect(expanded.getByRole('link').first()).toBeFocused();
        for (const item of ADMIN_NAV_REGISTRY) {
          await expect(
            expanded.getByRole('link', { name: item.label })
          ).toHaveAttribute('href', item.href);
        }

        const operatorHrefs = new Set(
          ADMIN_NAV_REGISTRY.map(item => item.href)
        );
        const renderedHrefs = await visibleHrefSet(expanded);
        expect(new Set(renderedHrefs)).toEqual(operatorHrefs);

        const mainAfterOpen = await page.locator('#main-content').boundingBox();
        expect(mainAfterOpen).toEqual(mainBefore);

        await page.keyboard.press('Escape');
        await expect(expanded).toHaveCount(0);
        await expect(more).toBeFocused();
        expect(await page.locator('#main-content').boundingBox()).toEqual(
          mainBefore
        );
      } else {
        await expect(desktopNavigation).toBeVisible();
        await expect(mobileNavigation).not.toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'Dashboard Navigation' })
        ).toHaveCount(0);

        const operatorLinks = desktopNavigation.getByRole('link');
        await expect(operatorLinks).toHaveCount(ADMIN_NAV_REGISTRY.length);
        for (const item of ADMIN_NAV_REGISTRY) {
          await expect(
            desktopNavigation.getByRole('link', { name: item.label })
          ).toHaveAttribute('href', item.href);
        }
        expect(new Set(await visibleHrefSet(desktopNavigation))).toEqual(
          new Set(ADMIN_NAV_REGISTRY.map(item => item.href))
        );
        await expect(
          page.getByRole('button', { name: 'Sign Out' })
        ).toBeVisible();
      }
    });

    test(`${viewport.label}: Jovie navigation is role-invariant and non-admin OV access cannot leak operator links`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);

      await enterPersona(page, 'admin', APP_ROUTES.CHAT);
      const customerNavigationName =
        viewport.width < 1024 ? 'Dashboard Tabs' : 'Dashboard Navigation';
      const adminCustomerNavigation = page.getByRole('navigation', {
        name: customerNavigationName,
      });
      await expect(adminCustomerNavigation).toBeVisible();
      const adminCustomerContract = await customerNavigationContract(
        adminCustomerNavigation,
        viewport.width < 1024
      );
      await expect(
        page.getByRole('navigation', { name: 'OV Mobile Navigation' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('navigation', { name: 'OV Navigation' })
      ).toHaveCount(0);

      await enterPersona(page, 'creator-ready', APP_ROUTES.CHAT);
      const creatorCustomerNavigation = page.getByRole('navigation', {
        name: customerNavigationName,
      });
      await expect(creatorCustomerNavigation).toBeVisible();
      expect(
        await customerNavigationContract(
          creatorCustomerNavigation,
          viewport.width < 1024
        )
      ).toEqual(adminCustomerContract);

      await enterPersona(page, 'creator-ready', APP_ROUTES.OV);
      await expect(page).toHaveURL(/\/app\/?$/);
      await expect(
        page.getByRole('navigation', { name: 'OV Mobile Navigation' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('navigation', { name: 'OV Navigation' })
      ).toHaveCount(0);
    });
  }
});
