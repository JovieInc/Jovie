/** Browser probes must stay self-contained for Playwright init-script serialization. */
import type { Page } from '@playwright/test';
import { inspectEssentialViewport } from '../helpers/golden-path-keyframes';

export async function inspectStartEntryEssentialViewport(page: Page) {
  return inspectEssentialViewport(
    page,
    [
      '[aria-label="Chat message input" i]',
      'button[aria-label="Send message"], button[aria-label="Stop generating"], button[aria-label="Interrupt and send"]',
    ],
    [
      '[data-testid="onboarding-empty-intro"] h1',
      '[data-testid="onboarding-flow-status"] [role="status"]',
      '[data-testid="onboarding-turnstile-widget-frame"][data-turnstile-mount="inline"]',
      '[data-onboarding-session] [role="alert"]',
    ]
  );
}

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

/** Numeric-only projection for job logs; never serialize DOM identity or text. */
export function projectReplyLayoutEvidence(
  snapshot:
    | {
        supported: boolean;
        total: number | null;
        windowStart: number;
        measuredAt: number;
        entries: readonly ClaimLayoutShiftEntry[];
      }
    | undefined
) {
  if (!snapshot) return { available: false };
  const numberOrNull = (value: number | null) =>
    Number.isFinite(value) ? value : null;
  const rect = (value: ClaimLayoutShiftSource['previous']) =>
    value
      ? {
          x: numberOrNull(value.x),
          y: numberOrNull(value.y),
          width: numberOrNull(value.width),
          height: numberOrNull(value.height),
          finite: [value.x, value.y, value.width, value.height].every(
            Number.isFinite
          ),
        }
      : null;
  return {
    available: true,
    supported: snapshot.supported,
    total: numberOrNull(snapshot.total),
    totalFinite: Number.isFinite(snapshot.total),
    windowStart: numberOrNull(snapshot.windowStart),
    windowStartFinite: Number.isFinite(snapshot.windowStart),
    measuredAt: numberOrNull(snapshot.measuredAt),
    measuredAtFinite: Number.isFinite(snapshot.measuredAt),
    entries: snapshot.entries.map(entry => ({
      value: numberOrNull(entry.value),
      valueFinite: Number.isFinite(entry.value),
      startTime: numberOrNull(entry.startTime),
      startTimeFinite: Number.isFinite(entry.startTime),
      hadRecentInput: entry.hadRecentInput,
      counted: entry.counted,
      sources: entry.sources.map(source => ({
        previous: rect(source.previous),
        current: rect(source.current),
      })),
    })),
  };
}

export type ClaimSignInFrame = {
  startTime: number;
  text: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  style: {
    font: string;
    fontSize: string;
    fontFamily: string;
    paddingInlineStart: string;
    paddingInlineEnd: string;
    borderInlineStartWidth: string;
    borderInlineEndWidth: string;
  } | null;
  fontStatus: FontFaceSet['status'] | null;
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
    __claimLayout?: {
      supported: boolean;
      total: number | null;
      windowStart: number;
    };
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
      /** Diagnostic: changed sign-in text/style/geometry frames, first 2s. */
      signInFrames?: ClaimSignInFrame[];
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
  // Observe the sign-in control separately: the guidance geometry sampler
  // stops once guidance appears, before late text or font changes can land.
  // Read only, retain changes only, and stop after two seconds.
  const signInFrames: ClaimSignInFrame[] = [];
  metric.signInFrames = signInFrames;
  const signInDeadline = performance.now() + 2000;
  let previousSignInSignature = '';
  const sampleSignIn = () => {
    const link = document.querySelector(
      '[data-testid="onboarding-sign-in-header"] a.btn-linear-login'
    );
    const rect = link?.getBoundingClientRect();
    const style = link ? getComputedStyle(link) : null;
    const snapshot: Omit<ClaimSignInFrame, 'startTime'> = {
      text: link?.textContent ?? null,
      rect: rect
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null,
      style: style
        ? {
            font: style.font,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            paddingInlineStart: style.paddingInlineStart,
            paddingInlineEnd: style.paddingInlineEnd,
            borderInlineStartWidth: style.borderInlineStartWidth,
            borderInlineEndWidth: style.borderInlineEndWidth,
          }
        : null,
      fontStatus: document.fonts?.status ?? null,
    };
    const signature = JSON.stringify(snapshot);
    if (signature !== previousSignInSignature) {
      previousSignInSignature = signature;
      signInFrames.push({ startTime: performance.now(), ...snapshot });
    }
    if (performance.now() < signInDeadline) requestAnimationFrame(sampleSignIn);
  };
  requestAnimationFrame(sampleSignIn);
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
    windowStart: 0,
  };
  const entries: ClaimLayoutShiftEntry[] = [];
  // `since` is the open edge of the measured window. It stays at navigation
  // until the settled handoff arms the reply window. Entries are kept, and
  // total is recomputed from startTime, so a late callback cannot add a
  // pre-window shift back after the window opens.
  let since = metric.windowStart;
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
    metric.windowStart = since;
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
