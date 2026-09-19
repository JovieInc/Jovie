import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';

const SHEET_MATRIX_STORY_ID = 'ui-atoms-sheet--conformance-matrix';
const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;
const EVIDENCE_DIR = join('test-results', 'storybook-sheet-evidence');

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'compact', width: 390, height: 844 },
] as const;

const THEMES = ['light', 'dark'] as const;
const SIDES = ['top', 'bottom', 'left', 'right'] as const;
type SheetSide = (typeof SIDES)[number];

async function openStory(
  page: Page,
  theme: (typeof THEMES)[number],
  viewport: (typeof VIEWPORTS)[number]
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORYBOOK_THEME_STORAGE_KEY, value: theme }
  );
  await page.goto(`/iframe.html?id=${SHEET_MATRIX_STORY_ID}&viewMode=story`, {
    waitUntil: 'domcontentloaded',
  });
  const root = page.locator('[data-testid="sheet-conformance"]');
  await expect(root).toBeVisible({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  await expect(root).not.toBeEmpty({ timeout: STORYBOOK_RENDER_TIMEOUT_MS });
  await expect(
    root.locator('button[data-testid^="sheet-trigger-"]')
  ).toHaveCount(SIDES.length);
  return root;
}

async function attachScreenshot(testInfo: TestInfo, name: string, page: Page) {
  const screenshot = await page.screenshot({ animations: 'disabled' });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: 'image/png',
  });
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, name), screenshot);
}

async function attachA11yResult(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .include('body')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const evidence = JSON.stringify(
    {
      violations: results.violations.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      })),
    },
    null,
    2
  );
  await testInfo.attach(name, {
    body: evidence,
    contentType: 'application/json',
  });
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, name), evidence);
  expect(results.violations, `${name} accessibility violations`).toEqual([]);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    const html = document.documentElement;
    return {
      documentClientWidth: html.clientWidth,
      documentScrollWidth: html.scrollWidth,
      rootScrollWidth: root?.scrollWidth ?? 0,
      viewportWidth: window.innerWidth,
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

async function assertDialogFocusLoop(
  page: Page,
  content: Locator,
  label: string
) {
  const focusable = content.locator(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const focusableCount = await focusable.count();
  expect(focusableCount, `${label} focusable controls`).toBeGreaterThan(1);

  const firstFocusable = focusable.first();
  const lastFocusable = focusable.last();

  await lastFocusable.focus();
  await page.keyboard.press('Tab');
  await expect(firstFocusable).toBeFocused();

  await firstFocusable.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(lastFocusable).toBeFocused();
}

async function assertSheetBounds(
  content: Locator,
  side: SheetSide,
  label: string
) {
  await expect
    .poll(
      async () => {
        const bounds = await content.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          };
        });

        const withinViewport =
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.top >= -1 &&
          bounds.left >= -1 &&
          bounds.right <= bounds.viewportWidth + 1 &&
          bounds.bottom <= bounds.viewportHeight + 1;
        const touchesExpectedEdge =
          side === 'top'
            ? Math.abs(bounds.top) <= 1
            : side === 'bottom'
              ? Math.abs(bounds.bottom - bounds.viewportHeight) <= 1
              : side === 'left'
                ? Math.abs(bounds.left) <= 1
                : Math.abs(bounds.right - bounds.viewportWidth) <= 1;

        return withinViewport && touchesExpectedEdge;
      },
      { message: `${label} edge bounds` }
    )
    .toBe(true);
}

async function closeAndRestoreFocus(
  page: Page,
  content: Locator,
  trigger: Locator
) {
  await expect(content).toHaveAttribute('data-state', 'open');
  await expect(content).toHaveAttribute('role', 'dialog');
  await page.keyboard.press('Escape');
  await waitForClosed(content);
  await expect(trigger).toBeFocused();
}

async function waitForClosed(content: Locator) {
  await expect
    .poll(async () => {
      if ((await content.count()) === 0) return 'detached';
      return (await content.getAttribute('data-state')) ?? 'missing-state';
    })
    .toMatch(/^(closed|detached)$/);
  if ((await content.count()) > 0) await expect(content).toBeHidden();
}

