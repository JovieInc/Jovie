/** Browser probes must stay self-contained for Playwright init-script serialization. */

export type ClaimLayoutShiftSource = {
  node: {
    nodeName: string;
    id: string;
    testId: string;
    className: string;
  } | null;
  previous: { x: number; y: number; width: number; height: number } | null;
  current: { x: number; y: number; width: number; height: number } | null;
};

export type ClaimLayoutShiftEntry = {
  value: number;
  hadRecentInput: boolean;
  startTime: number;
  counted: boolean;
  sources: ClaimLayoutShiftSource[];
};

type GuidanceLayoutShiftRect = { y: number; h: number; w: number };

type GuidanceLayoutShiftEntry = {
  value: number;
  startTime: number;
  sources?: {
    node: string | null;
    previous: GuidanceLayoutShiftRect | null;
    current: GuidanceLayoutShiftRect | null;
  }[];
};

declare global {
  interface Window {
    __claimLayout?: { supported: boolean; total: number | null };
    __claimLayoutEntries?: ClaimLayoutShiftEntry[];
    /** Diagnostic: composer child heights, one entry per change, first 4s. */
    __claimComposerFrames?: string[];
    __armClaimLayout?: () => void;
    __claimInitialLayout?: {
      supported: boolean;
      total: number | null;
      unguidedFirst: boolean;
      first: number[] | null;
      guided: number[] | null;
      entries?: GuidanceLayoutShiftEntry[];
      /** Diagnostic: rect heights/tops of the layout chain at both samples. */
      firstDetail?: Record<string, string>;
      guidedDetail?: Record<string, string>;
    };
  }
}

export function installDelayedGuidanceLayoutProbe(fontSize: number): void {
  const supported =
    typeof PerformanceObserver === 'function' &&
    PerformanceObserver.supportedEntryTypes.includes('layout-shift');
  const metric: NonNullable<Window['__claimInitialLayout']> = {
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
          const node = (
            shift as unknown as {
              sources?: Array<{
                node?: Node | null;
                previousRect?: DOMRectReadOnly;
                currentRect?: DOMRectReadOnly;
              }>;
            }
          ).sources?.map(source => {
            const el = source.node instanceof Element ? source.node : null;
            const box = (rect?: DOMRectReadOnly) =>
              rect ? { y: rect.y, h: rect.height, w: rect.width } : null;
            return {
              node: el
                ? (el.getAttribute('data-testid') ??
                  `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
                : null,
              previous: box(source.previousRect),
              current: box(source.currentRect),
            };
          });
          (metric.entries ??= []).push({
            value: shift.value,
            startTime: shift.startTime,
            sources: node,
          });
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
      const detail = () => {
        const out: Record<string, string> = {};
        for (const [name, selector] of [
          ['status', '[data-testid="onboarding-flow-status"]'],
          ['ghost', '[data-testid="onboarding-verification-instruction-size"]'],
          ['composer', '[data-testid="chat-empty-state-centered-composer"]'],
          ['field', '[data-testid="chat-input-inline-field"]'],
          ['textarea', '[aria-label="Chat message input" i]'],
        ] as const) {
          const el = document.querySelector(selector) as HTMLElement | null;
          const r = el?.getBoundingClientRect();
          out[name] = r
            ? `y=${r.y.toFixed(1)} h=${r.height.toFixed(1)}${name === 'textarea' ? ` style=${el?.style.height}` : ''}`
            : 'absent';
        }
        return out;
      };
      if (!metric.first) {
        metric.firstDetail = detail();
        metric.first = positions;
        metric.unguidedFirst = !guidance?.getBoundingClientRect().height;
      }
      if (guidance?.getBoundingClientRect().height) {
        metric.guidedDetail = detail();
        metric.guided = positions;
      }
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
  const entries: ClaimLayoutShiftEntry[] = [];
  // `since` is the open edge of the measured window. It stays at navigation
  // until the settled handoff arms the reply window. Entries are kept, and
  // total is recomputed from startTime, so a late callback cannot add a
  // pre-window shift back after the window opens.
  let since = 0;
  window.__claimLayout = metric;
  window.__claimLayoutEntries = entries;

  const recompute = () => {
    if (!supported) {
      metric.total = null;
      return;
    }
    let total = 0;
    let invalid = false;
    for (const shift of entries) {
      const inWindow = shift.startTime >= since && !shift.hadRecentInput;
      if (!inWindow) {
        shift.counted = false;
        continue;
      }
      if (!Number.isFinite(shift.value)) {
        shift.counted = false;
        invalid = true;
        continue;
      }
      shift.counted = true;
      total += shift.value;
    }
    metric.total = invalid ? Number.NaN : total;
  };

  window.__armClaimLayout = () => {
    if (!supported) return;
    since = performance.now();
    recompute();
  };

  const frames: string[] = [];
  window.__claimComposerFrames = frames;
  let lastSignature = '';
  const sampleComposer = () => {
    const composer = document.querySelector(
      '[data-testid="chat-empty-state-centered-composer"]'
    );
    if (composer) {
      const describe = (el: Element) => {
        const box = el.getBoundingClientRect();
        const tag = el.getAttribute('data-testid') ?? el.tagName.toLowerCase();
        return `${tag}:${box.height.toFixed(0)}`;
      };
      const walk = (el: Element, depth: number): string[] => [
        `${'  '.repeat(depth)}${describe(el)}`,
        ...(depth < 4
          ? [...el.children].flatMap(child => walk(child, depth + 1))
          : []),
      ];
      const kids = [...composer.children].flatMap(child => walk(child, 0));
      const signature = `${composer.getBoundingClientRect().height.toFixed(0)} [${kids.join(' | ')}]`;
      if (signature !== lastSignature) {
        lastSignature = signature;
        frames.push(`${Math.round(performance.now())}ms ${signature}`);
      }
    }
    if (performance.now() < 15000) requestAnimationFrame(sampleComposer);
  };
  requestAnimationFrame(sampleComposer);

  if (!supported) return;

  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const shift = entry as PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
        sources?: Array<{
          node?: Node | null;
          previousRect?: DOMRectReadOnly;
          currentRect?: DOMRectReadOnly;
        }>;
      };
      const sources = (shift.sources ?? []).map(source => {
        const node = source.node instanceof Element ? source.node : null;
        const snapshot = (rect: DOMRectReadOnly | undefined) =>
          rect && Number.isFinite(rect.width)
            ? {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              }
            : null;
        return {
          node: node
            ? {
                nodeName: node.nodeName,
                id: node.id,
                testId: node.getAttribute('data-testid') ?? '',
                className: (node.getAttribute('class') ?? '').slice(0, 160),
              }
            : null,
          previous: snapshot(source.previousRect),
          current: snapshot(source.currentRect),
        };
      });
      entries.push({
        value: typeof shift.value === 'number' ? shift.value : Number.NaN,
        hadRecentInput: Boolean(shift.hadRecentInput),
        startTime: Number.isFinite(shift.startTime) ? shift.startTime : 0,
        counted: false,
        sources,
      });
    }
    recompute();
  }).observe({ type: 'layout-shift' });
}
