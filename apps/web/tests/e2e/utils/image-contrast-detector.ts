import type { Page } from '@playwright/test';
import sharp from 'sharp';

// Invariant consumer: JOV-INV-019 `text-aware-contrast` (JOV-6916).
// Unlike the token-pair ratchet (scripts/lint-contrast-ratchet.mjs), this
// inspects RENDERED pixels: for every text node and interactive control whose
// box overlaps a painted image layer (hero photo, editorial card, CSS
// background image), the glyph ink is hidden and the pixels behind the glyph
// box are sampled. WCAG AA is enforced against the worst-case percentile of
// the sampled background luminance, so art direction must reserve contrast
// rather than rely on a post-hoc overlay.

export const IMAGE_CONTRAST_CERTIFICATION_SCHEMA =
  'jovie-image-contrast/v1' as const;

const HIDE_ATTRIBUTE = 'data-image-contrast-hide';

export interface ImageContrastReceipt {
  readonly element: string;
  readonly text: string;
  readonly box: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly foreground: string;
  readonly foregroundLuminance: number;
  readonly backgroundLuminance: {
    readonly p10: number;
    readonly p50: number;
    readonly p90: number;
  };
  readonly worstContrastRatio: number;
  readonly requiredRatio: number;
  readonly largeText: boolean;
  readonly pass: boolean;
}

export interface ImageContrastFinding {
  readonly kind: 'image-contrast';
  readonly message: string;
  readonly elements: readonly string[];
  readonly measurements?: Readonly<Record<string, number>>;
}

export interface ImageContrastSnapshot {
  readonly schemaVersion: typeof IMAGE_CONTRAST_CERTIFICATION_SCHEMA;
  readonly findings: readonly ImageContrastFinding[];
  readonly receipts: readonly ImageContrastReceipt[];
  readonly inspectedAt: string;
}

interface CandidateRecord {
  readonly index: number;
  readonly element: string;
  readonly text: string;
  readonly box: { x: number; y: number; width: number; height: number };
  readonly color: string;
  readonly fontSize: number;
  readonly fontWeight: number;
}

interface PageScan {
  readonly candidates: readonly CandidateRecord[];
  readonly deviceScaleFactor: number;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseCssColor(
  color: string
): { r: number; g: number; b: number } | null {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(color);
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * (sorted.length - 1)))
  );
  return sorted[index];
}

