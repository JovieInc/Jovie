import { writeFile } from 'node:fs/promises';
import { PUBLIC_WAITLIST_URL } from '@/data/homepageFrontDoorCta';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';
import {
  evaluateAcceptanceEvidence,
  evaluateRelationalGrid,
} from '../../../../scripts/component-rendered-invariant-policy.mjs';
import { expect, test } from './setup';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

const isFastIteration = process.env.E2E_FAST_ITERATION === '1';
const HOMEPAGE_NAVIGATION_TIMEOUT = 60_000;
type PlaywrightPage = import('@playwright/test').Page;
type PlaywrightContext = import('@playwright/test').BrowserContext;

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

async function prepareConsentFixture(
  page: PlaywrightPage,
  context: PlaywrightContext
) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Match the consent fixture: middleware refreshes this flag from geo headers.
  await page.setExtraHTTPHeaders({
    'x-vercel-ip-country': 'DE',
    'x-vercel-ip-country-region': 'BE',
  });
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('jv_cc');
    } catch {
      // ignore
    }
  });
  await context.addCookies([
    {
      name: 'jv_cc_required',
      value: '1',
      url: process.env.BASE_URL ?? 'http://localhost:3100',
      sameSite: 'Lax',
    },
  ]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHydration(page);
}

async function readRenderedHeroFontEvidence(page: PlaywrightPage) {
  const binding = await page.evaluate(() => {
    const headline = document.querySelector<HTMLElement>(
      '.homepage-editorial-hero__headline'
    );
    if (!headline) throw new Error('Homepage hero headline missing');
    const firstFamily = (value: string) =>
      value
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '');
    const style = getComputedStyle(headline);
    const rootSatoshi = firstFamily(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--font-satoshi'
      )
    );
    return {
      requestedFamily: firstFamily(style.fontFamily),
      rootSatoshi,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      fontStatus: document.fonts.status,
      matchingFaces: Array.from(document.fonts)
        .filter(face => firstFamily(face.family) === rootSatoshi)
        .map(face => ({
          family: firstFamily(face.family),
          weight: face.weight,
          style: face.style,
          status: face.status,
          display: face.display,
        })),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
    };
  });

  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: '.homepage-editorial-hero__headline',
    });
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', {
      nodeId,
    });
    return {
      binding,
      platformFonts: fonts
        .filter(font => font.glyphCount > 0)
        .map(font => ({
          familyName: font.familyName,
          postScriptName: font.postScriptName,
          isCustomFont: font.isCustomFont,
          glyphCount: font.glyphCount,
        })),
    };
  } finally {
    await session.detach();
  }
}

async function readHeroFontSpecimen(page: PlaywrightPage) {
  return page.evaluate(() => {
    const headline = document.querySelector<HTMLElement>(
      '.homepage-editorial-hero__headline'
    );
    if (!headline) throw new Error('Homepage hero headline missing');
    const style = getComputedStyle(headline);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (!Number.isFinite(fontSize) || !Number.isFinite(lineHeight)) {
      throw new Error('Homepage hero font metrics are not numeric');
    }
    const strip = document.createElement('div');
    strip.dataset.homepageFontSpecimen = 'true';
    strip.style.cssText =
      'position:absolute;left:-100000px;top:0;display:flex;flex-direction:column;visibility:hidden;pointer-events:none;white-space:nowrap;';
    const variants = [
      { viewport: 'desktop', fontSize: 80 },
      { viewport: 'mobile', fontSize: 40 },
    ] as const;
    const weights = [400, 500, 600] as const;
    for (const variant of variants) {
      for (const weight of weights) {
        const sample = document.createElement('span');
        sample.dataset.fontWeight = String(weight);
        sample.dataset.fontViewport = variant.viewport;
        sample.textContent = headline.textContent ?? '';
        sample.style.fontFamily = style.fontFamily;
        sample.style.fontSize = `${variant.fontSize}px`;
        sample.style.fontWeight = String(weight);
        sample.style.lineHeight = String(lineHeight / fontSize);
        sample.style.letterSpacing = style.letterSpacing;
        strip.append(sample);
      }
    }
    document.body.append(strip);
    try {
      return {
        copy: headline.textContent ?? '',
        fontFamily: style.fontFamily,
        lineHeightRatio: lineHeight / fontSize,
        letterSpacing: style.letterSpacing,
        variants: Array.from(strip.children).map(sample => {
          const bounds = sample.getBoundingClientRect();
          return {
            viewport: sample.getAttribute('data-font-viewport'),
            fontSize: Number.parseFloat(getComputedStyle(sample).fontSize),
            fontWeight: Number.parseInt(
              sample.getAttribute('data-font-weight') ?? '0',
              10
            ),
            width: bounds.width,
            height: bounds.height,
          };
        }),
      };
    } finally {
      strip.remove();
    }
  });
}

interface HeroActionVisual {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly color: string;
  readonly boxShadow: string;
  readonly transform: string;
  readonly opacity: string;
  readonly transitionProperty: string;
}

async function readHeroActionVisual(
  action: import('@playwright/test').Locator
): Promise<HeroActionVisual> {
  return action.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      boxShadow: style.boxShadow,
      transform: style.transform,
      opacity: style.opacity,
      transitionProperty: style.transitionProperty,
    };
  });
}

