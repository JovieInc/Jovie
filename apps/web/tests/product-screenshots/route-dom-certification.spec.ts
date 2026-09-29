import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { MARKETING_EXACT_PUBLIC_ROUTE_TARGETS } from '@/data/marketing';
import { SCREENSHOT_VIEWPORTS } from '@/lib/screenshots/registry';
import {
  IMAGE_CONTRAST_CERTIFICATION_SCHEMA,
  inspectImageContrast,
} from '../e2e/utils/image-contrast-detector';
import { installPublicRouteMocks } from '../e2e/utils/public-surface-helpers';
import {
  inspectRouteDom,
  ROUTE_DOM_CERTIFICATION_SCHEMA,
  type RouteDomFindingKind,
} from '../e2e/utils/route-dom-detector';
import { waitForHydration } from '../e2e/utils/smoke-test-utils';
import {
  isExternalBaseUrl,
  primeOriginBoundVercelBypass,
  requireExactNavigationOrigin,
} from '../helpers/vercel-preview';

// Invariant consumer: JOV-INV-019.
// Canon evidence: certifies marketing routes and public-profile open states against the rendered DOM.
// Deliberate red: rejects overlap, text dumps, duplicate heroes, semantic duplicates, narrow sheets, clipped content, raw controls, and low image-aware contrast behind glyphs and header controls.

const profileRoute = '/unfazed';
const outputRoot = path.resolve(
  process.env.ROUTE_DOM_CERTIFICATION_OUTPUT_DIR ??
    'test-results/route-dom-certification'
);
const sourceGitSha =
  process.env.EXPECTED_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  'local-uncommitted';
const deploymentId = process.env.EXPECTED_PRODUCTION_DEPLOYMENT_ID ?? null;
const certificationScope = process.env.ROUTE_DOM_CERTIFICATION_SCOPE ?? 'all';

test.describe.configure({ retries: 0 });

const profileViewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const profileStates = [
  { id: 'menu', kind: 'drawer', trigger: 'Menu' },
  { id: 'share', kind: 'drawer-menuitem', trigger: 'Share Profile' },
  { id: 'pay', kind: 'drawer-menuitem', trigger: 'Pay' },
  { id: 'contact', kind: 'drawer-menuitem', trigger: 'Contact' },
  { id: 'credits', kind: 'drawer-menuitem', trigger: 'Release credits' },
  { id: 'tab-home', kind: 'tab', trigger: 'Home' },
  { id: 'tab-music', kind: 'tab', trigger: 'Music' },
  { id: 'tab-events', kind: 'tab', trigger: 'Events' },
  { id: 'tab-about', kind: 'tab', trigger: 'About' },
] as const;

function safeName(value: string): string {
  return value.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
}

async function writeSnapshot(
  relativePath: string,
  payload: unknown
): Promise<void> {
  const outputPath = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function exactBaseUrl(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== 'string') {
    throw new Error('Route DOM certification requires an exact baseURL.');
  }
  return requireExactNavigationOrigin(baseURL);
}

// Vaul hardcodes `transition: transform .5s cubic-bezier(...)` on
// [data-vaul-drawer] regardless of prefers-reduced-motion (emulateMedia
// above has no effect on it: it's a plain CSS transition the library sets
// itself, not one gated behind a media query). A `waitForTimeout` shorter
// than that leaves the sheet mid-slide when a screenshot-based check runs,
// and a slide is a real, uncomposited-color-shifting transform: the
// contrast detector's pixel sampling picked up a genuinely different,
// run-to-run-varying frame instead of the settled one. Poll the drawer's
// own transform until two consecutive reads agree instead of guessing a
// fixed delay.
async function waitForDrawerToSettle(page: Page): Promise<void> {
  const drawer = page.locator('[data-vaul-drawer]').first();
  if ((await drawer.count()) === 0) return;
  let previous: string | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await drawer.evaluate(el => getComputedStyle(el).transform);
    if (current === previous) return;
    previous = current;
    await page.waitForTimeout(50);
  }
}

