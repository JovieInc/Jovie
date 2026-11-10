/**
 * JOV-5489: deterministic golden-path keyframes for visual review.
 *
 * Each keyframe is a fixed-viewport screenshot (animations disabled) plus a
 * deterministic in-page layout audit taken at the same instant (reviewer B).
 * Enabled only when GOLDEN_PATH_KEYFRAME_DIR is set, so ordinary runs are
 * untouched. Manifest: one JSON line per keyframe in <dir>/manifest.jsonl.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const GOLDEN_PATH_KEYFRAME_SCHEMA = 'jovie.golden-path-keyframe/v1';

export interface LayoutAudit {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly overflowPx: number;
  readonly offscreenInteractive: readonly string[];
  readonly smallTargets: readonly string[];
  readonly brokenImages: readonly string[];
}

export interface KeyframeRecord {
  readonly schema: typeof GOLDEN_PATH_KEYFRAME_SCHEMA;
  readonly id: string;
  readonly sequence: number;
  readonly url: string;
  readonly file: string;
  readonly sha256: string;
  /** Expected fixture identity, independent of the text rendered by the page. */
  readonly expectedArtistName?: string;
  readonly audit: LayoutAudit;
  readonly pageErrors: readonly string[];
  /** Public homepage proof, sampled on both sides of the screenshot bytes. */
  readonly homePreview?: {
    readonly before: HomePreviewAudit;
    readonly after: HomePreviewAudit;
  };
}

export interface HomePreviewAudit {
  /** Endpoint state; neither occlusion nor the exact PNG instant is inferred. */
  readonly status: 'ready' | 'loading' | 'error' | 'missing' | 'hidden';
  readonly scenario: 'template-profile-live-mobile';
  readonly selectedCopy: {
    readonly headline: string;
    readonly subhead: string;
  };
  readonly frameStatus: string | null;
  readonly image: {
    readonly resource: 'expected' | 'unexpected' | 'missing';
    readonly complete: boolean;
    readonly naturalWidth: number;
    readonly naturalHeight: number;
  };
  readonly geometry: {
    readonly viewport: { readonly width: number; readonly height: number };
    readonly scroll: { readonly x: number; readonly y: number };
    readonly ancestors: readonly {
      readonly tag: string;
      readonly box: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      };
      readonly display: string;
      readonly visibility: string;
      readonly opacity: string;
      readonly contentVisibility: string;
      readonly transform: string;
    }[];
  };
}

/** Plain JS: no transpiler helpers, URLs, or account data enter this public proof. */
export const HOME_PREVIEW_AUDIT_SOURCE = `(() => {
  const proof = document.querySelector('[data-testid="homepage-hero-proof"]');
  const frame = proof && proof.querySelector('[data-testid="product-screenshot-frame-template-profile-live-mobile"]');
  const image = frame && frame.querySelector('img');
  const frameStatus = frame ? frame.getAttribute('data-status') : null;
  let resource = 'missing';
  if (image) {
    resource = 'unexpected';
    try {
      const url = new URL(image.currentSrc || image.src, location.href);
      if (url.origin === location.origin && !url.username && !url.password && url.pathname === '/product-screenshots/template-profile-live-phone.png') resource = 'expected';
    } catch {}
  }
  const ancestors = [];
  let hidden = false;
  for (let el = image || frame || proof; el && ancestors.length < 12; el = el.parentElement) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    hidden ||= style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0 || style.contentVisibility === 'hidden' || rect.width <= 0 || rect.height <= 0;
    ancestors.push({ tag: el.tagName, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, display: style.display, visibility: style.visibility, opacity: style.opacity, contentVisibility: style.contentVisibility, transform: style.transform });
    if (el === document.body) break;
  }
  const complete = image instanceof HTMLImageElement && image.complete;
  const naturalWidth = image instanceof HTMLImageElement ? image.naturalWidth : 0;
  const naturalHeight = image instanceof HTMLImageElement ? image.naturalHeight : 0;
  const status = !proof || !frame ? 'missing' : frameStatus === 'error' ? 'error' : !image ? 'missing' : complete && naturalWidth === 0 ? 'error' : hidden ? 'hidden' : frameStatus !== 'loaded' || !complete || !naturalWidth || !naturalHeight ? 'loading' : 'ready';
  return {
    status, scenario: 'template-profile-live-mobile', frameStatus,
    selectedCopy: { headline: (document.querySelector('[data-hero-canvas] h1')?.textContent || '').slice(0, 500), subhead: (document.querySelector('.homepage-hero-canvas__subhead')?.textContent || '').slice(0, 500) },
    image: { resource, complete, naturalWidth, naturalHeight },
    geometry: { viewport: { width: innerWidth, height: innerHeight }, scroll: { x: scrollX, y: scrollY }, ancestors },
  };
})()`;