async function scanCandidates(page: Page): Promise<PageScan> {
  return page.evaluate(hideAttribute => {
    const root = document.querySelector('main') ?? document.body;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // elementsFromPoint() is a hit-test API: it silently omits any element
    // (or descendant of one) with pointer-events:none, even when that
    // element is the topmost thing actually PAINTED there — a decorative
    // badge, a label over an image, a control disabled for click-through.
    // Occlusion below cares about paint order, not click eligibility, so
    // force every element hit-testable for the duration of this scan. This
    // is read-only inspection (no dispatched input), so it's safe to revert
    // immediately after.
    const pointerEventsOverride = document.createElement('style');
    pointerEventsOverride.textContent = '*{pointer-events:auto!important}';
    document.head.appendChild(pointerEventsOverride);

    try {
      return scanWithPointerEventsForced();
    } finally {
      pointerEventsOverride.remove();
    }

    function scanWithPointerEventsForced(): PageScan {
      const round = (value: number): number => Math.round(value * 100) / 100;
      const isRendered = (element: Element): boolean => {
        const rect = element.getBoundingClientRect();
        // Screen-reader-only text (Tailwind's sr-only: exactly 1x1px,
        // clipped, -1px margin) is never painted for sighted users, so a
        // visual contrast check against it is meaningless — exclude it the
        // same way display:none/visibility:hidden already are, rather than
        // certifying (or failing) a color nobody sees. Require *both*
        // dimensions to be this collapsed, not just one, so a real 1px-tall
        // divider or gradient rule (full width, genuinely painted) isn't
        // dropped as an image layer or a candidate.
        if (rect.width <= 1 && rect.height <= 1) return false;
        const style = getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse' &&
          Number.parseFloat(style.opacity || '1') > 0
        );
      };
      const intersectViewport = (
        rect: DOMRect
      ): { x: number; y: number; width: number; height: number } | null => {
        const x = Math.max(0, rect.left);
        const y = Math.max(0, rect.top);
        const right = Math.min(viewportWidth, rect.right);
        const bottom = Math.min(viewportHeight, rect.bottom);
        if (right - x <= 0 || bottom - y <= 0) return null;
        return {
          x: round(x),
          y: round(y),
          width: round(right - x),
          height: round(bottom - y),
        };
      };
      const describe = (element: Element): string => {
        const testId = element.getAttribute('data-testid');
        if (testId)
          return `${element.tagName.toLowerCase()}[data-testid="${testId}"]`;
        if (element.id) return `${element.tagName.toLowerCase()}#${element.id}`;
        const role = element.getAttribute('role');
        if (role) return `${element.tagName.toLowerCase()}[role="${role}"]`;
        const siblings = Array.from(
          element.parentElement?.children ?? []
        ).filter(candidate => candidate.tagName === element.tagName);
        const suffix =
          siblings.length > 1
            ? `:nth-of-type(${siblings.indexOf(element) + 1})`
            : '';
        return `${element.tagName.toLowerCase()}${suffix}`;
      };

      // Painted image layers: replaced media elements plus elements whose own
      // box paints a CSS image (hero photo, editorial card, gradient art).
      const imageLayers: { element: Element; rect: DOMRect }[] = [];
      const paintsCssImage = (element: Element): boolean => {
        const style = getComputedStyle(element);
        if (style.backgroundImage !== 'none') return true;
        for (const pseudo of ['::before', '::after'] as const) {
          const pseudoStyle = getComputedStyle(element, pseudo);
          if (
            pseudoStyle.backgroundImage !== 'none' &&
            pseudoStyle.content !== 'none' &&
            pseudoStyle.content !== 'normal'
          ) {
            return true;
          }
        }
        return false;
      };
      for (const element of Array.from(root.querySelectorAll('*'))) {
        if (!isRendered(element)) continue;
        const isMedia =
          element instanceof HTMLImageElement ||
          element instanceof HTMLVideoElement ||
          element instanceof HTMLCanvasElement;
        if (!isMedia && !paintsCssImage(element)) continue;
        const rect = element.getBoundingClientRect();
        if (intersectViewport(rect)) imageLayers.push({ element, rect });
      }

      const isInteractive = (element: Element): boolean =>
        element instanceof HTMLAnchorElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement ||
        element.closest(
          '[role="button"], [role="link"], [role="menuitem"], [role="tab"], summary'
        ) === element;

      const hasDirectText = (element: Element): string => {
        let text = '';
        for (const node of Array.from(element.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
        }
        return text.replace(/\s+/g, ' ').trim();
      };

      const candidates: CandidateRecord[] = [];
      const seen = new Set<Element>();
      const pushCandidate = (element: Element, text: string): void => {
        if (seen.has(element) || !isRendered(element)) return;
        const clipped = intersectViewport(element.getBoundingClientRect());
        if (!clipped) return;
        const layersBehind = imageLayers.filter(({ element: layer, rect }) => {
          if (element.contains(layer)) return false;
          const overlapLeft = Math.max(clipped.x, rect.left);
          const overlapTop = Math.max(clipped.y, rect.top);
          const overlapRight = Math.min(clipped.x + clipped.width, rect.right);
          const overlapBottom = Math.min(
            clipped.y + clipped.height,
            rect.bottom
          );
          if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) {
            return false;
          }
          // Resolve the hit-test stack at the center of THIS layer's overlap
          // with the candidate, not the candidate's own center: a candidate
          // can span several layers, or be only partially covered elsewhere
          // by an unrelated sibling (an open drawer sheet, a modal scrim). A
          // single global sample point would wrongly call the whole candidate
          // unreachable — or wrongly call a layer "behind" it — based on
          // whatever happens to sit at a point that isn't even part of this
          // particular overlap.
          const sampleX = Math.min(
            viewportWidth - 1,
            Math.max(0, (overlapLeft + overlapRight) / 2)
          );
          const sampleY = Math.min(
            viewportHeight - 1,
            Math.max(0, (overlapTop + overlapBottom) / 2)
          );
          const stack = document.elementsFromPoint(sampleX, sampleY);
          const candidateDepth = stack.findIndex(item => item === element);
          if (candidateDepth === -1) return false;
          // Anything strictly above the candidate in the stack that ISN'T one
          // of its own ancestors OR descendants (e.g. an icon glyph painted
          // inside it) is a genuinely unrelated third party — a later, opaque
          // sibling (an open drawer sheet, a modal scrim) — that currently
          // occupies this pixel instead. That holds even when `layer` is the
          // candidate's own image-painting ancestor: the ancestor relationship
          // alone doesn't prove today's screenshot actually pairs them if
          // something else sits on top of both.
          const occludedByUnrelated = stack
            .slice(0, candidateDepth)
            .some(item => !item.contains(element) && !element.contains(item));
          if (occludedByUnrelated) return false;
          // An ancestor that paints the image is trivially behind its own
          // descendant candidate once we know the candidate is genuinely
          // reachable (unoccluded) here.
          if (layer.contains(element)) return true;
          // Otherwise the layer must stack below the candidate at this point.
          const layerDepth = stack.findIndex(
            item => item === layer || layer.contains(item)
          );
          return layerDepth !== -1 && layerDepth > candidateDepth;
        });
        if (layersBehind.length === 0) return;
        seen.add(element);
        const index = candidates.length;
        element.setAttribute(hideAttribute, String(index));
        const style = getComputedStyle(element);
        candidates.push({
          index,
          element: describe(element),
          text: text.slice(0, 80),
          box: clipped,
          color: style.color,
          fontSize: Number.parseFloat(style.fontSize || '16'),
          fontWeight: Number.parseInt(style.fontWeight || '400', 10) || 400,
        });
      };

      for (const element of Array.from(root.querySelectorAll('*'))) {
        const directText = hasDirectText(element);
        if (directText) {
          pushCandidate(element, directText);
          continue;
        }
        // Interactive controls whose label lives in a descendant: certify the
        // control's box itself (e.g. icon-labeled buttons over imagery). Only
        // for a true icon-only control (aria-label, no visible text node
        // anywhere inside): a control whose label instead comes from real
        // text is skipped here and left to the plain hasDirectText branch
        // above, which will reach that same descendant on its own turn and
        // sample its own box and color — the descendant can explicitly
        // override an inherited foreground and sits in a tighter box than the
        // control's full hit target (e.g. dark ink on a light pill face
        // nested in a control that otherwise inherits a light-on-dark
        // default, padded past the pill's own edges), so sampling the
        // control itself would certify a box and a color nobody sees.
        if (isInteractive(element)) {
          const ariaLabel = element.getAttribute('aria-label');
          if (!ariaLabel) continue;
          // A visually hidden duplicate (sr-only span mirroring the
          // aria-label) isn't where the glyph actually paints, so it must not
          // count as "the label lives in a descendant" — that would defer to
          // a descendant this same loop is about to discard via isRendered's
          // own sr-only exclusion, silently dropping the control from
          // checking entirely.
          const hasVisibleNestedText = Array.from(
            element.querySelectorAll('*')
          ).some(
            candidate => isRendered(candidate) && hasDirectText(candidate)
          );
          if (hasVisibleNestedText) continue;
          const label = ariaLabel.replace(/\s+/g, ' ').trim();
          if (label) pushCandidate(element, label);
        }
      }

      return {
        candidates,
        deviceScaleFactor: window.devicePixelRatio || 1,
      };
    }
  }, HIDE_ATTRIBUTE);
}

