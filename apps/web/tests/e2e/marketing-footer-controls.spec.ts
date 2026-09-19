import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

const THEME_STORAGE_KEY = 'jovie-theme';
const HOME_NAVIGATION_TIMEOUT = 60_000;
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

type ThemeChoice = 'system' | 'light' | 'dark';

type ThemeState = {
  readonly stored: string | null;
  readonly dark: boolean;
  readonly colorScheme: string;
  readonly pressed: Record<ThemeChoice, boolean>;
};

type Rect = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
};

type FooterGeometry = {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly horizontalOverflow: number;
  readonly toolbar: Rect;
  readonly locale: Rect;
  readonly targets: readonly Rect[];
};

const buttonName = (theme: ThemeChoice) =>
  `${theme[0].toUpperCase()}${theme.slice(1)} Theme`;

async function interceptAnalytics(page: import('@playwright/test').Page) {
  for (const endpoint of [
    '**/api/profile/view',
    '**/api/audience/visit',
    '**/api/track',
  ]) {
    await page.route(endpoint, route =>
      route.fulfill({ status: 200, body: '{}' })
    );
  }
}

async function openHome(
  page: import('@playwright/test').Page,
  viewport: { readonly width: number; readonly height: number }
) {
  await page.setViewportSize(viewport);
  await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: HOME_NAVIGATION_TIMEOUT,
  });
  await waitForHydration(page, { timeout: HOME_NAVIGATION_TIMEOUT });
  await expect(page.getByTestId('marketing-footer')).toBeVisible();
  await expect(page.getByTestId('marketing-footer-controls')).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Theme' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Light Theme' })).toBeVisible();
}

async function waitForThemeControls(
  page: import('@playwright/test').Page
): Promise<void> {
  await expect(page.getByRole('toolbar', { name: 'Theme' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'System Theme' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Light Theme' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dark Theme' })).toBeVisible();
}

async function clearThemePreference(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.evaluate(storageKey => {
    window.localStorage.removeItem(storageKey);
  }, THEME_STORAGE_KEY);
}

async function readThemeState(
  page: import('@playwright/test').Page
): Promise<ThemeState> {
  return page.evaluate(storageKey => {
    const root = document.documentElement;
    const pressed = (theme: ThemeChoice) =>
      root
        .querySelector<HTMLButtonElement>(
          `[aria-label="${theme[0].toUpperCase()}${theme.slice(1)} Theme"]`
        )
        ?.getAttribute('aria-pressed') === 'true';

    return {
      stored: window.localStorage.getItem(storageKey),
      dark: root.classList.contains('dark'),
      colorScheme: root.style.colorScheme,
      pressed: {
        system: pressed('system'),
        light: pressed('light'),
        dark: pressed('dark'),
      },
    };
  }, THEME_STORAGE_KEY);
}

async function chooseTheme(
  page: import('@playwright/test').Page,
  theme: ThemeChoice
): Promise<void> {
  const button = page.getByRole('button', { name: buttonName(theme) });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await readThemeState(page)).stored)
    .toBe(theme);
}

async function measureFooterGeometry(
  page: import('@playwright/test').Page
): Promise<FooterGeometry> {
  return page.getByTestId('marketing-footer-controls').evaluate(root => {
    const measureRect = (element: Element): Rect => {
      const rect = element.getBoundingClientRect();
      const round = (value: number) => Math.round(value * 10) / 10;
      return {
        left: round(rect.left),
        right: round(rect.right),
        top: round(rect.top),
        bottom: round(rect.bottom),
        width: round(rect.width),
        height: round(rect.height),
      };
    };
    const toolbar = root.querySelector('[role="toolbar"]');
    const locale = root.querySelector(
      '[data-testid="marketing-locale-static"]'
    );
    const buttons = toolbar?.querySelectorAll('button') ?? [];
    if (!toolbar || !locale || buttons.length !== 3) {
      throw new Error(
        'Marketing footer controls did not expose three theme targets'
      );
    }

    const targets = Array.from(buttons).map(button => {
      const hitTarget = button.querySelector(
        ':scope > span[aria-hidden="true"]'
      );
      if (!hitTarget) throw new Error('Theme button is missing its hit target');
      return measureRect(hitTarget);
    });

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      horizontalOverflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth,
      toolbar: measureRect(toolbar),
      locale: measureRect(locale),
      targets,
    };
  });
}