export interface EssentialViewportAudit {
  readonly supported: boolean;
  readonly findings: readonly {
    readonly selector: string;
    readonly reason: 'missing' | 'duplicate' | 'clipped' | 'occluded';
    readonly box?: {
      readonly left: number;
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
    };
  }[];
}

/**
 * Wait until the element's rect and every ancestor's client box stop moving.
 * The composer surface uses Motion layout="size", so a draft change (for
 * example clearing a multi-line starter) tweens its height; auditing mid-tween
 * reads a fractional, clipped box that is not a layout defect. This waits for
 * the motion to finish and never relaxes the geometry assertion itself.
 */
export async function waitForStableGeometry(
  page: Page,
  selector: string,
  { frames = 12, timeout = 5_000 } = {}
): Promise<void> {
  await page.waitForFunction(
    ({ selector, frames }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const w = window as unknown as {
        __geometryStable?: { key: string; count: number; seen: boolean };
      };
      const parts: string[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const r = node.getBoundingClientRect();
        parts.push(
          [r.left, r.top, r.width, r.height, node.clientHeight]
            .map(n => n.toFixed(2))
            .join(',')
        );
      }
      const key = parts.join('|');
      const state = w.__geometryStable;
      if (!state || state.key !== key) {
        w.__geometryStable = { key, count: 0, seen: true };
        return false;
      }
      state.count += 1;
      return state.count >= frames;
    },
    { selector, frames },
    { polling: 'raf', timeout }
  );
}

/**
 * State-specific actions only: transcript/list items may legitimately scroll.
 * Optional states are selected and audited in the same browser snapshot.
 */
