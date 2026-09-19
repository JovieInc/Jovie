/**
 * Visible action/conversion affordances on the public profile.
 *
 * Synthetic monitoring uses Desktop Chrome at 1280×720. At `min-width: 1180px`
 * compact bottom nav (`profile-tab-bar` / `profile-bottom-nav`) is CSS-hidden
 * (JOV-5995) and desktop conversion lives on AEO about testids plus, after
 * hydration, desktop primary-tab chrome. Keep compact selectors for <1180.
 */
export const PUBLIC_PROFILE_ACTION_AFFORDANCE_SELECTORS = [
  '[data-testid="profile-about-follow"]',
  '[data-testid="profile-about-listen"]',
  '[data-testid="profile-about-share"]',
  '[data-testid="profile-primary-tab-subscribe"]',
  '[data-testid="profile-primary-tab-listen"]',
  '[data-testid="profile-desktop-alerts-card"]',
  'a[href*="mode=subscribe"]',
  'a[href*="/tip"]',
  'a[href*="/subscribe"]',
  'a[href*="/tour"]',
  'a[href*="/contact"]',
  'a[href*="/listen"]',
  'a[aria-label*="Follow"]',
  'a:has-text("Follow")',
  'a:has-text("Subscribe")',
  'button:has-text("Tip")',
  'button:has-text("Follow")',
  'button:has-text("Subscribe")',
  'button:has-text("Support")',
  'button:has-text("Open support")',
  'button[aria-label="Home"]',
  'button[aria-label="Music"]',
  'button[aria-label="Shows"]',
  'button[aria-label="About"]',
  'button:has-text("Get updates")',
  '[data-mode]',
  '[data-testid="profile-home-alerts-row"]',
  '[data-testid="profile-tab-bar"]',
] as const;

export const DESKTOP_PUBLIC_PROFILE_ACTION_TESTIDS = [
  'profile-about-follow',
  'profile-about-listen',
  'profile-about-share',
  'profile-primary-tab-subscribe',
  'profile-primary-tab-listen',
  'profile-desktop-alerts-card',
] as const;

export function publicProfileActionAffordanceSelector(): string {
  return PUBLIC_PROFILE_ACTION_AFFORDANCE_SELECTORS.join(', ');
}