async function sampleRegionLuminances(
  screenshot: Buffer,
  box: { x: number; y: number; width: number; height: number },
  scale: number
): Promise<number[]> {
  const left = Math.max(0, Math.floor(box.x * scale));
  const top = Math.max(0, Math.floor(box.y * scale));
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const { data, info } = await sharp(screenshot)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminances: number[] = [];
  const stride = Math.max(1, Math.floor((width * height) / 20000));
  const channels = info.channels;
  for (let pixel = 0; pixel < width * height; pixel += stride) {
    const offset = pixel * channels;
    luminances.push(
      relativeLuminance(data[offset], data[offset + 1], data[offset + 2])
    );
  }
  return luminances.sort((a, b) => a - b);
}

/**
 * Inspect the rendered page for text and interactive controls painted over
 * image layers, then measure real contrast by hiding the glyph ink and
 * sampling the pixels exposed behind each glyph box.
 *
 * WCAG AA is applied against the worst-case background percentile: for light
 * foregrounds the 90th-percentile background luminance, for dark foregrounds
 * the 10th. Large text (>=24px, or >=18.66px bold) requires 3:1; everything
 * else requires 4.5:1.
 */
export async function inspectImageContrast(
  page: Page
): Promise<ImageContrastSnapshot> {
  const { candidates, deviceScaleFactor } = await scanCandidates(page);
  const findings: ImageContrastFinding[] = [];
  const receipts: ImageContrastReceipt[] = [];

  if (candidates.length === 0) {
    return {
      schemaVersion: IMAGE_CONTRAST_CERTIFICATION_SCHEMA,
      findings,
      receipts,
      inspectedAt: new Date().toISOString(),
    };
  }

  // Hide glyph ink only; control backgrounds stay painted so the sampled
  // region is exactly what sits behind each glyph.
  const styleTag = await page.addStyleTag({
    content: `[${HIDE_ATTRIBUTE}], [${HIDE_ATTRIBUTE}] * { color: transparent !important; text-shadow: none !important; -webkit-text-stroke: transparent !important; caret-color: transparent !important; }`,
  });
  // Under runner CPU contention headless Chromium intermittently rejects a
  // capture with "Protocol error (Page.captureScreenshot): Unable to capture
  // screenshot" (see playwright-artifact-secrets.test.ts for the documented
  // transient). Retry only that error, at most twice; anything else fails.
  let screenshot: Buffer;
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        screenshot = await page.screenshot({ type: 'png' });
        break;
      } catch (error) {
        if (
          attempt >= 3 ||
          !String(error).includes('Unable to capture screenshot')
        ) {
          throw error;
        }
      }
    }
  } finally {
    await styleTag.evaluate(tag => tag.remove());
  }

  const metadata = await sharp(screenshot).metadata();
  const imageWidth = metadata.width ?? 0;
  const imageHeight = metadata.height ?? 0;

  for (const candidate of candidates) {
    const box = {
      x: candidate.box.x,
      y: candidate.box.y,
      width: Math.min(
        candidate.box.width,
        imageWidth / deviceScaleFactor - candidate.box.x
      ),
      height: Math.min(
        candidate.box.height,
        imageHeight / deviceScaleFactor - candidate.box.y
      ),
    };
    if (box.width <= 0 || box.height <= 0) continue;

    const luminances = await sampleRegionLuminances(
      screenshot,
      box,
      deviceScaleFactor
    );
    if (luminances.length === 0) continue;

    const color = parseCssColor(candidate.color);
    if (!color) continue;
    const fgLuminance = relativeLuminance(color.r, color.g, color.b);
    const p10 = percentile(luminances, 10);
    const p50 = percentile(luminances, 50);
    const p90 = percentile(luminances, 90);
    const largeText =
      candidate.fontSize >= 24 ||
      (candidate.fontSize >= 18.66 && candidate.fontWeight >= 700);
    const requiredRatio = largeText ? 3 : 4.5;
    // Worst case: light text fails on the brightest sampled background,
    // dark text on the darkest.
    const worstBg = fgLuminance >= 0.18 ? p90 : p10;
    const worstRatio = contrastRatio(fgLuminance, worstBg);
    const pass = worstRatio >= requiredRatio;

    receipts.push({
      element: candidate.element,
      text: candidate.text,
      box,
      foreground: candidate.color,
      foregroundLuminance: Math.round(fgLuminance * 1000) / 1000,
      backgroundLuminance: {
        p10: Math.round(p10 * 1000) / 1000,
        p50: Math.round(p50 * 1000) / 1000,
        p90: Math.round(p90 * 1000) / 1000,
      },
      worstContrastRatio: Math.round(worstRatio * 100) / 100,
      requiredRatio,
      largeText,
      pass,
    });

    if (!pass) {
      findings.push({
        kind: 'image-contrast',
        message: `"${candidate.text}" on ${candidate.element} renders ${worstRatio.toFixed(2)}:1 against the worst-case sampled image background (requires ${requiredRatio}:1).`,
        elements: [candidate.element],
        measurements: {
          worstContrastRatio: Math.round(worstRatio * 100) / 100,
          requiredRatio,
        },
      });
    }
  }

  return {
    schemaVersion: IMAGE_CONTRAST_CERTIFICATION_SCHEMA,
    findings,
    receipts,
    inspectedAt: new Date().toISOString(),
  };
}
