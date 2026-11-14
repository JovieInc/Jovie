import type { Page } from '@playwright/test';

/**
 * Focus-ring clipping detector (Tim, 2026-11-14: the sidebar header bell's
 * ring was cut on both sides by its staged cluster's `overflow-hidden`).
 *
 * Tabs through every focusable element inside `rootSelector`, and for each
 * one measures the painted focus indicator from computed style (outline
 * width + offset, and the outward spread/blur of box-shadow rings such as
 * Tailwind's `ring-2 ring-offset-2`). It then walks the ancestors and
 * reports any ancestor whose overflow clips on an axis (hidden, clip, auto,
 * scroll) and whose padding box does not contain the ring on that axis.
 *
 * jsdom cannot see this (no layout, no stylesheet), so the class-level twin
 * lives in tests/unit/components/organisms/sidebar-header-actions.test.tsx.
 */
export interface FocusRingClipFinding {
  readonly element: string;
  readonly clipper: string;
  readonly overflow: string;
  readonly sides: readonly ('top' | 'right' | 'bottom' | 'left')[];
  readonly ring: { top: number; right: number; bottom: number; left: number };
  readonly clip: { top: number; right: number; bottom: number; left: number };
}

export interface FocusRingClipReport {
  readonly visited: number;
  readonly findings: readonly FocusRingClipFinding[];
}

/** Measures the element that currently has focus. Runs in the page. */
function measureActiveElement(
  rootSelector: string
): Promise<
  | { readonly outside: true }
  | { readonly outside: false; readonly findings: FocusRingClipFinding[] }
> {
  const describe = (element: Element) => {
    const id = element.id ? `#${element.id}` : '';
    const testId = element.getAttribute('data-testid');
    const label =
      element.getAttribute('aria-label') ??
      element.textContent?.trim().slice(0, 40) ??
      '';
    return `${element.tagName.toLowerCase()}${id}${
      testId ? `[data-testid=${testId}]` : ''
    }${label ? ` "${label}"` : ''}`;
  };

  const px = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  /** Outward reach of all non-inset box-shadows (ring + ring offset). */
  const shadowReach = (boxShadow: string) => {
    if (!boxShadow || boxShadow === 'none') return 0;
    let reach = 0;
    // Split on commas that are not inside a color function.
    const shadows = boxShadow.split(/,(?![^(]*\))/);
    for (const shadow of shadows) {
      if (/\binset\b/.test(shadow)) continue;
      const lengths = shadow
        .replace(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([^)]*\)/g, '')
        .match(/-?\d*\.?\d+px/g)
        ?.map(px);
      if (!lengths || lengths.length < 2) continue;
      const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
      reach = Math.max(
        reach,
        spread + blur + Math.max(Math.abs(x), Math.abs(y))
      );
    }
    return reach;
  };

  const run = async () => {
    const active = document.activeElement;
    const root = document.querySelector(rootSelector);
    if (
      !(active instanceof HTMLElement) ||
      !root ||
      !root.contains(active) ||
      active === document.body
    ) {
      return { outside: true as const };
    }
    // Ring transitions (box-shadow, outline) must settle before measuring.
    await Promise.all(
      active
        .getAnimations({ subtree: false })
        .map(animation => animation.finished.catch(() => undefined))
    );
    const style = getComputedStyle(active);
    const outlineReach =
      style.outlineStyle !== 'none' && px(style.outlineWidth) > 0
        ? px(style.outlineWidth) + px(style.outlineOffset)
        : 0;
    const reach = Math.max(outlineReach, shadowReach(style.boxShadow));
    const box = active.getBoundingClientRect();
    if (reach <= 0 || box.width === 0 || box.height === 0) {
      return { outside: false as const, findings: [] };
    }
    const ring = {
      top: box.top - reach,
      right: box.right + reach,
      bottom: box.bottom + reach,
      left: box.left - reach,
    };
    const findings: FocusRingClipFinding[] = [];
    const tolerance = 0.5;
    for (
      let node = active.parentElement;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      const nodeStyle = getComputedStyle(node);
      const clipsX = nodeStyle.overflowX !== 'visible';
      const clipsY = nodeStyle.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      const rect = node.getBoundingClientRect();
      const clip = {
        top: rect.top + px(nodeStyle.borderTopWidth),
        right: rect.right - px(nodeStyle.borderRightWidth),
        bottom: rect.bottom - px(nodeStyle.borderBottomWidth),
        left: rect.left + px(nodeStyle.borderLeftWidth),
      };
      const sides: FocusRingClipFinding['sides'][number][] = [];
      if (clipsX && ring.left < clip.left - tolerance) sides.push('left');
      if (clipsX && ring.right > clip.right + tolerance) sides.push('right');
      if (clipsY && ring.top < clip.top - tolerance) sides.push('top');
      if (clipsY && ring.bottom > clip.bottom + tolerance) sides.push('bottom');
      if (sides.length > 0) {
        findings.push({
          element: describe(active),
          clipper: describe(node),
          overflow: `${nodeStyle.overflowX} ${nodeStyle.overflowY}`,
          sides,
          ring,
          clip,
        });
      }
    }
    return { outside: false as const, findings };
  };

  return run();
}

/**
 * Tab from the top of the document through every focusable element in
 * `rootSelector` (default: the app shell frame) and collect clipped rings.
 * Stops when focus cycles back to the first element or after `maxTabs`.
 */
export async function findClippedFocusRings(
  page: Page,
  {
    rootSelector = '[data-app-shell-frame]',
    maxTabs = 250,
  }: { readonly rootSelector?: string; readonly maxTabs?: number } = {}
): Promise<FocusRingClipReport> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.getSelection()?.removeAllRanges();
  });
  const seen = new Set<string>();
  const findings: FocusRingClipFinding[] = [];
  let visited = 0;
  for (let index = 0; index < maxTabs; index++) {
    await page.keyboard.press('Tab');
    const key = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return null;
      const path: string[] = [];
      for (let node: Element | null = active; node; node = node.parentElement) {
        const parent = node.parentElement;
        path.push(
          `${node.tagName}:${parent ? Array.prototype.indexOf.call(parent.children, node) : 0}`
        );
      }
      return path.join('<');
    });
    if (key === null) continue;
    if (seen.has(key)) break;
    seen.add(key);
    const result = await page.evaluate(measureActiveElement, rootSelector);
    if (result.outside) continue;
    visited++;
    findings.push(...result.findings);
  }
  return { visited, findings };
}
