import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';

/**
 * Pricing Page Tests
 *
 * NOTE: These tests verify the public pricing page for unauthenticated
 * visitors. Must run without saved auth to see correct CTAs.
 */

// Override global storageState to run these tests as unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Pricing coverage runs in the lighter content-gate fast lane'
);

test.describe('Pricing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/profile/view', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/audience/visit', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.route('**/api/track', route =>
      route.fulfill({ status: 200, body: '{}' })
    );
    await page.goto('/pricing', {
      waitUntil: 'domcontentloaded',
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);
  });

  test('displays pricing plans correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Pricing|Jovie/);

    // Check main heading
    await expect(page.locator('h1')).toHaveText('Pricing');
    await expect(
      page.getByRole('heading', {
        name: 'Public Jovie profile and audience capture',
      })
    ).toHaveCount(0);

    // Check that the canonical pricing tiers are visible
    await expect(page.getByTestId('marketing-pricing-plan-free')).toContainText(
      'Free'
    );
    await expect(page.getByTestId('marketing-pricing-plan-free')).toContainText(
      '$0'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      'Pro'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      'Limited access'
    );
    await expect(page.getByTestId('marketing-pricing-plan-pro')).toContainText(
      'Request access'
    );
    await expect(
      page.getByTestId('marketing-pricing-plan-enterprise')
    ).toContainText('Enterprise');
    await expect(
      page.getByTestId('marketing-pricing-plan-enterprise')
    ).toContainText('Contact sales');
    await expect(
      page.getByTestId('marketing-pricing-plan-enterprise')
    ).toContainText('Custom');
    await expect(page.getByTestId('marketing-pricing-plan-max')).toHaveCount(0);
    await expect(page.getByTestId('marketing-pricing-plan-team')).toHaveCount(
      0
    );
  });

  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`keeps comparison text readable and plan selection coherent (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      for (const width of [320, 375, 390, 430, 720, 767, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        const chart = page.locator('.system-b-pricing-chart');
        const table = chart.getByRole('table');
        await expect(table).toHaveCount(1);
        const assertReadableCells = async () => {
          const collisions = await table.evaluate(element => {
            const failures: string[] = [];
            for (const cell of element.querySelectorAll('th, td')) {
              const bounds = cell.getBoundingClientRect();
              const walker = document.createTreeWalker(
                cell,
                NodeFilter.SHOW_TEXT
              );
              for (
                let node = walker.nextNode();
                node;
                node = walker.nextNode()
              ) {
                if (
                  !node.textContent?.trim() ||
                  node.parentElement?.closest('.sr-only')
                ) {
                  continue;
                }
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const ink of range.getClientRects()) {
                  if (
                    ink.left < bounds.left - 1 ||
                    ink.right > bounds.right + 1
                  ) {
                    failures.push(node.textContent.trim());
                  }
                }
              }
            }
            return failures;
          });
          expect(collisions, `comparison painted text at ${width}px`).toEqual(
            []
          );
          expect(
            await table.evaluate(element => {
              const shell = element.parentElement;
              return !!shell && shell.scrollWidth <= shell.clientWidth + 1;
            }),
            `complete comparison fits its visible region at ${width}px`
          ).toBe(true);
        };

        await assertReadableCells();
        if (width < 768) {
          const selector = chart.getByRole('combobox', {
            name: 'Select Plan To Compare',
          });
          await selector.selectOption('free');
          await expect(
            table.getByRole('columnheader', { name: /Free/ })
          ).toContainText('$0');
          await expect(
            table
              .getByRole('rowheader', { name: 'Contact / subscriber capture' })
              .locator('..')
              .getByRole('cell')
          ).toHaveText('Up to 100');
          await assertReadableCells();
          await selector.focus();
          await selector.press('p');
          await expect(selector).toBeFocused();
          await expect(selector).toHaveValue('pro');
          await expect(
            table.getByRole('columnheader', { name: /Artist Presence/ })
          ).toContainText('$199/mo');
          await expect(
            table
              .getByRole('rowheader', { name: 'Contact / subscriber capture' })
              .locator('..')
              .getByRole('cell')
          ).toHaveText('Unlimited');
          await assertReadableCells();
          await selector.press('Tab');
          await expect(page.locator(':focus')).toHaveText(
            'Claim my free profile'
          );
          await page.keyboard.press('Shift+Tab');
          await expect(selector).toBeFocused();
          await selector.press('f');
          await expect(selector).toBeFocused();
          await expect(selector).toHaveValue('free');
          await expect(
            table.getByRole('columnheader', { name: /Free/ })
          ).toContainText('$0');
          await expect(
            table
              .getByRole('rowheader', { name: 'Contact / subscriber capture' })
              .locator('..')
              .getByRole('cell')
          ).toHaveText('Up to 100');
          await assertReadableCells();
          await selector.press('Tab');
          await expect(page.locator(':focus')).toHaveText(
            'Claim my free profile'
          );
          await page.keyboard.press('Shift+Tab');
          await expect(selector).toBeFocused();
          await selector.press('p');
          await expect(selector).toBeFocused();
          await expect(selector).toHaveValue('pro');
          await expect(
            table.getByRole('columnheader', { name: /Artist Presence/ })
          ).toContainText('$199/mo');
          await expect(
            table
              .getByRole('rowheader', { name: 'Contact / subscriber capture' })
              .locator('..')
              .getByRole('cell')
          ).toHaveText('Unlimited');
          await selector.press('Tab');
          await expect(selector).not.toBeFocused();
          await expect(page.locator(':focus')).toHaveText(
            'Claim my free profile'
          );
        } else {
          await expect(chart.getByRole('combobox')).toHaveCount(0);
          await expect(
            table.getByRole('columnheader', { name: /Free/ })
          ).toContainText('$0');
          await expect(
            table.getByRole('columnheader', { name: /Artist Presence/ })
          ).toContainText('$199/mo');
        }
        if (width === 320) {
          const accessibility = await new AxeBuilder({ page })
            .include('.system-b-pricing-chart')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(accessibility.violations).toEqual([]);
        }
      }
    });
  }

  test('keeps centered pricing and plan features readable at narrow and wide widths', async ({
    page,
  }) => {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const hero = page.getByTestId('marketing-section-hero');
      await expect(hero.locator('img')).toHaveCount(0);
      await expect(hero.locator('h1')).toHaveText('Pricing');
      await expect
        .poll(() =>
          page
            .locator('.marketing-pricing-plan-card__features li')
            .evaluateAll(items =>
              items.every(item => {
                const text = item.querySelector('span');
                return (
                  !!text &&
                  text.getBoundingClientRect().width >=
                    item.getBoundingClientRect().width - 2
                );
              })
            )
        )
        .toBe(true);
      await expect(
        page.locator('.marketing-pricing-plan-card__features li svg')
      ).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth
          )
        )
        .toBe(true);
    }
  });

  test('keeps campaign attribution when legacy launch pricing links redirect', async ({
    page,
  }) => {
    await page.goto(
      '/launch/pricing?utm_source=release-email&utm_campaign=fall',
      {
        waitUntil: 'domcontentloaded',
        timeout: SMOKE_TIMEOUTS.NAVIGATION,
      }
    );

    await expect(page).toHaveURL(
      /\/pricing\?utm_source=release-email&utm_campaign=fall$/
    );
    await expect(page.locator('h1')).toHaveText('Pricing');
  });

  test('has working call-to-action buttons', async ({ page }) => {
    const freeTierCta = page
      .getByRole('link', { name: 'Claim my free profile' })
      .first();
    await expect(freeTierCta).toBeVisible();
    await expect(freeTierCta).toHaveAttribute('href', /\/signup\?plan=free/);
    await expect(
      page.getByTestId('marketing-pricing-plan-pro').getByRole('link', {
        name: 'Request access',
      })
    ).toHaveAttribute('href', '/waitlist');
    await expect(
      page.getByTestId('marketing-pricing-plan-enterprise').getByRole('link', {
        name: 'Contact sales',
      })
    ).toHaveAttribute('href', 'mailto:support@jov.ie');
    const pricingCardCtasAreCentered = await page
      .locator('.marketing-pricing-plan-card')
      .evaluateAll(cards =>
        cards.map(card => {
          const cta = card.querySelector<HTMLElement>(
            '.marketing-pricing-plan-card__cta'
          );
          const cardRect = card.getBoundingClientRect();
          const ctaRect = cta?.getBoundingClientRect();
          if (!ctaRect) return false;
          return (
            Math.abs(
              cardRect.left +
                cardRect.width / 2 -
                (ctaRect.left + ctaRect.width / 2)
            ) <= 1 && ctaRect.right <= cardRect.right
          );
        })
      );
    expect(pricingCardCtasAreCentered).toEqual([true, true, true]);
    await expect(
      page.getByRole('link', { name: 'Explore Jovie Profiles' }).first()
    ).toBeVisible();

    await expect(page.getByText('Compare all features').first()).toBeVisible();
  });

  test('shows pricing tier details', async ({ page }) => {
    // Verify page has substantial content (pricing details)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 500).toBe(true);
  });

  test('keeps the pricing explanation free of unsupported distribution-logo proof', async ({
    page,
  }) => {
    await expect(page.locator('.marketing-hero-logos')).toHaveCount(0);
    await expect(
      page.locator('main [data-testid="homepage-trust"]')
    ).toHaveCount(0);
  });

  test('keeps shared logo-bar assets inside the notification trust card (JOV-6849, JOV-7233)', async ({
    page,
  }) => {
    await page.goto('/artist-notifications', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    const logoBar = page.locator('main [data-testid="homepage-trust"]');
    await expect(logoBar).toBeVisible();
    const brokenImages = await logoBar
      .locator('img')
      .evaluateAll(imgs =>
        imgs
          .filter(img => !(img.complete && img.naturalWidth > 0))
          .map(img => img.getAttribute('src') ?? img.alt)
      );
    expect(brokenImages).toEqual([]);
    const logoCard = logoBar.locator(':scope > div');
    const logoFrames = logoCard.locator('[data-logo-asset]');

    for (const width of [375, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(logoCard).toBeVisible();

      const cardBox = await logoCard.boundingBox();
      const logoBoxes = await logoFrames.evaluateAll(frames =>
        frames.map(frame => {
          const rect = frame.getBoundingClientRect();
          return {
            id: frame.getAttribute('data-logo-asset'),
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        })
      );

      expect(cardBox).not.toBeNull();
      for (const logoBox of logoBoxes) {
        expect
          .soft(logoBox.width, `${logoBox.id} width at ${width}px`)
          .toBeGreaterThan(0);
        expect
          .soft(logoBox.left, `${logoBox.id} left at ${width}px`)
          .toBeGreaterThanOrEqual(cardBox!.x);
        expect
          .soft(logoBox.right, `${logoBox.id} right at ${width}px`)
          .toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
      }
    }
  });
});