async function openAndAssertSide(
  page: Page,
  root: Locator,
  side: SheetSide,
  theme: (typeof THEMES)[number],
  viewportId: string
) {
  const trigger = root.getByTestId(`sheet-trigger-${side}`);
  const content = page.getByTestId(`sheet-content-${side}`);

  await trigger.click();
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute('data-side', side);
  await expect(content).toHaveAccessibleName(
    `${side[0].toUpperCase()}${side.slice(1)} sheet`
  );
  await expect(content).toHaveAttribute('aria-labelledby', /.+/);
  await expect(content).toHaveAttribute('aria-describedby', /.+/);
  await expect(page.getByTestId('sheet-close-button')).toHaveAccessibleName(
    'Close'
  );
  await expect(content).toHaveClass(/motion-reduce:transition-none/);

  const expectedEdgeClass = `${side}-0`;
  await expect(content).toHaveClass(new RegExp(expectedEdgeClass));
  if (side === 'top' || side === 'bottom') {
    await expect(content).toHaveClass(/max-h-sheet-viewport/);
  } else {
    await expect(content).toHaveClass(/max-w-sheet-viewport/);
  }

  await expect(page.getByTestId(`sheet-body-${side}`)).toContainText(
    'https://jov.ie/artist/this-is-a-long-public-profile-slug'
  );

  const activeElementInsideDialog = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement
      ? Boolean(active.closest('[role="dialog"]'))
      : false;
  });
  expect(
    activeElementInsideDialog,
    `${theme}/${viewportId}/${side} focus`
  ).toBe(true);
  await page.keyboard.press('Tab');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement
          ? Boolean(active.closest('[role="dialog"]'))
          : false;
      })
    )
    .toBe(true);

  await assertDialogFocusLoop(page, content, `${theme}/${viewportId}/${side}`);
  await assertSheetBounds(content, side, `${theme}/${viewportId}/${side}`);

  await assertNoHorizontalOverflow(page, `${theme}/${viewportId}/${side}`);
  return { content, trigger };
}

test.describe('Sheet atom Storybook conformance', () => {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      test(`all edge variants preserve dialog behavior [${theme}/${viewport.id}]`, async ({
        page,
      }, testInfo) => {
        const root = await openStory(page, theme, viewport);
        await expect(page.locator('html')).toHaveClass(
          new RegExp(`\\b${theme}\\b`)
        );
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);

        const right = await openAndAssertSide(
          page,
          root,
          'right',
          theme,
          viewport.id
        );
        const rightInRoot = await right.content.evaluate(
          element =>
            document.getElementById('storybook-root')?.contains(element) ??
            false
        );
        expect(rightInRoot).toBe(false);
        await attachScreenshot(
          testInfo,
          `sheet-conformance-${theme}-${viewport.id}.png`,
          page
        );
        await attachA11yResult(
          page,
          testInfo,
          `sheet-a11y-${theme}-${viewport.id}-right.json`
        );
        await closeAndRestoreFocus(page, right.content, right.trigger);

        const bottom = await openAndAssertSide(
          page,
          root,
          'bottom',
          theme,
          viewport.id
        );
        await attachA11yResult(
          page,
          testInfo,
          `sheet-a11y-${theme}-${viewport.id}-bottom.json`
        );
        await page
          .getByTestId('sheet-overlay')
          .click({ position: { x: 4, y: 4 } });
        await waitForClosed(bottom.content);
        await expect(bottom.trigger).toBeFocused();

        const left = await openAndAssertSide(
          page,
          root,
          'left',
          theme,
          viewport.id
        );
        await attachA11yResult(
          page,
          testInfo,
          `sheet-a11y-${theme}-${viewport.id}-left.json`
        );
        await page.getByTestId('sheet-footer-close-left').click();
        await waitForClosed(left.content);
        await expect(left.trigger).toBeFocused();

        const top = await openAndAssertSide(
          page,
          root,
          'top',
          theme,
          viewport.id
        );
        await attachA11yResult(
          page,
          testInfo,
          `sheet-a11y-${theme}-${viewport.id}-top.json`
        );
        const topInRoot = await top.content.evaluate(
          element =>
            document.getElementById('storybook-root')?.contains(element) ??
            false
        );
        expect(topInRoot).toBe(true);
        await page.getByTestId('sheet-close-button').click();
        await waitForClosed(top.content);
        await expect(top.trigger).toBeFocused();
        await assertNoHorizontalOverflow(
          page,
          `${theme}/${viewport.id}/closed`
        );
      });
    }
  }

  test('reduced motion preserves the same open and close outcome', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const root = await openStory(page, 'dark', VIEWPORTS[1]);
    const { content, trigger } = await openAndAssertSide(
      page,
      root,
      'right',
      'dark',
      'compact-reduced-motion'
    );
    await expect(content).toHaveClass(/motion-reduce:animate-none/);
    const reducedMotionStyles = await content.evaluate(element => {
      const styles = getComputedStyle(element);
      return {
        animationDuration: styles.animationDuration
          .split(',')
          .map(value => value.trim()),
        animationName: styles.animationName,
        transitionDuration: styles.transitionDuration
          .split(',')
          .map(value => value.trim()),
        transitionProperty: styles.transitionProperty,
      };
    });
    expect(reducedMotionStyles.animationDuration).toEqual(['0s']);
    expect(reducedMotionStyles.animationName).toBe('none');
    expect(reducedMotionStyles.transitionDuration).toEqual(['0s']);
    expect(reducedMotionStyles.transitionProperty).toBe('none');
    await attachA11yResult(
      page,
      testInfo,
      'sheet-a11y-dark-compact-reduced-motion.json'
    );
    await closeAndRestoreFocus(page, content, trigger);
  });
});
