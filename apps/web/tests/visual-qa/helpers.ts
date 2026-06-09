import { expect, type Page } from '@playwright/test';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import type { VisualQaColorScheme } from '@/lib/visual-qa/themes';
import type { VisualQaCaptureConfig } from '@/lib/visual-qa/types';
import { VISUAL_QA_VIEWPORTS } from '@/lib/visual-qa/viewports';
import {
  assertNoDevOverlays,
  hideTransientUI,
  SCREENSHOT_CLOCK_ISO,
  TIMEOUTS,
  waitForImages,
  waitForSettle,
} from '../product-screenshots/helpers';

const JOVIE_THEME_STORAGE_KEY = 'jovie-theme';

export async function applyVisualQaColorScheme(
  page: Page,
  colorScheme: VisualQaColorScheme
) {
  await page.emulateMedia({ colorScheme });
  await page.addInitScript(
    ({ storageKey, theme }) => {
      localStorage.setItem(storageKey, theme);
      const root = document.documentElement;
      const isDark = theme === 'dark';
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    },
    {
      storageKey: JOVIE_THEME_STORAGE_KEY,
      theme: colorScheme,
    }
  );
}

export async function reinforceVisualQaColorScheme(
  page: Page,
  colorScheme: VisualQaColorScheme
) {
  await page.evaluate(
    ({ storageKey, theme }) => {
      localStorage.setItem(storageKey, theme);
      const root = document.documentElement;
      const isDark = theme === 'dark';
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    },
    {
      storageKey: JOVIE_THEME_STORAGE_KEY,
      theme: colorScheme,
    }
  );
}

export async function prepareVisualQaCapture(
  page: Page,
  config: VisualQaCaptureConfig
) {
  const viewport = VISUAL_QA_VIEWPORTS[config.viewport];
  const colorScheme = config.colorScheme ?? 'dark';

  if (!config.route.startsWith('/exp/shell-v1')) {
    await page.clock.setFixedTime(
      new Date(config.fixedNow ?? SCREENSHOT_CLOCK_ISO)
    );
  }

  await applyVisualQaColorScheme(page, colorScheme);
  await page.emulateMedia({
    colorScheme,
    reducedMotion: config.reducedMotion ? 'reduce' : 'no-preference',
  });
  await page.setViewportSize(viewport);

  if (config.flagOverrides && Object.keys(config.flagOverrides).length > 0) {
    const serializedOverrides = JSON.stringify(config.flagOverrides);
    await page.addInitScript(
      ({ cookieName, key, value }) => {
        localStorage.setItem(key, value);
        document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
      },
      {
        cookieName: APP_FLAG_OVERRIDES_COOKIE,
        key: FF_OVERRIDES_KEY,
        value: serializedOverrides,
      }
    );
  }

  await page.goto(config.route, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION,
  });

  await reinforceVisualQaColorScheme(page, colorScheme);

  await expect(page.locator(config.waitFor).first()).toBeVisible({
    timeout: TIMEOUTS.CONTENT_VISIBLE,
  });

  await waitForImages(page).catch(() => {});
  await waitForSettle(page);
  await hideTransientUI(page);
  await assertNoDevOverlays(page);
}

export async function writeVisualQaScreenshot(
  page: Page,
  config: VisualQaCaptureConfig,
  outputPath: string
) {
  if (config.captureTarget === 'locator' && config.captureSelector) {
    await page.locator(config.captureSelector).first().screenshot({
      path: outputPath,
    });
    return;
  }

  await page.screenshot({
    path: outputPath,
    fullPage: config.fullPage ?? false,
  });
}
