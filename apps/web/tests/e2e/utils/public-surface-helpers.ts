import { expect, type Locator, type Page } from '@playwright/test';
import type {
  PublicInteractionSpec,
  ResolvedPublicSurfaceSpec,
} from './public-surface-manifest';
import { setupPageMonitoring } from './smoke-test-utils';

const ERROR_TEXT_PATTERNS = [
  'application error',
  'internal server error',
  'unhandled runtime error',
  'something went wrong',
  'a server-side exception has occurred',
];

const OVERLAY_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[data-radix-popper-content-wrapper]',
  '[data-state="open"]',
].join(', ');

const SAFE_TRIGGER_DENYLIST =
  /start free|get started|claim profile|continue|pay|buy|checkout|open in|venmo|spotify|apple music|youtube music|sign in|sign up|more options|view on mobile|back|close/i;

export function createPublicMonitoring(page: Page) {
  return setupPageMonitoring(page);
}

export async function installPublicRouteMocks(page: Page) {
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

async function waitForAnyVisible(
  page: Page,
  selectors: readonly string[],
  timeout = 30_000
) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const visible = await page
        .locator(selector)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) {
        return selector;
      }
    }
    await page.waitForTimeout(200);
  }

  throw new Error(
    `None of the expected selectors became visible: ${selectors.join(', ')}`
  );
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePathAndSearch(value: string) {
  const url = new URL(value, 'http://localhost');
  const pathname =
    url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : url.pathname;
  return `${pathname}${url.search}`;
}

export async function waitForPublicSurfaceReady(
  page: Page,
  surface: ResolvedPublicSurfaceSpec
) {
  if (surface.expectedState === 'redirect' && surface.expectedRedirects) {
    await expect
      .poll(
        () =>
          surface.expectedRedirects?.some(pattern =>
            pattern.test(
              new URL(page.url()).pathname + new URL(page.url()).search
            )
          ) ?? false,
        {
          timeout: 10_000,
          message: `${surface.id} did not settle on an expected redirect target`,
        }
      )
      .toBe(true);
  }

  await waitForAnyVisible(
    page,
    surface.readySelectors,
    surface.readyVisibleTimeoutMs
  );

  if (
    surface.expectedState === 'redirect' &&
    surface.allowedFinalDocumentStatuses &&
    surface.allowedFinalDocumentStatuses.length > 0
  ) {
    await expect
      .poll(
        async () => {
          const response = await page.request.get(page.url(), {
            failOnStatusCode: false,
          });
          return (
            surface.allowedFinalDocumentStatuses?.includes(response.status()) ??
            false
          );
        },
        {
          timeout: 10_000,
          message: `${surface.id} did not settle on an allowed final document status`,
        }
      )
      .toBe(true);
  }

  if (surface.readyText) {
    const readyScope = page.locator(surface.mainSelector ?? 'body').first();
    await expect(readyScope.getByText(surface.readyText).first()).toBeVisible({
      timeout: 10_000,
    });
  }
}

export async function assertPublicSurfaceHealthy(
  page: Page,
  surface: ResolvedPublicSurfaceSpec
) {
  const body = normalizeText(await page.locator('body').textContent());
  const lowerBody = body.toLowerCase();

  for (const pattern of ERROR_TEXT_PATTERNS) {
    expect(
      lowerBody,
      `${surface.id} rendered an error pattern: ${pattern}`
    ).not.toContain(pattern);
  }

  if (surface.expectedState === 'redirect' && surface.expectedRedirects) {
    const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
    expect(
      surface.expectedRedirects.some(pattern => pattern.test(finalPath)),
      `${surface.id} ended at unexpected redirect target ${finalPath}`
    ).toBe(true);
  }

  if (surface.expectedState !== 'redirect') {
    const finalPath = normalizePathAndSearch(page.url());
    const expectedPath = normalizePathAndSearch(surface.resolvedPath);
    if (surface.allowedFinalPaths && surface.allowedFinalPaths.length > 0) {
      expect(
        surface.allowedFinalPaths.some(pattern => pattern.test(finalPath)),
        `${surface.id} unexpectedly redirected from ${expectedPath} to ${finalPath}`
      ).toBe(true);
    } else {
      expect(
        finalPath,
        `${surface.id} unexpectedly redirected from ${expectedPath} to ${finalPath}`
      ).toBe(expectedPath);
    }
  }

  if (!surface.allowMissingMain) {
    const main = page.locator(surface.mainSelector ?? 'main').first();
    await expect(main).toBeVisible({
      timeout: surface.mainVisibleTimeoutMs ?? 10_000,
    });
    const mainText = normalizeText(await main.textContent());
    expect(
      mainText.length,
      `${surface.id} rendered too little main content`
    ).toBeGreaterThanOrEqual(surface.minMainTextLength ?? 30);
  }

  const h1Count = await page.locator('h1').count();
  if (
    (surface.expectedState === 'ok' || surface.expectedState === 'not-found') &&
    surface.allowMultipleH1 !== true
  ) {
    expect(h1Count, `${surface.id} should render exactly one h1`).toBe(1);
  }
}

