import { writeFile } from 'node:fs/promises';
import { expect, type Page, type TestInfo, test } from '@playwright/test';

// Regression proof mounts the production WorkInspectorActions and InspectorSection.
// Retained old-source geometry must fail the same hit-target checks as the fix.
const states = [
  ['layout-public-visible', 'work-action-share-page'],
  ['layout-private-hidden', 'work-action-share-privately'],
  ['layout-unknown-hidden', 'work-action-share-privately'],
] as const;

async function prepareNativeMedia(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: window.matchMedia.bind(window),
      configurable: false,
      writable: false,
    });
    new MutationObserver(() => {
      document
        .querySelectorAll('style[data-jovie-storybook-fixtures]')
        .forEach(node => node.remove());
    }).observe(document, { childList: true, subtree: true });
  });
}

async function mount(page: Page, story: string, width: number) {
  await page.goto(
    `/iframe.html?id=library-workinspectoractions--${story}&viewMode=story`,
    { waitUntil: 'domcontentloaded' }
  );
  const host = page.getByTestId('work-actions-layout-host');
  await expect(host).toBeVisible({ timeout: 90_000 });
  // Explicit fixture content budget; no styles on the component are changed.
  await host.evaluate((element, pixels) => {
    element.style.width = `${pixels}px`;
  }, width);
  await page.evaluate(async () => {
    // Storybook does not run the app layout's next/font setup. Load the same
    // committed local face, not a fallback font or an external font service.
    const face = new FontFace(
      'Inter Variable',
      'url("/fonts/Inter-Latin.woff2")',
      { weight: '100 900' }
    );
    document.fonts.add(await face.load());
    await document.fonts.ready;
  });
}

async function hitGeometry(page: Page) {
  return page.getByTestId('work-actions-layout-host').evaluate(host => {
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
      };
    };
    const primary = host.querySelector(
      '[data-testid="work-action-share-page"],' +
        '[data-testid="work-action-share-privately"],' +
        '[data-testid="work-action-review-publish"]'
    );
    if (!primary) throw new Error('No primary action mounted');
    const face = box(primary);
    const primaryStyle = getComputedStyle(primary);
    const pseudo = getComputedStyle(primary, '::before');
    if (pseudo.content === 'none' || pseudo.position !== 'absolute') {
      throw new Error('Production primary hit-target pseudo-element absent');
    }
    const width = Math.max(
      parseFloat(pseudo.width),
      parseFloat(pseudo.minWidth)
    );
    const height = Math.max(
      parseFloat(pseudo.height),
      parseFloat(pseudo.minHeight)
    );
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('Primary hit-target dimensions are not measurable');
    }
    const expanded = {
      x: face.x + (face.width - width) / 2,
      y: face.y + (face.height - height) / 2,
      right: face.x + (face.width + width) / 2,
      bottom: face.y + (face.height + height) / 2,
      width,
      height,
    };
    const ownerAt = (x: number, y: number) =>
      document
        .elementFromPoint(x, y)
        ?.closest('button,a')
        ?.getAttribute('data-testid') ?? null;
    const utilities = [
      ...host.querySelectorAll(
        '[data-testid="work-action-preview-page"],[data-testid="work-action-ask-jovie"]'
      ),
    ].map(node => {
      const rect = box(node);
      const intersectionWidth = Math.max(
        0,
        Math.min(expanded.right, rect.right) - Math.max(expanded.x, rect.x)
      );
      const intersectionHeight = Math.max(
        0,
        Math.min(expanded.bottom, rect.bottom) - Math.max(expanded.y, rect.y)
      );
      const id = node.getAttribute('data-testid');
      const style = getComputedStyle(node);
      return {
        id,
        rect,
        overlapArea: intersectionWidth * intersectionHeight,
        topOwner: ownerAt(rect.x + rect.width / 2, rect.y + 0.25),
        centerOwner: ownerAt(rect.x + rect.width / 2, rect.y + rect.height / 2),
        font: {
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
        },
      };
    });
    return {
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        scale: devicePixelRatio,
      },
      coarse: matchMedia('(pointer: coarse)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      loadedFonts: [...document.fonts].map(font => ({
        family: font.family,
        status: font.status,
      })),
      host: box(host),
      primary: {
        id: primary.getAttribute('data-testid'),
        face,
        expanded,
        font: {
          family: primaryStyle.fontFamily,
          size: primaryStyle.fontSize,
          weight: primaryStyle.fontWeight,
        },
      },
      utilities,
      limits:
        'Quiet utility faces are measured; this does not certify 44px targets or full accessibility.',
    };
  });
}

