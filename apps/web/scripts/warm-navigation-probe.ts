export interface WarmNavigationProbeWindow extends Window {
  __perfWarmNavFallbackStart?: number;
  __perfWarmNavStart?: number;
  __perfWarmNavAcknowledgedAt?: number;
  __perfWarmNavCleanup?: () => void;
}

/** Runs inside the measured browser, before input, without a polling gap. */
export function installWarmNavigationProbe(
  node: Element,
  acknowledgmentItemId: string | null
) {
  const perfWindow = window as WarmNavigationProbeWindow;
  perfWindow.__perfWarmNavCleanup?.();
  perfWindow.__perfWarmNavStart = undefined;
  perfWindow.__perfWarmNavAcknowledgedAt = undefined;
  perfWindow.__perfWarmNavFallbackStart = performance.now();

  if (
    acknowledgmentItemId &&
    node.getAttribute('data-navigation-item-id') !== acknowledgmentItemId
  ) {
    throw new Error(
      'Warm-navigation trigger has the wrong navigation item identity.'
    );
  }
  if (
    acknowledgmentItemId &&
    node.getAttribute('data-navigation-pending') === 'true'
  ) {
    throw new Error(
      'Warm-navigation trigger is already pending before measurement.'
    );
  }

  const observer = acknowledgmentItemId
    ? new MutationObserver(records => {
        if (typeof perfWindow.__perfWarmNavStart !== 'number') return;
        // oldValue retains evidence even when a cached transition adds and
        // removes the acknowledgment before this observer is delivered.
        if (
          node.getAttribute('data-navigation-pending') === 'true' ||
          records.some(record => record.oldValue === 'true')
        ) {
          perfWindow.__perfWarmNavAcknowledgedAt = performance.now();
          observer?.disconnect();
        }
      })
    : null;
  observer?.observe(node, {
    attributes: true,
    attributeFilter: ['data-navigation-pending'],
    attributeOldValue: true,
  });

  // Method syntax keeps this callback self-contained when tsx serializes the
  // enclosing function for Playwright (named arrows can capture __name).
  const handlers = {
    recordStart() {
      if (typeof perfWindow.__perfWarmNavStart === 'number') return;
      observer?.takeRecords();
      perfWindow.__perfWarmNavStart = performance.now();
    },
  };
  node.addEventListener('pointerdown', handlers.recordStart, {
    capture: true,
    once: true,
  });
  node.addEventListener('click', handlers.recordStart, {
    capture: true,
    once: true,
  });
  perfWindow.__perfWarmNavCleanup = () => {
    observer?.disconnect();
    node.removeEventListener('pointerdown', handlers.recordStart, true);
    node.removeEventListener('click', handlers.recordStart, true);
  };
}

export function clearWarmNavProbe() {
  const perfWindow = window as WarmNavigationProbeWindow;
  perfWindow.__perfWarmNavCleanup?.();
  perfWindow.__perfWarmNavCleanup = undefined;
}
