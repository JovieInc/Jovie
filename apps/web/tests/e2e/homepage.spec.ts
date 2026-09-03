import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';
const HOMEPAGE_NAVIGATION_TIMEOUT = 60_000;
type PlaywrightPage = import('@playwright/test').Page;

test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  isFastIteration,
  'Homepage coverage runs in the lighter smoke-public and content-gate fast lanes'
);

async function interceptAnalytics(page: PlaywrightPage) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

async function hasNextDevTransientOverlay(page: PlaywrightPage) {
  return page
    .getByText(
      /Runtime SyntaxError|Unexpected end of JSON input|Manifest file is empty/
    )
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
}

async function gotoHomepage(page: PlaywrightPage) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/', {
      waitUntil: 'domcontentloaded',
      timeout: HOMEPAGE_NAVIGATION_TIMEOUT,
    });
    await waitForHydration(page);

    if (!(await hasNextDevTransientOverlay(page))) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error('Homepage rendered a transient Next.js dev overlay');
}

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the editorial hero with the name search as the only control', async ({
    page,
  }) => {
    const hero = page.getByTestId('homepage-hero-shell');

    await expect(hero).toBeVisible();
    await expect(hero.getByText('operating system')).toHaveCount(0);
    await expect(
      hero.getByRole('heading', {
        name: 'Control how the world sees you.',
      })
    ).toBeVisible();
    await expect(
      hero.getByText(
        'Find what the internet knows. Turn it into relationships.'
      )
    ).toBeVisible();
    await expect(hero.getByPlaceholder('Search your name')).toBeVisible();
    await expect(
      hero.getByRole('button', { name: 'Find me', exact: true })
    ).toBeEnabled();
    await expect(hero.getByRole('link')).toHaveCount(0);
    await expect(hero.getByRole('button')).toHaveCount(1);
    await expect(hero.getByText('Get started')).toHaveCount(0);
    await expect(hero.getByPlaceholder('Ask Jovie...')).toHaveCount(0);

    // The hero owns the first viewport.
    const heroBox = await hero.boundingBox();
    const viewport = page.viewportSize();
    expect(heroBox?.y ?? 1).toBeLessThanOrEqual(0);
    expect(heroBox?.height ?? 0).toBeGreaterThanOrEqual(
      (viewport?.height ?? 0) - 1
    );
  });

  test('header uses compact homepage presentation and text-only login', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute(
      'data-presentation',
      'homepage-embedded'
    );
    await expect(header.locator('a[href="/"]').first()).toBeVisible();
    await expect(header.getByRole('link', { name: 'Product' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'For' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Tools' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Pricing' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Contact' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(
      header.getByRole('link', { name: 'Find yourself' })
    ).toHaveCount(0);

    await page.evaluate(() =>
      window.scrollTo({ top: 320, behavior: 'instant' })
    );
    const floatingShell = header.locator('nav > div');
    await expect
      .poll(async () =>
        floatingShell.evaluate(
          element => element.getBoundingClientRect().height
        )
      )
      .toBeLessThanOrEqual(44);

    const floatingRadius = await floatingShell.evaluate(element =>
      Number.parseFloat(getComputedStyle(element).borderRadius)
    );
    expect(floatingRadius).toBe(22);
  });

  test('header flyouts are not mounted by default', async ({ page }) => {
    const header = page.getByTestId('header-nav');
    const toolsFlyout = page.locator('#marketing-header-flyout-tools');

    await expect(header.getByRole('button', { name: 'For' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Tools' })).toHaveCount(0);
    await expect(toolsFlyout).toHaveCount(0);
  });

  test('hero backdrop is one decorative full-bleed photo that loads first', async ({
    page,
  }) => {
    const backdrop = page.getByTestId('homepage-editorial-hero-backdrop');

    await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    await expect(backdrop.locator('img')).toHaveCount(1);
    await expect(backdrop.locator('img')).toHaveAttribute('alt', '');
    await expect(backdrop.locator('img')).toHaveAttribute(
      'fetchpriority',
      'high'
    );
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(
        '[data-testid="homepage-editorial-hero-backdrop"] img'
      );
      if (!image) return false;
      const rect = image.getBoundingClientRect();
      return (
        image.complete &&
        image.naturalWidth > 0 &&
        rect.width >= window.innerWidth - 1 &&
        rect.height >= window.innerHeight - 1
      );
    });
    await expect(backdrop.locator('img')).toHaveJSProperty(
      'currentSrc',
      /night-desk/
    );

    // Type sits on top of the photo, inside the viewport.
    const heading = page.getByRole('heading', {
      name: 'Control how the world sees you.',
    });
    const headingBox = await heading.boundingBox();
    const viewport = page.viewportSize();
    expect(headingBox?.y ?? -1).toBeGreaterThan(0);
    expect((headingBox?.y ?? 0) + (headingBox?.height ?? 0)).toBeLessThan(
      viewport?.height ?? 0
    );
  });

  test('hero reveal is geometry-safe, interactive, and static under reduced motion', async ({
    page,
  }) => {
    const copy = page.locator('.homepage-editorial-hero__copy');
    const before = await copy.boundingBox();
    expect(
      await copy.evaluate(element => {
        const style = getComputedStyle(element);
        return [style.animationDelay, style.animationName, style.pointerEvents];
      })
    ).toEqual(['0.1s', 'homepage-hero-content-reveal', 'auto']);
    await expect(page.getByTestId('homepage-primary-cta')).toBeEnabled();
    await expect
      .poll(() => copy.evaluate(element => +getComputedStyle(element).opacity))
      .toBe(1);
    expect(await copy.boundingBox()).toEqual(before);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHomepage(page);
    expect(
      await copy.evaluate(element => {
        const style = getComputedStyle(element);
        return [style.animationName, style.opacity];
      })
    ).toEqual(['none', '1']);
  });

  test('locks the nine certified sections, their order, heading lines, and CLS', async ({
    page,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await page.evaluate(() => {
        const target = window as Window & { __homepageCls?: number };
        target.__homepageCls = 0;
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              hadRecentInput: boolean;
              value: number;
            };
            if (!shift.hadRecentInput)
              target.__homepageCls = (target.__homepageCls ?? 0) + shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
    }

    const sectionIds = [
      'homepage-hero-shell',
      'homepage-proof',
      'homepage-section-connected',
      'homepage-section-found',
      'homepage-section-know',
      'homepage-section-relationships',
      'homepage-section-smarter',
      'homepage-section-built',
      'homepage-close',
    ];
    const sectionTops = await page.evaluate(
      ids =>
        ids.map(
          id =>
            document
              .querySelector(`[data-testid="${id}"]`)
              ?.getBoundingClientRect().top ?? Number.NaN
        ),
      sectionIds
    );
    expect(sectionTops.some(top => Number.isNaN(top))).toBe(false);
    expect(sectionTops).toEqual([...sectionTops].sort((a, b) => a - b));

    // Section 2 is a statement, never a logo strip.
    const proof = page.getByTestId('homepage-proof');
    await expect(proof).toHaveText("Proof is earned. We don't borrow it.");
    await expect(proof.locator('img, svg')).toHaveCount(0);
    await expect(page.getByTestId('homepage-trust')).toHaveCount(0);

    // Locked section copy, verbatim.
    for (const [id, headline, body] of [
      [
        'connected',
        'Everything about you, connected.',
        'Your work, links, story, and presence—organized into one living profile.',
      ],
      [
        'found',
        'Be found. Be understood.',
        'Share the right version of you, legible wherever people want to know how you can help.',
      ],
      [
        'know',
        'Know who cares.',
        'See who is paying attention, what brought them to you, and what they may want next.',
      ],
      [
        'relationships',
        'Turn attention into relationships.',
        'Give every person a tailored next step—follow, subscribe, listen, buy, book, or reach out—without forcing everyone through the same funnel.',
      ],
      [
        'smarter',
        'A presence that gets smarter.',
        'Every interaction improves what you know, what you show, and what you do next.',
      ],
      [
        'built',
        'Built around who you are.',
        'Jovie adapts to your work without reducing you to a category.',
      ],
    ] as const) {
      const section = page.getByTestId(`homepage-section-${id}`);
      await expect(
        section.getByRole('heading', { level: 2, name: headline })
      ).toBeVisible();
      await expect(section.getByText(body)).toBeVisible();
    }

    // Real product exports load at device quality where they appear.
    const connected = page.getByTestId('homepage-section-connected');
    await connected.scrollIntoViewIfNeeded();
    await expect(connected.locator('img')).toHaveCount(1);
    const relationships = page.getByTestId('homepage-section-relationships');
    await relationships.scrollIntoViewIfNeeded();
    await expect(relationships.locator('img')).toHaveCount(3);
    const exportSelector =
      '[data-testid="homepage-section-connected"] img, [data-testid="homepage-section-relationships"] img';
    await page.waitForFunction(
      selector =>
        Array.from(document.querySelectorAll<HTMLImageElement>(selector)).every(
          img => img.complete && img.naturalWidth > 0
        ),
      exportSelector
    );
    const exportQuality = await page
      .locator(exportSelector)
      .evaluateAll(images =>
        images.map(img => {
          const rect = img.getBoundingClientRect();
          return {
            alt: img.alt,
            naturalWidth: img.naturalWidth,
            requiredWidth: Math.ceil(rect.width * devicePixelRatio),
          };
        })
      );
    expect(exportQuality).toHaveLength(4);
    for (const image of exportQuality) {
      expect(
        image.naturalWidth,
        `${image.alt} should be loaded at device pixel ratio quality`
      ).toBeGreaterThanOrEqual(image.requiredWidth);
    }

    // Section 9 repeats the name search; CTA is Find me, never Search.
    const close = page.getByTestId('homepage-close');
    await close.scrollIntoViewIfNeeded();
    await expect(
      close.getByRole('heading', { level: 2, name: 'See what the world sees.' })
    ).toBeVisible();
    await expect(close.getByText('Start with your name.')).toBeVisible();
    await expect(close.getByPlaceholder('Search your name')).toBeVisible();
    await expect(
      close.getByRole('button', { name: 'Find me', exact: true })
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toHaveCount(2);
    await expect(page.getByRole('button', { name: /^Search$/ })).toHaveCount(0);
    await expect(page.getByText('Get started')).toHaveCount(0);
    await expect(page.getByText('Drop more music')).toHaveCount(0);
    await expect(page.getByTestId('homepage-faq')).toHaveCount(0);
    await expect(page.getByTestId('homepage-v2-final-cta')).toHaveCount(0);

    if (browserName === 'chromium') {
      expect(
        await page.evaluate(
          () => (window as Window & { __homepageCls?: number }).__homepageCls
        )
      ).toBeLessThanOrEqual(0.01);
    }

    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      const headingLines = await page
        .locator(
          '.homepage-editorial-hero__headline, [data-homepage-section-heading]'
        )
        .evaluateAll(headings =>
          headings.map(heading => {
            const style = getComputedStyle(heading);
            return Math.ceil(
              heading.getBoundingClientRect().height /
                Number.parseFloat(style.lineHeight) -
                0.05
            );
          })
        );
      expect(headingLines).toHaveLength(8);
      expect(Math.max(...headingLines)).toBeLessThanOrEqual(2);
    }

    const footer = page.getByTestId('marketing-footer');
    await expect(footer).toBeVisible();
  });

  test('mobile keeps hero and product proof inside the viewport with direct auth CTAs', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHomepage(page);

    const heading = page.getByRole('heading', {
      name: 'Control how the world sees you.',
    });
    await expect(heading).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });
    await expect(page.getByTestId('header-nav')).toBeVisible();

    // One sentence never wraps onto three lines, even on a phone.
    await page.evaluate(() => document.fonts.ready);
    const headingLines = await heading.evaluate(element => {
      const style = getComputedStyle(element);
      return Math.ceil(
        element.getBoundingClientRect().height /
          Number.parseFloat(style.lineHeight) -
          0.05
      );
    });
    expect(headingLines).toBeLessThanOrEqual(2);

    const search = page.getByTestId('homepage-editorial-hero-search');
    const searchBounds = await search.boundingBox();
    const viewportWidth = page.viewportSize()?.width ?? 0;

    expect(searchBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (searchBounds?.x ?? 0) + (searchBounds?.width ?? 0)
    ).toBeLessThanOrEqual(viewportWidth + 1);
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toBeVisible();

    await page.evaluate(() => {
      const closeDevTools = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close Next.js Dev Tools"]'
      );
      closeDevTools?.click();
    });

    const header = page.getByTestId('header-nav');
    await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(
      0
    );
    await expect(
      header.getByRole('link', { name: 'Get started', exact: true })
    ).toHaveCount(0);
    await expect(
      header.getByRole('link', { name: 'Find yourself', exact: true })
    ).toHaveCount(0);
    await expect(
      header.getByRole('link', { name: 'Log in', exact: true })
    ).toHaveAttribute('href', '/signin');
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const viewports = [
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1512, height: 982 },
    ];

    await page.setViewportSize(viewports[0]);
    await gotoHomepage(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );

      const overflow = await page.evaluate(() => {
        return (
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
        );
      });

      expect(overflow).toBeLessThanOrEqual(1);
    }
  });

  test('loads without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await gotoHomepage(page);

    expect(errors).toEqual([]);
  });

  /**
   * JOV-2065: Public CTAs with data-cta-sign-up="true" route through the
   * canonical /start product entry before authenticated signup.
   *
   * Finds every element marked with data-cta-sign-up="true" and verifies it
   * has an href starting with /start.
   */
  test('all data-cta-sign-up elements navigate to /start (JOV-2065)', async ({
    page,
  }) => {
    await gotoHomepage(page);

    const ctaLinks = page.locator('[data-cta-sign-up="true"]');
    const count = await ctaLinks.count();

    // The certified homepage converts through the name search (two Find me
    // buttons); anchor sign-up CTAs are optional, but any that exist must
    // still route through /start.
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toHaveCount(2);

    for (let i = 0; i < count; i += 1) {
      const cta = ctaLinks.nth(i);
      const tagName = await cta.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'a') {
        const href = await cta.getAttribute('href');
        const isStartRoute = href?.startsWith('/start') ?? false;
        expect(
          isStartRoute,
          `CTA at index ${i} (href="${href}") must route to /start`
        ).toBe(true);
      }
    }
  });
});