async function retain(page: Page, info: TestInfo, name: string) {
  const facts = await hitGeometry(page);
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(facts, null, 2));
  await info.attach(`${name}.json`, { path, contentType: 'application/json' });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
  return facts;
}

function expectSeparateTargets(facts: Awaited<ReturnType<typeof hitGeometry>>) {
  expect(facts.primary.expanded.height).toBeGreaterThanOrEqual(44);
  expect(
    facts.loadedFonts.some(
      font => font.family.includes('Inter Variable') && font.status === 'loaded'
    )
  ).toBe(true);
  for (const font of [
    facts.primary.font,
    ...facts.utilities.map(utility => utility.font),
  ]) {
    expect(font.family).toContain('Inter Variable');
    expect(font.size).toBe('12px');
    expect(font.weight).toBe('510');
  }
  for (const utility of facts.utilities) {
    expect(utility.overlapArea, `primary intersects ${utility.id}`).toBe(0);
    expect(utility.topOwner, `top boundary of ${utility.id}`).toBe(utility.id);
    expect(utility.centerOwner).toBe(utility.id);
    expect(utility.rect.x).toBeGreaterThanOrEqual(facts.host.x - 0.5);
    expect(utility.rect.right).toBeLessThanOrEqual(facts.host.right + 0.5);
  }
}

test('mounted compact actions preserve distinct pointer targets across states and widths', async ({
  page,
}, info) => {
  await prepareNativeMedia(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [story, primary] of states) {
    for (const width of [245, 336, 138]) {
      await mount(page, story, width);
      await expect(page.getByTestId(primary)).toBeVisible();
      await expect(page.getByTestId('work-action-preview-page')).toHaveCount(
        story === 'layout-public-visible' ? 1 : 0
      );
      // Write the failing old geometry and PNG before the regression assertion.
      const facts = await retain(page, info, `${story}-${width}-pointer`);
      expect(facts.coarse).toBe(false);
      expect(facts.reducedMotion).toBe(false);
      expectSeparateTargets(facts);
      if (story === 'layout-public-visible' && width >= 245) {
        const [preview, ask] = facts.utilities;
        expect(Math.abs(preview.rect.y - ask.rect.y)).toBeLessThanOrEqual(0.5);
      }
      for (const utility of facts.utilities) {
        const control = page.getByTestId(utility.id!);
        const before = await control.boundingBox();
        await control.hover();
        await expect.poll(() => control.boundingBox()).toEqual(before);
      }
    }
  }
});

test('mounted utility grouping preserves keyboard order and private-action activation', async ({
  page,
}, info) => {
  await prepareNativeMedia(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page, 'layout-public-visible', 245);
  const share = page.getByTestId('work-action-share-page');
  await share.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('work-action-preview-page')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('work-action-ask-jovie')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('work-action-preview-page')).toBeFocused();
  const publicFacts = await retain(
    page,
    info,
    'public-keyboard-reduced-motion'
  );
  expect(publicFacts.reducedMotion).toBe(true);
  expectSeparateTargets(publicFacts);
  await mount(page, 'layout-private-hidden', 245);
  const privateAction = page.getByTestId('work-action-share-privately');
  await privateAction.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('work-actions-private-activations')).toHaveText(
    '1'
  );
  await expect(privateAction).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('work-actions-private-activations')).toHaveText(
    '2'
  );
  await expect(privateAction).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('work-action-ask-jovie')).toBeFocused();
});

test.describe('coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('mounted action boundaries stay distinct on touch input', async ({
    page,
  }, info) => {
    await prepareNativeMedia(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [story, primary] of states) {
      await mount(page, story, 245);
      await expect(page.getByTestId(primary)).toBeVisible();
      const facts = await retain(page, info, `${story}-245-coarse`);
      expect(facts.coarse).toBe(true);
      expectSeparateTargets(facts);
    }
    await mount(page, 'layout-private-hidden', 245);
    await page.getByTestId('work-action-share-privately').tap();
    await expect(
      page.getByTestId('work-actions-private-activations')
    ).toHaveText('1');
  });
});
