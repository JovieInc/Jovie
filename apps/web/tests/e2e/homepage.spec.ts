import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
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
    const frames = page.locator(
      '[data-aura-contained="true"][data-aura-motion="static"]'
    );
    await expect(frames).toHaveCount(2);
    expect(
      await frames
        .first()
        .locator(':scope > [aria-hidden="true"]')
        .evaluate(element => [
          getComputedStyle(element).overflow,
          getComputedStyle(element, '::before').animationName,
        ])
    ).toEqual(['hidden', 'none']);
  });

  test('expands editorial autocomplete as one attached branded control', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1129, height: 842 });
    await page.route('**/api/spotify/search**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'artist-1',
            name: 'Taylor Swift',
            url: 'https://open.spotify.com/artist/artist-1',
            followers: 1000,
            verified: true,
            isClaimed: true,
          },
        ]),
      })
    );

    const hero = page.getByTestId('homepage-hero-shell');
    const input = hero.getByPlaceholder('Search your name');
    await expect(input).toHaveAttribute('spellcheck', 'false');
    await input.fill('Taylor');

    const dropdown = hero.locator('[data-dropdown-presentation="attached"]');
    await expect(dropdown).toBeVisible();
    const spotifyMark = dropdown.getByTestId('spotify-paste-url-brand');
    await expect(spotifyMark.locator('svg')).toBeVisible();
    expect(
      await spotifyMark
        .locator('svg')
        .evaluate(el => getComputedStyle(el).color)
    ).not.toBe('rgb(0, 0, 0)');
    const geometry = await dropdown.evaluate(element => {
      const result = element.getBoundingClientRect();
      const field = element.previousElementSibling?.getBoundingClientRect();
      return [
        Math.abs(result.top - (field?.bottom ?? 0)),
        Math.abs(result.left - (field?.left ?? 0)),
        Math.abs(result.right - (field?.right ?? 0)),
        result.bottom <= innerHeight,
      ];
    });
    expect(geometry[0]).toBeLessThanOrEqual(1.5);
    expect(geometry.slice(1)).toEqual([0, 0, true]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await input.press('ArrowDown');
    const selected = dropdown.getByRole('option', { name: /Taylor Swift/i });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(input).toHaveAttribute('aria-activedescendant', /result-0$/);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await input.press('Escape');
    await expect(dropdown).toHaveCount(0);
    await input.fill('Taylor Swift');
    await expect(dropdown).toBeVisible();
    await hero.getByRole('heading').click({ position: { x: 1, y: 1 } });
    await expect(dropdown).toHaveCount(0);
  });

  test('header uses the canonical marketing shell with full navigation', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute(
      'data-presentation',
      'marketing-glass'
    );
    await expect(header.locator('a[href="/"]').first()).toBeVisible();
    await expect(header.getByRole('link', { name: 'Product' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'For' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Tools' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Pricing' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Contact' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(
      header.getByRole('link', { name: 'Find yourself' })
    ).toHaveAttribute('href', '/start');
  });

  test('canonical header flyouts stay closed until requested', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');
    const toolsFlyout = page.locator('#marketing-header-flyout-tools');

    await expect(header.getByRole('button', { name: 'For' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Tools' })).toBeVisible();
    await expect(toolsFlyout).toHaveCount(0);
  });

  test('hero backdrop is an image-free abstract field with centered content', async ({
    page,
  }) => {
    const backdrop = page.getByTestId('homepage-editorial-hero-backdrop');

    await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    await expect(backdrop).toHaveAttribute('data-hero-layer', 'decorative');
    await expect(backdrop).toHaveAttribute(
      'data-hero-visual',
      'abstract-light-field'
    );
    await expect(backdrop.locator('picture, img, video')).toHaveCount(0);
    await expect(
      backdrop.locator('.homepage-editorial-hero__light-well')
    ).toHaveCount(1);
    expect(
      await backdrop
        .locator('.homepage-editorial-hero__light-well')
        .evaluate(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            backgroundImage: style.backgroundImage,
            opacity: Number.parseFloat(style.opacity),
            height: rect.height,
            width: rect.width,
          };
        })
    ).toMatchObject({
      backgroundImage: expect.not.stringMatching(/^none$/),
      opacity: expect.any(Number),
      height: expect.any(Number),
      width: expect.any(Number),
    });

    const copyBox = await page
      .locator('.homepage-editorial-hero__copy')
      .boundingBox();
    const viewport = page.viewportSize();
    const copyCenter = (copyBox?.x ?? 0) + (copyBox?.width ?? 0) / 2;
    const viewportCenter = (viewport?.width ?? 0) / 2;
    expect(Math.abs(copyCenter - viewportCenter)).toBeLessThanOrEqual(1);
    expect(copyBox?.y ?? -1).toBeGreaterThan(0);
    expect((copyBox?.y ?? 0) + (copyBox?.height ?? 0)).toBeLessThan(
      viewport?.height ?? 0
    );
  });

  test('hero reveal is geometry-safe, interactive, and static under reduced motion', async ({
    page,
  }) => {
    await expect(
      page
        .getByTestId('homepage-hero-shell')
        .locator('[data-hero-layer="active"]')
    ).toHaveCount(1);
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

    const hydrationErrors: string[] = [];
    page.on('console', message => {
      if (
        message.type() === 'error' &&
        message.text().toLowerCase().includes('hydrat')
      ) {
        hydrationErrors.push(message.text());
      }
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoHomepage(page);
    expect(
      await copy.evaluate(element => {
        const style = getComputedStyle(element);
        return [style.animationName, style.opacity];
      })
    ).toEqual(['none', '1']);
    expect(hydrationErrors).toEqual([]);
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

    const heroToProofBoundary = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>(
        '[data-testid="homepage-hero-shell"]'
      );
      const stack = document.querySelector<HTMLElement>(
        '[data-testid="homepage-story-stack"]'
      );
      const proofSection = document.querySelector<HTMLElement>(
        '[data-testid="homepage-proof"]'
      );
      if (!(hero && stack && proofSection)) return null;
      return {
        gap:
          stack.getBoundingClientRect().top -
          hero.getBoundingClientRect().bottom,
        proofOffset:
          proofSection.getBoundingClientRect().top -
          stack.getBoundingClientRect().top,
      };
    });
    expect(heroToProofBoundary).not.toBeNull();
    expect(heroToProofBoundary?.gap).toBeGreaterThanOrEqual(0);
    expect(heroToProofBoundary?.gap).toBeLessThanOrEqual(1);
    expect(
      Math.abs(heroToProofBoundary?.proofOffset ?? Number.NaN)
    ).toBeLessThanOrEqual(1);

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
      .evaluateAll(elements =>
        elements.map(element => {
          const img = element as HTMLImageElement;
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
    await expect(page.getByTestId('homepage-close-mark')).toHaveCount(0);
    await expect(page.getByTestId('homepage-close-depth')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    const closeBox = await close.boundingBox();
    expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(
      (page.viewportSize()?.height ?? 0) * 0.87
    );

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
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      const sectionHeadings = page.locator(
        '.homepage-editorial-hero__headline, [data-homepage-section-heading]'
      );
      const headingLines = await sectionHeadings.evaluateAll(headings =>
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
      await expect
        .poll(async () =>
          Math.max(
            ...(await sectionHeadings.evaluateAll(headings =>
              headings.map(heading => {
                const style = getComputedStyle(heading);
                return Math.ceil(
                  heading.getBoundingClientRect().height /
                    Number.parseFloat(style.lineHeight) -
                    0.05
                );
              })
            ))
          )
        )
        .toBeLessThanOrEqual(2);
    }

    const footer = page.getByTestId('marketing-footer');
    await expect(footer).toBeVisible();
    await expect(
      footer.getByRole('link', { name: 'Artist Profiles' })
    ).toBeVisible();
    await expect(
      footer.getByRole('link', { name: 'Developers' })
    ).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
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
    await expect(page.getByTestId('homepage-primary-cta')).toBeVisible();

    await page.evaluate(() => {
      const closeDevTools = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close Next.js Dev Tools"]'
      );
      closeDevTools?.click();
    });

    const header = page.getByTestId('header-nav');
    const openMenu = page.getByRole('button', { name: 'Open menu' });
    await expect(openMenu).toBeVisible();
    await openMenu.click();
    const mobileNav = page.locator('#mobile-nav-panel');
    await expect(mobileNav).toBeVisible();
    await expect(
      header.getByRole('link', { name: 'Get started', exact: true })
    ).toHaveCount(0);
    await expect(
      header.getByRole('link', { name: 'Find yourself', exact: true })
    ).toHaveCount(0);
    await expect(
      mobileNav.getByRole('link', { name: 'Log in', exact: true })
    ).toHaveAttribute('href', '/signin');
    await expect(
      mobileNav.getByRole('link', { name: 'Find yourself', exact: true })
    ).toHaveAttribute('href', '/start');
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const viewports = [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 736, height: 863 },
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

  test('keeps the hero centered and unclipped at 200% zoom equivalents', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 720, height: 450 },
      { width: 320, height: 406 },
    ]) {
      await page.setViewportSize(viewport);
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);

      const copy = page.locator('.homepage-editorial-hero__copy');
      const copyBox = await copy.boundingBox();
      const heroBox = await page
        .getByTestId('homepage-hero-shell')
        .boundingBox();
      const copyCenter = (copyBox?.x ?? 0) + (copyBox?.width ?? 0) / 2;
      expect(Math.abs(copyCenter - viewport.width / 2)).toBeLessThanOrEqual(8);
      expect(copyBox?.y ?? -1).toBeGreaterThanOrEqual(heroBox?.y ?? 0);
      expect((copyBox?.y ?? 0) + (copyBox?.height ?? 0)).toBeLessThanOrEqual(
        (heroBox?.y ?? 0) + (heroBox?.height ?? 0) + 1
      );

      const horizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      );
      expect(horizontalOverflow).toBeLessThanOrEqual(1);

      const heading = page.getByRole('heading', {
        name: 'Control how the world sees you.',
      });
      const headingLines = await heading.evaluate(element => {
        const style = getComputedStyle(element);
        return Math.ceil(
          element.getBoundingClientRect().height /
            Number.parseFloat(style.lineHeight) -
            0.05
        );
      });
      expect(headingLines).toBeLessThanOrEqual(3);
      await expect(page.getByTestId('homepage-primary-cta')).toBeVisible();
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
   * JOV-5334: Public waitlist-first conversion CTAs land on the production
   * waitlist URL. /start remains the post-auth capture chat, not the public
   * Get started.
   */
  test('all data-cta-sign-up elements navigate to the public waitlist (JOV-5334)', async ({
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
        const isWaitlistRoute =
          href === PUBLIC_WAITLIST_URL ||
          (href?.startsWith('/waitlist') ?? false);
        expect(
          isWaitlistRoute,
          `CTA at index ${i} (href="${href}") must route to the public waitlist`
        ).toBe(true);
      }
    }
  });
});