export async function inspectEssentialViewport(
  page: Page,
  selectors: readonly string[],
  optionalSelectors: readonly string[] = []
): Promise<EssentialViewportAudit> {
  // Plain JS avoids transpiler helpers in serialized browser functions.
  return page.evaluate(`((selectors, optionalSelectors) => {
    const viewport = window.visualViewport;
    if (!viewport) return { supported: false, findings: [] };
    const findings = [];
    const visible = el => {
      if (!el.getClientRects().length) return false;
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    // Preserve locator.isVisible() selection: opacity zero still has a layout
    // box, so it must reach the strict painted-visibility audit and fail below.
    const rendered = el => {
      if (!el.getClientRects().length) return false;
      if (el.checkVisibility && !el.checkVisibility()) return false;
      if (getComputedStyle(el).visibility !== 'visible') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    for (const selector of new Set([...selectors, ...optionalSelectors])) {
      const candidates = Array.from(document.querySelectorAll(selector));
      if (!selectors.includes(selector) && !candidates.some(rendered)) continue;
      const matches = candidates.filter(visible);
      if (matches.length !== 1) {
        findings.push({ selector, reason: matches.length ? 'duplicate' : 'missing' });
        continue;
      }
      const el = matches[0];
      const rect = el.getBoundingClientRect();
      const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      let left = viewport.offsetLeft, top = viewport.offsetTop;
      let right = left + viewport.width, bottom = top + viewport.height;
      for (let node = el.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const clip = node.getBoundingClientRect();
        // Motion's composer layout projection scales viewport bounds, while
        // client dimensions and borders stay in layout pixels. Convert the
        // clip's client box into the same coordinates as the control's rect.
        const scaleX = node.offsetWidth > 0 ? clip.width / node.offsetWidth : 1;
        const scaleY = node.offsetHeight > 0 ? clip.height / node.offsetHeight : 1;
        if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
          left = Math.max(left, clip.left + node.clientLeft * scaleX);
          right = Math.min(right, clip.left + (node.clientLeft + node.clientWidth) * scaleX);
        }
        if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
          top = Math.max(top, clip.top + node.clientTop * scaleY);
          bottom = Math.min(bottom, clip.top + (node.clientTop + node.clientHeight) * scaleY);
        }
      }
      if (rect.width <= 0 || rect.height <= 0 || rect.left < left - 1 || rect.top < top - 1 || rect.right > right + 1 || rect.bottom > bottom + 1) {
        findings.push({ selector, reason: 'clipped', box });
        continue;
      }
      const x = (rect.left + rect.right) / 2, y = (rect.top + rect.bottom) / 2;
      const points = [[x,y], [rect.left + 1,y], [rect.right - 1,y], [x,rect.top + 1], [x,rect.bottom - 1]];
      // elementFromPoint skips pointer-events:none, so a painted status pill
      // looks occluded by whatever sits underneath it. Sample with the target
      // hit-testable, then restore. A real cover still wins.
      const occludedAt = (px, py) => {
        const previous = el.style.pointerEvents;
        el.style.pointerEvents = 'auto';
        let hit;
        try {
          hit = document.elementFromPoint(px, py);
        } finally {
          el.style.pointerEvents = previous;
        }
        return !hit || (hit !== el && !el.contains(hit));
      };
      if (points.some(([px,py]) => occludedAt(px, py))) findings.push({ selector, reason: 'occluded', box });
    }
    return { supported: true, findings };
  })(${JSON.stringify(selectors)}, ${JSON.stringify(optionalSelectors)})`);
}

const pageErrors = new WeakMap<Page, string[]>();
let sequence = 0;

// Attribute only inspected static API routes. Unknown paths can contain
// credentials or account identifiers, even after removing query and fragment.
const KEYFRAME_RESOURCE_PATHS = new Set([
  '/api/analytics/navigation',
  '/api/chat/usage',
  '/api/billing/status',
  '/api/onboarding/conversation',
  '/api/spotify/search',
]);

function keyframeResourcePath(
  resourceUrl: string,
  pageUrl: string
): string | null {
  try {
    // No base URL: relative and malformed locations must fail closed.
    const resource = new URL(resourceUrl);
    const page = new URL(pageUrl);
    return (resource.protocol === 'http:' || resource.protocol === 'https:') &&
      resource.origin === page.origin &&
      KEYFRAME_RESOURCE_PATHS.has(resource.pathname)
      ? resource.pathname
      : null;
  } catch {
    return null;
  }
}

function trackErrors(page: Page): string[] {
  let errors = pageErrors.get(page);
  if (!errors) {
    errors = [];
    pageErrors.set(page, errors);
    const list = errors;
    page.on('pageerror', error => list.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text().slice(0, 300);
      const resource = keyframeResourcePath(message.location().url, page.url());
      list.push(resource ? `${text} [resource: ${resource}]` : text);
    });
  }
  return errors;
}

/**
 * Runs in the browser. Plain JavaScript source on purpose: TS transpilers
 * (esbuild keepNames) inject helpers such as __name into serialized function
 * bodies, which do not exist in the page and make page.evaluate throw.
 */
