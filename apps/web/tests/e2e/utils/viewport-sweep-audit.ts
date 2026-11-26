import type { Page } from '@playwright/test';

/**
 * Geometric, deterministic layout audit for the viewport sweep
 * (tests/e2e/profile/viewport-sweep.spec.ts).
 *
 * Every check reads computed geometry from the live DOM. None of them compares
 * pixels, so a result never depends on fonts, antialiasing or image decoding.
 * The audit runs inside the page (single evaluate) so the sweep can call it
 * after every resize step without reloading.
 */

export type ViewportSweepViolationCode =
  | 'horizontal_overflow'
  | 'offscreen_element'
  | 'bottom_elements_overlap'
  | 'bottom_element_clipped'
  | 'bottom_element_covered'
  | 'tab_indicator_outside_active_tab'
  | 'tab_underline_wider_than_tab'
  | 'stray_accent_line'
  | 'content_after_footer'
  | 'overlay_wider_than_popover_max'
  | 'overlay_is_bottom_sheet_on_desktop'
  | 'duplicate_release_credits'
  | 'focus_ring_after_pointer'
  | 'large_vertical_gap';

export interface ViewportSweepViolation {
  readonly code: ViewportSweepViolationCode;
  readonly detail: string;
}

export interface ViewportSweepAuditOptions {
  /** `profile` enables the profile-only checks (tab indicator, gaps). */
  readonly kind: 'profile' | 'page';
  /** Largest empty vertical band allowed between consecutive content blocks. */
  readonly maxVerticalGapPx: number;
  /** Largest width of an anchored desktop popover. */
  readonly popoverMaxWidthPx: number;
  /** Width at and above which overlays must be anchored popovers. */
  readonly desktopMinWidthPx: number;
}

export const DEFAULT_AUDIT_OPTIONS = {
  maxVerticalGapPx: 160,
  popoverMaxWidthPx: 420,
  desktopMinWidthPx: 768,
} as const;

/**
 * Wait until layout has stopped moving: two animation frames, then the tab
 * lens (a spring) and the shell boxes must read identically for several
 * consecutive frames. Frame based, so there is no wall-clock sleep.
 */
export async function settleViewport(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const frame = () =>
      new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const read = () =>
      JSON.stringify(
        [
          '[data-testid="profile-bottom-nav-indicator"]',
          '[data-testid="public-profile-layout-shell"]',
          '[data-testid="profile-tab-bar"]',
          '[data-testid="profile-menu-drawer"]',
          'main',
        ].map(selector => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return [x, y, width, height, getComputedStyle(element).transform];
        })
      );
    await frame();
    await frame();
    let previous = read();
    let stableFrames = 0;
    for (let attempt = 0; attempt < 90 && stableFrames < 5; attempt += 1) {
      await frame();
      const current = read();
      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;
    }
    // Let finite animations (a popover fading out at 1180px) end, up to 1s.
    const finite = document
      .getAnimations()
      .filter(a => a.effect?.getComputedTiming().endTime !== Infinity);
    const done = Promise.allSettled(finite.map(a => a.finished));
    await Promise.race([done, new Promise(r => setTimeout(r, 1000))]);
  });
}

