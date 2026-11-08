import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import {
  inspectRouteDom,
  MARKETING_TASTE_FINDING_KINDS,
  type RouteDomFindingKind,
} from '../e2e/utils/route-dom-detector';
import { requireExactNavigationOrigin } from '../helpers/vercel-preview';

// Shared setup for route-dom-certification.spec.ts: run configuration, the
// marketing taste baseline, profile-state drivers and fixture builders.

export const profileRoute = '/unfazed';
export const outputRoot = path.resolve(
  process.env.ROUTE_DOM_CERTIFICATION_OUTPUT_DIR ??
    'test-results/route-dom-certification'
);
export const sourceGitSha =
  process.env.EXPECTED_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  'local-uncommitted';
export const deploymentId =
  process.env.EXPECTED_PRODUCTION_DEPLOYMENT_ID ?? null;
export const certificationScope =
  process.env.ROUTE_DOM_CERTIFICATION_SCOPE ?? 'all';

// Marketing taste kinds are ratcheted: existing routes may not exceed their
// recorded count per route/viewport/kind, and new routes start at zero.
// Regenerate after fixes with UPDATE_ROUTE_DOM_TASTE_BASELINE=1.
export const tasteBaselinePath = path.resolve(
  'tests/product-screenshots/route-dom-marketing-baseline.json'
);
export const tasteBaseline: Record<string, number> = JSON.parse(
  readFileSync(tasteBaselinePath, 'utf8')
);
export const updateTasteBaseline =
  process.env.UPDATE_ROUTE_DOM_TASTE_BASELINE === '1';
export const isTasteKind = (kind: string): boolean =>
  (MARKETING_TASTE_FINDING_KINDS as readonly string[]).includes(kind);

export const profileViewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

export const profileStates = [
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

export function safeName(value: string): string {
  return value.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
}

export async function writeSnapshot(
  relativePath: string,
  payload: unknown
): Promise<void> {
  const outputPath = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function exactBaseUrl(testInfo: TestInfo): string {
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

export async function prepareProfileState(
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

export async function expectDeliberateRed(
  page: Page,
  surface: 'marketing' | 'public-profile',
  kind: RouteDomFindingKind
): Promise<void> {
  const snapshot = await inspectRouteDom(page, { surface });
  expect(snapshot.findings.map(finding => finding.kind)).toContain(kind);
}

// Outcome-detector fixture media and sections.
export const svg = (inner: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">${inner}</svg>`)}`;
export const flatImg = svg('<rect width="600" height="400" fill="#0b0b0d"/>');
export const busyImg = svg(
  Array.from(
    { length: 40 },
    (_, i) =>
      `<rect x="${(i % 8) * 75}" y="${Math.floor(i / 8) * 80}" width="60" height="60" fill="hsl(${i * 9} 60% ${20 + (i % 5) * 12}%)"/>`
  ).join('')
);
export const axisSection = (align: string, attrs = '') =>
  `<section ${attrs} style="text-align:${align}"><h2>Heading ${align}</h2><p>A lede that is long enough to count as copy.</p></section>`;
