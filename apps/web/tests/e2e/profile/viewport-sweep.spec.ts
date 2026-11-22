/**
 * Viewport sweep: permanent layout-breakage regression gate.
 *
 * Why this exists: jov.ie/tim shipped broken at many widths and on window
 * resize (stray tab indicator, overlapping bottom bars, content below the
 * footer, giant overlay sheets on desktop, focus rings after a mouse click)
 * and no existing check noticed. Every assertion here is geometric and
 * deterministic (see utils/viewport-sweep-audit.ts); no pixel diffs.
 *
 * Coverage:
 *   - public profile (DB-free fixture route, the real public profile shell):
 *     fixed widths 320..1440, embedded-pane widths, Home / Music / About
 *     tabs, full-page scroll, every overlay state (menu, share, pay,
 *     credits, contact), claimed + unclaimed (Get yours bar) + embedded
 *     preview variants.
 *   - continuous resize: load wide, step the viewport down and back up in
 *     40px steps WITHOUT reloading, audit after every step.
 *   - golden-path public pages (/, /start, /signin, /signup, /pricing).
 *
 * Every width/state also writes <width>-<state>.png under
 * test-results/viewport-sweep-shots/ (uploaded as a CI artifact) so before and
 * after shots come from the same run that gates the PR.
 *
 * Not covered here (needs a seeded DB / real auth, owned by the Golden Path
 * lanes): signed-in /app and /onboarding. Overlay states that the fixture
 * profile does not offer (e.g. Pay on a profile without tipping) are recorded
 * as `state-unavailable` annotations rather than silently dropped.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  prepareProfileState,
  profileStates,
} from '../../product-screenshots/route-dom-certification-support';
import { getOverflowingElements } from '../utils/mobile-overflow';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import {
  auditViewport,
  settleViewport,
  type ViewportSweepViolation,
} from '../utils/viewport-sweep-audit';
import { auditOverlay } from '../utils/viewport-sweep-overlay-audit';
import {
  planResizeSteps,
  SWEEP_EMBEDDED_WIDTHS,
  SWEEP_FIXED_WIDTHS,
  SWEEP_HEIGHT,
  SWEEP_OVERLAY_WIDTHS,
  SWEEP_RESIZE_STEP,
} from '../utils/viewport-sweep-plan';

test.use({ storageState: { cookies: [], origins: [] } });

const SHOT_DIR = path.resolve('test-results/viewport-sweep-shots');

const PROFILE_VARIANTS = {
  claimed: '/renders/profile-admission?layout=public&state=claimed',
  unclaimed: '/renders/profile-admission?layout=public&state=unclaimed',
  preview: '/renders/profile-admission?layout=preview',
} as const;

const GOLDEN_PATH_PAGES = [
  { id: 'home', path: '/' },
  { id: 'start', path: '/start' },
  { id: 'signin', path: '/signin' },
  { id: 'signup', path: '/signup' },
  { id: 'pricing', path: '/pricing' },
] as const;
const GOLDEN_PATH_WIDTHS = [320, 390, 768, 1024, 1440] as const;

async function shot(
  page: Page,
  width: number,
  state: string,
  fullPage = false
) {
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${width}-${state}.png`),
    fullPage,
  });
}

function format(label: string, violations: readonly ViewportSweepViolation[]) {
  return violations.length === 0
    ? ''
    : `${label}\n${violations.map(v => `  [${v.code}] ${v.detail}`).join('\n')}`;
}

/** Collect every failure of a test, then fail once with all of them. */
function createCollector() {
  const failures: string[] = [];
  return {
    add(label: string, violations: readonly ViewportSweepViolation[]) {
      const text = format(label, violations);
      if (text) failures.push(text);
    },
    addText(text: string) {
      failures.push(text);
    },
    assertClean() {
      expect(failures, failures.join('\n\n')).toEqual([]);
    },
  };
}

