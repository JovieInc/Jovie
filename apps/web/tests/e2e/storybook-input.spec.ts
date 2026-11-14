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
import { wcag22AaAxeOptions } from '@/lib/a11y-gates/wcag-standard.cjs';

const INPUT_MATRIX_STORY_ID = 'ui-atoms-input--conformance-matrix';
const INPUT_FOCUS_STORY_ID = 'ui-atoms-input--keyboard-focus';
const STORYBOOK_RENDER_TIMEOUT_MS = 60_000;
const EVIDENCE_DIR = join('test-results', 'storybook-input-evidence');

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'compact', width: 390, height: 844 },
] as const;

async function setStoryTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(
    value => localStorage.setItem('jovie-theme-storybook', value),
    theme
  );
}

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
    .options(wcag22AaAxeOptions())
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
      // Loading keeps the field focusable: read-only, not natively disabled.
      await expect(page.getByLabel('Loading')).not.toBeDisabled();
      await expect(page.getByLabel('Loading')).toHaveAttribute('readonly', '');
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

test.describe('Shared error copy contrast', () => {
  const errorStories = [
    'ui-atoms-field--error',
    'ui-atoms-form--error-state',
    'ui-atoms-input--error',
    'ui-atoms-label--error-state',
    'ui-atoms-nativeselect--error',
    'ui-atoms-textarea--error',
  ] as const;

  for (const theme of ['light', 'dark'] as const) {
    for (const story of errorStories) {
      test(`error copy meets WCAG AA [${theme} ${story}] @a11y`, async ({
        page,
      }, testInfo) => {
        await setStoryTheme(page, theme);
        const root = await openStory(page, story);
        await expect(page.locator('html')).toHaveClass(new RegExp(theme));
        await page.evaluate(() => document.fonts.ready);
        await expect(root.locator('.text-destructive').first()).toBeVisible();

        const result = await new AxeBuilder({ page })
          .include('#storybook-root')
          .options(wcag22AaAxeOptions())
          .analyze();
        const measured = result.passes
          .filter(rule => rule.id === 'color-contrast')
          .flatMap(rule => rule.nodes)
          .filter(node => node.html.includes('text-destructive'))
          .flatMap(node => node.any)
          .filter(check => check.id === 'color-contrast');
        const evidencePath = testInfo.outputPath('error-copy-contrast.json');
        await writeFile(
          evidencePath,
          JSON.stringify({ story, theme, result }, null, 2)
        );
        await testInfo.attach('error-copy-contrast.json', {
          path: evidencePath,
          contentType: 'application/json',
        });
        const screenshotPath = testInfo.outputPath('error-copy.png');
        await root.screenshot({ path: screenshotPath, animations: 'disabled' });
        await testInfo.attach('error-copy.png', {
          path: screenshotPath,
          contentType: 'image/png',
        });
        expect(result.violations).toEqual([]);
        expect(
          result.incomplete.filter(rule => rule.id === 'color-contrast')
        ).toEqual([]);
        expect(measured.length).toBeGreaterThan(0);
        for (const check of measured)
          expect(check.data.contrastRatio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

test.describe('Composite field and switch error-copy contrast', () => {
  const fixtures = [
    {
      story: 'ui-atoms-compositefield--error-state',
      message: 'composite-field-error-message',
      role: 'textbox',
      name: 'Choose your handle',
    },
    {
      story: 'ui-atoms-switch--error-state',
      message: 'sw-error-message',
      role: 'switch',
      name: 'Accept the distribution terms',
    },
  ] as const;

  for (const theme of ['light', 'dark'] as const) {
    for (const fixture of fixtures) {
      test(`error copy meets WCAG AA [${theme} ${fixture.story}] @a11y`, async ({
        page,
      }, testInfo) => {
        await setStoryTheme(page, theme);
        const root = await openStory(page, fixture.story);
        await expect(page.locator('html')).toHaveClass(new RegExp(theme));
        await expect(
          root.getByRole(fixture.role, { name: fixture.name })
        ).toBeVisible();
        await expect(root.locator(`#${fixture.message}`)).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const result = await new AxeBuilder({ page })
          .include('#storybook-root')
          .options(wcag22AaAxeOptions())
          .analyze();
        const evidencePath = testInfo.outputPath('error-copy-contrast.json');
        await writeFile(
          evidencePath,
          JSON.stringify({ story: fixture.story, theme, result }, null, 2)
        );
        await testInfo.attach('error-copy-contrast.json', {
          path: evidencePath,
          contentType: 'application/json',
        });
        await attachScreenshot(testInfo, `${fixture.story}-${theme}.png`, root);
        expect(result.violations).toEqual([]);
        expect(
          result.incomplete.filter(rule => rule.id === 'color-contrast')
        ).toEqual([]);
        const measured = result.passes
          .filter(rule => rule.id === 'color-contrast')
          .flatMap(rule => rule.nodes)
          .filter(node => node.html.includes(fixture.message))
          .flatMap(node => node.any)
          .filter(check => check.id === 'color-contrast');
        expect(measured.length).toBeGreaterThan(0);
        for (const check of measured)
          expect(check.data.contrastRatio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

test.describe('Link and danger-tooltip text contrast', () => {
  const stories = [
    'shadcn-link--default',
    'shadcn-link--active',
    'shadcn-link--visited',
    'shadcn-link--as-child',
    'shadcn-link--long-content',
    'shadcn-link--state-matrix',
    'ui-atoms-tooltip--danger',
  ] as const;

  for (const theme of ['light', 'dark'] as const) {
    for (const story of stories) {
      test(`semantic text meets WCAG AA [${theme} ${story}] @a11y`, async ({
        page,
      }, testInfo) => {
        await setStoryTheme(page, theme);
        await openStory(page, story);
        await expect(page.locator('html')).toHaveClass(new RegExp(theme));
        const selector =
          story === 'ui-atoms-tooltip--danger'
            ? '[data-testid="tooltip-content"]'
            : '#storybook-root [data-variant="link"]:not([aria-disabled="true"])';
        await expect(page.locator(selector).first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const result = await new AxeBuilder({ page })
          .include(selector)
          .options(wcag22AaAxeOptions())
          .analyze();
        const measured = [...result.passes, ...result.violations]
          .filter(rule => rule.id === 'color-contrast')
          .flatMap(rule => rule.nodes)
          .flatMap(node => node.any)
          .filter(check => check.id === 'color-contrast');
        const evidence = JSON.stringify({ story, theme, result }, null, 2);
        await testInfo.attach('semantic-text-contrast.json', {
          body: evidence,
          contentType: 'application/json',
        });
        await attachScreenshot(
          testInfo,
          `semantic-text-${theme}-${story}.png`,
          page.locator('body')
        );
        await writeFile(
          join(EVIDENCE_DIR, `semantic-text-${theme}-${story}.json`),
          evidence
        );
        expect(result.violations).toEqual([]);
        expect(
          result.incomplete.filter(rule => rule.id === 'color-contrast')
        ).toEqual([]);
        expect(measured.length).toBeGreaterThan(0);
        for (const check of measured)
          expect(check.data.contrastRatio).toBeGreaterThanOrEqual(4.5);
      });
    }
    test(`visited preview preserves interactive color precedence [${theme}]`, async ({
      page,
    }, testInfo) => {
      await setStoryTheme(page, theme);
      await openStory(page, 'shadcn-link--visited');
      const link = page.locator('#storybook-root [data-variant="link"]');
      const tokens = await link.evaluate(element => {
        const probe = document.createElement('span');
        element.append(probe);
        const colors: Record<string, string> = {};
        for (const state of ['visited', 'hover']) {
          probe.style.color = `var(--color-link-${state})`;
          colors[state] = getComputedStyle(probe).color;
        }
        probe.remove();
        return colors;
      });
      const color = () =>
        link.evaluate(element => getComputedStyle(element).color);
      await page.mouse.move(0, 0);
      const observed: Record<string, string> = { idle: await color() };
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      expect(
        await link.evaluate(element => element.matches(':focus-visible'))
      ).toBe(true);
      observed.focus = await color();
      await link.hover();
      observed.hover = await color();
      await page.mouse.down();
      observed.active = await color();
      await page.mouse.up();
      await page.mouse.move(0, 0);
      observed.restored = await color();
      const evidencePath = testInfo.outputPath('visited-preview-colors.json');
      await writeFile(
        evidencePath,
        JSON.stringify({ theme, tokens, observed })
      );
      await testInfo.attach('visited-preview-colors.json', {
        path: evidencePath,
        contentType: 'application/json',
      });
      expect(observed).toEqual({
        idle: tokens.visited,
        focus: tokens.visited,
        hover: tokens.hover,
        active: tokens.hover,
        restored: tokens.visited,
      });
    });
  }
});

test.describe('Waitlist Spotify native composition events', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const option of ['artist', 'manual'] as const) {
      test(`composition preserves editing before ordinary ${option} activation [${theme}]`, async ({
        page,
      }, testInfo) => {
        const pageErrors: string[] = [];
        const resourceErrors: string[] = [];
        const events: Array<{
          key: string;
          isComposing: boolean;
          defaultPrevented: boolean;
        }> = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error') pageErrors.push(message.text());
        });
        page.on('requestfailed', request =>
          resourceErrors.push(
            `${request.url()}: ${request.failure()?.errorText}`
          )
        );
        page.on('response', response => {
          if (response.status() >= 400)
            resourceErrors.push(`${response.status()} ${response.url()}`);
        });

        const root = page.locator('#storybook-root');
        const name = `waitlist-composition-${theme}-${option}`;
        let failure: unknown;
        let screenshotFailure: unknown;
        try {
          await setStoryTheme(page, theme);
          await openStory(
            page,
            'features-waitlist-waitlistspotifysearch--results'
          );
          await expect(page.locator('html')).toHaveClass(new RegExp(theme));
          const search = root.getByRole('combobox', {
            name: 'Search Spotify artists',
          });
          await expect(search).toHaveValue('Neon');
          await expect(
            root.getByRole('button', { name: /Neon Harbour/ })
          ).toBeVisible();
          await search.focus();
          await page.keyboard.press('ArrowDown');
          if (option === 'manual') {
            await page.keyboard.press('ArrowDown');
            await page.keyboard.press('ArrowDown');
          }
          const activeOption =
            option === 'artist' ? 'spotify-result-0' : 'spotify-result-2';
          await expect(search).toHaveAttribute(
            'aria-activedescendant',
            activeOption
          );

          // These are native DOM event flags, not an OS input-method replay.
          for (const key of [
            'Enter',
            'ArrowDown',
            'ArrowUp',
            'Escape',
            'Tab',
          ]) {
            const event = await search.evaluate((element, composingKey) => {
              const keydown = new KeyboardEvent('keydown', {
                key: composingKey,
                isComposing: true,
                bubbles: true,
                cancelable: true,
              });
              element.dispatchEvent(keydown);
              return {
                key: composingKey,
                isComposing: keydown.isComposing,
                defaultPrevented: keydown.defaultPrevented,
              };
            }, key);
            events.push(event);
            expect(event.isComposing).toBe(true);
            expect(event.defaultPrevented).toBe(false);
            await expect(search).toBeVisible();
            await expect(search).toBeFocused();
            await expect(search).toHaveValue('Neon');
            await expect(search).toHaveAttribute('aria-expanded', 'true');
            await expect(search).toHaveAttribute(
              'aria-activedescendant',
              activeOption
            );
          }
          await attachScreenshot(testInfo, `${name}-editing.png`, root);
          await attachA11yResult(page, testInfo, `${name}-editing-a11y.json`);

          await page.keyboard.press('Enter');
          if (option === 'artist') {
            await expect(
              root.getByRole('button', { name: 'Change', exact: true })
            ).toBeVisible();
            await expect(
              root.getByText('Neon Harbor', { exact: true })
            ).toBeVisible();
          } else {
            await expect(root.getByLabel('Spotify link')).toBeVisible();
          }
          await expect(search).toHaveCount(0);
          await assertNoHorizontalOverflow(page, name);
        } catch (error) {
          failure = error;
        } finally {
          try {
            await attachScreenshot(testInfo, `${name}-final.png`, root);
          } catch (error) {
            screenshotFailure = error;
          }
          const evidence = JSON.stringify(
            {
              theme,
              option,
              events,
              pageErrors,
              resourceErrors,
              failure: failure === undefined ? null : String(failure),
              screenshotFailure:
                screenshotFailure === undefined
                  ? null
                  : String(screenshotFailure),
            },
            null,
            2
          );
          await testInfo.attach(`${name}.json`, {
            body: evidence,
            contentType: 'application/json',
          });
          await mkdir(EVIDENCE_DIR, { recursive: true });
          await writeFile(join(EVIDENCE_DIR, `${name}.json`), evidence);
        }
        if (failure !== undefined) throw failure;
        if (screenshotFailure !== undefined) throw screenshotFailure;
        await attachA11yResult(page, testInfo, `${name}-a11y.json`);
        expect(pageErrors).toEqual([]);
        expect(resourceErrors).toEqual([]);
      });
    }
  }
});
