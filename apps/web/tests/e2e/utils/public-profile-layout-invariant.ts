import type { Page } from '@playwright/test';

type PublicProfileLayoutViolationCode =
  | 'artist_name_clipped'
  | 'phantom_banner'
  | 'banner_reserved_geometry'
  | 'claim_cta_overflow'
  | 'claim_cta_wrap'
  | 'desktop_bottom_nav'
  | 'desktop_card_outside_column'
  | 'desktop_column_gutter'
  | 'desktop_column_overlap'
  | 'desktop_compact_shell'
  | 'desktop_empty_side_rail'
  | 'desktop_geometry_token'
  | 'desktop_phone_column'
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
    // Opted-out builds (NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE=0)
    // keep desktop widths on the compact profile, centered in
    // a phone-width column. That column is the admitted desktop presentation
    // only while the layout honestly reports `compact`; a shell that claims
    // desktop ownership while showing the compact card is still a hybrid.
    const desktopSurfaceShipped =
      root?.classList.contains('profile-viewport--desktop-surface') ?? false;
    const isPhoneColumn = (compact: HTMLElement) =>
      !desktopSurfaceShipped &&
      layout === 'compact' &&
      compact.closest('[data-profile-preview="true"]') === null;

    if (ownsDesktop && bottomNavs.length > 0) {
      violations.push({
        code: 'desktop_bottom_nav',
        detail: `desktop layout exposed ${bottomNavs.length} compact bottom navigation surface(s)`,
      });
    }

    if (isDesktopViewport && compactSurfaces.length > 0) {
      for (const compact of compactSurfaces) {
        if (isPhoneColumn(compact)) {
          const rect = compact.getBoundingClientRect();
          // >= 1024px the flag-off profile is the two-column desktop
          // composition; below it the phone column.
          const maxWidth = Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              window.innerWidth >= 1024
                ? '--profile-desktop-max-width'
                : '--profile-shell-max-width'
            )
          );
          const viewportWidth = document.documentElement.clientWidth;
          const sideDelta = Math.abs(rect.left - (viewportWidth - rect.right));
          if (
            !Number.isFinite(maxWidth) ||
            rect.width > maxWidth + 1 ||
            sideDelta > 2
          ) {
            violations.push({
              code: 'desktop_phone_column',
              detail: `compact column is ${rect.width.toFixed(1)}px wide (max ${maxWidth}px) with a ${sideDelta.toFixed(1)}px centering delta`,
            });
          }
          continue;
        }
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

    if (isDesktopViewport) {
      const frame = document.querySelector<HTMLElement>(
        '.public-profile-layout-frame'
      );
      const contentMax = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--ds-public-content-max'
        )
      );
      if (ownsDesktop && frame && Number.isFinite(contentMax)) {
        const expectedWidth = Math.min(window.innerWidth, contentMax);
        const actualWidth = frame.getBoundingClientRect().width;
        if (Math.abs(actualWidth - expectedWidth) > 1) {
          violations.push({
            code: 'desktop_geometry_token',
            detail: `desktop frame width is ${actualWidth}px; expected ${expectedWidth}px from --ds-public-content-max`,
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

    // Home overview columns (cover | Selected work + Events | Get updates +
    // Payments) must never paint over each other. The cards are translucent,
    // so an overlap shows both columns at once (jov.ie/tim at 1440px, where
    // nowrap release titles widened the center cards past their track).
    if (ownsDesktop && homeOverview) {
      const columns = [
        'profile-desktop-cover',
        'profile-desktop-secondary-grid',
        'profile-desktop-side-rail',
      ].flatMap(testId => {
        const column = visible(`[data-testid="${testId}"]`)[0];
        if (!column) return [];
        const cards =
          testId === 'profile-desktop-cover'
            ? [column]
            : Array.from(column.children).filter(isVisible);
        return [{ testId, column, cards }];
      });
      const describe = (rect: DOMRect) =>
        `${rect.left.toFixed(1)}..${rect.right.toFixed(1)} x ${rect.top.toFixed(1)}..${rect.bottom.toFixed(1)}`;
      const overviewBox = homeOverview.getBoundingClientRect();
      for (const { testId, column, cards } of columns) {
        const columnBox = column.getBoundingClientRect();
        for (const card of cards) {
          const cardBox = card.getBoundingClientRect();
          if (
            cardBox.left < columnBox.left - 1 ||
            cardBox.right > columnBox.right + 1 ||
            cardBox.left < overviewBox.left - 1 ||
            cardBox.right > overviewBox.right + 1
          ) {
            violations.push({
              code: 'desktop_card_outside_column',
              detail: `${testId} card ${describe(cardBox)} escapes column ${describe(columnBox)} / overview ${describe(overviewBox)}`,
            });
          }
        }
      }
      for (let left = 0; left < columns.length; left += 1) {
        for (let right = left + 1; right < columns.length; right += 1) {
          for (const leftCard of columns[left].cards) {
            for (const rightCard of columns[right].cards) {
              const a = leftCard.getBoundingClientRect();
              const b = rightCard.getBoundingClientRect();
              const overlapX =
                Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const overlapY =
                Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (overlapX > 1 && overlapY > 1) {
                violations.push({
                  code: 'desktop_column_overlap',
                  detail: `${columns[left].testId} card ${describe(a)} overlaps ${columns[right].testId} card ${describe(b)} by ${overlapX.toFixed(1)}x${overlapY.toFixed(1)}px`,
                });
              }
            }
          }
        }
      }
      // The cover is narrower than its track (4:5, height-driven), so only
      // the center/rail gutter is the grid's own column gap.
      const center = columns.find(
        column => column.testId === 'profile-desktop-secondary-grid'
      );
      const rail = columns.find(
        column => column.testId === 'profile-desktop-side-rail'
      );
      const columnGap = Number.parseFloat(
        getComputedStyle(homeOverview).columnGap
      );
      if (center && rail && Number.isFinite(columnGap)) {
        const gutter =
          rail.column.getBoundingClientRect().left -
          center.column.getBoundingClientRect().right;
        if (Math.abs(gutter - columnGap) > 1) {
          violations.push({
            code: 'desktop_column_gutter',
            detail: `center/rail gutter is ${gutter.toFixed(1)}px; the overview column gap is ${columnGap}px`,
          });
        }
      }
    }

    const desktopCover = visible('[data-testid="profile-desktop-cover"]')[0];
    const artistName = desktopCover?.querySelector<HTMLElement>(
      '[data-testid="profile-header"]'
    );
    if (ownsDesktop && desktopCover && isVisible(artistName ?? null)) {
      const coverBox = desktopCover.getBoundingClientRect();
      const nameBox = artistName.getBoundingClientRect();
      // The header can fit while a no-break name is clipped inside its
      // line-clamped span. Observe the text fragments, not just the flex box.
      const nameText = artistName.querySelector('span');
      const textBox = nameText?.getBoundingClientRect();
      const range = document.createRange();
      if (nameText) range.selectNodeContents(nameText);
      const textEscapes = textBox
        ? Array.from(range.getClientRects()).some(
            rect =>
              rect.left <
                Math.max(textBox.left, nameBox.left, coverBox.left) - 1 ||
              rect.right >
                Math.min(textBox.right, nameBox.right, coverBox.right) + 1
          )
        : false;
      if (
        nameBox.left < coverBox.left - 1 ||
        nameBox.right > coverBox.right + 1 ||
        textEscapes
      ) {
        violations.push({
          code: 'artist_name_clipped',
          detail: `artist name bounds ${nameBox.left.toFixed(1)}..${nameBox.right.toFixed(1)}, cover ${coverBox.left.toFixed(1)}..${coverBox.right.toFixed(1)}, clipped text=${textEscapes}`,
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
