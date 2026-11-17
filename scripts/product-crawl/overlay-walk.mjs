// Interaction walks for the product crawl (JOV-12386). After the page loads,
// the crawl re-opens a few pages that have a shell sidebar or hover triggers
// and walks the sequences that leave an overlay behind: peek the sidebar open
// and let it collapse, raise a tooltip and collapse the sidebar under it,
// resize to phone and back, press Escape, navigate away. After every step it
// asks orphaned-overlays.mjs what is still on screen without an anchor.
//
// Read-only against production: it hovers, presses Escape, resizes, and
// follows one same-origin link to a page the crawl already loaded. It never
// submits, signs in or types. The sidebar is unpinned through its cookie in
// this browser context only; nothing is stored for the account.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pickWalkTargets, safePaths } from './overlay-targets.mjs';

export {
  MAX_WALKS_PER_IDENTITY,
  pickWalkTargets,
  safePaths,
} from './overlay-targets.mjs';

import { findOrphanedOverlays, orphanKey } from './orphaned-overlays.mjs';

// The shell's hover-to-peek sidebar, and anything that opens a layer on
// hover (a Radix tooltip or hover-card trigger is closed, focusable, and
// carries no aria-expanded). Matched on state, not on component names.
export const RAIL = '[data-rail-preview-region="left"]';
export const HOVERABLE =
  ':is(button,a,[role="button"],[tabindex])[data-state="closed"]:not([aria-expanded]):not([aria-haspopup])';
const LAYERS =
  '[role="tooltip"],[role="menu"],[role="listbox"],[role="dialog"],[data-radix-popper-content-wrapper]';
/** Evaluated on every crawled page: is there anything here to walk? */
export const SURFACE = `({
  rail: Boolean(document.querySelector('${RAIL}')),
  hoverables: document.querySelectorAll('${HOVERABLE}').length })`;

export const DESKTOP = { width: 1440, height: 900 };
export const PHONE = { width: 390, height: 844 };
export const MAX_RAIL_TRIGGERS = 12;
const SETTLE_MS = 500; // past the rail's grace and a tooltip's exit
const RECHECK_MS = 700; // an orphan must still be there on a second look
const MAX_SHOTS = 3;
// A load can consume 30s, followed by 2.5s hydration and the first check.
const WALK_START_RESERVE_MS = 35_000;
const deadlineError = () =>
  Object.assign(new Error('crawl deadline reached'), {
    code: 'CRAWL_DEADLINE',
  });

/**
 * Walk one loaded page. `page` is a Playwright page at desktop size.
 * @param {any} page
 * @param {{ safe?: string[], shot?: (name: string) => Promise<string | null>,
 *   deadlineEpochMs?: number, now?: () => number, pastDeadline?: () => boolean,
 *   onStep?: (step: any) => void }} [opts]
 */