async function prepareProfileState(
  page: Page,
  state: (typeof profileStates)[number]
): Promise<void> {
  if (state.kind === 'tab') {
    const tab = page.getByRole('button', { name: state.trigger, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-current', 'page');
    return;
  }

  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  await expect(page.getByTestId('profile-menu-drawer')).toBeVisible();
  await waitForDrawerToSettle(page);
  if (state.kind === 'drawer') return;

  await page
    .getByRole('menuitem', { name: state.trigger, exact: true })
    .click();
  if (state.id === 'credits') {
    await expect(page.getByRole('dialog', { name: 'Credits' })).toBeVisible();
    return;
  }
  await expect(page.getByTestId('profile-menu-drawer')).toBeVisible();
  // The secondary panel (e.g. Pay) is taller than the root menu list, so
  // Vaul re-measures and re-transitions the drawer's own height/transform a
  // second time here, independent of the settle-wait above.
  await waitForDrawerToSettle(page);
}

async function expectDeliberateRed(
  page: Page,
  surface: 'marketing' | 'public-profile',
  kind: RouteDomFindingKind
): Promise<void> {
  const snapshot = await inspectRouteDom(page, { surface });
  expect(snapshot.findings.map(finding => finding.kind)).toContain(kind);
}

test.describe('Route DOM detector deliberate-red fixtures', () => {
  test('reproduces R01 sibling overlap', async ({ page }) => {
    await page.setContent(
      '<main><section><h1>R01</h1><p>Overlap proposal</p></section><section style="position:relative;height:200px"><article style="position:absolute;inset:0 0 auto 0;height:100px">Card A</article><article style="position:absolute;inset:40px 0 auto 0;height:100px">Card B</article></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'unintended-overlap');
  });

  test('honors the explicit intentional-overlap opt-in', async ({ page }) => {
    await page.setContent(
      '<main><section><h1>Layered proof</h1><p>Intentional composition.</p></section><section style="position:relative;height:200px"><article data-overlap="intentional" style="position:absolute;inset:0 0 auto 0;height:100px">Card A</article><article data-overlap="intentional" style="position:absolute;inset:40px 0 auto 0;height:100px">Card B</article></section></main>'
    );
    const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
    expect(snapshot.findings.map(finding => finding.kind)).not.toContain(
      'unintended-overlap'
    );
  });

  test('rejects a below-hero text dump', async ({ page }) => {
    await page.setContent(
      '<main><section><h1>Product</h1><p>A concrete product story.</p><figure>Media</figure></section><section><h2>Wall of copy</h2><p>Only prose lives in this section.</p><ul><li>More prose</li></ul></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'text-dump-section');
  });

  test('reproduces the changelog double hero', async ({ page }) => {
    await page.setContent(
      `<main><section><h1>What Shipped</h1><p>The latest improvements from Jovie.</p></section><section><h2>What's New in Jovie</h2><p>Follow every product change.</p></section></main>`
    );
    await expectDeliberateRed(page, 'marketing', 'duplicate-hero');
  });

  test('rejects a CSS-hidden semantic alternate', async ({ page }) => {
    await page.setContent(
      '<main><section><h1>Canonical headline</h1><p>One canonical supporting argument.</p></section><section style="display:none"><h2>Canonical headline</h2><p>One canonical supporting argument.</p></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'semantic-duplicate');
  });

  test('rejects a fit-content profile sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(
      '<main data-testid="public-profile-layout-shell"><div data-testid="profile-compact-shell" style="position:relative;width:390px;height:844px"><dialog open aria-modal="true" style="width:185px;height:300px">Menu</dialog></div></main>'
    );
    await expectDeliberateRed(page, 'public-profile', 'container-width-sheet');
  });

  test('rejects unreachable clipped profile content', async ({ page }) => {
    await page.setContent(
      '<main data-testid="public-profile-layout-shell"><div class="h-fixed overflow-hidden" style="height:80px;overflow:hidden"><p style="margin-top:120px">Content below a fixed dock</p></div></main>'
    );
    await expectDeliberateRed(page, 'public-profile', 'unreachable-content');
  });

  test('rejects raw controls in product chrome', async ({ page }) => {
    await page.setContent(
      '<main data-testid="public-profile-layout-shell"><header><button type="button">Raw menu</button></header></main>'
    );
    await expectDeliberateRed(page, 'public-profile', 'raw-control');
  });

  // JOV-6916: text-aware-contrast deliberate-red. R01 painted a bright
  // upper-right corner exactly where the docked header renders Log in and
  // the primary CTA; light glyphs over that corner must reproduce red.
  test('reproduces the R01 bright header corner behind Log in and the CTA', async ({
    page,
  }) => {
    await page.setContent(
      '<main><div style="position:fixed;inset:0;background-image:linear-gradient(115deg,#050505 55%,#ffffff 55.5%)"></div><header style="position:fixed;top:0;left:0;right:0;display:flex;justify-content:flex-end;gap:24px;padding:20px"><a href="/signin" style="color:#ffffff;font-size:15px">Log in</a><a href="/start" style="color:#ffffff;font-size:15px">Get started</a></header><section style="margin-top:120px"><h1 style="color:#ffffff">R01 header corner</h1></section></main>'
    );
    const snapshot = await inspectImageContrast(page);
    expect(snapshot.schemaVersion).toBe(IMAGE_CONTRAST_CERTIFICATION_SCHEMA);
    expect(snapshot.findings.map(finding => finding.kind)).toContain(
      'image-contrast'
    );
    expect(snapshot.receipts.length).toBeGreaterThan(0);
  });

  test('emits passing receipts for glyphs over reserved dark imagery', async ({
    page,
  }) => {
    await page.setContent(
      '<main><div style="position:fixed;inset:0;background-image:linear-gradient(115deg,#050505 100%,#050505 100%)"></div><header style="position:fixed;top:0;left:0;right:0;display:flex;justify-content:flex-end;gap:24px;padding:20px"><a href="/signin" style="color:#ffffff;font-size:15px">Log in</a></header></main>'
    );
    const snapshot = await inspectImageContrast(page);
    expect(snapshot.findings).toEqual([]);
    expect(snapshot.receipts.length).toBeGreaterThan(0);
    expect(snapshot.receipts.every(receipt => receipt.pass)).toBe(true);
  });

  // JOV-INV-019 (2026-09-29): a real /unfazed pass surfaced three detector
  // false positives — none reflected what a sighted user actually sees.
  test('samples a nested override color and box instead of an interactive control that inherits a different one', async ({
    page,
  }) => {
    await page.setContent(
      '<main>' +
        '<div style="position:fixed;inset:0;background-image:linear-gradient(115deg,#ffffff 100%,#ffffff 100%)"></div>' +
        '<a href="/pay" style="position:relative;display:flex;height:44px;width:160px;align-items:center;justify-content:center;color:#ffffff">' +
        '<span style="display:flex;height:28px;width:140px;align-items:center;justify-content:center;border-radius:9999px;background:#050608;color:#f7f8f8">Pay $10</span>' +
        '</a>' +
        '</main>'
    );
    const snapshot = await inspectImageContrast(page);
    expect(snapshot.findings).toEqual([]);
    expect(snapshot.receipts.some(receipt => receipt.text === 'Pay $10')).toBe(
      true
    );
    expect(
      snapshot.receipts.every(
        receipt => receipt.text !== 'Pay $10' || receipt.pass
      )
    ).toBe(true);
  });

  test('excludes a visually hidden sr-only label from image-contrast candidates', async ({
    page,
  }) => {
    await page.setContent(
      '<main>' +
        '<div style="position:fixed;inset:0;background-image:linear-gradient(115deg,#ffffff 100%,#ffffff 100%)"></div>' +
        '<button aria-label="Home" style="position:relative;color:#ffffff">' +
        '<span style="position:absolute;width:1px;height:1px;overflow:hidden;white-space:nowrap;clip:rect(0,0,0,0)">Home</span>' +
        '<svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6" fill="currentColor"></circle></svg>' +
        '</button>' +
        '</main>'
    );
    const snapshot = await inspectImageContrast(page);
    expect(snapshot.findings.map(finding => finding.kind)).toContain(
      'image-contrast'
    );
    expect(
      snapshot.receipts.some(
        receipt => receipt.text === 'Home' && !receipt.pass
      )
    ).toBe(true);
  });

  test('excludes a candidate fully covered by a later opaque overlay', async ({
    page,
  }) => {
    await page.setContent(
      '<main>' +
        // A real dialog/drawer disables pointer-events on the page behind
        // it (Vaul/Radix scroll-lock + focus boundary), which also removes
        // it from elementsFromPoint's hit chain — this is what the fix
        // relies on, so the fixture must reproduce it, not just the
        // z-ordering.
        '<div style="position:fixed;inset:0;background-image:linear-gradient(115deg,#050505 100%,#050505 100%);pointer-events:none">' +
        '<span style="position:absolute;top:40px;left:20px;color:#f7f8f8;font-size:15px">Behind the sheet</span>' +
        '</div>' +
        '<div style="position:fixed;inset:0;background:#050608">Sheet content</div>' +
        '</main>'
    );
    const snapshot = await inspectImageContrast(page);
    expect(
      snapshot.receipts.some(receipt => receipt.text === 'Behind the sheet')
    ).toBe(false);
  });
});

test('certifies every marketing route and public-profile open state', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(30 * 60_000);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const baseUrl = exactBaseUrl(testInfo);
  const exactDeployment = isExternalBaseUrl(baseUrl);
  if (exactDeployment) {
    expect(
      sourceGitSha,
      'Production receipts require an exact source SHA'
    ).toMatch(/^[0-9a-f]{40}$/);
    await primeOriginBoundVercelBypass(context, baseUrl);
  }

  const receipts: Array<Record<string, string | number>> = [];

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const target of certificationScope === 'public-profile'
    ? []
    : MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
    for (const viewport of target.viewports) {
      await page.setViewportSize(SCREENSHOT_VIEWPORTS[viewport]);
      const response = await page.goto(target.fixturePath, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      expect.soft(response?.status(), target.url).toBeLessThan(400);
      await expect(
        page.locator(target.expectedRuntimeSelector).first()
      ).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(250);

      const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
      const imageContrast = await inspectImageContrast(page);
      const findings = [...snapshot.findings, ...imageContrast.findings];
      const snapshotPath = path.join(
        'marketing',
        `${safeName(target.url)}-${viewport}.json`
      );
      await writeSnapshot(snapshotPath, {
        schemaVersion: ROUTE_DOM_CERTIFICATION_SCHEMA,
        sourceGitSha,
        deploymentId,
        deploymentUrl: baseUrl,
        route: target.url,
        fixturePath: target.fixturePath,
        viewport,
        state: 'default',
        ...snapshot,
        findings,
        imageContrast,
      });
      receipts.push({
        route: target.url,
        viewport,
        state: 'default',
        snapshotPath,
        findingCount: findings.length,
      });
      expect.soft(findings, `${target.url} ${viewport}`).toEqual([]);
    }
  }

  for (const viewport of certificationScope === 'marketing'
    ? []
    : profileViewports) {
    for (const state of profileStates) {
      await page.setViewportSize(viewport);
      await installPublicRouteMocks(page);
      const response = await page.goto(profileRoute, {
        waitUntil: 'domcontentloaded',
        timeout: 90_000,
      });
      expect.soft(response?.status(), `${profileRoute} ${state.id}`).toBe(200);
      await waitForHydration(page);
      await expect(
        page.getByTestId('public-profile-layout-shell')
      ).toBeVisible();
      await prepareProfileState(page, state);
      // ProfileUnifiedDrawer.tsx cross-fades drawer views via Framer Motion
      // AnimatePresence (mode="wait": the outgoing view exits over 120ms,
      // then the incoming one enters over another 120ms) — a JS-driven
      // opacity animation the library runs unconditionally, not a CSS
      // transition/animation, so page.emulateMedia({reducedMotion: 'reduce'})
      // above has no effect on it. 150ms could still land mid cross-fade,
      // which for a state with brand-accent-colored content (e.g. the
      // selected-amount pill on Pay) blends its real background toward the
      // drawer's own dark surface and reads as a false low-contrast finding.
      // Clear both phases with margin.
      await page.waitForTimeout(400);

      const snapshot = await inspectRouteDom(page, {
        surface: 'public-profile',
      });
      const imageContrast = await inspectImageContrast(page);
      const findings = [...snapshot.findings, ...imageContrast.findings];
      const viewportId = `${viewport.width}x${viewport.height}`;
      const snapshotPath = path.join(
        'public-profile',
        `${viewportId}-${state.id}.json`
      );
      await writeSnapshot(snapshotPath, {
        schemaVersion: ROUTE_DOM_CERTIFICATION_SCHEMA,
        sourceGitSha,
        deploymentId,
        deploymentUrl: baseUrl,
        route: profileRoute,
        viewport: viewportId,
        state: state.id,
        ...snapshot,
        findings,
        imageContrast,
      });
      receipts.push({
        route: profileRoute,
        viewport: viewportId,
        state: state.id,
        snapshotPath,
        findingCount: findings.length,
      });
      expect
        .soft(findings, `${profileRoute} ${viewportId} ${state.id}`)
        .toEqual([]);
    }
  }

  await writeSnapshot('receipt.json', {
    schemaVersion: ROUTE_DOM_CERTIFICATION_SCHEMA,
    capturedAt: new Date().toISOString(),
    certificationMode: exactDeployment
      ? 'immutable-production-deployment'
      : 'local-production-build',
    deploymentUrl: baseUrl,
    deploymentId,
    sourceGitSha,
    routeCount: MARKETING_EXACT_PUBLIC_ROUTE_TARGETS.length,
    receipts,
  });
});