export const LAYOUT_AUDIT_SOURCE = `(() => {
  const describe = el => {
    const label = el.getAttribute('aria-label') || el.getAttribute('data-testid') || (el.textContent || '').trim().slice(0, 40);
    return el.tagName.toLowerCase() + ' "' + label + '"';
  };
  const insideScroller = el => {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true;
    }
    return false;
  };
  const visible = el => {
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
  };
  const width = window.innerWidth;
  const interactive = Array.from(document.querySelectorAll(
    'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea'
  )).filter(visible);
  const offscreenInteractive = interactive.filter(el => {
    const box = el.getBoundingClientRect();
    return (box.right > width + 1 || box.left < -1) && getComputedStyle(el).position !== 'fixed' && !insideScroller(el);
  }).map(describe);
  // WCAG 2.2 SC 2.5.8: inline links inside running text are exempt.
  const smallTargets = interactive.filter(el => {
    const box = el.getBoundingClientRect();
    if (box.width >= 24 && box.height >= 24) return false;
    return getComputedStyle(el).display !== 'inline';
  }).map(el => {
    const box = el.getBoundingClientRect();
    return describe(el) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height);
  });
  const brokenImages = Array.from(document.images)
    .filter(img => img.complete && img.naturalWidth === 0 && visible(img))
    .map(img => (img.currentSrc || img.src).slice(0, 160));
  const scrollWidth = document.scrollingElement ? document.scrollingElement.scrollWidth : width;
  return {
    viewport: { width, height: window.innerHeight },
    overflowPx: Math.max(0, scrollWidth - width),
    offscreenInteractive,
    smallTargets,
    brokenImages,
  };
})()`;

/**
 * Runs in the browser before each screenshot. A stuck-to-bottom chat lands at
 * an arbitrary scroll offset, so a message can straddle the top of the
 * thread. For every scroll container with top clearance, nudge scrollTop to
 * the nearest turn boundary so no message or speaker row (JOV-12045: the row
 * sits above its message's [data-message-id] box) is drawn partly inside the
 * visible part of that band; the fade band itself is fully masked (JOV-12045),
 * so settled content is invisible above the clearance or fully visible below
 * it. Prefer scrolling down (hide the message, keep the latest turn in view);
 * scroll up only when the lowest content still ends inside the scrollport. A
 * fresh frame (scrollTop 0) also clears a bottom-edge straddle when the shift
 * fits the container's top padding. Returns how many nudges ran. Plain
 * JavaScript for the same reason as LAYOUT_AUDIT_SOURCE.
 */