async function visibleLocators(page: Page, selectors: readonly string[]) {
  const matches: Locator[] = [];

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const visible = await candidate.isVisible().catch(() => false);
      if (visible) {
        matches.push(candidate);
      }
    }
  }

  return matches;
}

async function closeTransientUi(page: Page) {
  if (page.isClosed()) {
    return;
  }

  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(150).catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(150).catch(() => undefined);
}

async function assertOverlayLifecycle(page: Page, trigger: Locator) {
  const before = await page.locator(OVERLAY_SELECTOR).count();
  await trigger.click({ force: true });
  await page.waitForTimeout(200).catch(() => undefined);
  const after = await page.locator(OVERLAY_SELECTOR).count();

  if (after > before) {
    const overlay = page.locator(OVERLAY_SELECTOR).last();
    await expect(overlay).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Tab').catch(() => undefined);
    await closeTransientUi(page);

    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      if (page.isClosed()) {
        return;
      }

      const settled = await page.locator(OVERLAY_SELECTOR).count();
      if (settled <= before) {
        return;
      }

      await page.waitForTimeout(100).catch(() => undefined);
    }
  }
}

async function runSafeTriggerSweep(
  page: Page,
  interaction: PublicInteractionSpec
) {
  const selectors = interaction.selectors ?? [
    'button:not([type="submit"]):not([disabled])',
    'summary',
    '[aria-haspopup="dialog"]',
    '[aria-haspopup="menu"]',
    '[aria-haspopup="listbox"]',
    '[role="tab"]',
  ];
  const clickedLabels = new Set<string>();
  let clicked = 0;

  while (clicked < (interaction.maxClicks ?? 4)) {
    const triggers = await visibleLocators(page, selectors);
    let nextTrigger: Locator | null = null;

    for (const trigger of triggers) {
      const label = normalizeText(
        (await trigger.getAttribute('aria-label').catch(() => null)) ??
          (await trigger.textContent().catch(() => ''))
      );
      const isNavigational = await trigger
        .evaluate(element => {
          const anchor = element.closest('a[href]');
          if (!anchor) {
            return false;
          }

          const href = anchor.getAttribute('href');
          if (!href) {
            return false;
          }

          const resolved = new URL(href, window.location.href);
          const current = new URL(window.location.href);
          return (
            resolved.origin !== current.origin ||
            `${resolved.pathname}${resolved.search}` !==
              `${current.pathname}${current.search}`
          );
        })
        .catch(() => false);

      if (
        !label ||
        isNavigational ||
        SAFE_TRIGGER_DENYLIST.test(label) ||
        clickedLabels.has(label)
      ) {
        continue;
      }

      const stillVisible = await trigger.isVisible().catch(() => false);
      if (!stillVisible) {
        continue;
      }

      clickedLabels.add(label);
      nextTrigger = trigger;
      break;
    }

    if (!nextTrigger) {
      break;
    }

    await assertOverlayLifecycle(page, nextTrigger).catch(() => undefined);
    clicked += 1;
  }
}

async function runCookieBannerInteraction(page: Page) {
  const banner = page.locator('[data-testid="cookie-banner"]').first();
  const bannerVisible = await banner.isVisible().catch(() => false);

  if (!bannerVisible) {
    return;
  }

  const customizeTrigger = banner
    .getByRole('button', { name: /customize/i })
    .first();
  const customizeVisible = await customizeTrigger
    .isVisible()
    .catch(() => false);

  if (customizeVisible) {
    await assertOverlayLifecycle(page, customizeTrigger);
    return;
  }

  const manageTrigger = banner.getByRole('button', { name: /manage/i }).first();
  const manageVisible = await manageTrigger.isVisible().catch(() => false);

  if (!manageVisible) {
    return;
  }

  await assertOverlayLifecycle(page, manageTrigger);
}

