import { readFileSync } from 'node:fs';
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
  installLayoutShiftObserver,
  MARKETING_TASTE_FINDING_KINDS,
  measureLayoutShift,
  ROUTE_DOM_CERTIFICATION_SCHEMA,
  type RouteDomFindingKind,
} from '../e2e/utils/route-dom-detector';
import { inspectShellMaterial } from '../e2e/utils/shell-material-detector';
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

// Marketing taste kinds are ratcheted: existing routes may not exceed their
// recorded count per route/viewport/kind, and new routes start at zero.
// Regenerate after fixes with UPDATE_ROUTE_DOM_TASTE_BASELINE=1.
const tasteBaselinePath = path.resolve(
  'tests/product-screenshots/route-dom-marketing-baseline.json'
);
const tasteBaseline: Record<string, number> = JSON.parse(
  readFileSync(tasteBaselinePath, 'utf8')
);
const updateTasteBaseline = process.env.UPDATE_ROUTE_DOM_TASTE_BASELINE === '1';
const isTasteKind = (kind: string): boolean =>
  (MARKETING_TASTE_FINDING_KINDS as readonly string[]).includes(kind);

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
  // Retry budget exhausted without two consecutive matching reads: surface
  // it instead of silently proceeding on a transform that may still be
  // moving, so a future flake here points straight at this wait rather than
  // back through the same false-positive investigation that added it.
  console.warn(
    `waitForDrawerToSettle: transform did not stabilize after 1s (last read: ${previous})`
  );
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
  // JOV-7710 / AM-017: one semantic level reads as one material.
  const plane = (inner: string) =>
    `<main id="main-content" style="width:1000px;height:600px;background:rgb(16,17,20)">${inner}</main>`;

  test('rejects an inset header strip on the main plane (JOV-7207)', async ({
    page,
  }) => {
    await page.setContent(
      plane(
        '<header style="height:40px;background:rgb(24,25,30)">Inbox</header><div style="height:400px">rows</div>'
      )
    );
    const report = await inspectShellMaterial(page);
    expect(report.findings.map(finding => finding.element)).toEqual(['header']);
  });

  test('rejects a boxed table region on the main plane', async ({ page }) => {
    await page.setContent(
      plane(
        '<div style="height:40px">Releases</div><div data-testid="boxed" style="width:900px;height:300px;background:rgba(255,255,255,0.03)">table</div>'
      )
    );
    const report = await inspectShellMaterial(page);
    expect(report.findings.map(finding => finding.element)).toEqual([
      'div[data-testid="boxed"]',
    ]);
  });

  test('passes controls and declared surfaces on one plane', async ({
    page,
  }) => {
    await page.setContent(
      plane(
        '<header style="height:40px;background:rgb(16,17,20)"><button style="width:80px;height:28px;background:rgb(60,60,70)">New</button></header><div role="menu" style="width:900px;height:200px;background:rgb(30,31,36)"><div style="width:880px;height:40px;background:rgb(40,41,46)">item</div></div><div style="width:900px;height:200px;background:transparent">table</div>'
      )
    );
    const report = await inspectShellMaterial(page);
    expect(report.plane).toBe('rgb(16 17 20)');
    expect(report.findings).toEqual([]);
  });

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

  // Marketing taste invariants — each fixture reproduces a shipped defect.
  test('rejects a card nested inside a card (/card preview)', async ({
    page,
  }) => {
    await page.setContent(
      '<main><section><h1>Card</h1><div style="border:1px solid #333;border-radius:24px;padding:20px;width:400px"><div style="border:1px solid #333;border-radius:16px;height:200px"><span style="border:1px solid #333;border-radius:999px">Preview</span></div></div></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'nested-decorative-surface');
  });

  test('rejects copy stranded outside any section (/card "Coming soon")', async ({
    page,
  }) => {
    await page.setContent(
      '<main><div><section><h1>Hero</h1><p>Lede copy for the hero.</p></section><p>Coming soon</p></div></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'stranded-text');
  });

  test('rejects a section heading larger than the h1', async ({ page }) => {
    await page.setContent(
      '<main><section><h1 style="font-size:56px">Hero</h1></section><section><h2 style="font-size:64px">Section</h2></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'heading-hierarchy-inversion');
  });

  test('rejects a line-clamped heading that hides text (/product CTA)', async ({
    page,
  }) => {
    await page.setContent(
      '<main><section><h2 style="width:200px;font-size:32px;line-height:1;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden">See what shows up when people search for you.</h2></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'clipped-heading');
  });

  test('rejects a clamped heading whose block size is also capped (/launch hero)', async ({
    page,
  }) => {
    await page.setContent(
      '<main><section><h1 style="width:520px;font-size:80px;line-height:0.94;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-block-size:calc(2 * 1lh);overflow:hidden">Your entire music career. One intelligent link.</h1></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'clipped-heading');
  });

  test('rejects an unstyled terminal CTA stack (/product footer CTA)', async ({
    page,
  }) => {
    await page.setContent(
      '<main><section style="width:1200px"><div><h2>See what shows up when people search for you.</h2><p style="max-width:400px;margin:0 auto">Claim your Jovie profile free.</p><div style="display:flex;justify-content:center"><a href="/start">Claim your Jovie</a></div></div></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'misaligned-text-stack');
  });

  test('rejects placeholder copy shipped as product', async ({ page }) => {
    await page.setContent(
      '<main><section><h1>Card</h1><figure><p>Your name</p></figure></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'placeholder-copy');
  });

  test('rejects a one-word last line in a headline', async ({ page }) => {
    await page.setContent(
      '<main><section><h1 style="font:20px/1.2 monospace;width:12ch">aa bb cc dd ee</h1></section></main>'
    );
    await expectDeliberateRed(page, 'marketing', 'orphaned-line');
  });

  test('passes a balanced headline', async ({ page }) => {
    await page.setContent(
      '<main><section><h1 style="font:20px/1.2 monospace;width:12ch;text-wrap:balance">aa bb cc dd ee</h1></section></main>'
    );
    const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
    expect(snapshot.findings.map(finding => finding.kind)).not.toContain(
      'orphaned-line'
    );
  });

  test('rejects missing layout-shift observation instead of certifying zero', async ({
    page,
  }) => {
    await page.setContent('<main><h1>Stable content</h1></main>');
    await expect(measureLayoutShift(page)).rejects.toThrow(
      'Layout-shift observation is unavailable'
    );
  });

  test('certifies an observed stable document', async ({ page }, testInfo) => {
    const fixtureUrl = new URL(
      '/__route-dom-fixture__/stable',
      exactBaseUrl(testInfo)
    ).href;
    await page.route(fixtureUrl, route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main><h1>Stable content</h1></main>',
      })
    );
    await installLayoutShiftObserver(page);
    await page.goto(fixtureUrl);
    expect(await measureLayoutShift(page)).toBeNull();
  });

  test('rejects cumulative layout shift over budget', async ({
    page,
  }, testInfo) => {
    const fixtureUrl = new URL(
      '/__route-dom-fixture__/shift',
      exactBaseUrl(testInfo)
    ).href;
    await page.route(fixtureUrl, route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<main><div id="late"></div><section style="height:600px"><h1>Hero</h1><p>Body copy that moves.</p></section></main><script>setTimeout(()=>{document.getElementById("late").style.height="400px"},300)</script>',
      })
    );
    await installLayoutShiftObserver(page);
    await page.goto(fixtureUrl);
    await page.waitForTimeout(600);
    const finding = await measureLayoutShift(page);
    expect(finding?.kind).toBe('layout-shift');
  });

  test('passes a composed, centered terminal CTA', async ({ page }) => {
    await page.setContent(
      '<main><section><h1 style="font-size:56px">Hero</h1><p>Lede copy for the hero.</p></section><section style="width:1200px"><div style="display:flex;flex-direction:column;align-items:center;text-align:center"><h2 style="font-size:48px">See what shows up.</h2><p>Claim your Jovie profile free.</p><div><a href="/start">Claim your Jovie</a></div></div></section></main>'
    );
    const snapshot = await inspectRouteDom(page, { surface: 'marketing' });
    expect(snapshot.findings).toEqual([]);
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
        // it (Vaul/Radix scroll-lock + focus boundary). The detector forces
        // pointer-events:auto for the duration of its own scan (see the
        // sibling test below), so this fixture's pointer-events:none isn't
        // what excludes it — the later, fully opaque "Sheet content" div
        // genuinely painting on top at this pixel is.
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

  test('still certifies a visible pointer-events:none candidate with nothing covering it', async ({
    page,
  }) => {
    // elementsFromPoint() is a hit-test API: pointer-events:none removes an
    // element from it even when nothing else is painted on top — it's used
    // deliberately for decorative/click-through overlays throughout the
    // product (42+ call sites), and none of them stop being visible glyphs.
    // Without forcing pointer-events:auto during the scan, this candidate
    // would be silently dropped from every check, not just the one above
    // where something genuinely covers it.
    await page.setContent(
      '<main>' +
        '<div style="position:fixed;inset:0;background-image:linear-gradient(115deg,#ffffff 100%,#ffffff 100%)">' +
        '<span style="position:absolute;top:40px;left:20px;color:#f5f5f5;font-size:15px;pointer-events:none">Click-through label</span>' +
        '</div>' +
        '</main>'
    );
    const snapshot = await inspectImageContrast(page);
    const receipt = snapshot.receipts.find(
      item => item.text === 'Click-through label'
    );
    expect(receipt).toBeDefined();
    expect(receipt?.pass).toBe(false);
    expect(snapshot.findings.map(finding => finding.kind)).toContain(
      'image-contrast'
    );
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
  const nextTasteBaseline: Record<string, number> = {};

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installLayoutShiftObserver(page);
  for (const target of certificationScope === 'public-profile'
    ? []
    : MARKETING_EXACT_PUBLIC_ROUTE_TARGETS) {
    for (const viewport of target.viewports) {
      // Release requests and renderer state after every viewport receipt.
      const page = await context.newPage();
      try {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await installLayoutShiftObserver(page);
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
        const layoutShift = await measureLayoutShift(page);
        const findings = [
          ...snapshot.findings,
          ...imageContrast.findings,
          ...(layoutShift ? [layoutShift] : []),
        ];
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
        const tasteCounts = new Map<string, number>();
        for (const finding of findings) {
          if (!isTasteKind(finding.kind)) continue;
          const key = `${target.url}|${viewport}|${finding.kind}`;
          tasteCounts.set(key, (tasteCounts.get(key) ?? 0) + 1);
        }
        for (const [key, count] of tasteCounts) nextTasteBaseline[key] = count;
        const overBaseline = [...tasteCounts]
          .filter(([key, count]) => count > (tasteBaseline[key] ?? 0))
          .map(
            ([key, count]) => `${key}: ${count} > ${tasteBaseline[key] ?? 0}`
          );
        expect
          .soft(
            findings.filter(finding => !isTasteKind(finding.kind)),
            `${target.url} ${viewport}`
          )
          .toEqual([]);
        if (!updateTasteBaseline) {
          expect
            .soft(overBaseline, `${target.url} ${viewport} taste ratchet`)
            .toEqual([]);
        }
      } finally {
        await page.close();
      }
    }
  }
  if (updateTasteBaseline && certificationScope !== 'public-profile') {
    await writeFile(
      tasteBaselinePath,
      `${JSON.stringify(
        Object.fromEntries(
          Object.entries(nextTasteBaseline).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        ),
        null,
        2
      )}\n`
    );
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

// JOV-7710 / AM-017: the composed app shell's main plane (header + route
// content) is one material. Ratcheted per route like the marketing taste
// kinds; regenerate after fixes with UPDATE_SHELL_MATERIAL_BASELINE=1.
const shellMaterialRoutes = [
  '/demo',
  '/demo/audience',
  '/demo/showcase/analytics',
  '/demo/showcase/earnings',
  '/demo/showcase/links',
  '/demo/showcase/releases',
  '/demo/showcase/settings',
  '/demo/showcase/release-tracked-links',
] as const;
const shellMaterialBaselinePath = path.resolve(
  'tests/product-screenshots/shell-material-baseline.json'
);

test('certifies a single-material main plane on composed shell routes', async ({
  page,
}, testInfo) => {
  test.skip(certificationScope === 'public-profile', 'profile-only scope');
  test.setTimeout(10 * 60_000);
  const baseUrl = exactBaseUrl(testInfo);
  const baseline: Record<string, number> = JSON.parse(
    readFileSync(shellMaterialBaselinePath, 'utf8')
  );
  const update = process.env.UPDATE_SHELL_MATERIAL_BASELINE === '1';
  const next: Record<string, number> = {};
  const receipts: Array<Record<string, string | number>> = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(SCREENSHOT_VIEWPORTS.desktop);
  for (const route of shellMaterialRoutes) {
    const response = await page.goto(route, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    expect.soft(response?.status(), route).toBeLessThan(400);
    await expect(page.locator('main#main-content')).toBeVisible({
      timeout: 30_000,
    });
    await waitForHydration(page);
    await page.waitForTimeout(500);
    const report = await inspectShellMaterial(page);
    expect.soft(report.plane, `${route} main plane`).not.toBeNull();
    const snapshotPath = `${safeName(route)}-desktop.json`;
    await writeSnapshot(path.join('shell', snapshotPath), {
      schemaVersion: ROUTE_DOM_CERTIFICATION_SCHEMA,
      sourceGitSha,
      deploymentUrl: baseUrl,
      route,
      viewport: 'desktop',
      state: 'default',
      plane: report.plane,
      findings: report.findings,
    });
    receipts.push({
      route,
      viewport: 'desktop',
      state: 'default',
      snapshotPath,
      findingCount: report.findings.length,
    });
    if (report.findings.length > 0) next[route] = report.findings.length;
    if (!update) {
      expect
        .soft(
          report.findings.length,
          `${route} nested surface materials: ${JSON.stringify(report.findings)}`
        )
        .toBeLessThanOrEqual(baseline[route] ?? 0);
    }
  }
  await writeSnapshot(path.join('shell', 'receipt.json'), {
    schemaVersion: ROUTE_DOM_CERTIFICATION_SCHEMA,
    capturedAt: new Date().toISOString(),
    certificationMode: 'local-production-build',
    deploymentUrl: baseUrl,
    deploymentId,
    sourceGitSha,
    routeCount: shellMaterialRoutes.length,
    receipts,
  });
  if (update) {
    await writeFile(
      shellMaterialBaselinePath,
      `${JSON.stringify(next, null, 2)}\n`
    );
  }
});