export async function walkPage(
  page,
  {
    safe = [],
    shot,
    deadlineEpochMs = Infinity,
    now = Date.now,
    pastDeadline = () => false,
    onStep,
  } = {}
) {
  /** @type {any[]} */
  const steps = [];
  let trail = [];
  let sequence = '';
  let shots = 0;
  const reported = new Set();
  const timeLeft = (needed = 0) => {
    const left = deadlineEpochMs - now();
    if (pastDeadline() || left <= needed) throw deadlineError();
    return left;
  };
  const timeout = ms => Math.max(1, Math.min(ms, timeLeft()));
  const wait = async ms => {
    timeLeft(ms);
    await page.waitForTimeout(ms);
    timeLeft();
  };
  const openLayers = () =>
    page.evaluate(sel => document.querySelectorAll(sel).length, LAYERS);
  const check = async step => {
    trail.push(step);
    await wait(SETTLE_MS);
    let orphans = (await page.evaluate(findOrphanedOverlays)).filter(
      o => !reported.has(orphanKey(o))
    );
    if (orphans.length) {
      await wait(RECHECK_MS);
      const still = new Set(
        (await page.evaluate(findOrphanedOverlays)).map(orphanKey)
      );
      const unique = new Set();
      orphans = orphans.filter(o => {
        const key = orphanKey(o);
        if (!still.has(key) || unique.has(key)) return false;
        unique.add(key);
        return true;
      });
    }
    /** @type {any} */
    const entry = { sequence, step, open: await openLayers() };
    if (orphans.length) {
      entry.orphans = orphans;
      for (const orphan of orphans) reported.add(orphanKey(orphan));
      entry.trail = [...trail];
      if (shot && shots < MAX_SHOTS) {
        timeLeft();
        shots += 1;
        entry.screenshot = await shot(`${sequence}-${steps.length}`);
      }
    }
    steps.push(entry);
    onStep?.(entry);
  };
  const neutral = () => {
    timeLeft();
    return page.mouse.move(DESKTOP.width * 0.55, DESKTOP.height * 0.5);
  };
  const begin = async name => {
    sequence = name;
    trail = [];
    await page.keyboard.press('Escape', { timeout: timeout(5000) });
    await neutral();
    await wait(300);
  };
  /** 'peek' when hover opened it, 'pinned', 'no-peek', or 'none'. */
  const openRail = async () => {
    timeLeft();
    const rail = page.locator(RAIL).first();
    if (!(await rail.isVisible().catch(() => false))) {
      timeLeft();
      return 'none';
    }
    if ((await rail.getAttribute('data-rail-pinned')) === 'true')
      return 'pinned';
    await rail
      .hover({ position: { x: 12, y: 300 }, timeout: timeout(3000) })
      .catch(() => {});
    return page
      .waitForSelector(`${RAIL}[data-rail-preview]`, { timeout: timeout(2000) })
      .then(() => 'peek')
      .catch(() => 'no-peek');
  };
  /** Hover visible triggers until one raises a layer; its index, or -1. */
  const raise = async (scope, from = 0, tries = 6) => {
    const triggers = page.locator(
      `${scope ? `${scope} ` : ''}${HOVERABLE}:visible`
    );
    const count = await triggers.count();
    for (let i = from; i < Math.min(count, from + tries); i += 1) {
      timeLeft();
      const before = await openLayers();
      const hit = await triggers
        .nth(i)
        .hover({ timeout: timeout(1500) })
        .then(() =>
          page.waitForFunction(
            ([sel, n]) => document.querySelectorAll(sel).length > n,
            [LAYERS, before],
            { timeout: timeout(1500) } // past a tooltip's open delay
          )
        )
        .then(() => true)
        .catch(() => false);
      timeLeft();
      if (hit) return i;
    }
    return -1;
  };
  /** Sidebar open (when there is one) with a layer raised from it. */
  const overlayUp = async () => {
    const rail = await openRail();
    if (rail !== 'none') trail.push('hover-open sidebar');
    const inRail = rail === 'none' ? -1 : await raise(RAIL);
    const hit = inRail >= 0 ? inRail : await raise('');
    if (hit >= 0) await check('hover tooltip trigger');
    return hit >= 0;
  };

  let rail = 'none';
  let opened = 0;
  let error;
  let stoppedForTime = false;
  try {
    await begin('sidebar-peek');
    rail = await openRail();
    // A pinned sidebar stays put; only a peeked one collapses under the layer.
    const leave = rail === 'peek' ? 'collapse sidebar' : 'pointer leaves';
    if (rail !== 'none') {
      await check('hover-open sidebar');
      await neutral();
      await check(leave);
    }

    // The founder's sequence, once per trigger inside the open sidebar.
    if (rail !== 'none')
      for (let from = 0; from < MAX_RAIL_TRIGGERS; ) {
        await begin('tooltip-then-collapse');
        if ((await openRail()) !== 'none') trail.push('hover-open sidebar');
        const hit = await raise(RAIL, from, MAX_RAIL_TRIGGERS - from);
        if (hit < 0) break;
        opened += 1;
        await check('hover tooltip trigger');
        await neutral();
        await check(leave);
        from = hit + 1;
      }

    await begin('resize');
    if (await overlayUp()) {
      opened += 1;
      timeLeft();
      await page.setViewportSize(PHONE);
      await check('resize to phone');
      timeLeft();
      await page.setViewportSize(DESKTOP);
      await check('resize to desktop');
    }

    await begin('escape');
    if (await overlayUp()) {
      opened += 1;
      await page.keyboard.press('Escape', { timeout: timeout(5000) });
      await check('press Escape');
    }

    // Last, because it leaves the page. The link is followed without moving
    // the pointer, so the layer is still up when the route changes.
    await begin('navigate-away');
    if (await overlayUp()) {
      opened += 1;
      timeLeft();
      const went = await page.evaluate(
        ([safe, railSel]) => {
          const ok = a =>
            a.origin === location.origin &&
            a.pathname !== location.pathname &&
            a.target !== '_blank' &&
            safe.includes(a.pathname);
          /** @type {any[]} */
          const links = [...document.querySelectorAll('a[href]')];
          const link =
            links.find(a => ok(a) && a.closest(railSel)) ?? links.find(ok);
          link?.click();
          return link?.pathname ?? null;
        },
        [safe, RAIL]
      );
      if (went) {
        await page
          .waitForURL(u => u.pathname === went, { timeout: timeout(8000) })
          .catch(() => {});
        await check(`navigate away to ${went}`);
      }
    }
  } catch (e) {
    // Keep the steps walked so far; the receipt names where it stopped.
    stoppedForTime =
      e?.code === 'CRAWL_DEADLINE' ||
      pastDeadline() ||
      now() >= deadlineEpochMs;
    if (!stoppedForTime)
      error = `${sequence}: ${String(e?.message || e).split('\n')[0]}`.slice(
        0,
        200
      );
  }
  return {
    rail,
    opened,
    steps,
    ...(stoppedForTime ? { stoppedForTime: true } : {}),
    ...(error ? { error } : {}),
  };
}

