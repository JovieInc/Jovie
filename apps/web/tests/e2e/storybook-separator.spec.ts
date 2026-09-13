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

const SEPARATOR_STORY_ID = 'ui-atoms-separator--conformance-matrix';
const STORYBOOK_THEME_STORAGE_KEY = 'jovie-theme-storybook';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;
const EVIDENCE_DIR = join('test-results', 'storybook-separator-evidence');

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'compact', width: 390, height: 844 },
] as const;

const THEMES = ['light', 'dark'] as const;

async function openStory(
  page: Page,
  theme: (typeof THEMES)[number],
  viewport: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
  }
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: STORYBOOK_THEME_STORAGE_KEY, value: theme }
  );
  await page.goto(`/iframe.html?id=${SEPARATOR_STORY_ID}&viewMode=story`, {
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
  const screenshot = await root.screenshot({ animations: 'disabled' });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: 'image/png',
  });
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, name), screenshot);
}

async function attachA11yResult(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .include('#storybook-root')
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

async function attachMeasurement(
  testInfo: TestInfo,
  name: string,
  measurement: unknown
) {
  const evidence = JSON.stringify(measurement, null, 2);
  await testInfo.attach(name, {
    body: evidence,
    contentType: 'application/json',
  });
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await writeFile(join(EVIDENCE_DIR, name), evidence);
}

async function measureSeparators(page: Page) {
  return page.evaluate(() => {
    const root = document.getElementById('storybook-root');
    const hasVisiblePaintAlpha = (color: string) => {
      const normalized = color.trim().toLowerCase();
      if (normalized === 'transparent') return false;

      const rgbaAlpha = normalized.match(
        /^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/
      );
      if (rgbaAlpha) return Number(rgbaAlpha[1]) > 0;

      const modernAlpha = normalized.match(/\/\s*([0-9.]+)\s*(%)?\s*\)$/);
      if (modernAlpha) {
        const value = Number(modernAlpha[1]);
        return (modernAlpha[2] ? value / 100 : value) > 0;
      }

      return !/\/\s*none\s*\)$/.test(normalized);
    };
    const find = (testId: string) => {
      const element = root?.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`
      );
      if (!element) throw new Error(`missing ${testId}`);
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        ariaOrientation: element.getAttribute('aria-orientation'),
        backgroundColor: style.backgroundColor,
        box: { height: box.height, width: box.width },
        dataOrientation: element.getAttribute('data-orientation'),
        hasVisiblePaintAlpha: hasVisiblePaintAlpha(style.backgroundColor),
        role: element.getAttribute('role'),
      };
    };
    const surface = root?.querySelector<HTMLElement>('section');
    const surfaceStyle = surface ? getComputedStyle(surface) : null;
    const html = document.documentElement;
    const scrolling = document.scrollingElement ?? html;
    const tokenProbe = document.createElement('span');
    tokenProbe.setAttribute('aria-hidden', 'true');
    tokenProbe.style.backgroundColor = 'var(--color-border-subtle)';
    tokenProbe.style.height = '1px';
    tokenProbe.style.position = 'fixed';
    tokenProbe.style.visibility = 'hidden';
    tokenProbe.style.width = '1px';
    document.body.append(tokenProbe);
    const borderColorPaint = getComputedStyle(tokenProbe).backgroundColor;
    tokenProbe.remove();

    return {
      documentOverflow: {
        clientWidth: html.clientWidth,
        scrollWidth: Math.max(scrolling.scrollWidth, document.body.scrollWidth),
      },
      horizontalDecorative: find('separator-horizontal-decorative'),
      horizontalSemantic: find('separator-horizontal-semantic'),
      rootTheme: {
        className: html.className,
        colorScheme: html.style.colorScheme,
      },
      surfaceBackground: surfaceStyle?.backgroundColor ?? null,
      borderColorDeclaration: root
        ? getComputedStyle(root)
            .getPropertyValue('--color-border-subtle')
            .trim()
        : '',
      borderColorPaint,
      borderColorPaintHasVisibleAlpha: hasVisiblePaintAlpha(borderColorPaint),
      verticalDecorative: find('separator-vertical-decorative'),
      verticalSemantic: find('separator-vertical-semantic'),
    };
  });
}

async function assertSeparatorContract(
  page: Page,
  theme: (typeof THEMES)[number],
  viewportId: string
) {
  const measurement = await measureSeparators(page);
  const label = `${theme}/${viewportId}`;

  expect(measurement.rootTheme.className.split(/\s+/)).toContain(theme);
  expect(measurement.rootTheme.colorScheme).toBe(theme);
  expect(measurement.surfaceBackground).not.toBeNull();
  expect(measurement.borderColorDeclaration).not.toBe('');
  expect(measurement.borderColorPaint).not.toBe('');
  expect(measurement.borderColorPaintHasVisibleAlpha).toBe(true);

  expect(measurement.horizontalDecorative.role).toBe('none');
  expect(measurement.horizontalDecorative.dataOrientation).toBe('horizontal');
  expect(measurement.horizontalSemantic.role).toBe('separator');
  expect(measurement.horizontalSemantic.ariaOrientation).toBeNull();
  expect(measurement.horizontalSemantic.dataOrientation).toBe('horizontal');
  expect(measurement.verticalDecorative.role).toBe('none');
  expect(measurement.verticalDecorative.dataOrientation).toBe('vertical');
  expect(measurement.verticalSemantic.role).toBe('separator');
  expect(measurement.verticalSemantic.ariaOrientation).toBe('vertical');
  expect(measurement.verticalSemantic.dataOrientation).toBe('vertical');

  for (const separator of [
    measurement.horizontalDecorative,
    measurement.horizontalSemantic,
    measurement.verticalDecorative,
    measurement.verticalSemantic,
  ]) {
    expect(separator.hasVisiblePaintAlpha, `${label} token paint alpha`).toBe(
      true
    );
    expect(separator.backgroundColor, `${label} token paint`).toBe(
      measurement.borderColorPaint
    );
  }

  expect(measurement.horizontalDecorative.box.width).toBeGreaterThan(0);
  expect(measurement.horizontalDecorative.box.height).toBeGreaterThan(0);
  expect(measurement.horizontalDecorative.box.height).toBeLessThanOrEqual(2);
  expect(measurement.verticalDecorative.box.width).toBeGreaterThan(0);
  expect(measurement.verticalDecorative.box.width).toBeLessThanOrEqual(2);
  expect(measurement.verticalDecorative.box.height).toBeGreaterThan(0);

  expect(
    measurement.documentOverflow.scrollWidth,
    `${label} document overflow`
  ).toBeLessThanOrEqual(measurement.documentOverflow.clientWidth + 1);

  return measurement;
}

test.describe('Separator atom Storybook conformance', () => {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      test(`orientation and semantics remain bound [${theme}/${viewport.id}]`, async ({
        page,
      }, testInfo) => {
        const root = await openStory(page, theme, viewport);
        const measurement = await assertSeparatorContract(
          page,
          theme,
          viewport.id
        );
        await attachMeasurement(
          testInfo,
          `separator-measurement-${theme}-${viewport.id}.json`,
          measurement
        );
        await attachA11yResult(
          page,
          testInfo,
          `separator-a11y-${theme}-${viewport.id}.json`
        );
        await attachScreenshot(
          testInfo,
          `separator-conformance-${theme}-${viewport.id}.png`,
          root
        );
      });
    }
  }

  test('logical orientation remains stable for RTL and 200% text zoom', async ({
    page,
  }, testInfo) => {
    const root = await openStory(page, 'dark', {
      id: 'compact-rtl-zoom',
      width: 390,
      height: 844,
    });
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const measurement = await assertSeparatorContract(
      page,
      'dark',
      'compact-rtl-zoom'
    );
    await attachMeasurement(
      testInfo,
      'separator-measurement-rtl-zoom.json',
      measurement
    );
    await attachA11yResult(page, testInfo, 'separator-a11y-rtl-zoom.json');
    await attachScreenshot(
      testInfo,
      'separator-conformance-rtl-zoom.png',
      root
    );
  });
});