async function openProfile(page: Page, url: string, width: number) {
  await installPublicRouteMocks(page);
  await page.setViewportSize({ width, height: SWEEP_HEIGHT });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('public-profile-layout-shell')).toBeVisible();
  await expect(
    page
      .locator(
        '[data-testid="profile-compact-shell"][data-interactive-ready="true"], [data-testid="profile-desktop-surface"][data-interactive-ready="true"]'
      )
      .first()
  ).toBeVisible();
  await settleViewport(page);
}

async function auditProfileNow(
  page: Page,
  collector: ReturnType<typeof createCollector>,
  label: string
) {
  await settleViewport(page);
  collector.add(label, await auditViewport(page, { kind: 'profile' }));
  const offenders = await getOverflowingElements(page);
  if (offenders.length > 0) {
    collector.addText(
      `${label}\n  [offscreen_element] ${offenders
        .slice(0, 5)
        .map(
          o =>
            `${o.tag}${o.id ? `#${o.id}` : ''} "${o.text}" left=${o.left} right=${o.right}`
        )
        .join(' | ')}`
    );
  }
}

/** Home -> Music -> About with real mouse clicks, auditing each. */
async function sweepTabs(
  page: Page,
  collector: ReturnType<typeof createCollector>,
  width: number,
  variant: string
) {
  for (const state of profileStates.filter(s => s.kind === 'tab')) {
    if (state.trigger === 'Events') continue;
    const tab = page.getByRole('button', { name: state.trigger, exact: true });
    if ((await tab.count()) === 0) {
      test.info().annotations.push({
        type: 'state-unavailable',
        description: `${variant} ${width}px: no ${state.trigger} tab`,
      });
      continue;
    }
    await prepareProfileState(page, state);
    await auditProfileNow(
      page,
      collector,
      `${variant} ${width}px tab ${state.trigger}`
    );
    await shot(page, width, `${variant}-${state.id}`);
  }
  // Full-page scroll: scroll every scrollable region to its end and re-audit.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>('*')
    )) {
      if (element.scrollHeight > element.clientHeight + 8) {
        const overflowY = getComputedStyle(element).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          element.scrollTop = element.scrollHeight;
        }
      }
    }
  });
  await auditProfileNow(
    page,
    collector,
    `${variant} ${width}px scrolled to end`
  );
  await shot(page, width, `${variant}-scrolled`, true);
}

test.describe('viewport sweep: public profile', () => {
  test.describe.configure({ timeout: 180_000 });

  for (const width of SWEEP_FIXED_WIDTHS) {
    test(`claimed profile tabs and scroll at ${width}px`, async ({ page }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.claimed, width);
      await auditProfileNow(page, collector, `claimed ${width}px initial`);
      await sweepTabs(page, collector, width, 'claimed');
      collector.assertClean();
    });

    test(`unclaimed profile (Get yours bar) at ${width}px`, async ({
      page,
    }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.unclaimed, width);
      await auditProfileNow(page, collector, `unclaimed ${width}px initial`);
      await shot(page, width, 'unclaimed-home');
      collector.assertClean();
    });
  }

  for (const width of SWEEP_EMBEDDED_WIDTHS) {
    test(`embedded pane: profile at ${width}px`, async ({ page }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.claimed, width);
      await auditProfileNow(page, collector, `embedded-pane ${width}px`);
      await shot(page, width, 'embedded-pane');
      collector.assertClean();
    });

    test(`embedded preview frame at ${width}px`, async ({ page }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.preview, width);
      await auditProfileNow(page, collector, `preview ${width}px`);
      await shot(page, width, 'preview');
      collector.assertClean();
    });
  }

  for (const width of SWEEP_OVERLAY_WIDTHS) {
    for (const state of profileStates.filter(s => s.kind !== 'tab')) {
      test(`overlay ${state.id} at ${width}px`, async ({ page }) => {
        const collector = createCollector();
        await openProfile(page, PROFILE_VARIANTS.claimed, width);
        const menuButton = page.getByRole('button', {
          name: 'Menu',
          exact: true,
        });
        await expect(menuButton).toBeVisible();
        if (state.kind === 'drawer-menuitem') {
          await menuButton.click();
          await expect(page.getByTestId('profile-menu-drawer')).toBeVisible();
          const item = page.getByRole('menuitem', {
            name: state.trigger,
            exact: true,
          });
          if ((await item.count()) === 0) {
            test.info().annotations.push({
              type: 'state-unavailable',
              description: `${state.id} at ${width}px: fixture has no "${state.trigger}" menu item`,
            });
            return;
          }
          await page.keyboard.press('Escape');
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await settleViewport(page);
        await prepareProfileState(page, state);
        await settleViewport(page);
        collector.add(
          `overlay ${state.id} ${width}px`,
          await auditOverlay(page)
        );
        await auditProfileNow(
          page,
          collector,
          `overlay ${state.id} ${width}px page`
        );
        await shot(page, width, `overlay-${state.id}`);
        collector.assertClean();
      });
    }
  }
});