async function nextFrames(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
  );
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('marketing footer theme controls', () => {
  test('supports mode selection, persistence, system media, keyboard use, and stable hit geometry', async ({
    page,
  }, testInfo) => {
    await interceptAnalytics(page);

    const receipt = {
      runtime: 'playwright-browser',
      route: '/',
      storageKey: THEME_STORAGE_KEY,
      viewports: VIEWPORTS,
      modes: {},
      systemMedia: {},
      keyboard: {},
      geometry: {},
      policyBoundary: {},
    } as Record<string, unknown>;

    await test.step('select each mode and persist it across reload', async () => {
      await page.emulateMedia({ colorScheme: 'light' });
      await openHome(page, VIEWPORTS[0]);
      await clearThemePreference(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForThemeControls(page);

      await chooseTheme(page, 'system');
      const systemState = await readThemeState(page);
      expect(systemState.pressed.system).toBe(true);

      await chooseTheme(page, 'light');
      const lightState = await readThemeState(page);
      expect(lightState.dark).toBe(false);
      expect(lightState.colorScheme).toBe('light');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForThemeControls(page);
      const persistedLightState = await readThemeState(page);
      expect(persistedLightState.stored).toBe('light');
      expect(persistedLightState.pressed.light).toBe(true);
      expect(persistedLightState.dark).toBe(false);

      await chooseTheme(page, 'dark');
      const darkState = await readThemeState(page);
      expect(darkState.dark).toBe(true);
      expect(darkState.colorScheme).toBe('dark');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForThemeControls(page);
      const persistedDarkState = await readThemeState(page);
      expect(persistedDarkState.stored).toBe('dark');
      expect(persistedDarkState.pressed.dark).toBe(true);
      expect(persistedDarkState.dark).toBe(true);

      receipt.modes = {
        system: systemState,
        light: persistedLightState,
        dark: persistedDarkState,
      };
    });

    await test.step('follow the OS preference while system mode is selected', async () => {
      await page.emulateMedia({ colorScheme: 'light' });
      await chooseTheme(page, 'system');
      await expect
        .poll(async () => (await readThemeState(page)).dark)
        .toBe(false);

      await page.emulateMedia({ colorScheme: 'dark' });
      await expect
        .poll(async () => (await readThemeState(page)).dark)
        .toBe(true);
      const systemDarkState = await readThemeState(page);
      expect(systemDarkState.stored).toBe('system');
      expect(systemDarkState.pressed.system).toBe(true);

      await page.emulateMedia({ colorScheme: 'light' });
      await expect
        .poll(async () => (await readThemeState(page)).dark)
        .toBe(false);
      const systemLightState = await readThemeState(page);
      expect(systemLightState.stored).toBe('system');
      expect(systemLightState.pressed.system).toBe(true);

      receipt.systemMedia = {
        dark: systemDarkState,
        light: systemLightState,
      };
    });

    await test.step('activate a choice from the keyboard and retain focus', async () => {
      const toolbar = page.getByRole('toolbar', { name: 'Theme' });
      const system = toolbar.getByRole('button', { name: 'System Theme' });
      const light = toolbar.getByRole('button', { name: 'Light Theme' });
      await system.focus();
      await expect(system).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(light).toBeFocused();
      await page.keyboard.press('Space');
      await expect(light).toBeFocused();
      await expect(light).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(async () => (await readThemeState(page)).stored)
        .toBe('light');

      receipt.keyboard = {
        focusedBeforeActivation: 'System Theme',
        focusedAfterTab: 'Light Theme',
        activatedBy: 'Space',
        focusRetained: true,
      };
    });

    await test.step('keep 44px targets separate at desktop and mobile widths', async () => {
      const measurements: Record<string, FooterGeometry> = {};
      for (const viewport of VIEWPORTS) {
        await openHome(page, viewport);
        await clearThemePreference(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForThemeControls(page);

        await page
          .getByTestId('marketing-footer-controls')
          .scrollIntoViewIfNeeded();
        const before = await measureFooterGeometry(page);
        expect(before.horizontalOverflow).toBeLessThanOrEqual(1);
        expect(before.targets).toHaveLength(3);
        for (const target of before.targets) {
          expect(target.width).toBeGreaterThanOrEqual(44);
          expect(target.height).toBeGreaterThanOrEqual(44);
          expect(target.left).toBeGreaterThanOrEqual(0);
          expect(target.right).toBeLessThanOrEqual(before.viewportWidth);
        }
        for (let index = 1; index < before.targets.length; index += 1) {
          expect(before.targets[index - 1].right).toBeLessThanOrEqual(
            before.targets[index].left
          );
        }
        for (const target of before.targets) {
          const overlapsLocale =
            target.left < before.locale.right &&
            target.right > before.locale.left &&
            target.top < before.locale.bottom &&
            target.bottom > before.locale.top;
          expect(overlapsLocale).toBe(false);
        }

        const toolbar = page.getByRole('toolbar', { name: 'Theme' });
        for (let index = 0; index < before.targets.length; index += 1) {
          await toolbar.getByRole('button').nth(index).hover();
          await nextFrames(page);
          const after = await measureFooterGeometry(page);
          expect(after.toolbar).toEqual(before.toolbar);
          expect(after.targets).toEqual(before.targets);
        }
        measurements[viewport.name] = before;
      }
      receipt.geometry = measurements;
    });

    await test.step('keep the preference control scoped to the declared route policy', async () => {
      await page.goto('/brand', {
        waitUntil: 'domcontentloaded',
        timeout: HOME_NAVIGATION_TIMEOUT,
      });
      await waitForHydration(page, { timeout: HOME_NAVIGATION_TIMEOUT });
      await expect(page.getByTestId('marketing-footer')).toBeVisible();
      await expect(page.getByTestId('marketing-footer-controls')).toHaveCount(
        0
      );
      await expect
        .poll(async () =>
          page.evaluate(() =>
            document.documentElement.classList.contains('dark')
          )
        )
        .toBe(true);
      receipt.policyBoundary = {
        themeRoute: '/',
        darkOnlyRoute: '/brand',
        controlsOnBrand: false,
        darkFallbackOnBrand: true,
      };
    });

    const receiptDirectory = process.env.PR_VISUAL_OUT
      ? join(
          process.env.GITHUB_WORKSPACE ?? process.cwd(),
          process.env.PR_VISUAL_OUT
        )
      : join(process.cwd(), 'pr-visual-artifacts');
    const receiptPath = join(receiptDirectory, 'footer-interaction.json');
    await mkdir(receiptDirectory, {
      recursive: true,
    });
    const serializedReceipt = JSON.stringify(
      {
        ...receipt,
        exactHead:
          process.env.PR_VISUAL_HEAD_SHA ?? process.env.GITHUB_SHA ?? null,
        testFile: testInfo.file,
      },
      null,
      2
    );
    await writeFile(receiptPath, serializedReceipt);
    await testInfo.attach('footer-interaction-receipt', {
      body: serializedReceipt,
      contentType: 'application/json',
    });
  });
});
