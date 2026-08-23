/**
 * Public-profile navigation visibility guard.
 *
 * The historical PAC assignment is retained for analytics compatibility, but
 * an experiment may not remove authorized navigation. Visual experiments can
 * change presentation only; the semantic destination set remains reachable.
 */

export interface ColdTabBarVisibilityInput {
  /** Statsig-assigned arm (`hidden` | `visible`). */
  readonly tabBarArm: 'hidden' | 'visible';
  /** True when the visitor is already subscribed / captured. */
  readonly isSubscribed: boolean;
  /** True once any interaction restored the bar this session. */
  readonly restoredThisSession: boolean;
  /** True when localStorage marks a prior visit that already interacted. */
  readonly isReturnVisit: boolean;
  /** Preview / non-interactive renders always keep the bar. */
  readonly isInteractive?: boolean;
}

/**
 * Whether the bottom tab bar should render for this visitor state.
 * Pure — storage reads happen at the call site.
 */
export function shouldShowColdVisitorTabBar(
  _input: ColdTabBarVisibilityInput
): boolean {
  return true;
}
