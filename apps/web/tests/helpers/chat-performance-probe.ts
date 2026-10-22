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

export interface ComposerEditTiming {
  readonly handledMs: number;
  readonly presentedMs: number;
}

export interface BrowserChatProbe {
  dataReadyMs?: number;
  fetchStartedMs?: number;
  frameId?: number;
  firstFeedbackMs?: number;
  longTaskDurations: number[];
  longTaskObserver?: PerformanceObserver;
  observer: MutationObserver;
  originalFetch: typeof window.fetch;
  renderToInteractiveMs?: number;
  nextInput?: ComposerEditTiming;
  start: number;
  usableStateMs?: number;
  edit: (value: string) => Promise<ComposerEditTiming>;
  dispose: () => void;
}

declare global {
  interface Window {
    __jovieChatPerformanceProbe?: BrowserChatProbe;
  }
}

/** Self-contained because Playwright serializes this callback into the browser. */
export function installBrowserChatProbe({
  assistant,
  nextInput = 'Next message',
  rootSelector = 'body',
  user,
}: {
  assistant: string;
  nextInput?: string;
  rootSelector?: string;
  user: string;
}) {
  const probeWindow = window;
  const previous = probeWindow.__jovieChatPerformanceProbe;
  previous?.dispose();
  const mountedRoot = document.querySelector(rootSelector);
  if (!mountedRoot) throw new Error('Chat probe root is not mounted');
  const root = mountedRoot;
  const inputFrames = new Set<number>();
  const pendingEdits = new Set<() => void>();
  let disposed = false;

  const start = performance.now();
  const observer = new MutationObserver(() => schedulePresentedRows());
  const probe: BrowserChatProbe = {
    start,
    observer,
    longTaskDurations: [],
    originalFetch: window.fetch,
    edit,
    dispose,
  };
  function dispose() {
    disposed = true;
    probe.observer.disconnect();
    probe.longTaskObserver?.disconnect();
    if (probe.frameId !== undefined) cancelAnimationFrame(probe.frameId);
    for (const frame of inputFrames) cancelAnimationFrame(frame);
    for (const cancel of pendingEdits) cancel();
    window.fetch = probe.originalFetch;
  }
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
    const isChatPost =
      new URL(url, window.location.origin).pathname === '/api/chat';
    if (probe.fetchStartedMs === undefined && isChatPost) {
      probe.fetchStartedMs = performance.now() - probe.start;
    }
    const response = originalFetch(input, init);
    if (!isChatPost) return response;
    return response.then(resolved => {
      if (probe.dataReadyMs === undefined) {
        probe.dataReadyMs = performance.now() - probe.start;
      }
      return resolved;
    });
  };

  // Read the actual message rows after a paint opportunity. Body text can
  // include hidden/history/template content that was never presented.
  const isPresented = (row: HTMLElement) => {
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
  };
  const hasPresentedRow = (testId: string, text: string) =>
    Array.from(
      root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)
    ).some(row => (row.textContent ?? '').includes(text) && isPresented(row));

  function edit(value: string): Promise<ComposerEditTiming> {
    return new Promise<ComposerEditTiming>((resolve, reject) => {
      const composer = root.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Chat Message Input"]'
      );
      if (disposed || !composer || composer.disabled || composer.readOnly) {
        reject(new Error('Composer cannot receive input'));
        return;
      }
      composer.focus();
      // defaultValue is React's committed controlled value. A native edit changes
      // only value. Observing value alone would pass with a missing/blocked handler.
      if (composer.defaultValue === value) {
        reject(new Error('Probe edit must change the committed draft'));
        return;
      }
      let handledMs: number | undefined;
      let committedFrame = false;
      const editStart = performance.now();
      const cancel = () => reject(new Error('Composer probe disposed'));
      pendingEdits.add(cancel);
      const schedule = (callback: FrameRequestCallback) => {
        const id = requestAnimationFrame(time => {
          inputFrames.delete(id);
          callback(time);
        });
        inputFrames.add(id);
      };
      const check = () => {
        if (disposed) return;
        if (performance.now() - editStart > 5000) {
          pendingEdits.delete(cancel);
          reject(new Error('Composer did not handle and present the edit'));
          return;
        }
        const committed =
          composer.defaultValue === value && composer.value === value;
        if (committed && handledMs === undefined)
          handledMs = performance.now() - editStart;
        if (
          committed &&
          committedFrame &&
          document.activeElement === composer &&
          isPresented(composer)
        ) {
          pendingEdits.delete(cancel);
          resolve({
            handledMs: handledMs!,
            presentedMs: performance.now() - editStart,
          });
          return;
        }
        committedFrame = committed;
        schedule(check);
      };
      // Start in the browser task that dispatches input, after locator/actionability
      // work. The prototype setter bypasses React's value tracker, as a real edit does.
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )!.set!.call(composer, value);
      composer.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: value,
        })
      );
      if (composer.defaultValue === value)
        handledMs = performance.now() - editStart;
      schedule(check);
    });
  }

  let nextInputStarted = false;
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
    }
    // Dispatch the next edit at the presentation checkpoint itself. No runner
    // round trip or enabled-textarea shortcut can hide blocked input handling.
    if (probe.usableStateMs !== undefined && !nextInputStarted) {
      const composer = root.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Chat Message Input"]'
      );
      if (
        composer &&
        !composer.disabled &&
        !composer.readOnly &&
        document.activeElement === composer
      ) {
        nextInputStarted = true;
        void probe
          .edit(nextInput)
          .then(timing => {
            if (disposed) return;
            probe.nextInput = timing;
            probe.renderToInteractiveMs =
              performance.now() - probe.start - probe.usableStateMs!;
          })
          .catch(() => {
            // Missing readiness remains missing; readChatProbe fails closed.
          });
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
  probeWindow.__jovieChatPerformanceProbe = probe;
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
