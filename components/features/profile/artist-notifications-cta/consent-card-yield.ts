import { useEffect } from 'react';

/**
 * JOV-3209 one-interruption guardrail: while a profile mobile flow is open,
 * the consent card yields to it (see design-system.css
 * `html[data-profile-flow-open]`) instead of stacking over it and
 * intercepting its inputs. Clears on close and on unmount.
 */
export function useConsentCardYield(open: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.dataset.profileFlowOpen = 'true';
    else delete root.dataset.profileFlowOpen;
    return () => {
      delete root.dataset.profileFlowOpen;
    };
  }, [open]);
}
