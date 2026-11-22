import type { Page } from '@playwright/test';

export interface AccentLineViolation {
  readonly code: 'accent_line_not_at_top';
  readonly detail: string;
}

/**
 * The cover accent line (JOV-14241) is a thin line pinned to the top edge of
 * the profile stage. If its top offset within the stage container is not 0 it
 * renders as a stray blue line partway down the page (the /tim bug). The
 * element is optional: profiles without it pass.
 */
export async function auditCoverAccentLine(
  page: Page
): Promise<readonly AccentLineViolation[]> {
  return page.evaluate(() => {
    const violations: AccentLineViolation[] = [];
    for (const line of Array.from(
      document.querySelectorAll<HTMLElement>('.profile-cover-accent-line')
    )) {
      const container = line.parentElement;
      if (!container) continue;
      const offset =
        line.getBoundingClientRect().top -
        container.getBoundingClientRect().top;
      if (Math.abs(offset) > 1) {
        violations.push({
          code: 'accent_line_not_at_top',
          detail: `profile-cover-accent-line top offset ${Math.round(offset)}px within its stage (expected 0)`,
        });
      }
    }
    return violations;
  });
}
