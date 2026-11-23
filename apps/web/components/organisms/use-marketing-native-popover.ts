'use client';

import { useEffect, useRef, useState } from 'react';

function supportsNativePopover(): boolean {
  return (
    typeof HTMLElement !== 'undefined' &&
    typeof HTMLElement.prototype.showPopover === 'function'
  );
}

export function useMarketingNativePopover(open: boolean) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Server markup and the first hydration render must agree. React does not
  // repair a mismatched popover attribute before the opening effect runs.
  const [nativePopover, setNativePopover] = useState(false);

  useEffect(() => {
    setNativePopover(supportsNativePopover());
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !nativePopover || !panel.hasAttribute('popover')) {
      return;
    }

    if (open && !panel.matches(':popover-open')) {
      panel.showPopover();
    } else if (!open && panel.matches(':popover-open')) {
      panel.hidePopover();
    }
  }, [nativePopover, open]);

  return { panelRef, nativePopover };
}