test.describe('viewport sweep: continuous resize', () => {
  test.describe.configure({ timeout: 240_000 });

  for (const [variant, url] of [
    ['claimed', PROFILE_VARIANTS.claimed],
    ['unclaimed', PROFILE_VARIANTS.unclaimed],
  ] as const) {
    test(`${variant} profile survives step-down and step-up resize without reload`, async ({
      page,
    }) => {
      const collector = createCollector();
      await openProfile(page, url, 1440);
      const steps = planResizeSteps(1440, 320, SWEEP_RESIZE_STEP);
      for (const [index, width] of steps.entries()) {
        await page.setViewportSize({ width, height: SWEEP_HEIGHT });
        await auditProfileNow(
          page,
          collector,
          `${variant} resize step ${index} -> ${width}px`
        );
        if (
          index === 0 ||
          width === 320 ||
          index === steps.length - 1 ||
          width === 760
        ) {
          await shot(page, width, `${variant}-resize-${index}`);
        }
      }
      collector.assertClean();
    });
  }

  test('menu stays valid while resizing with the menu open', async ({
    page,
  }) => {
    const collector = createCollector();
    await openProfile(page, PROFILE_VARIANTS.claimed, 1440);
    const menu = profileStates.find(s => s.id === 'menu');
    if (!menu) throw new Error('menu profile state missing');
    await prepareProfileState(page, menu);
    for (const width of planResizeSteps(1440, 320, 120)) {
      await page.setViewportSize({ width, height: SWEEP_HEIGHT });
      await settleViewport(page);
      collector.add(`menu open resize ${width}px`, await auditOverlay(page));
    }
    collector.assertClean();
  });
});

test.describe('viewport sweep: golden-path public pages', () => {
  test.describe.configure({ timeout: 180_000 });

  for (const route of GOLDEN_PATH_PAGES) {
    test(`${route.id} (${route.path}) across widths and resize`, async ({
      page,
    }) => {
      const collector = createCollector();
      await installPublicRouteMocks(page);
      await page.setViewportSize({ width: 1440, height: SWEEP_HEIGHT });
      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
      });
      expect(response?.status(), `${route.path} status`).toBeLessThan(400);
      await settleViewport(page);
      const widths = [
        ...GOLDEN_PATH_WIDTHS,
        ...planResizeSteps(1440, 320, 160),
      ];
      for (const [index, width] of widths.entries()) {
        await page.setViewportSize({ width, height: SWEEP_HEIGHT });
        await settleViewport(page);
        collector.add(
          `${route.id} ${width}px (${index})`,
          await auditViewport(page, { kind: 'page' })
        );
        if (index < GOLDEN_PATH_WIDTHS.length) {
          await shot(page, width, `page-${route.id}`);
        }
      }
      collector.assertClean();
    });
  }
});
