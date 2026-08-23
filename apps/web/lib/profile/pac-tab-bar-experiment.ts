/**
 * Cold-visitor tab bar experiment helpers (JOV-3907 / JOV-5318).
 *
 * The historical PAC `hidden` arm removed the entire authorized destination
 * set before first interaction. That arm now fails closed: authorized public
 * navigation stays visible for every visitor state.
 */

export const PAC_TAB_BAR_RETURN_VISIT_KEY = 'jv_pac_tab_bar_return';

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
 *
 * The historical PAC `hidden` arm hid the entire authorized destination set
 * before first interaction. That arm now fails closed: authorized navigation
 * stays visible for cold visitors, return visits, and subscribed fans.
 */
export function shouldShowColdVisitorTabBar(
  _input: ColdTabBarVisibilityInput
): boolean {
  return true;
}

export function readPacTabBarReturnVisit(
  storage: Pick<Storage, 'getItem'> | null | undefined
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PAC_TAB_BAR_RETURN_VISIT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPacTabBarReturnVisit(
  storage: Pick<Storage, 'setItem'> | null | undefined
): void {
  if (!storage) return;
  try {
    storage.setItem(PAC_TAB_BAR_RETURN_VISIT_KEY, '1');
  } catch {
    // Best-effort — return-visit restore degrades to per-session only.
  }
}
