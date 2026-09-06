import type { Page } from '@playwright/test';

type PublicProfileLayoutViolationCode =
  | 'artist_name_clipped'
  | 'phantom_banner'
  | 'banner_reserved_geometry'
  | 'claim_cta_overflow'
  | 'claim_cta_wrap'
  | 'desktop_bottom_nav'
  | 'desktop_compact_shell'
  | 'desktop_empty_side_rail'
  | 'horizontal_overflow'
  | 'layout_surface_count'
  | 'target_under_44'
  | 'unlabeled_preview';

export async function auditPublicProfileLayout(page: Page) {
  return page.evaluate(desktopBreakpoint => {
    type Violation = {
      readonly code: PublicProfileLayoutViolationCode;
      readonly detail: string;
    };
    const violations: Violation[] = [];
    const root = document.querySelector<HTMLElement>(
      '[data-testid="public-profile-layout-shell"]'
    );
    const isVisible = (element: Element | null): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const visible = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const compactSurfaces = visible('[data-testid="profile-compact-shell"]');
    const desktopSurfaces = visible('[data-testid="profile-desktop-surface"]');
    const bottomNavs = visible('[data-testid="profile-bottom-nav"]');
    const layout = root?.dataset.layout ?? null;
    const isDesktopViewport = window.innerWidth >= desktopBreakpoint;
    const ownsDesktop = isDesktopViewport && layout === 'desktop';

    if (ownsDesktop && bottomNavs.length > 0) {
      violations.push({
        code: 'desktop_bottom_nav',
        detail: `desktop layout exposed ${bottomNavs.length} compact bottom navigation surface(s)`,
      });
    }

    if (isDesktopViewport && compactSurfaces.length > 0) {
      for (const compact of compactSurfaces) {
        const preview = compact.closest<HTMLElement>(
          '[data-profile-preview="true"]'
        );
        const label = preview?.querySelector(
          '[data-testid="profile-preview-label"]'
        );
        const exit = preview?.querySelector<HTMLElement>(
          '[data-testid="profile-preview-exit"]'
        );
        const hasLabel = isVisible(label ?? null);
        const hasExit = isVisible(exit ?? null) && exit?.tabIndex !== -1;
        if (!preview || !hasLabel || !hasExit) {
          violations.push({
            code: 'desktop_compact_shell',
            detail:
              'desktop viewport exposed a compact shell outside an admitted preview',
          });
          violations.push({
            code: 'unlabeled_preview',
            detail:
              'desktop-width compact shell lacks the explicit preview marker, visible label, or keyboard-operable exit',
          });
        }
      }
    }

    const homeOverview = visible(
      '[data-testid="profile-desktop-home-overview"]'
    )[0];
    const sideRail = visible('[data-testid="profile-desktop-side-rail"]')[0];
    if (
      ownsDesktop &&
      homeOverview?.dataset.sideRailEnabled === 'false' &&
      sideRail
    ) {
      violations.push({
        code: 'desktop_empty_side_rail',
        detail: 'desktop overview reserved a visible side rail without content',
      });
    }

    const desktopCover = visible('[data-testid="profile-desktop-cover"]')[0];
    const artistName = desktopCover?.querySelector<HTMLElement>(
      '[data-testid="profile-header"]'
    );
    if (ownsDesktop && desktopCover && isVisible(artistName ?? null)) {
      const coverBox = desktopCover.getBoundingClientRect();
      const nameBox = artistName.getBoundingClientRect();
      if (
        nameBox.left < coverBox.left - 1 ||
        nameBox.right > coverBox.right + 1
      ) {
        violations.push({
          code: 'artist_name_clipped',
          detail: `artist name bounds ${nameBox.left.toFixed(1)}..${nameBox.right.toFixed(1)} escape cover ${coverBox.left.toFixed(1)}..${coverBox.right.toFixed(1)}`,
        });
      }
    }

    const expectedCompact = layout === 'compact' ? 1 : 0;
    const expectedDesktop = layout === 'desktop' ? 1 : 0;
    if (
      compactSurfaces.length !== expectedCompact ||
      desktopSurfaces.length !== expectedDesktop
    ) {
      violations.push({
        code: 'layout_surface_count',
        detail: `layout=${layout ?? '<missing>'} compact=${compactSurfaces.length} desktop=${desktopSurfaces.length}`,
      });
    }

    const overflow =
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth
      ) - window.innerWidth;
    if (overflow > 1) {
      violations.push({
        code: 'horizontal_overflow',
        detail: `document exceeds viewport by ${overflow}px`,
      });
    }

    const banners = visible(
      '[data-testid="profile-desktop-banner"], [data-testid="profile-shell-banner"]'
    );
    for (const banner of banners) {
      if (!Array.from(banner.children).some(isVisible)) {
        violations.push({
          code: 'phantom_banner',
          detail: 'visible banner wrapper has no visible child',
        });
      }
    }
    const desktopShell = visible('[data-testid="profile-desktop-shell"]')[0];
    const desktopSurface = desktopSurfaces[0];
    if (ownsDesktop && desktopShell && desktopSurface) {
      const shellBox = desktopShell.getBoundingClientRect();
      const surfaceBox = desktopSurface.getBoundingClientRect();
      const bannerHeight = banners
        .filter(banner => desktopShell.contains(banner))
        .reduce(
          (sum, banner) => sum + banner.getBoundingClientRect().height,
          0
        );
      if (
        Math.abs(surfaceBox.top - shellBox.top - bannerHeight) > 2 ||
        Math.abs(surfaceBox.bottom - shellBox.bottom) > 2
      ) {
        violations.push({
          code: 'banner_reserved_geometry',
          detail: `banner=${bannerHeight} top reservation=${surfaceBox.top - shellBox.top} bottom gap=${shellBox.bottom - surfaceBox.bottom}`,
        });
      }
    }

    const cta = visible('[data-testid="claim-banner-cta"]')[0] ?? null;
    const ctaLabel =
      visible('[data-testid="claim-banner-cta-label"]')[0] ?? null;
    let claimCtaLineCount: number | null = null;
    if (cta && ctaLabel) {
      const range = document.createRange();
      range.selectNodeContents(ctaLabel);
      claimCtaLineCount = Array.from(range.getClientRects()).filter(
        rect => rect.width > 0 && rect.height > 0
      ).length;
      if (claimCtaLineCount !== 1) {
        violations.push({
          code: 'claim_cta_wrap',
          detail: `claim CTA label rendered ${claimCtaLineCount} line boxes`,
        });
      }
      if (cta.scrollWidth - cta.clientWidth > 1) {
        violations.push({
          code: 'claim_cta_overflow',
          detail: `claim CTA content exceeds its box by ${cta.scrollWidth - cta.clientWidth}px`,
        });
      }
    }

    const admissionTargets = visible(
      [
        '[data-testid="claim-banner-cta"]',
        '[data-testid="profile-desktop-surface"] nav button',
        '[data-testid="profile-desktop-surface"] button[aria-label="Menu"]',
        '[data-testid="profile-tab-bar"] button',
      ].join(',')
    );
    for (const target of admissionTargets) {
      const rect = target.getBoundingClientRect();
      if (rect.width < 44 || rect.height < 44) {
        violations.push({
          code: 'target_under_44',
          detail: `${target.getAttribute('aria-label') ?? target.textContent?.trim() ?? target.tagName} is ${rect.width}x${rect.height}`,
        });
      }
    }

    return {
      claimCtaLineCount,
      violations,
    };
  }, 1180);
}