async function readHeroActionVisualAfterFrame(
  page: PlaywrightPage,
  selector: string
): Promise<HeroActionVisual> {
  return page.evaluate(async targetSelector => {
    const element = document.querySelector<HTMLElement>(targetSelector);
    if (!element) throw new Error('Hero action missing for visual sampling');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
      boxShadow: style.boxShadow,
      transform: style.transform,
      opacity: style.opacity,
      transitionProperty: style.transitionProperty,
    };
  }, selector);
}

function hasHeroActionVisualDelta(
  baseline: HeroActionVisual,
  sample: HeroActionVisual
): boolean {
  return (
    baseline.backgroundColor !== sample.backgroundColor ||
    baseline.borderColor !== sample.borderColor ||
    baseline.color !== sample.color ||
    baseline.boxShadow !== sample.boxShadow ||
    baseline.transform !== sample.transform ||
    baseline.opacity !== sample.opacity
  );
}

function sameHeroActionVisual(
  first: HeroActionVisual,
  second: HeroActionVisual
): boolean {
  return !hasHeroActionVisualDelta(first, second);
}

async function measureHeroAction(action: import('@playwright/test').Locator) {
  return action.evaluate(element => {
    const face = element.getBoundingClientRect();
    const pseudo = getComputedStyle(element, '::before');
    const width = Math.max(face.width, Number.parseFloat(pseudo.width) || 0);
    const height = Math.max(face.height, Number.parseFloat(pseudo.height) || 0);
    const left = face.x + (face.width - width) / 2;
    const top = face.y + (face.height - height) / 2;
    const points = [
      [left + width / 2, top + 1],
      [left + width / 2, top + height - 1],
      [left + 1, top + height / 2],
      [left + width - 1, top + height / 2],
    ];
    return {
      faceHeight: face.height,
      clientHeight: element.clientHeight,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
      width,
      height,
      left,
      right: left + width,
      top,
      bottom: top + height,
      viewportWidth: window.innerWidth,
      owned: points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit === element || (hit !== null && element.contains(hit));
      }),
      field: element
        .closest('.homepage-name-search__field')
        ?.getBoundingClientRect(),
    };
  });
}

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await interceptAnalytics(page);
    await gotoHomepage(page);
  });

  test('renders the editorial hero with the configured primary action', async ({
    page,
  }) => {
    const hero = page.getByTestId('marketing-section-hero');

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
    if (FEATURE_FLAGS.WAITLIST_ENABLED) {
      await expect(
        hero.getByRole('link', { name: 'Request access', exact: true })
      ).toHaveAttribute('href', PUBLIC_WAITLIST_URL);
      await expect(hero.getByRole('combobox')).toHaveCount(0);
      await expect(hero.getByRole('button')).toHaveCount(0);
    } else {
      const nameSearch = hero.getByPlaceholder('Search your name');
      await expect(nameSearch).toBeVisible();
      await expect(nameSearch).toHaveAccessibleName('Search your name');
      await expect(
        hero.getByRole('button', { name: 'Find me', exact: true })
      ).toBeEnabled();
      await expect(hero.getByRole('link')).toHaveCount(0);
      await expect(hero.getByRole('button')).toHaveCount(1);
    }
    await expect(hero.getByText('Get started')).toHaveCount(0);
    await expect(hero.getByPlaceholder('Ask Jovie...')).toHaveCount(0);

    // The canonical desktop Hero stage is a 660px slice; the independent
    // proof/logo slice owns the content that follows it.
    const heroBox = await hero.boundingBox();
    expect(heroBox?.y ?? 1).toBeLessThanOrEqual(0);
    expect(heroBox?.height ?? 0).toBeCloseTo(660, 0);

    if (!FEATURE_FLAGS.WAITLIST_ENABLED) {
      const searchBox = await hero
        .getByTestId('homepage-editorial-hero-search')
        .boundingBox();
      const inputBox = await hero
        .getByPlaceholder('Search your name')
        .boundingBox();
      expect(searchBox?.width ?? 0).toBeCloseTo(640, 0);
      expect(inputBox?.width ?? 0).toBeGreaterThanOrEqual(420);
    }
  });

  test('hero action remains independently operable through native text growth and state reversal', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'Platform font evidence is Chromium-only'
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => document.fonts.ready);

    const hero = page.getByTestId('marketing-section-hero');
    const input = hero.getByPlaceholder('Search your name');
    const action = hero.getByRole('button', { name: 'Find me', exact: true });
    const actionSelector = '[data-testid="homepage-primary-cta"]';
    await expect(input).toBeVisible();
    await expect(action).toBeEnabled();

    const fontEvidence = await readRenderedHeroFontEvidence(page);
    const fontSpecimen = await readHeroFontSpecimen(page);
    await writeFile(
      testInfo.outputPath('homepage-hero-font-evidence.json'),
      JSON.stringify(fontEvidence, null, 2)
    );
    await testInfo.attach('homepage-hero-font-evidence.json', {
      path: testInfo.outputPath('homepage-hero-font-evidence.json'),
      contentType: 'application/json',
    });
    await writeFile(
      testInfo.outputPath('homepage-hero-font-specimen.json'),
      JSON.stringify(fontSpecimen, null, 2)
    );
    await testInfo.attach('homepage-hero-font-specimen.json', {
      path: testInfo.outputPath('homepage-hero-font-specimen.json'),
      contentType: 'application/json',
    });
    expect(fontEvidence.binding.fontStatus).toBe('loaded');
    expect(fontEvidence.binding.requestedFamily.toLowerCase()).toBe('satoshi');
    expect(fontEvidence.binding.rootSatoshi.toLowerCase()).toBe('satoshi');
    expect(fontEvidence.binding.reducedMotion).toBe(true);
    expect(
      fontEvidence.platformFonts.some(
        font => font.isCustomFont && /satoshi/i.test(font.familyName)
      )
    ).toBe(true);
    expect(fontSpecimen.copy).toBe('Control how the world sees you.');
    expect(fontSpecimen.variants).toHaveLength(6);
    expect(fontSpecimen.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ viewport: 'desktop', fontSize: 80 }),
        expect.objectContaining({ viewport: 'mobile', fontSize: 40 }),
      ])
    );
    for (const specimen of fontSpecimen.variants) {
      expect(specimen.width).toBeGreaterThan(0);
      expect(specimen.height).toBeGreaterThan(0);
    }

    const baseline = await measureHeroAction(action);
    expect(baseline.faceHeight).toBeCloseTo(28, 0);
    expect(baseline.height).toBeGreaterThanOrEqual(44);
    expect(baseline.width).toBeGreaterThanOrEqual(44);
    expect(baseline.owned).toBe(true);
    expect(baseline.field).not.toBeUndefined();
    expect(baseline.left).toBeGreaterThanOrEqual(baseline.field?.left ?? 0);
    expect(baseline.right).toBeLessThanOrEqual(baseline.field?.right ?? 0);
    expect(baseline.top).toBeGreaterThanOrEqual(baseline.field?.top ?? 0);
    expect(baseline.bottom).toBeLessThanOrEqual(baseline.field?.bottom ?? 0);

    const interactionEvidence: Array<{
      reducedMotion: boolean;
      baseline: HeroActionVisual;
      hoverFirstFrame: HeroActionVisual;
      hoverSettled: HeroActionVisual;
      leaveFirstFrame: HeroActionVisual;
      leaveSettled: HeroActionVisual;
      pressedFirstFrame: HeroActionVisual;
      pressedSettled: HeroActionVisual;
      releaseFirstFrame: HeroActionVisual;
      releaseSettled: HeroActionVisual;
      hoverFirstFrameChangedFromBaseline: boolean;
      hoverSettledChangedFromBaseline: boolean;
      leaveFirstFrameChangedFromHover: boolean;
      leaveSettledReturnedToBaseline: boolean;
      pressedFirstFrameChangedFromHover: boolean;
      pressedSettledChangedFromHover: boolean;
      releaseFirstFrameChangedFromPressed: boolean;
      releaseSettledReturnedToBaseline: boolean;
    }> = [];

    for (const reducedMotion of [false, true]) {
      await page.emulateMedia({
        reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      const modeHero = page.getByTestId('marketing-section-hero');
      const modeInput = modeHero.getByPlaceholder('Search your name');
      const modeAction = modeHero.getByRole('button', {
        name: 'Find me',
        exact: true,
      });
      await expect(modeAction).toBeEnabled();
      const stableBox = await modeAction.boundingBox();
      const baselineVisual = await readHeroActionVisual(modeAction);
      if (reducedMotion) {
        expect(baselineVisual.transitionProperty).toBe('none');
      } else {
        expect(baselineVisual.transitionProperty).toContain('box-shadow');
        expect(baselineVisual.transitionProperty).toContain('transform');
        expect(baselineVisual.transitionProperty).not.toContain('opacity');
        expect(baselineVisual.transitionProperty).not.toContain(
          'background-color'
        );
        expect(baselineVisual.transitionProperty).not.toContain('border-color');
        expect(baselineVisual.transitionProperty).not.toContain('color');
      }

      await modeAction.focus();
      await expect(modeAction).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(modeInput).toBeFocused();

      await modeAction.hover();
      expect(
        await modeAction.evaluate(element => element.matches(':hover'))
      ).toBe(true);
      const hoverFirstFrame = await readHeroActionVisualAfterFrame(
        page,
        actionSelector
      );
      expect(hasHeroActionVisualDelta(baselineVisual, hoverFirstFrame)).toBe(
        true
      );
      await page.waitForTimeout(220);
      const hoverSettled = await readHeroActionVisual(modeAction);
      expect(hasHeroActionVisualDelta(baselineVisual, hoverSettled)).toBe(true);
      await modeInput.hover();
      expect(
        await modeAction.evaluate(element => element.matches(':hover'))
      ).toBe(false);
      const leaveFirstFrame = await readHeroActionVisualAfterFrame(
        page,
        actionSelector
      );
      expect(sameHeroActionVisual(leaveFirstFrame, baselineVisual)).toBe(true);
      await page.waitForTimeout(220);
      const leaveSettled = await readHeroActionVisual(modeAction);
      expect(leaveSettled).toEqual(baselineVisual);

      await modeAction.hover();
      await page.waitForTimeout(220);
      const pressedHoverSettled = await readHeroActionVisual(modeAction);
      expect(pressedHoverSettled).toEqual(hoverSettled);
      const pressedBox = await modeAction.boundingBox();
      if (!pressedBox) throw new Error('Hero action box missing');
      await page.mouse.move(
        pressedBox.x + pressedBox.width / 2,
        pressedBox.y + pressedBox.height / 2
      );
      await page.mouse.down();
      expect(
        await modeAction.evaluate(element => element.matches(':active'))
      ).toBe(true);
      const pressedFirstFrame = await readHeroActionVisualAfterFrame(
        page,
        actionSelector
      );
      expect(
        hasHeroActionVisualDelta(pressedHoverSettled, pressedFirstFrame)
      ).toBe(true);
      await page.waitForTimeout(220);
      const pressedSettled = await readHeroActionVisual(modeAction);
      // Compare against settled hover so hover cannot masquerade as press
      // feedback. The shared primary Button supplies an opacity state that
      // remains available when reduced-motion removes transitions.
      expect(
        hasHeroActionVisualDelta(pressedHoverSettled, pressedSettled)
      ).toBe(true);
      await page.mouse.up();
      expect(
        await modeAction.evaluate(element => element.matches(':active'))
      ).toBe(false);
      await modeInput.hover();
      const releaseFirstFrame = await readHeroActionVisualAfterFrame(
        page,
        actionSelector
      );
      expect(sameHeroActionVisual(releaseFirstFrame, baselineVisual)).toBe(
        true
      );
      await page.waitForTimeout(220);
      expect(await modeAction.boundingBox()).toEqual(pressedBox);
      expect(await modeAction.boundingBox()).toEqual(stableBox);
      await page.waitForTimeout(220);
      const releaseSettled = await readHeroActionVisual(modeAction);
      expect(releaseSettled).toEqual(baselineVisual);
      interactionEvidence.push({
        reducedMotion,
        baseline: baselineVisual,
        hoverFirstFrame,
        hoverSettled,
        leaveFirstFrame,
        leaveSettled,
        pressedFirstFrame,
        pressedSettled,
        releaseFirstFrame,
        releaseSettled,
        hoverFirstFrameChangedFromBaseline: hasHeroActionVisualDelta(
          baselineVisual,
          hoverFirstFrame
        ),
        hoverSettledChangedFromBaseline: hasHeroActionVisualDelta(
          baselineVisual,
          hoverSettled
        ),
        leaveFirstFrameChangedFromHover: hasHeroActionVisualDelta(
          hoverSettled,
          leaveFirstFrame
        ),
        leaveSettledReturnedToBaseline: sameHeroActionVisual(
          leaveSettled,
          baselineVisual
        ),
        pressedFirstFrameChangedFromHover: hasHeroActionVisualDelta(
          pressedHoverSettled,
          pressedFirstFrame
        ),
        pressedSettledChangedFromHover: hasHeroActionVisualDelta(
          pressedHoverSettled,
          pressedSettled
        ),
        releaseFirstFrameChangedFromPressed: hasHeroActionVisualDelta(
          pressedSettled,
          releaseFirstFrame
        ),
        releaseSettledReturnedToBaseline: sameHeroActionVisual(
          releaseSettled,
          baselineVisual
        ),
      });
    }

    await writeFile(
      testInfo.outputPath('homepage-hero-interaction-evidence.json'),
      JSON.stringify(interactionEvidence, null, 2)
    );
    await testInfo.attach('homepage-hero-interaction-evidence.json', {
      path: testInfo.outputPath('homepage-hero-interaction-evidence.json'),
      contentType: 'application/json',
    });

    await action.evaluate(element => {
      (element as HTMLElement).style.fontSize = '40px';
    });
    const enlarged = await measureHeroAction(action);
    expect(enlarged.faceHeight).toBeGreaterThan(28);
    expect(enlarged.scrollHeight).toBeLessThanOrEqual(enlarged.clientHeight);
    expect(enlarged.scrollWidth).toBeLessThanOrEqual(enlarged.clientWidth);
    expect(enlarged.height).toBeGreaterThanOrEqual(44);
    expect(enlarged.width).toBeGreaterThanOrEqual(44);
    expect(enlarged.owned).toBe(true);
    expect(enlarged.left).toBeGreaterThanOrEqual(enlarged.field?.left ?? 0);
    expect(enlarged.right).toBeLessThanOrEqual(enlarged.field?.right ?? 0);
    expect(enlarged.left).toBeGreaterThanOrEqual(0);
    expect(enlarged.right).toBeLessThanOrEqual(enlarged.viewportWidth);
  });

  test('header uses the canonical marketing shell with full navigation', async ({
    page,
  }) => {
    const header = page.getByTestId('header-nav');

    await expect(header).toBeVisible();
    await expect(header).toHaveAttribute(
      'data-presentation',
      'homepage-embedded'
    );
    await expect(header.locator('a[href="/"]').first()).toBeVisible();
    await expect(header.getByRole('link', { name: 'Artists' })).toHaveAttribute(
      'href',
      '/artists'
    );
    await expect(header.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      '/product'
    );
    await expect(header.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    await expect(header.getByRole('button', { name: 'For' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Tools' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Features' })).toHaveCount(
      0
    );
    await expect(header.getByRole('button', { name: 'Resources' })).toHaveCount(
      0
    );
    await expect(header.getByRole('link', { name: 'Contact' })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    await expect(
      header.getByRole('link', { name: 'Request access' })
    ).toHaveAttribute('href', '/signup');
  });

  test('canonical homepage controls grow natively and trust artwork stays in its slots', async ({
    page,
    context,
  }) => {
    await prepareConsentFixture(page, context);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await gotoHomepage(page);
      await page.evaluate(() => document.fonts.ready);
      const actions = page.locator(
        '.marketing-glass-header__cta:visible, [data-testid="cookie-actions"] button:visible, [data-testid="homepage-primary-cta"]:visible'
      );
      await expect(page.getByTestId('cookie-actions')).toBeVisible();
      expect(await actions.count()).toBeGreaterThanOrEqual(4);
      await expect(page.getByTestId('homepage-primary-cta')).toBeVisible();
      for (const action of await actions.all()) {
        const geometry = await action.evaluate(element => {
          const face = element.getBoundingClientRect();
          const target = getComputedStyle(element, '::before');
          return {
            height: face.height,
            targetHeight: Number.parseFloat(target.height),
            targetWidth: Number.parseFloat(target.width),
          };
        });
        expect(geometry.height).toBeCloseTo(28, 0);
        expect(geometry.targetHeight).toBeGreaterThanOrEqual(44);
        expect(geometry.targetWidth).toBeGreaterThanOrEqual(44);
      }

      const consentAndHeader = page.locator(
        '.marketing-glass-header__cta:visible, [data-testid="cookie-actions"] button:visible'
      );
      const assertTargets = async () => {
        const targets = await consentAndHeader.evaluateAll(elements =>
          elements.map(element => {
            const face = element.getBoundingClientRect();
            const pseudo = getComputedStyle(element, '::before');
            const width = Math.max(face.width, Number.parseFloat(pseudo.width));
            const height = Math.max(
              face.height,
              Number.parseFloat(pseudo.height)
            );
            const left = face.x + (face.width - width) / 2;
            const top = face.y + (face.height - height) / 2;
            const points = [
              [left + width / 2, top + 2],
              [left + width / 2, top + height - 2],
              [left + 2, top + height / 2],
              [left + width - 2, top + height / 2],
            ];
            return {
              left,
              right: left + width,
              top,
              bottom: top + height,
              owned: points.every(([x, y]) => {
                const hit = document.elementFromPoint(x, y);
                return (
                  hit === element || (hit !== null && element.contains(hit))
                );
              }),
            };
          })
        );
        for (let i = 0; i < targets.length; i += 1) {
          expect(targets[i].owned, '44px target must hit its own control').toBe(
            true
          );
          for (const other of targets.slice(i + 1)) {
            const target = targets[i];
            expect(
              target.right <= other.left ||
                other.right <= target.left ||
                target.bottom <= other.top ||
                other.bottom <= target.top
            ).toBe(true);
          }
        }
      };
      await assertTargets();
      for (const action of await consentAndHeader.all()) {
        await page.keyboard.press('Tab');
        await action.focus();
        await page.evaluate(
          () =>
            new Promise<void>(resolve => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              );
            })
        );
        await expect(action).toBeFocused();
        const shadow = await action.evaluate(
          element => getComputedStyle(element).boxShadow
        );
        expect(shadow).toContain('rgb(17, 175, 255)');
      }

      // Text-only enlargement must grow the native control, not clip its label.
      for (const action of await actions.all()) {
        await action.evaluate(element => {
          element.style.fontSize = '40px';
        });
        const grown = await action.evaluate(element => ({
          height: element.getBoundingClientRect().height,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
        expect(grown.height).toBeGreaterThan(28);
        expect(grown.scrollHeight).toBeLessThanOrEqual(grown.clientHeight);
      }
      await assertTargets();
    }
  });

  test('canonical header has no flyout menus', async ({ page }) => {
    const header = page.getByTestId('header-nav');
    const toolsFlyout = page.locator('#marketing-header-flyout-tools');

    await expect(header.getByRole('button', { name: 'For' })).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Tools' })).toHaveCount(0);
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
    expect(copyBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((copyBox?.y ?? 0) + (copyBox?.height ?? 0)).toBeLessThan(
      viewport?.height ?? 0
    );
  });

  test('hero reveal is geometry-safe, interactive, and static under reduced motion', async ({
    page,
  }) => {
    await expect(
      page
        .getByTestId('marketing-section-hero')
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

  test('locks current editorial sections, action states, heading lines, and CLS', async ({
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
      'marketing-section-hero',
      'homepage-section-connected',
      'homepage-section-relationships',
      'homepage-editorial-changelog',
      'homepage-close',
    ];
    const sectionTops = await page.evaluate(
      ids =>
        ids.map(
          id =>
            document
              .querySelector(
                `[data-testid="${id}"], [data-homepage-testid="${id}"]`
              )
              ?.getBoundingClientRect().top ?? Number.NaN
        ),
      sectionIds
    );
    expect(sectionTops.some(top => Number.isNaN(top))).toBe(false);
    expect(sectionTops).toEqual([...sectionTops].sort((a, b) => a - b));

    await expect(page.getByTestId('marketing-section-logo-cloud')).toHaveCount(
      0
    );
    const connected = page.locator(
      '[data-homepage-testid="homepage-section-connected"]'
    );
    await connected.scrollIntoViewIfNeeded();
    await expect(
      connected.getByRole('heading', {
        name: 'Everything about you, connected.',
      })
    ).toBeVisible();
    await expect(
      connected.getByText('IDENTITY, ACROSS THE INTERNET')
    ).toBeVisible();
    await expect(
      connected.getByText(
        'Your work and story are scattered across the internet. Your identity should be easier to see.'
      )
    ).toBeVisible();
    // The identity artwork remains editorial rather than a profile screenshot.
    await connected.scrollIntoViewIfNeeded();
    await expect(connected.locator('img')).toHaveCount(1);
    const relationships = page.locator(
      '[data-homepage-testid="homepage-section-relationships"]'
    );
    await relationships.scrollIntoViewIfNeeded();
    await expect(relationships.locator('img')).toHaveCount(0);
    await expect(relationships.getByRole('listitem')).toHaveCount(3);
    const exportSelector =
      '[data-homepage-testid="homepage-section-connected"] img, [data-homepage-testid="homepage-section-relationships"] img';
    await page.waitForFunction(
      selector =>
        Array.from(document.querySelectorAll<HTMLImageElement>(selector)).every(
          img => img.complete && img.naturalWidth > 0
        ),
      exportSelector
    );
    const exportQuality = await page
      .locator(exportSelector)
      .evaluateAll(async elements =>
        Promise.all(
          elements.map(async element => {
            const img = element as HTMLImageElement;
            const rect = img.getBoundingClientRect();
            // Responsive srcset naturalWidth is density-corrected. Decode the
            // selected resource separately to measure its actual pixel width.
            const resource = new Image();
            resource.src = img.currentSrc;
            await resource.decode();
            return {
              alt: img.alt,
              naturalWidth: resource.naturalWidth,
              requiredWidth: Math.ceil(rect.width * devicePixelRatio),
            };
          })
        )
      );
    expect(exportQuality).toHaveLength(1);
    for (const image of exportQuality) {
      expect(
        image.naturalWidth,
        `${image.alt} should be loaded at device pixel ratio quality`
      ).toBeGreaterThanOrEqual(image.requiredWidth);
    }

    const close = page.getByTestId('marketing-section-cta');
    await close.scrollIntoViewIfNeeded();
    await expect(
      close.getByRole('heading', { name: 'Take control of your presence.' })
    ).toBeVisible();
    if (FEATURE_FLAGS.WAITLIST_ENABLED) {
      await expect(
        close.getByRole('link', { name: 'Request access' })
      ).toHaveAttribute('href', PUBLIC_WAITLIST_URL);
    } else {
      await close.getByRole('button', { name: 'Find your profile' }).click();
      await expect(page.getByPlaceholder('Search your name')).toBeFocused();
    }
    await expect(
      page.getByRole('button', { name: 'Find me', exact: true })
    ).toHaveCount(FEATURE_FLAGS.WAITLIST_ENABLED ? 0 : 1);
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
      expect(headingLines).toHaveLength(4);
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

  test('proof logos do not collide and headings clear the sticky nav at 1280', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoHomepage(page);
    await page.evaluate(() => document.fonts.ready);

    const proof = page.getByTestId('marketing-section-logo-cloud');
    await expect(proof.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'inline-strip'
    );
    await expect(proof.locator('[data-presentation="card"]')).toHaveCount(0);

    const logoBoxes = await proof.locator('svg').evaluateAll(svgs =>
      svgs.map(svg => {
        const box = svg.getBoundingClientRect();
        return {
          label: svg.getAttribute('aria-label') ?? svg.textContent ?? '',
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
      })
    );
    expect(logoBoxes).toHaveLength(4);
    for (let index = 0; index < logoBoxes.length; index += 1) {
      for (let other = index + 1; other < logoBoxes.length; other += 1) {
        const a = logoBoxes[index];
        const b = logoBoxes[other];
        const overlaps =
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        expect(overlaps, `${a.label} overlaps ${b.label} at 1280px`).toBe(
          false
        );
      }
    }

    const headerBottom = await page
      .getByTestId('header-nav')
      .evaluate(header => {
        const shell = header.querySelector('.marketing-glass-header__shell');
        return (shell ?? header).getBoundingClientRect().bottom;
      });

    const headings = page.locator('[data-homepage-section-heading]');
    const headingCount = await headings.count();
    expect(headingCount).toBeGreaterThanOrEqual(7);

    for (let index = 0; index < headingCount; index += 1) {
      const heading = headings.nth(index);
      const name = (await heading.innerText()).trim();
      await heading.evaluate(element => {
        element.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
      const top = await heading.evaluate(
        element => element.getBoundingClientRect().top
      );
      expect(top, `${name} must clear the sticky nav`).toBeGreaterThanOrEqual(
        headerBottom - 0.5
      );
    }
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

    const [heroStageWidth, searchMaterial] = await Promise.all([
      page
        .locator('.homepage-editorial-hero__stage')
        .evaluate(element => element.getBoundingClientRect().width),
      FEATURE_FLAGS.WAITLIST_ENABLED
        ? Promise.resolve(null)
        : search.locator('.homepage-name-search').evaluate(element => {
            const field = element.querySelector<HTMLElement>(
              '.homepage-name-search__field'
            );
            const glow = element.querySelector<HTMLElement>(
              '.input-aura-frame__illumination'
            );
            if (!(field && glow)) return null;
            const fieldBounds = field.getBoundingClientRect();
            const glowBounds = glow.getBoundingClientRect();
            const glowStyle = getComputedStyle(glow);
            return {
              fieldLeft: fieldBounds.left,
              fieldRight: fieldBounds.right,
              glowLeft: glowBounds.left,
              glowRight: glowBounds.right,
              glowMaskComposite: glowStyle.maskComposite,
              glowWebkitMaskComposite: glowStyle.webkitMaskComposite,
            };
          }),
    ]);

    expect(searchBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (searchBounds?.x ?? 0) + (searchBounds?.width ?? 0)
    ).toBeLessThanOrEqual(viewportWidth + 1);
    expect(searchBounds?.width ?? 0).toBeCloseTo(
      Math.min(640, heroStageWidth),
      0
    );
    if (FEATURE_FLAGS.WAITLIST_ENABLED) {
      await expect(
        search.getByRole('link', { name: 'Request access' })
      ).toHaveAttribute('href', PUBLIC_WAITLIST_URL);
    } else {
      expect(searchMaterial).not.toBeNull();
      expect(searchMaterial?.glowLeft).toBeCloseTo(
        searchMaterial?.fieldLeft ?? Number.NaN,
        0
      );
      expect(searchMaterial?.glowRight).toBeCloseTo(
        searchMaterial?.fieldRight ?? Number.NaN,
        0
      );
      expect(
        searchMaterial?.glowMaskComposite === 'exclude' ||
          searchMaterial?.glowWebkitMaskComposite === 'xor' ||
          searchMaterial?.glowWebkitMaskComposite === 'XOR'
      ).toBe(true);
    }
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
      header.getByRole('link', { name: 'Find yourself', exact: true })
    ).toHaveCount(0);
    await expect(
      mobileNav.getByRole('link', { name: 'Log in', exact: true })
    ).toHaveAttribute('href', '/signin');
    await expect(
      mobileNav.getByRole('link', { name: 'Request access', exact: true })
    ).toHaveAttribute('href', '/signup');
  });

  test('has no horizontal overflow across common viewports', async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const viewports = [
      { width: 320, height: 568 },
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
        .getByTestId('marketing-section-hero')
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

  test('editorial sections share one desktop column grid and scaled phone chrome', async ({
    page,
  }) => {
    const measure = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      });
      return page.evaluate(() => {
        const copies = [
          ...document.querySelectorAll<HTMLElement>(
            '.homepage-certified-section .homepage-certified-section__copy'
          ),
        ];
        const starts = copies.map(copy => {
          const section = copy.closest<HTMLElement>(
            '.homepage-certified-section'
          );
          return {
            align: section?.dataset.align ?? '',
            left: copy.getBoundingClientRect().left,
          };
        });
        const startLefts = starts
          .filter(entry => entry.align === 'start')
          .map(entry => entry.left);
        const endLefts = starts
          .filter(entry => entry.align === 'end')
          .map(entry => entry.left);
        const notches = [
          ...document.querySelectorAll<HTMLElement>(
            '.homepage-certified-section__phones[data-count="3"] .ap-phone-frame'
          ),
        ].map(frame => {
          const notch = frame.querySelector<HTMLElement>(
            '.ap-phone-frame__notch'
          );
          const frameWidth = frame.getBoundingClientRect().width;
          const notchWidth = notch?.getBoundingClientRect().width ?? 0;
          return { frameWidth, notchWidth, ratio: notchWidth / frameWidth };
        });
        return { startLefts, endLefts, notches };
      });
    };

    const spread = (values: number[]) =>
      Math.max(...values) - Math.min(...values);

    const desktop = await measure(1440);
    expect(spread(desktop.startLefts)).toBeLessThanOrEqual(2);
    expect(spread(desktop.endLefts)).toBeLessThanOrEqual(2);
    expect(
      evaluateRelationalGrid({
        candidateRevision: 'live',
        route: '/',
        viewport: { width: 1440, height: 900 },
        state: 'idle',
        theme: 'light',
        sourceTokensPass: true,
        elements: desktop.endLefts.map((x, index) => ({
          id: `end-copy-${index}`,
          column: '7 / span 6',
          align: 'end',
          role: 'copy',
          box: { x, y: 0, width: 0, height: 0 },
        })),
      }).ok
    ).toBe(true);
    expect(
      evaluateAcceptanceEvidence({
        candidateRevision: 'live',
        route: '/',
        viewport: { width: 1440, height: 900 },
        state: 'idle',
        theme: 'light',
        sourceTokensPass: true,
        rendered: { aligned: spread(desktop.endLefts) <= 2 },
        screenshotBaselineUpdated: false,
      }).ok
    ).toBe(true);
    expect(desktop.endLefts[0] ?? 0).toBeGreaterThan(
      (desktop.startLefts[0] ?? 0) + 80
    );

    const aboveSwitch = await measure(900);
    const belowSwitch = await measure(899);
    expect(spread(aboveSwitch.startLefts)).toBeLessThanOrEqual(2);
    expect(spread(aboveSwitch.endLefts)).toBeLessThanOrEqual(2);
    expect(aboveSwitch.endLefts[0] ?? 0).toBeGreaterThan(
      (aboveSwitch.startLefts[0] ?? 0) + 40
    );
    expect(
      spread([...belowSwitch.startLefts, ...belowSwitch.endLefts])
    ).toBeLessThanOrEqual(2);

    const mobile = await measure(390);
    expect(
      spread([...mobile.startLefts, ...mobile.endLefts])
    ).toBeLessThanOrEqual(2);
    expect(mobile.notches.length).toBeGreaterThan(0);
    for (const notch of mobile.notches) {
      expect(notch.ratio).toBeLessThan(0.45);
      expect(notch.notchWidth).toBeLessThan(notch.frameWidth);
    }
  });

  test('optical polish keeps shared search geometry and a quiet hero field', async ({
    page,
  }) => {
    await page.evaluate(() => document.fonts.ready);

    const measureSearch = (root: string) =>
      page.locator(root).evaluate(element => {
        const field = element.querySelector<HTMLElement>(
          '.homepage-name-search__field'
        );
        const glow = element.querySelector<HTMLElement>(
          '.input-aura-frame__illumination'
        );
        const action = element.querySelector<HTMLElement>(
          'button[data-size="marketing"]'
        );
        if (!(field && glow && action)) return null;
        const fieldBox = field.getBoundingClientRect();
        const actionBox = action.getBoundingClientRect();
        const fieldStyle = getComputedStyle(field);
        const glowStyle = getComputedStyle(glow);
        return {
          fieldHeight: fieldBox.height,
          fieldBackground: fieldStyle.backgroundColor,
          insetTop: actionBox.top - fieldBox.top,
          insetBottom: fieldBox.bottom - actionBox.bottom,
          insetRight: fieldBox.right - actionBox.right,
          actionHeight: actionBox.height,
          glowTop: glow.getBoundingClientRect().top,
          fieldTop: fieldBox.top,
          maskComposite: glowStyle.maskComposite,
          treatment: element
            .querySelector('[data-aura-treatment]')
            ?.getAttribute('data-aura-treatment'),
        };
      });

    if (FEATURE_FLAGS.WAITLIST_ENABLED) {
      const actions = page.locator('.homepage-request-access a');
      await expect(actions).toHaveCount(2);
      for (const action of await actions.all()) {
        await expect(action).toHaveAttribute('href', PUBLIC_WAITLIST_URL);
        await expect(action).toHaveAttribute('data-size', 'marketing');
      }
      for (const width of [1440, 768, 375]) {
        await page.setViewportSize({ width, height: 900 });
        const action = await page
          .getByTestId('homepage-primary-cta')
          .boundingBox();
        const copy = await page
          .locator('.homepage-editorial-hero__copy')
          .boundingBox();
        expect(action).not.toBeNull();
        expect(copy).not.toBeNull();
        expect(
          Math.abs(action!.x + action!.width / 2 - (copy!.x + copy!.width / 2))
        ).toBeLessThanOrEqual(1);
      }
      await expect(page.getByRole('combobox')).toHaveCount(0);
    } else {
      const heroSearch = await measureSearch(
        '[data-testid="homepage-editorial-hero-search"]'
      );
      // K4ar1 closing owns one focus-only action; the hero field is the sole
      // search surface, so a duplicated close-search node must stay absent.
      expect(await page.getByTestId('homepage-close-search').count()).toBe(0);
      expect(heroSearch).not.toBeNull();
      expect(heroSearch?.treatment).toBe('editorial');
      expect(heroSearch?.actionHeight).toBeCloseTo(28, 0);
      expect(heroSearch?.insetTop).toBeCloseTo(heroSearch?.insetBottom ?? 0, 0);
      expect(heroSearch?.insetTop).toBeCloseTo(heroSearch?.insetRight ?? 0, 0);
      expect(heroSearch?.fieldHeight).toBeCloseTo(44, 0);
      expect(heroSearch?.insetTop).toBeCloseTo(8, 0);
      expect(heroSearch?.insetRight).toBeCloseTo(8, 0);

      const input = page
        .getByTestId('homepage-editorial-hero-search')
        .getByRole('combobox');
      const idleBackground = heroSearch?.fieldBackground;
      await input.focus();
      const focused = await measureSearch(
        '[data-testid="homepage-editorial-hero-search"]'
      );
      expect(focused?.fieldBackground).toBe(idleBackground);
      expect(focused?.fieldHeight).toBeCloseTo(heroSearch?.fieldHeight ?? 0, 0);
    }

    const lightWell = page.locator('.homepage-editorial-hero__light-well');
    expect(
      await lightWell.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          borderWidth: style.borderWidth,
          backgroundImage: style.backgroundImage,
        };
      })
    ).toMatchObject({
      borderWidth: '0px',
      backgroundImage: expect.not.stringMatching(/55\.1%/),
    });

    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => document.fonts.ready);
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
    expect(headingLines).toBe(1);
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
   * JOV-6436: Public Get started CTAs land on same-origin /signup.
   * /start remains the post-auth capture chat; /waitlist is the receipt.
   */
  test('all data-cta-sign-up elements navigate to signup (JOV-6436)', async ({
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
    ).toHaveCount(FEATURE_FLAGS.WAITLIST_ENABLED ? 0 : 1);

    for (let i = 0; i < count; i += 1) {
      const cta = ctaLinks.nth(i);
      const tagName = await cta.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'a') {
        const href = await cta.getAttribute('href');
        const isSignupRoute =
          href === PUBLIC_WAITLIST_URL ||
          href === '/signup' ||
          (href?.startsWith('/signup?') ?? false);
        expect(
          isSignupRoute,
          `CTA at index ${i} (href="${href}") must route to /signup`
        ).toBe(true);
      }
    }
  });
});
