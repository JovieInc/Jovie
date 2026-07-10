/**
 * Cold-visitor tab bar experiment helpers (JOV-3907).
 *
 * Hypothesis: hiding the bottom tab bar for cold (S0) visitors reduces choice
 * surface and raises play-rate → capture-rate.
 *
 * Rules:
 * - Only cold, unsubscribed visitors on the `hidden` arm start without the bar.
 * - First interaction restores the bar for the rest of the session.
 * - Return visits always see the bar (localStorage-marked), regardless of arm.
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
 * Pure — storage reads happen at the call site.
 */
export function shouldShowColdVisitorTabBar(
  input: ColdTabBarVisibilityInput
): boolean {
  if (input.isInteractive === false) return true;
  if (input.isSubscribed) return true;
  if (input.restoredThisSession) return true;
  if (input.isReturnVisit) return true;
  if (input.tabBarArm === 'visible') return true;
  return false;
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
