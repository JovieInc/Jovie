export function roundTripCopy(label: 'Warmup' | 'Performance', index: number) {
  return {
    userText: `${label} message ${index + 1}`,
    assistantText:
      `${label} reply ${index + 1}. ` +
      'This deterministic response is long enough to exercise the real message list layout.',
  };
}

/** Derive the fixture from the actual newest submitted UI message, not request order. */
export function roundTripFromRequest(body: { messages?: unknown }) {
  if (!Array.isArray(body.messages)) throw new Error('Missing chat messages');
  const message = body.messages.findLast(message => message?.role === 'user');
  if (!Array.isArray(message?.parts))
    throw new Error('Missing user message parts');
  const text = message.parts
    .filter(
      (part: { type?: string; text?: unknown }) =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map((part: { text: string }) => part.text)
    .join('');
  const match = /^(Warmup|Performance) message ([1-9]\d*)$/.exec(text);
  if (!match) throw new Error(`Unexpected ratchet message: ${text}`);
  return roundTripCopy(
    match[1] as 'Warmup' | 'Performance',
    Number(match[2]) - 1
  );
}

export interface ChatProbeTiming {
  readonly startMs: number;
  readonly durationMs: number;
  readonly sourceBucket:
    | 'first-party-next'
    | 'first-party-other'
    | 'third-party'
    | 'unknown';
}

export interface ChatProbeSnapshot {
  readonly sendMs?: number;
  readonly fetchStartedMs?: number;
  readonly dataReadyMs?: number;
  readonly firstFeedbackMs?: number;
  readonly usableStateMs?: number;
  readonly renderToInteractiveMs?: number;
  readonly endMs: number;
  readonly longTaskSupported: boolean;
  readonly scriptTimingSupported: boolean;
  readonly longTasks: readonly ChatProbeTiming[];
  readonly scripts: readonly ChatProbeTiming[];
  readonly longTaskCount: number;
  readonly maxLongTaskMs: number;
}

export interface BrowserChatProbe {
  start: number;
  sendMs?: number;
  fetchStartedMs?: number;
  dataReadyMs?: number;
  firstFeedbackMs?: number;
  usableStateMs?: number;
  renderToInteractiveMs?: number;
  frameId?: number;
  observer: MutationObserver;
  markSend: () => void;
  stop: () => ChatProbeSnapshot;
}

/** Self-contained because Playwright serializes this callback into the browser. */
export function installBrowserChatProbe({
  assistant,
  user,
}: {
  assistant: string;
  user: string;
}) {
  const probeWindow = window as Window & {
    __jovieChatPerformanceProbe?: BrowserChatProbe;
  };
  probeWindow.__jovieChatPerformanceProbe?.stop();
  let active = true;
  let sent = false;
  let end: number | undefined;
  let snapshot: ChatProbeSnapshot | undefined;
  const tasks: ChatProbeTiming[] = [];
  const scripts: ChatProbeTiming[] = [];
  const observers: PerformanceObserver[] = [];
  let longTaskSupported = false;
  let scriptTimingSupported = false;
  const probe: BrowserChatProbe = {
    start: performance.now(),
    observer: undefined as unknown as MutationObserver,
    markSend() {
      if (!active || sent)
        throw new Error('Probe send already marked or stopped');
      for (const observer of observers) observer.takeRecords();
      probe.start = performance.now();
      probe.sendMs = 0;
      sent = true;
    },
    stop() {
      if (snapshot) return snapshot;
      end = performance.now();
      for (const observer of observers) {
        collect(observer.takeRecords());
        observer.disconnect();
      }
      active = false;
      probe.observer.takeRecords();
      probe.observer.disconnect();
      if (probe.frameId !== undefined) cancelAnimationFrame(probe.frameId);
      probe.frameId = undefined;
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      const relative = (entries: ChatProbeTiming[]) =>
        entries
          .filter(
            entry =>
              sent &&
              entry.startMs < end! &&
              entry.startMs + entry.durationMs > probe.start
          )
          .map(entry => ({ ...entry, startMs: entry.startMs - probe.start }));
      const longTasks = relative(tasks);
      snapshot = {
        sendMs: probe.sendMs,
        fetchStartedMs: probe.fetchStartedMs,
        dataReadyMs: probe.dataReadyMs,
        firstFeedbackMs: probe.firstFeedbackMs,
        usableStateMs: probe.usableStateMs,
        renderToInteractiveMs: probe.renderToInteractiveMs,
        endMs: end - probe.start,
        longTaskSupported,
        scriptTimingSupported,
        longTasks,
        scripts: relative(scripts),
        longTaskCount: longTasks.length,
        maxLongTaskMs: Math.max(0, ...longTasks.map(entry => entry.durationMs)),
      };
      return snapshot;
    },
  };
  // Long-task attribution identifies a browsing context, never a script.
  // LoAF script URLs are reduced immediately to fixed buckets and discarded.
  const sourceBucket = (
    source: string | undefined
  ): ChatProbeTiming['sourceBucket'] => {
    if (!source) return 'unknown';
    try {
      const url = new URL(source);
      if (!['http:', 'https:'].includes(url.protocol)) return 'unknown';
      if (url.origin !== location.origin) return 'third-party';
      return url.pathname.startsWith('/_next/')
        ? 'first-party-next'
        : 'first-party-other';
    } catch {
      return 'unknown';
    }
  };
  function collect(entries: PerformanceEntry[]) {
    if (!active || !sent) return;
    for (const entry of entries) {
      if (entry.entryType === 'longtask')
        tasks.push({
          startMs: entry.startTime,
          durationMs: entry.duration,
          sourceBucket: 'unknown',
        });
      if (entry.entryType === 'long-animation-frame') {
        const frame = entry as PerformanceEntry & {
          scripts?: {
            startTime: number;
            duration: number;
            sourceURL?: string;
          }[];
        };
        for (const script of frame.scripts ?? [])
          scripts.push({
            startMs: script.startTime,
            durationMs: script.duration,
            sourceBucket: sourceBucket(script.sourceURL),
          });
      }
    }
  }
  for (const type of ['longtask', 'long-animation-frame']) {
    let observer: PerformanceObserver | undefined;
    try {
      if (
        typeof PerformanceObserver === 'undefined' ||
        !PerformanceObserver.supportedEntryTypes?.includes(type)
      )
        continue;
      observer = new PerformanceObserver(list => collect(list.getEntries()));
      observer.observe({ type });
      observers.push(observer);
      if (type === 'longtask') longTaskSupported = true;
      else scriptTimingSupported = true;
    } catch {
      observer?.disconnect();
    }
  }
  const originalFetch = window.fetch;
  const wrappedFetch: typeof window.fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method =
      init?.method ?? (input instanceof Request ? input.method : 'GET');
    const isChatPost =
      active &&
      sent &&
      method.toUpperCase() === 'POST' &&
      new URL(url, location.origin).pathname === '/api/chat';
    if (isChatPost && probe.fetchStartedMs === undefined)
      probe.fetchStartedMs = performance.now() - probe.start;
    const response = originalFetch.call(window, input, init);
    if (!isChatPost) return response;
    return response.then(resolved => {
      if (active && probe.dataReadyMs === undefined)
        probe.dataReadyMs = performance.now() - probe.start;
      return resolved;
    });
  };
  window.fetch = wrappedFetch;

  // Read the actual message rows after a paint opportunity. Body text can
  // include hidden/history/template content that was never presented.
  const hasPresentedRow = (testId: string, text: string) =>
    Array.from(
      document.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)
    ).some(row => {
      if (!(row.textContent ?? '').includes(text)) return false;
      const rect = row.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom <= 0 ||
        rect.right <= 0 ||
        rect.top >= innerHeight ||
        rect.left >= innerWidth
      ) {
        return false;
      }
      let left = Math.max(0, rect.left);
      let right = Math.min(innerWidth, rect.right);
      let top = Math.max(0, rect.top);
      let bottom = Math.min(innerHeight, rect.bottom);
      for (
        let ancestor: HTMLElement | null = row;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          style.opacity === '0'
        )
          return false;
        if (ancestor !== row) {
          const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
          const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
          if (clipsX || clipsY) {
            const clip = ancestor.getBoundingClientRect();
            if (clipsX) {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
            }
            if (clipsY) {
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
          }
        }
      }
      if (right <= left || bottom <= top) return false;
      return true;
    });

  let renderStart: number | undefined;
  const measurePresentedRows = () => {
    if (!active || probeWindow.__jovieChatPerformanceProbe !== probe) return;
    probe.frameId = undefined;
    const now = performance.now();
    if (
      probe.firstFeedbackMs === undefined &&
      hasPresentedRow('chat-user-bubble', user)
    ) {
      probe.firstFeedbackMs = now - probe.start;
    }
    if (
      probe.usableStateMs === undefined &&
      hasPresentedRow('chat-message-reply', assistant)
    ) {
      probe.usableStateMs = now - probe.start;
      renderStart = now;
    }
    // The reply has already had a paint opportunity. An enabled composer
    // at this same checkpoint is interactive now; another double-rAF would
    // add the probe's own frame delay to the product's readiness latency.
    if (
      renderStart !== undefined &&
      probe.renderToInteractiveMs === undefined
    ) {
      const composer = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Chat Message Input"]'
      );
      if (composer && !composer.disabled) {
        probe.renderToInteractiveMs = now - renderStart;
      }
    }
    if (
      probe.firstFeedbackMs === undefined ||
      probe.usableStateMs === undefined ||
      probe.renderToInteractiveMs === undefined
    ) {
      schedulePresentedRows();
    }
  };
  const schedulePresentedRows = () => {
    if (!active || !sent || probe.frameId !== undefined) return;
    probe.frameId = requestAnimationFrame(() => {
      if (!active) return;
      probe.frameId = requestAnimationFrame(measurePresentedRows);
    });
  };
  const observer = new MutationObserver(schedulePresentedRows);

  probe.observer = observer;
  probeWindow.__jovieChatPerformanceProbe = probe;
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
