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

/** Self-contained because Playwright serializes this callback into the browser. */
export function installBrowserChatProbe({
  assistant,
  user,
}: {
  assistant: string;
  user: string;
}) {
  const probeWindow = window as Window & {
    __jovieChatPerformanceProbe?: {
      dataReadyMs?: number;
      fetchStartedMs?: number;
      frameId?: number;
      firstFeedbackMs?: number;
      longTaskDurations: number[];
      longTaskObserver?: PerformanceObserver;
      observer: MutationObserver;
      originalFetch: typeof window.fetch;
      renderToInteractiveMs?: number;
      start: number;
      usableStateMs?: number;
    };
  };
  const previous = probeWindow.__jovieChatPerformanceProbe;
  previous?.observer.disconnect();
  previous?.longTaskObserver?.disconnect();
  if (previous?.frameId !== undefined) cancelAnimationFrame(previous.frameId);
  if (previous) window.fetch = previous.originalFetch;

  const start = performance.now();
  const probe = {
    start,
    observer: undefined as unknown as MutationObserver,
    longTaskDurations: [],
    originalFetch: window.fetch,
  } as NonNullable<typeof probeWindow.__jovieChatPerformanceProbe>;
  try {
    probe.longTaskObserver = new PerformanceObserver(list => {
      probe.longTaskDurations.push(
        ...list.getEntries().map(entry => entry.duration)
      );
    });
    probe.longTaskObserver.observe({ type: 'longtask' });
  } catch {
    // Long-task entries are unavailable in some browser engines.
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (
      probe.fetchStartedMs === undefined &&
      new URL(url, window.location.origin).pathname === '/api/chat'
    ) {
      probe.fetchStartedMs = performance.now() - probe.start;
    }
    return originalFetch(input, init);
  };

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
    if (probeWindow.__jovieChatPerformanceProbe !== probe) return;
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
    } else if (
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
    if (probe.frameId !== undefined) return;
    probe.frameId = requestAnimationFrame(() => {
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
