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
import { auditCoverAccentLine } from '../utils/viewport-sweep-accent-audit';
import {
  auditViewport,
  settleViewport,
  type ViewportSweepViolation,
} from '../utils/viewport-sweep-audit';
import { auditColumnGaps } from '../utils/viewport-sweep-column-gap-audit';
import { auditOverlay } from '../utils/viewport-sweep-overlay-audit';
import {
  chunkSteps,
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
  // Fan capture on: mounts the desktop Get updates / Pay side rail, as on
  // jov.ie/tim. Without it the rail never renders in this sweep.
  rail: '/renders/profile-admission?layout=public&state=claimed&rail=on',
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

// Every test below fits the config's default per-test timeout: one test per
// width, per tab, per resize segment and per route/width combination.
const RESIZE_SEGMENT_SIZE = 8;
const MENU_RESIZE_SEGMENT_SIZE = 7;
const GOLDEN_RESIZE_SEGMENT_SIZE = 5;
const TAB_STATES = profileStates.filter(
  s => s.kind === 'tab' && s.trigger !== 'Events'
);

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

type SweepFinding = Pick<ViewportSweepViolation, 'detail'> & {
  readonly code: string;
};

function format(label: string, violations: readonly SweepFinding[]) {
  return violations.length === 0
    ? ''
    : `${label}\n${violations.map(v => `  [${v.code}] ${v.detail}`).join('\n')}`;
}

/** Collect every failure of a test, then fail once with all of them. */
function createCollector() {
  const failures: string[] = [];
  return {
    add(label: string, violations: readonly SweepFinding[]) {
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
  collector.add(label, await auditCoverAccentLine(page));
  collector.add(label, await auditColumnGaps(page));
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

/** Click one tab with a real mouse click and audit it. */
async function sweepTab(
  page: Page,
  collector: ReturnType<typeof createCollector>,
  width: number,
  variant: string,
  state: (typeof TAB_STATES)[number]
) {
  const tab = page.getByRole('button', { name: state.trigger, exact: true });
  if ((await tab.count()) === 0) {
    test.info().annotations.push({
      type: 'state-unavailable',
      description: `${variant} ${width}px: no ${state.trigger} tab`,
    });
    return;
  }
  await prepareProfileState(page, state);
  await auditProfileNow(
    page,
    collector,
    `${variant} ${width}px tab ${state.trigger}`
  );
  await shot(page, width, `${variant}-${state.id}`);
}

/** Full-page scroll: scroll every scrollable region to its end and re-audit. */
async function sweepScrollToEnd(
  page: Page,
  collector: ReturnType<typeof createCollector>,
  width: number,
  variant: string
) {
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
  for (const width of SWEEP_FIXED_WIDTHS) {
    test(`claimed profile initial state at ${width}px`, async ({ page }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.claimed, width);
      await auditProfileNow(page, collector, `claimed ${width}px initial`);
      collector.assertClean();
    });

    for (const state of TAB_STATES) {
      test(`claimed profile ${state.trigger} tab at ${width}px`, async ({
        page,
      }) => {
        const collector = createCollector();
        await openProfile(page, PROFILE_VARIANTS.claimed, width);
        await sweepTab(page, collector, width, 'claimed', state);
        collector.assertClean();
      });
    }

    test(`claimed profile scrolled to end at ${width}px`, async ({ page }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.claimed, width);
      await sweepScrollToEnd(page, collector, width, 'claimed');
      collector.assertClean();
    });

    test(`claimed profile with updates rail at ${width}px`, async ({
      page,
    }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.rail, width);
      await auditProfileNow(page, collector, `rail ${width}px initial`);
      await shot(page, width, 'rail-home');
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
  const segments = chunkSteps(
    planResizeSteps(1440, 320, SWEEP_RESIZE_STEP),
    RESIZE_SEGMENT_SIZE
  );

  for (const [variant, url] of [
    ['claimed', PROFILE_VARIANTS.claimed],
    ['unclaimed', PROFILE_VARIANTS.unclaimed],
  ] as const) {
    for (const [segmentIndex, segment] of segments.entries()) {
      const first = segment[0];
      const last = segment.at(-1);
      test(`${variant} profile resize segment ${segmentIndex} (${first}px to ${last}px) without reload`, async ({
        page,
      }) => {
        const collector = createCollector();
        await openProfile(page, url, first);
        for (const [index, width] of segment.entries()) {
          await page.setViewportSize({ width, height: SWEEP_HEIGHT });
          await auditProfileNow(
            page,
            collector,
            `${variant} resize segment ${segmentIndex} step ${index} -> ${width}px`
          );
          if (index === 0 || index === segment.length - 1 || width === 320) {
            await shot(
              page,
              width,
              `${variant}-resize-${segmentIndex}-${index}`
            );
          }
        }
        collector.assertClean();
      });
    }
  }

  const menuSegments = chunkSteps(
    planResizeSteps(1440, 320, 120),
    MENU_RESIZE_SEGMENT_SIZE
  );
  for (const [segmentIndex, segment] of menuSegments.entries()) {
    test(`menu stays valid while resizing with the menu open, segment ${segmentIndex}`, async ({
      page,
    }) => {
      const collector = createCollector();
      await openProfile(page, PROFILE_VARIANTS.claimed, segment[0]);
      const menu = profileStates.find(s => s.id === 'menu');
      if (!menu) throw new Error('menu profile state missing');
      await prepareProfileState(page, menu);
      for (const width of segment) {
        await page.setViewportSize({ width, height: SWEEP_HEIGHT });
        await settleViewport(page);
        collector.add(`menu open resize ${width}px`, await auditOverlay(page));
      }
      collector.assertClean();
    });
  }
});

test.describe('viewport sweep: golden-path public pages', () => {
  async function openGoldenPage(page: Page, routePath: string, width: number) {
    await installPublicRouteMocks(page);
    await page.setViewportSize({ width, height: SWEEP_HEIGHT });
    const response = await page.goto(routePath, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status(), `${routePath} status`).toBeLessThan(400);
    await settleViewport(page);
  }

  for (const route of GOLDEN_PATH_PAGES) {
    for (const width of GOLDEN_PATH_WIDTHS) {
      test(`${route.id} (${route.path}) at ${width}px`, async ({ page }) => {
        const collector = createCollector();
        await openGoldenPage(page, route.path, width);
        collector.add(
          `${route.id} ${width}px`,
          await auditViewport(page, { kind: 'page' })
        );
        await shot(page, width, `page-${route.id}`);
        collector.assertClean();
      });
    }

    const segments = chunkSteps(
      planResizeSteps(1440, 320, 160),
      GOLDEN_RESIZE_SEGMENT_SIZE
    );
    for (const [segmentIndex, segment] of segments.entries()) {
      test(`${route.id} (${route.path}) resize segment ${segmentIndex} without reload`, async ({
        page,
      }) => {
        const collector = createCollector();
        await openGoldenPage(page, route.path, segment[0]);
        for (const [index, width] of segment.entries()) {
          await page.setViewportSize({ width, height: SWEEP_HEIGHT });
          await settleViewport(page);
          collector.add(
            `${route.id} resize segment ${segmentIndex} ${width}px (${index})`,
            await auditViewport(page, { kind: 'page' })
          );
        }
        collector.assertClean();
      });
    }
  }
});