/**
 * Walk the picked pages, three at a time. Never throws: a walk that could
 * not run is recorded with its error so the receipt still shows the gap.
 * @param {{ pages: any[], origin: string, out: string,
 *   openContext: (job: { viewport: string, identity: string }) => Promise<any>,
 *   pastDeadline?: () => boolean, deadlineEpochMs?: number, now?: () => number,
 *   skip?: (route: string) => boolean,
 *   max?: number }} opts
 */
export async function runOverlayWalks({
  pages,
  origin,
  out,
  openContext,
  pastDeadline = () => false,
  deadlineEpochMs = Infinity,
  now = Date.now,
  skip,
  max,
}) {
  const targets = pickWalkTargets(pages, { max });
  const dir = join(out, 'overlay-walk');
  if (targets.length) await mkdir(dir, { recursive: true });
  const walkOne = async (target, n) => {
    /** @type {any} */
    const walk = { ...target, viewport: 'desktop', steps: [] };
    let ctx;
    let closing;
    let closeConfirmed = false;
    let expired = false;
    let timer;
    const close = () => {
      if (!ctx) return Promise.resolve();
      if (!closing) {
        walk.cleanupPending = true;
        closing = Promise.resolve()
          .then(() => ctx.close())
          .then(() => {
            closeConfirmed = true;
            delete walk.cleanupPending;
          })
          .catch(error => {
            walk.cleanupError = String(error?.message || error)
              .split('\n')[0]
              .slice(0, 200);
          });
      }
      return closing;
    };
    const timeLeft = () => {
      if (expired || pastDeadline() || now() >= deadlineEpochMs)
        throw deadlineError();
      return deadlineEpochMs - now();
    };
    const work = async () => {
      try {
        ctx = await openContext({
          viewport: 'desktop',
          identity: target.identity,
        });
        // A late context creation must close without starting any requests.
        timeLeft();
        // Unpinned, so hover peeks the sidebar open. This context's jar only.
        await ctx.addCookies([
          { name: 'sidebar:state', value: 'false', url: origin },
        ]);
        timeLeft();
        const page = await ctx.newPage();
        timeLeft();
        page.setDefaultTimeout(Math.max(1, Math.min(5000, timeLeft())));
        await page.goto(new URL(target.url, origin).href, {
          waitUntil: 'load',
          timeout: Math.max(1, Math.min(30_000, timeLeft())),
        });
        if (timeLeft() <= 2500) throw deadlineError();
        await page.waitForTimeout(2500); // hydrate before hovering
        timeLeft();
        const shot = async name => {
          const file = `${String(n).padStart(2, '0')}-${name}.png`;
          return page
            .screenshot({
              path: join(dir, file),
              timeout: Math.max(1, Math.min(5000, timeLeft())),
            })
            .then(() => `overlay-walk/${file}`)
            .catch(() => null);
        };
        Object.assign(
          walk,
          await walkPage(page, {
            safe: safePaths(pages, target.identity, skip),
            shot,
            deadlineEpochMs,
            now,
            pastDeadline: () => expired || pastDeadline(),
            onStep: step => walk.steps.push(step),
          })
        );
      } catch (e) {
        if (
          e?.code === 'CRAWL_DEADLINE' ||
          expired ||
          pastDeadline() ||
          now() >= deadlineEpochMs
        )
          walk.stoppedForTime = true;
        else
          walk.error = String(e?.message || e)
            .split('\n')[0]
            .slice(0, 200);
      } finally {
        await close();
      }
    };
    // One deadline alarm per active context, not another polling clock.
    const deadline = Number.isFinite(deadlineEpochMs)
      ? new Promise(resolve => {
          timer = setTimeout(
            () => {
              expired = true;
              walk.stoppedForTime = true;
              if (!closeConfirmed) walk.cleanupPending = true;
              // Request cancellation once. A stuck browser must not also
              // prevent the crawl from writing its incomplete receipt.
              void close();
              resolve(undefined);
            },
            Math.max(0, deadlineEpochMs - now())
          );
        })
      : null;
    try {
      const running = work();
      if (deadline) await Promise.race([running, deadline]);
      else await running;
    } finally {
      clearTimeout(timer);
      if (expired) void close();
      else await close();
    }
    return walk;
  };
  const walks = [];
  const skipped = [];
  for (let i = 0; i < targets.length; i += 3) {
    if (pastDeadline() || deadlineEpochMs - now() < WALK_START_RESERVE_MS) {
      skipped.push(
        ...targets.slice(i).map(target => ({
          ...target,
          viewport: 'desktop',
          reason: 'deadline',
        }))
      );
      break;
    }
    walks.push(
      ...(await Promise.all(
        targets.slice(i, i + 3).map((t, k) => walkOne(t, i + k))
      ))
    );
  }
  return { walks, left: skipped.length, skipped };
}

/**
 * One summary line: how much the walks really exercised, and what they
 * could not reach, so a quiet result is not read as full coverage.
 * @param {{ walks: any[], left: number }} result @param {boolean} signedIn
 */
export function overlayWalkSummary({ walks, left }, signedIn) {
  const n = f => walks.filter(f).length;
  const gaps = [
    n(w => w.stoppedForTime) &&
      `${n(w => w.stoppedForTime)} stopped at the deadline`,
    n(w => w.error) && `${n(w => w.error)} stopped on an error`,
    n(w => w.cleanupPending) &&
      `${n(w => w.cleanupPending)} context cleanups not confirmed`,
    left && `${left} not walked before the deadline`,
    !signedIn && 'the app shell sidebar was not walked (no signed-in session)',
  ].filter(Boolean);
  return `Overlay walks: ${walks.length} pages (${n(w => w.rail === 'peek')} peeked the sidebar open, ${n(w => w.opened > 0)} raised an overlay), ${walks.reduce((sum, w) => sum + (w.steps?.length ?? 0), 0)} steps checked${gaps.length ? `; ${gaps.join('; ')}` : ''}.`;
}
