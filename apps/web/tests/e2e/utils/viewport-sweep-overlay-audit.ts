import type { Page } from '@playwright/test';
import {
  DEFAULT_AUDIT_OPTIONS,
  type ViewportSweepAuditOptions,
} from './viewport-sweep-audit';

/**
 * Overlay geometry. On desktop-pointer widths an overlay must be a compact
 * popover anchored near its trigger, never a full-width bottom sheet.
 */
export async function auditOverlay(
  page: Page,
  options: Partial<ViewportSweepAuditOptions> = {}
): Promise<readonly ViewportSweepViolation[]> {
  const merged: ViewportSweepAuditOptions = {
    kind: 'profile',
    ...DEFAULT_AUDIT_OPTIONS,
    ...options,
  };
  return page.evaluate(opts => {
    const violations: { code: string; detail: string }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0.02 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const overlays = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="profile-menu-drawer"], [role="dialog"], [role="menu"], [data-vaul-drawer]'
      )
    ).filter(visible);
    const outermost = overlays.filter(
      element =>
        !overlays.some(other => other !== element && other.contains(element))
    );
    const label = (element: Element) =>
      `${element.tagName.toLowerCase()}${element.getAttribute('data-testid') ? `[data-testid=${element.getAttribute('data-testid')}]` : ''}${element.getAttribute('aria-label') ? `[aria-label=${element.getAttribute('aria-label')}]` : ''}`;
    if (vw >= opts.desktopMinWidthPx) {
      for (const overlay of outermost) {
        const rect = overlay.getBoundingClientRect();
        if (rect.width > opts.popoverMaxWidthPx + 1) {
          violations.push({
            code: 'overlay_wider_than_popover_max',
            detail: `${label(overlay)} is ${Math.round(rect.width)}px wide at ${vw}px viewport (popover max ${opts.popoverMaxWidthPx}px)`,
          });
        }
        const isSheet =
          overlay.hasAttribute('data-vaul-drawer') ||
          overlay.querySelector('[data-vaul-drawer]') !== null ||
          (rect.bottom >= vh - 1 && rect.width >= vw * 0.5);
        if (isSheet) {
          violations.push({
            code: 'overlay_is_bottom_sheet_on_desktop',
            detail: `${label(overlay)} renders as a bottom sheet (rect ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}) at ${vw}px viewport`,
          });
        }
      }
    }
    // Release credits must be reachable from exactly one control.
    const creditsControls = Array.from(
      document.querySelectorAll<HTMLElement>('button, a, [role="menuitem"]')
    ).filter(
      element =>
        visible(element) &&
        /release credits/i.test(
          `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`
        )
    );
    if (creditsControls.length > 1) {
      violations.push({
        code: 'duplicate_release_credits',
        detail: `${creditsControls.length} visible "Release credits" controls: ${creditsControls.map(label).join(' | ')}`,
      });
    }
    return violations;
  }, merged) as Promise<readonly ViewportSweepViolation[]>;
}
