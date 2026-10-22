/** Browser probes must stay self-contained for Playwright init-script serialization. */
declare global {
  interface Window {
    __claimLayout?: { supported: boolean; total: number | null };
    __claimInitialLayout?: {
      supported: boolean;
      total: number | null;
      unguidedFirst: boolean;
      first: number[] | null;
      guided: number[] | null;
    };
  }
}

export function installDelayedGuidanceLayoutProbe(fontSize: number): void {
  const supported =
    typeof PerformanceObserver === 'function' &&
    PerformanceObserver.supportedEntryTypes.includes('layout-shift');
  const metric = {
    supported,
    total: supported ? 0 : (null as number | null),
    unguidedFirst: false,
    first: null as number[] | null,
    guided: null as number[] | null,
  };
  window.__claimInitialLayout = metric;
  // CLS is optional; the style fixture and essential-control geometry are
  // required even when Firefox cannot observe layout-shift entries.
  if (supported) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!Number.isFinite(shift.value) || shift.value < 0) {
          metric.total = Number.NaN;
        } else if (!shift.hadRecentInput) {
          metric.total = (metric.total ?? 0) + shift.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }
  const style = document.createElement('style');
  const lineHeight = fontSize === 32 ? 40 : fontSize === 24 ? 32 : 16;
  style.textContent = `[data-testid="onboarding-flow-status"] > p {font-size:${fontSize}px;line-height:${lineHeight}px}`;
  // Delay only presentation, so even a fast hydration must expose the
  // unguided first frame. Provider, token and send state stay unchanged.
  const delay = document.createElement('style');
  delay.id = 'claim-delay-guidance';
  delay.textContent =
    '[data-testid="onboarding-flow-status"] > p[role="status"] {display:none!important}';
  const installTextSize = () => {
    if (document.head && !style.isConnected) document.head.append(style, delay);
  };
  new MutationObserver(installTextSize).observe(document, {
    childList: true,
    subtree: true,
  });
  installTextSize();
  const sample = () => {
    const elements = [
      '[data-testid="onboarding-empty-intro"] h1',
      '[data-testid="chat-empty-state-centered-composer"]',
      '[aria-label="Chat message input" i]',
      'button[aria-label="Send message"]',
    ].map(selector => document.querySelector(selector));
    const boxes = elements.map(element => element?.getBoundingClientRect());
    if (boxes.every(box => box && box.width > 0 && box.height > 0)) {
      const positions = boxes.map(box => box!.y);
      const guidance = document.querySelector(
        '[data-testid="onboarding-flow-status"] > p[role="status"]'
      );
      if (!metric.first) {
        metric.first = positions;
        metric.unguidedFirst = !guidance?.getBoundingClientRect().height;
      }
      if (guidance?.getBoundingClientRect().height) metric.guided = positions;
    }
    if (!metric.guided) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

export function installReplyLayoutProbe(): void {
  const supported =
    typeof PerformanceObserver === 'function' &&
    PerformanceObserver.supportedEntryTypes.includes('layout-shift');
  const metric = {
    supported,
    total: supported ? 0 : (null as number | null),
  };
  window.__claimLayout = metric;
  if (!metric.supported) return;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const shift = entry as PerformanceEntry & {
        hadRecentInput: boolean;
        value: number;
      };
      if (!shift.hadRecentInput)
        metric.total = (metric.total ?? 0) + shift.value;
    }
  }).observe({ type: 'layout-shift' });
}