export const SETTLE_SCROLL_SOURCE = `(() => {
  let moved = 0;
  const scrollers = Array.from(document.querySelectorAll('*')).filter(el => {
    const style = getComputedStyle(el);
    return (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  });
  for (const scroller of scrollers) {
    const clearance = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    if (clearance <= 0) continue;
    // Matches .system-b-chat-thread-top-fade: the clearance band is fully
    // masked (JOV-12045 removed the reveal ramp), so content is visible only
    // from the clearance line down.
    const visibleFrom = scroller.classList.contains('system-b-chat-thread-top-fade')
      ? clearance
      : 0;
    for (let pass = 0; pass < 3; pass += 1) {
      const edge = scroller.getBoundingClientRect().top;
      const straddler = Array.from(
        scroller.querySelectorAll('[data-message-id], [data-testid="onboarding-speaker-row"]')
      ).find(el => {
        const box = el.getBoundingClientRect();
        const top = box.top - edge;
        const bottom = box.bottom - edge;
        return bottom > visibleFrom + 0.5 && top < clearance - 0.5;
      });
      if (!straddler) break;
      const box = straddler.getBoundingClientRect();
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      const down = box.bottom - edge - visibleFrom;
      const up = clearance - (box.top - edge);
      const before = scroller.scrollTop;
      if (before + down <= maxScroll + 0.5) {
        scroller.scrollTop = before + down;
      } else {
        // Scroll up only while the lowest drawn content still ends inside the
        // scrollport: content may enter the bottom padding band (fully visible
        // there) but must not cross the container's bottom edge (JOV-12045: a
        // bottom-stuck transcript clears a straddling speaker row this way).
        const frame = scroller.getBoundingClientRect();
        const lowest = Array.from(scroller.querySelectorAll('*')).reduce((max, el) => {
          if (el.children.length > 0) return max;
          const leaf = el.getBoundingClientRect();
          return leaf.height > 0 && leaf.width > 0 ? Math.max(max, leaf.bottom) : max;
        }, -Infinity);
        if (lowest + up > frame.bottom + 0.5) break;
        scroller.scrollTop = Math.max(0, before - up);
      }
      if (scroller.scrollTop === before) break;
      moved += 1;
    }
    // JOV-12045: an at-rest frame (scrollTop 0) can also straddle the BOTTOM
    // edge (e.g. the desktop profile footer half-cut on a fresh load).
    // Scrolling down clears it while the top stays clean: the shift is
    // absorbed by the container's own top padding, so only straddles that
    // fit within it are cleared.
    if (scroller.scrollTop === 0) {
      const frame = scroller.getBoundingClientRect();
      const bottomEdge = frame.bottom - (parseFloat(getComputedStyle(scroller).paddingBottom) || 0);
      const straddler = Array.from(scroller.querySelectorAll('*')).find(el => {
        if (el.children.length > 0) return false;
        const box = el.getBoundingClientRect();
        return box.height > 0 && box.width > 0 && box.top < bottomEdge - 0.5 && box.bottom > bottomEdge + 0.5;
      });
      if (straddler) {
        const overhang = straddler.getBoundingClientRect().bottom - bottomEdge;
        if (overhang <= clearance) {
          scroller.scrollTop = overhang;
          moved += 1;
        }
      }
    }
  }
  return moved;
})()`;

/** Starts collecting console/page errors so the first keyframe sees them too. */
export function watchKeyframeErrors(page: Page): void {
  if (process.env.GOLDEN_PATH_KEYFRAME_DIR) trackErrors(page);
}

export async function captureKeyframe(
  page: Page,
  id: string,
  context: Pick<KeyframeRecord, 'expectedArtistName'> = {}
): Promise<void> {
  const dir = process.env.GOLDEN_PATH_KEYFRAME_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const errors = trackErrors(page);
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
    // A long-poll or analytics beacon must not block evidence capture.
  });
  await page.evaluate(SETTLE_SCROLL_SOURCE);
  const homeBefore =
    id === 'home'
      ? ((await page.evaluate(HOME_PREVIEW_AUDIT_SOURCE)) as HomePreviewAudit)
      : undefined;
  sequence += 1;
  const file = `${String(sequence).padStart(2, '0')}-${id}.png`;
  const image = await page.screenshot({
    path: join(dir, file),
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
    // The dev toolbar is CI chrome, not product; reviewers must not judge it.
    style: '[data-testid="dev-toolbar"]{display:none!important}',
  });
  const homeAfter =
    id === 'home'
      ? ((await page.evaluate(HOME_PREVIEW_AUDIT_SOURCE)) as HomePreviewAudit)
      : undefined;
  const record: KeyframeRecord = {
    schema: GOLDEN_PATH_KEYFRAME_SCHEMA,
    id,
    sequence,
    url: page.url(),
    file,
    sha256: createHash('sha256').update(image).digest('hex'),
    expectedArtistName: context.expectedArtistName,
    audit: (await page.evaluate(LAYOUT_AUDIT_SOURCE)) as LayoutAudit,
    pageErrors: errors.splice(0),
    homePreview:
      homeBefore && homeAfter
        ? { before: homeBefore, after: homeAfter }
        : undefined,
  };
  appendFileSync(join(dir, 'manifest.jsonl'), `${JSON.stringify(record)}\n`);
}
