import type {
  PerfRouteDefinition,
  PerfTimingBudget,
} from './performance-route-manifest';

/**
 * JOV-8737: shared readiness selectors for the public-profile alias
 * usable-result routes. #24709 made the desktop surface (>=1180px) the
 * canonical public profile and unmounts the compact shell there, so alias
 * readiness must accept whichever surface the visitor's viewport actually
 * mounts. Both lists stay additive: the compact selectors keep the 390x844
 * contract intact, and the desktop selectors cover Playwright's default
 * 1280x720 context. Kept as one shared constant per group so the two
 * surfaces cannot drift apart across the six alias routes.
 */
export const PROFILE_ALIAS_READY_SHELL_SELECTORS = [
  '[data-testid="profile-header"]',
  '[data-testid="profile-desktop-top-chrome"]',
] as const;

export const PROFILE_ALIAS_READY_CONTENT_SELECTORS = [
  '[data-testid="profile-compact-shell"][data-interactive-ready="true"]',
  '[data-testid="profile-desktop-surface"][data-interactive-ready="true"]',
] as const;

export function assertValidPerfAliasRoute(
  route: PerfRouteDefinition,
  timingBudgets: readonly PerfTimingBudget[]
) {
  if (route.aliasUsableResult) {
    const usableBudget = timingBudgets.find(
      timing => timing.metric === 'usable-alias-result'
    );
    if (
      route.surface !== 'public-profile' ||
      route.measureMode !== 'redirect'
    ) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must be a public-profile redirect.`
      );
    }
    if (usableBudget?.budget !== 1000) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must preserve its 1000ms median budget.`
      );
    }
    if (timingBudgets.some(timing => timing.metric === 'redirect-complete')) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must not claim redirect-complete timing.`
      );
    }
    if (
      !route.readySelectors.shell?.includes('[data-testid="profile-header"]')
    ) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must require the visible profile header.`
      );
    }
    if (
      !route.readySelectors.shell?.includes(
        '[data-testid="profile-desktop-top-chrome"]'
      )
    ) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must require the desktop top chrome.`
      );
    }
    if (
      !route.readySelectors.content?.includes(
        '[data-testid="profile-compact-shell"][data-interactive-ready="true"]'
      )
    ) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must require the interactive compact shell.`
      );
    }
    if (
      !route.readySelectors.content?.includes(
        '[data-testid="profile-desktop-surface"][data-interactive-ready="true"]'
      )
    ) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must require the interactive desktop surface.`
      );
    }
    if (route.aliasUsableResult.destinationAffordances.length === 0) {
      throw new TypeError(
        `Alias usable-result route "${route.id}" must require a destination affordance.`
      );
    }
  }
}
