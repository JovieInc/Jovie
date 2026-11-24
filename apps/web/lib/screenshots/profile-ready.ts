/**
 * Ready marker for desktop profile captures. At the 1440px desktop viewport
 * the canonical ProfileDesktopSurface (shipped by default Nov 9, #24709) is
 * shown and the compact shell stays in the DOM hidden, so waiting for the
 * compact shell alone never resolves. Wait for whichever profile surface is
 * visible.
 */
export const DESKTOP_PROFILE_READY_SELECTOR =
  '[data-testid="profile-desktop-surface"]:visible, [data-testid="profile-compact-shell"]:visible';