export async function auditViewport(
  page: Page,
  options: Partial<ViewportSweepAuditOptions> & {
    readonly kind: ViewportSweepAuditOptions['kind'];
  }
): Promise<readonly ViewportSweepViolation[]> {
  const merged: ViewportSweepAuditOptions = {
    ...DEFAULT_AUDIT_OPTIONS,
    ...options,
  };
  return page.evaluate(opts => {
    const violations: { code: string; detail: string }[] = [];
    const add = (code: string, detail: string) => {
      violations.push({ code, detail });
    };
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const describe = (element: Element): string => {
      const html = element as HTMLElement;
      const testId = html.getAttribute('data-testid');
      const label = html.getAttribute('aria-label');
      const text = (html.innerText || html.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      return `${element.tagName.toLowerCase()}${testId ? `[data-testid=${testId}]` : ''}${label ? `[aria-label=${label}]` : ''}${text ? ` "${text}"` : ''}`;
    };
    const isVisible = (element: Element): boolean => {
      const style = getComputedStyle(element);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number.parseFloat(style.opacity || '1') < 0.02
      ) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const isSrOnly = (rect: DOMRect) => rect.width <= 1 || rect.height <= 1;
    const hasHiddenAncestor = (element: Element): boolean => {
      let current: Element | null = element;
      while (current && current !== document.documentElement) {
        if (current.getAttribute('aria-hidden') === 'true') return true;
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };
    const isFixedLike = (element: Element): boolean => {
      let current: Element | null = element;
      while (current && current !== document.documentElement) {
        const position = getComputedStyle(current).position;
        if (position === 'fixed' || position === 'sticky') return true;
        current = current.parentElement;
      }
      return false;
    };
    const overlap = (a: DOMRect, b: DOMRect) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const inside = (inner: DOMRect, outer: DOMRect, tolerance: number) =>
      inner.left >= outer.left - tolerance &&
      inner.right <= outer.right + tolerance &&
      inner.top >= outer.top - tolerance &&
      inner.bottom <= outer.bottom + tolerance;

    // 1. No horizontal overflow of the document.
    const scrollWidth = document.documentElement.scrollWidth;
    if (scrollWidth - vw > 1) {
      add(
        'horizontal_overflow',
        `document.scrollWidth=${scrollWidth} innerWidth=${vw}`
      );
    }

    // 2. Fixed / sticky bottom elements: no overlap, not clipped, not covered.
    const bottomCandidates = Array.from(
      document.querySelectorAll<HTMLElement>('body *')
    ).filter(element => {
      if (getComputedStyle(element).position !== 'fixed') return false;
      if (!isVisible(element) || hasHiddenAncestor(element)) return false;
      if (element.closest('[role="dialog"], [data-vaul-overlay]')) return false;
      if (element.hasAttribute('data-vaul-overlay')) return false;
      const rect = element.getBoundingClientRect();
      return (
        rect.height > 8 &&
        rect.height < vh * 0.5 &&
        rect.width > 24 &&
        rect.bottom >= vh * 0.55
      );
    });
    // Outermost fixed element per stack only.
    const bottomElements = bottomCandidates.filter(
      element =>
        !bottomCandidates.some(
          other => other !== element && other.contains(element)
        )
    );
    for (let i = 0; i < bottomElements.length; i += 1) {
      const a = bottomElements[i];
      const aRect = a.getBoundingClientRect();
      if (
        aRect.bottom > vh + 1 ||
        aRect.top < -1 ||
        aRect.left < -1 ||
        aRect.right > vw + 1
      ) {
        add(
          'bottom_element_clipped',
          `${describe(a)} rect=${Math.round(aRect.left)},${Math.round(aRect.top)} ${Math.round(aRect.width)}x${Math.round(aRect.height)} viewport=${vw}x${vh}`
        );
      }
      if (getComputedStyle(a).pointerEvents !== 'none') {
        const cx = Math.min(Math.max(aRect.left + aRect.width / 2, 0), vw - 1);
        const cy = Math.min(Math.max(aRect.top + aRect.height / 2, 0), vh - 1);
        const hit = document.elementFromPoint(cx, cy);
        if (
          hit &&
          hit !== document.body &&
          hit !== document.documentElement &&
          !a.contains(hit) &&
          !hit.contains(a)
        ) {
          add(
            'bottom_element_covered',
            `${describe(a)} is covered at its centre by ${describe(hit)}`
          );
        }
      }
      for (let j = i + 1; j < bottomElements.length; j += 1) {
        const b = bottomElements[j];
        const area = overlap(aRect, b.getBoundingClientRect());
        if (area > 4) {
          add(
            'bottom_elements_overlap',
            `${describe(a)} overlaps ${describe(b)} by ${Math.round(area)}px²`
          );
        }
      }
    }

    // 3. Footer landmark: nothing visible renders after it.
    const footerCandidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        'footer, [role="contentinfo"], [data-testid="branding-badge"]'
      )
    ).filter(
      element =>
        isVisible(element) &&
        !hasHiddenAncestor(element) &&
        !isFixedLike(element) &&
        element.getAttribute('data-testid') !== 'profile-claim-footer'
    );
    let footer: HTMLElement | null =
      footerCandidates.reduce<HTMLElement | null>(
        (lowest, element) =>
          !lowest ||
          element.getBoundingClientRect().bottom >
            lowest.getBoundingClientRect().bottom
            ? element
            : lowest,
        null
      );
    if (!footer) {
      const madeWith = Array.from(
        document.querySelectorAll<HTMLElement>('a, span, p, div')
      ).find(
        element =>
          isVisible(element) &&
          element.children.length === 0 &&
          /^made with/i.test((element.textContent || '').trim())
      );
      footer = madeWith?.closest<HTMLElement>('a') ?? madeWith ?? null;
    }
    // Shell chrome: with the footer in an inner scroller (the profile shell),
    // elements outside it, like the pinned tab bar, are chrome, not content.
    let contentScroller: HTMLElement | null = null;
    for (
      let current = footer?.parentElement ?? null;
      current && current !== document.body;
      current = current.parentElement
    ) {
      const overflowY = getComputedStyle(current).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        contentScroller = current;
        break;
      }
    }
    // No branding (embedded preview): fall back to the shell's scroller.
    contentScroller ??=
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="profile-content-scroll"], [data-testid="profile-desktop-content-scroll"]'
        )
      ).find(element => isVisible(element)) ?? null;
    const isShellChrome = (element: Element): boolean =>
      contentScroller !== null &&
      !contentScroller.contains(element) &&
      !element.contains(contentScroller);
    if (footer) {
      const footerBottom = footer.getBoundingClientRect().bottom;
      const after = Array.from(
        document.querySelectorAll<HTMLElement>('body *')
      ).filter(element => {
        if (footer?.contains(element) || element.contains(footer)) return false;
        if (!isVisible(element) || hasHiddenAncestor(element)) return false;
        if (isFixedLike(element) || isShellChrome(element)) return false;
        const rect = element.getBoundingClientRect();
        if (isSrOnly(rect)) return false;
        if (rect.top < footerBottom - 1) return false;
        // Only elements that paint content: own text, media or controls.
        const ownText = Array.from(element.childNodes).some(
          node => node.nodeType === 3 && (node.textContent || '').trim() !== ''
        );
        return (
          ownText ||
          ['IMG', 'VIDEO', 'CANVAS', 'SVG', 'BUTTON', 'A', 'INPUT'].includes(
            element.tagName.toUpperCase()
          )
        );
      });
      if (after.length > 0) {
        add(
          'content_after_footer',
          `${after.length} visible element(s) render below the footer landmark (${describe(footer)}): ${after
            .slice(0, 4)
            .map(describe)
            .join(' | ')}`
        );
      }
    }

    // 4. Profile-only checks.
    if (opts.kind === 'profile') {
      const activeTab = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="profile-tab-bar"] [aria-current="page"], [data-testid="profile-bottom-nav"] [aria-current="page"], nav[aria-label="Profile Navigation"] [aria-current="page"]'
        )
      ).find(element => isVisible(element));
      const indicators = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="profile-bottom-nav-indicator"], [class*="tab-indicator"], [class*="tabs-indicator"], [class*="__indicator"]'
        )
      ).filter(
        element =>
          element.getAttribute('data-visible') !== 'false' &&
          isVisible(element) &&
          !hasHiddenAncestorExceptAriaHidden(element)
      );
      // aria-hidden is how the lens is marked (decorative), so it must still
      // count as visible geometry; only display/visibility hide it.
      function hasHiddenAncestorExceptAriaHidden(element: Element): boolean {
        let current: Element | null = element;
        while (current && current !== document.documentElement) {
          const style = getComputedStyle(current);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return true;
          }
          current = current.parentElement;
        }
        return false;
      }
      for (const indicator of indicators) {
        const rect = indicator.getBoundingClientRect();
        if (!activeTab) {
          add(
            'tab_indicator_outside_active_tab',
            `${describe(indicator)} is visible (${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.left)},${Math.round(rect.top)}) but no tab is active`
          );
          continue;
        }
        const tabRect = activeTab.getBoundingClientRect();
        if (!inside(rect, tabRect, 2)) {
          add(
            'tab_indicator_outside_active_tab',
            `${describe(indicator)} rect=${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)} is outside active tab ${describe(activeTab)} rect=${Math.round(tabRect.left)},${Math.round(tabRect.top)} ${Math.round(tabRect.width)}x${Math.round(tabRect.height)}`
          );
        }
      }
      // A text-tab underline pseudo-element must not be wider than its tab.
      if (activeTab) {
        const tabRect = activeTab.getBoundingClientRect();
        for (const pseudo of ['::before', '::after'] as const) {
          const style = getComputedStyle(activeTab, pseudo);
          if (
            style.content === 'none' ||
            style.display === 'none' ||
            style.position !== 'absolute'
          ) {
            continue;
          }
          const width = Number.parseFloat(style.width);
          const height = Number.parseFloat(style.height);
          const hasPaint =
            style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            style.backgroundColor !== 'transparent';
          if (hasPaint && height <= 4 && width > tabRect.width + 2) {
            add(
              'tab_underline_wider_than_tab',
              `${describe(activeTab)}${pseudo} is ${width}x${height}px inside a ${Math.round(tabRect.width)}px tab`
            );
          }
        }
      }
      // Any thin coloured rule that is not an intended separator.
      for (const element of Array.from(
        document.querySelectorAll<HTMLElement>('body *')
      )) {
        const rect = element.getBoundingClientRect();
        if (rect.height > 3 || rect.width < 24 || rect.height <= 0) continue;
        if (!isVisible(element)) continue;
        if (
          element.tagName === 'HR' ||
          element.getAttribute('role') === 'separator' ||
          element.getAttribute('data-testid') === 'profile-cover-accent-line' ||
          element.closest('[role="progressbar"], [role="slider"], button, a')
        ) {
          continue;
        }
        const match = getComputedStyle(element).backgroundColor.match(
          /rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/
        );
        if (!match) continue;
        const [r, g, b] = [match[1], match[2], match[3]].map(Number);
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (alpha > 0.2 && b > r + 40 && b > g + 10) {
          add(
            'stray_accent_line',
            `${describe(element)} is a ${Math.round(rect.width)}x${Math.round(rect.height)}px blue rule at ${Math.round(rect.left)},${Math.round(rect.top)} that is not a separator`
          );
        }
      }

      // 5. No large empty vertical band between consecutive content blocks.
      const blocks = Array.from(
        document.querySelectorAll<HTMLElement>('body *')
      )
        .filter(element => {
          if (!isVisible(element) || hasHiddenAncestor(element)) return false;
          if (isFixedLike(element) || isShellChrome(element)) return false;
          const rect = element.getBoundingClientRect();
          if (isSrOnly(rect) || rect.right < 0 || rect.left > vw) return false;
          const ownText = Array.from(element.childNodes).some(
            node =>
              node.nodeType === 3 && (node.textContent || '').trim() !== ''
          );
          return (
            ownText ||
            ['IMG', 'VIDEO', 'CANVAS', 'BUTTON', 'INPUT'].includes(
              element.tagName.toUpperCase()
            )
          );
        })
        .map(element => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > 0 && rect.top < vh)
        .sort((a, b) => a.rect.top - b.rect.top);
      let covered = blocks.length > 0 ? blocks[0].rect.bottom : 0;
      let coveredBy: Element | null = blocks[0]?.element ?? null;
      for (const { element, rect } of blocks.slice(1)) {
        const gap = rect.top - covered;
        if (gap > opts.maxVerticalGapPx) {
          add(
            'large_vertical_gap',
            `${Math.round(gap)}px of empty vertical space between y=${Math.round(covered)} and y=${Math.round(rect.top)} (max ${opts.maxVerticalGapPx}px), from ${coveredBy ? describe(coveredBy) : 'the top'} to ${describe(element)}`
          );
        }
        if (rect.bottom > covered) {
          covered = rect.bottom;
          coveredBy = element;
        }
      }
    }

    // 6. Focus ring after pointer input: only :focus-visible may draw one.
    const focused = document.activeElement;
    if (
      focused &&
      focused !== document.body &&
      focused !== document.documentElement &&
      !focused.matches(':focus-visible')
    ) {
      const style = getComputedStyle(focused);
      const outlineDrawn =
        style.outlineStyle !== 'none' &&
        Number.parseFloat(style.outlineWidth) > 0 &&
        !/rgba\(\d+, \d+, \d+, 0\)/.test(style.outlineColor);
      // A ring drawn as a zero-blur, positive-spread box-shadow.
      const shadowRing = /rgba?\([^)]*\)\s+0px\s+0px\s+0px\s+[1-9]/.test(
        style.boxShadow
      );
      if (outlineDrawn || shadowRing) {
        add(
          'focus_ring_after_pointer',
          `${describe(focused)} draws a focus ring (outline=${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}, shadow=${style.boxShadow.slice(0, 60)}) without :focus-visible`
        );
      }
    }

    return violations;
  }, merged) as Promise<readonly ViewportSweepViolation[]>;
}
