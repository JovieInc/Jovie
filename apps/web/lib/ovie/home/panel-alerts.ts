import { captureError } from '@/lib/error-tracking';

/**
 * Ovie Home panel failures are incidents, not copy. A panel that renders an
 * error state (or a projection that fails the client contract) reports once
 * per distinct reason per page session, so a broken Home pages someone
 * instead of waiting for Tim to notice (2026-10-30: In Flight and Done Today
 * showed "could not load" for a day before anyone saw it).
 */
export type OvieHomePanel =
  | 'shipping-loop'
  | 'asks'
  | 'company'
  | 'shipping-projection';

const reported = new Set<string>();

export function reportOvieHomePanelError(
  panel: OvieHomePanel,
  reason: string
): boolean {
  const key = `${panel}:${reason}`;
  if (reported.has(key)) return false;
  reported.add(key);
  void captureError(
    `Ovie Home panel error: ${panel}`,
    new Error(`${panel}: ${reason}`),
    { route: '/app/ov', panel, reason, alert: 'ovie-home-panel' }
  );
  return true;
}

/** Test-only. */
export function resetOvieHomePanelAlertsForTests(): void {
  reported.clear();
}