async function runHeaderNavigationInteraction(page: Page) {
  const triggers = await visibleLocators(page, [
    'button[aria-label*="menu" i]',
    'button[aria-label*="navigation" i]',
  ]);

  if (triggers.length === 0) {
    return;
  }

  await assertOverlayLifecycle(page, triggers[0]);
}

async function runNotificationFormInteraction(page: Page) {
  const field = page
    .locator('input[type="email"], input[name*="email" i], input[type="tel"]')
    .first();
  const visible = await field.isVisible().catch(() => false);

  if (!visible) {
    return;
  }

  await field.fill('not-an-email');
  await field.blur();
}

async function runAudioPreviewInteraction(page: Page) {
  const trigger = page
    .locator('button[aria-label*="play" i], button[aria-label*="preview" i]')
    .first();
  const visible = await trigger.isVisible().catch(() => false);

  if (!visible) {
    return;
  }

  await trigger.click({ force: true });
  await page.waitForTimeout(150);
  await trigger.click({ force: true }).catch(() => undefined);
}

async function runCreditsInteraction(page: Page) {
  const trigger = page
    .locator('button:has-text("Credits"), summary:has-text("Credits")')
    .first();
  const visible = await trigger.isVisible().catch(() => false);

  if (!visible) {
    return;
  }

  await assertOverlayLifecycle(page, trigger);
}

async function runArtworkMenuInteraction(page: Page) {
  const trigger = page
    .locator(
      'button[aria-label*="artwork" i], button[aria-label*="album art" i]'
    )
    .first();
  const visible = await trigger.isVisible().catch(() => false);

  if (!visible) {
    return;
  }

  await assertOverlayLifecycle(page, trigger);
}

async function runDspInteraction(page: Page) {
  const dspSelectors = [
    'a[href*="spotify"]',
    'a[href*="apple"]',
    'a[href*="youtube"]',
    'a[aria-label^="Open "]',
    'button[aria-label^="Open "]',
    'a:has-text("Spotify")',
    'a:has-text("Apple Music")',
    'a:has-text("YouTube Music")',
    'button:has-text("Spotify")',
    'button:has-text("Apple Music")',
    'button:has-text("YouTube Music")',
  ] as const;
  const visibleActions = await visibleLocators(page, dspSelectors);

  if (visibleActions.length === 0) {
    return;
  }

  await expect(visibleActions[0]).toBeVisible({ timeout: 5_000 });
}

export async function runDeclaredPublicInteractions(
  page: Page,
  surface: ResolvedPublicSurfaceSpec,
  projectName: string
) {
  const viewport = page.viewportSize();
  const isMobile =
    (viewport?.width ?? Number.POSITIVE_INFINITY) < 768 ||
    projectName.toLowerCase().includes('mobile');

  for (const interaction of surface.interactions) {
    if (interaction.viewport === 'desktop' && isMobile) {
      continue;
    }

    if (interaction.viewport === 'mobile' && !isMobile) {
      continue;
    }

    switch (interaction.id) {
      case 'cookie-banner':
        await runCookieBannerInteraction(page);
        break;
      case 'header-navigation':
        await runHeaderNavigationInteraction(page);
        break;
      case 'notification-form':
        await runNotificationFormInteraction(page);
        break;
      case 'audio-preview':
        await runAudioPreviewInteraction(page);
        break;
      case 'credits':
        await runCreditsInteraction(page);
        break;
      case 'artwork-menu':
        await runArtworkMenuInteraction(page);
        break;
      case 'dsp-actions':
        await runDspInteraction(page);
        break;
      case 'profile-mode-drawer':
        if (!page.url().includes('mode=')) {
          break;
        }

        const originalUrl = page.url();
        const profileTrigger = page
          .locator('[data-testid="profile-trigger"]')
          .first();
        if (!(await profileTrigger.isVisible().catch(() => false))) {
          break;
        }

        await profileTrigger.click({ force: true });
        await page.waitForURL(url => !url.searchParams.has('mode'), {
          timeout: 15_000,
        });
        await page
          .goBack({ waitUntil: 'domcontentloaded' })
          .catch(() => undefined);
        await page
          .waitForURL(originalUrl, { timeout: 15_000 })
          .catch(() => undefined);
        await waitForPublicSurfaceReady(page, surface);
        break;
      case 'safe-trigger-sweep':
        await runSafeTriggerSweep(page, interaction);
        break;
      default:
        break;
    }
  }

  await closeTransientUi(page);
}
