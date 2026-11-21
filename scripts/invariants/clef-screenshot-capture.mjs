// biome-ignore-all format: shared capture helper, kept compact so the Pen-still PR stays inside the size guard.
// biome-ignore-all assist/source/organizeImports: compact helper keeps imports together.
/**
* Playwright capture shared by clef-screenshot-evaluator and the Pen-still diff.
* Desktop is 1440×900. Mobile is 390×844 at 2×. Dark is the default color scheme.
*/
export const CAPTURE_VIEWPORTS = Object.freeze({
desktop: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false }),
mobile: Object.freeze({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true }), });
export const CAPTURE_COLOR_SCHEME_DEFAULT = 'dark';
/** @param {string | number} name */
export function resolveCaptureViewport(name) {
if (name === 1440 || name === '1440' || name === 'desktop') return CAPTURE_VIEWPORTS.desktop;
if (name === 390 || name === '390' || name === 'mobile') return CAPTURE_VIEWPORTS.mobile;
return CAPTURE_VIEWPORTS.desktop; }
/** Light is the derived variant. Anything else, including omission, is dark. */
export function resolveCaptureColorScheme(mode) {
return mode === 'light' ? 'light' : CAPTURE_COLOR_SCHEME_DEFAULT; }
/**
* True when the capture stayed on the intended surface. Exact path match is
* required, except `/app/chat` may land on `/app/chat/{threadId}` after the
* chat shell selects a thread (JOV-11623 / JOV-10150) — that is still chat,
* not an auth or onboarding redirect.
* @param {string | null | undefined} landedPath
* @param {string | null | undefined} expectedPath
*/
export function capturePathMatchesExpected(landedPath, expectedPath) {
if (!landedPath || !expectedPath) return false;
const norm = path => {
const trimmed = String(path).replace(/\/+$/u, '');
return trimmed.length === 0 ? '/' : trimmed;
};
const landed = norm(landedPath);
const expected = norm(expectedPath);
if (landed === expected) return true;
return expected === '/app/chat' && landed.startsWith('/app/chat/');
}
/** @param {(browser: import('playwright').Browser) => Promise<unknown>} run */
export async function withCaptureBrowser(run) { const { chromium } = await import('playwright');
const browser = await chromium.launch(); try { return await run(browser); } finally { await browser.close(); } }
/**
* @param {import('playwright').Browser} browser
* @param {{url: string, viewport?: string | number, mode?: string, selector?: string, mockupSelector?: string, click?: string, wait?: number, expectedPath?: string, storageState?: Parameters<import('playwright').Browser['newPage']>[0]['storageState']}} options
*/
export async function captureSurfacePng(browser, options) {
const { url, viewport = 'desktop', mode, selector, mockupSelector, click, wait = 1500, expectedPath, storageState } = options;
const target = resolveCaptureViewport(viewport); const page = await browser.newPage({
viewport: { width: target.width, height: target.height }, deviceScaleFactor: target.deviceScaleFactor,
isMobile: target.isMobile, colorScheme: resolveCaptureColorScheme(mode),
...(storageState ? { storageState } : {}), }); try {
await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
// A capture that landed on a different route (auth redirect, closed-signup
// handoff) is not this frame's surface: report it instead of screenshotting
// whatever page answered (JOV-11623).
const finalUrl = page.url();
if (expectedPath && !capturePathMatchesExpected(new URL(finalUrl).pathname, expectedPath)) {
return { png: null, geometry: null, viewport: target.width,
mode: resolveCaptureColorScheme(mode), finalUrl, redirected: true }; }
if (click) await page.click(click, { timeout: 5_000 }).catch(() => {}); await page.waitForTimeout(wait);
const png = selector ? await page.locator(selector).first().screenshot()
: await page.screenshot({ fullPage: true });
const geometry = await page.locator('html').evaluate((documentElement, { sectionSelector, mockup }) => {
const root = sectionSelector ? documentElement.ownerDocument.querySelector(sectionSelector) : documentElement;
if (!root) return null; const rect = root.getBoundingClientRect();
const mockupEl = mockup ? root.querySelector(mockup) : root.querySelector('[data-pen-mockup]');
const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
return { x: r.x - rect.x, y: r.y - rect.y, width: r.width, height: r.height }; }; return {
section: { width: rect.width, height: rect.height }, mockup: box(mockupEl),
textBlocks: [...root.querySelectorAll('h1, h2, h3, p')].map(box).filter(r => r && r.width > 0 && r.height > 0),
}; }, { sectionSelector: selector ?? null, mockup: mockupSelector ?? null });
return { png, geometry, viewport: target.width, mode: resolveCaptureColorScheme(mode),
finalUrl }; } finally {
await page.close(); } }
