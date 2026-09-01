import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';

const INPUT_MATRIX_STORY_ID = 'ui-atoms-input--conformance-matrix';
const INPUT_FOCUS_STORY_ID = 'ui-atoms-input--keyboard-focus';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'compact', width: 390, height: 844 },
] as const;

async function openStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  const root = page.locator('#storybook-root');
  await expect(root).toBeVisible({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  await expect(root).not.toBeEmpty({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  return root;
}

async function attachScreenshot(
  testInfo: TestInfo,
  name: string,
  root: Locator
) {
  await testInfo.attach(name, {
    body: await root.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

async function attachA11yResult(
  page: Page,
  testInfo: TestInfo,
  name: string
) {
  const results = await new AxeBuilder({ page })
    .include('#storybook-root')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  await testInfo.attach(name, {
    body: JSON.stringify(
      {
        violations: results.violations.map(violation => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.length,
        })),
      },
      null,
      2
    ),
    contentType: 'application/json',
  });

  expect(results.violations, `${name} accessibility violations`).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    return {
      rootScrollWidth: root?.scrollWidth ?? 0,
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    };
  });

  expect(
    overflow.documentScrollWidth,
    `${label} document overflow: ${JSON.stringify(overflow)}`
  ).toBeLessThanOrEqual(overflow.documentClientWidth + 1);
  expect(
    overflow.rootScrollWidth,
    `${label} root overflow: ${JSON.stringify(overflow)}`
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

test.describe('Input atom Storybook conformance', () => {
  for (const viewport of VIEWPORTS) {
    test(`state matrix renders and stays accessible [${viewport.id}]`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      const root = await openStory(page, INPUT_MATRIX_STORY_ID);

      await expect(page.getByLabel('Default')).toHaveAttribute(
        'placeholder',
        'Search tracks'
      );
      await expect(page.getByLabel('Error')).toHaveAttribute(
        'aria-invalid',
        'true'
      );
      await expect(page.getByRole('alert')).toHaveText(
        'Enter a valid artist URL.'
      );
      await expect(page.getByLabel('Success')).toHaveClass(/border-success/);
      await expect(page.getByLabel('Disabled')).toBeDisabled();
      await expect(page.getByLabel('Loading')).toBeDisabled();
      await expect(page.getByLabel('Loading')).toHaveAttribute(
        'aria-busy',
        'true'
      );
      await expect(page.getByLabel('Pending')).toHaveAttribute(
        'aria-busy',
        'true'
      );
      await expect(page.getByLabel('Long Placeholder')).toHaveAttribute(
        'placeholder',
        /should remain clipped/
      );

      await assertNoHorizontalOverflow(page, viewport.id);
      await attachA11yResult(page, testInfo, `input-a11y-${viewport.id}.json`);
      await attachScreenshot(
        testInfo,
        `input-conformance-${viewport.id}.png`,
        root
      );
    });
  }

  test('keyboard focus remains visible at 200% text zoom without overflow', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const root = await openStory(page, INPUT_FOCUS_STORY_ID);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const input = page.getByLabel('Keyboard Focus');
    await input.focus();
    await expect(input).toBeFocused();
    await expect(input).toHaveClass(/focus-visible:ring-focus\/25/);

    await assertNoHorizontalOverflow(page, '200% text zoom');
    await attachA11yResult(page, testInfo, 'input-a11y-200-zoom.json');
    await attachScreenshot(testInfo, 'input-keyboard-focus-200-zoom.png', root);
  });
});
