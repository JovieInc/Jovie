import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BrowserChatProbe,
  installBrowserChatProbe,
  roundTripCopy,
  roundTripFromRequest,
} from './chat-performance-probe';

describe('chat performance fixtures', () => {
  it('matches all warmups and scored turns from submitted content, including after index reset', () => {
    const history: unknown[] = [];
    for (const [label, count] of [
      ['Warmup', 3],
      ['Performance', 5],
    ] as const) {
      for (let index = 0; index < count; index += 1) {
        const copy = roundTripCopy(label, index);
        history.push({
          role: 'user',
          parts: [{ type: 'text', text: copy.userText }],
        });
        expect(roundTripFromRequest({ messages: history })).toEqual(copy);
        history.push({
          role: 'assistant',
          parts: [{ type: 'text', text: copy.assistantText }],
        });
      }
    }
  });

  it('rejects missing or unexpected submitted messages instead of silently replying with another fixture', () => {
    expect(() => roundTripFromRequest({})).toThrow('Missing chat messages');
    expect(() => roundTripFromRequest({ messages: [] })).toThrow(
      'Missing user message parts'
    );
    expect(() =>
      roundTripFromRequest({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Another request' }] },
        ],
      })
    ).toThrow('Unexpected ratchet message');
  });
});

const probeWindow = window as Window & {
  __jovieChatPerformanceProbe?: BrowserChatProbe;
};

describe('chat performance presentation probe (synthetic DOM/clock)', () => {
  let now = 100;
  let nextFrame = 0;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    now = 100;
    nextFrame = 0;
    frames = new Map();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(() => {
    probeWindow.__jovieChatPerformanceProbe?.stop();
    delete probeWindow.__jovieChatPerformanceProbe;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function frame(time: number) {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  }

  function row(testId: string, text: string, top = 10) {
    const element = document.createElement('div');
    element.dataset.testid = testId;
    element.textContent = text;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 20,
      left: 10,
      right: 210,
      width: 200,
      height: 20,
    } as DOMRect);
    document.body.append(element);
    return element;
  }

  it('uses the action-time clock for fetch and presented rows, excluding setup and hidden matching text', async () => {
    installBrowserChatProbe({
      user: 'Sent message',
      assistant: 'Received reply',
    });
    const probe = probeWindow.__jovieChatPerformanceProbe!;
    probe.markSend();
    probe.start = 1000;
    now = 1014;
    await window.fetch('/api/chat', { method: 'POST' });
    expect(probe.fetchStartedMs).toBe(14);
    expect(probe.dataReadyMs).toBe(14);

    const hidden = row('chat-user-bubble', 'Sent message');
    hidden.style.display = 'none';
    row('chat-message-reply', 'Received reply', innerHeight + 10);
    await Promise.resolve();
    frame(1010);
    frame(1020);
    expect(probe.firstFeedbackMs).toBeUndefined();
    expect(probe.usableStateMs).toBeUndefined();

    if (probeWindow.__jovieChatPerformanceProbe!.sendMs === undefined)
      probeWindow.__jovieChatPerformanceProbe!.markSend();
    row('chat-user-bubble', 'Sent message');
    row('chat-message-reply', 'Received reply');
    const composer = document.createElement('textarea');
    composer.setAttribute('aria-label', 'Chat Message Input');
    composer.disabled = true;
    document.body.append(composer);
    await Promise.resolve();
    frame(1030);
    expect(probe.firstFeedbackMs).toBeUndefined();
    frame(1040);
    expect(probe.firstFeedbackMs).toBe(40);
    expect(probe.usableStateMs).toBe(40);
    frame(1050);
    frame(1060);
    expect(probe.renderToInteractiveMs).toBeUndefined();
    composer.disabled = false;
    frame(1070);
    frame(1080);
    expect(probe.renderToInteractiveMs).toBe(40);
    expect(frames.size).toBe(0);
  });

  it('rejects visible-looking rows inside a hidden ancestor or clipped scroll region', async () => {
    installBrowserChatProbe({
      user: 'Sent message',
      assistant: 'Received reply',
    });
    probeWindow.__jovieChatPerformanceProbe!.markSend();
    const hiddenParent = document.createElement('div');
    hiddenParent.style.opacity = '0';
    hiddenParent.append(row('chat-user-bubble', 'Sent message'));
    document.body.append(hiddenParent);
    const clippedParent = document.createElement('div');
    clippedParent.style.overflowY = 'auto';
    vi.spyOn(clippedParent, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 200,
    } as DOMRect);
    clippedParent.append(row('chat-message-reply', 'Received reply'));
    document.body.append(clippedParent);
    await Promise.resolve();
    frame(110);
    frame(120);
    const probe = probeWindow.__jovieChatPerformanceProbe!;
    expect(probe.firstFeedbackMs).toBeUndefined();
    expect(probe.usableStateMs).toBeUndefined();
  });

  it('scores a composer already enabled when the reply is presented without adding two more frame waits', async () => {
    installBrowserChatProbe({
      user: 'Sent message',
      assistant: 'Received reply',
    });
    const probe = probeWindow.__jovieChatPerformanceProbe!;
    probe.markSend();
    probe.start = 1000;
    if (probeWindow.__jovieChatPerformanceProbe!.sendMs === undefined)
      probeWindow.__jovieChatPerformanceProbe!.markSend();
    row('chat-user-bubble', 'Sent message');
    row('chat-message-reply', 'Received reply');
    const composer = document.createElement('textarea');
    composer.setAttribute('aria-label', 'Chat Message Input');
    document.body.append(composer);
    await Promise.resolve();
    frame(1016);
    // Readiness still waits for the reply's actual paint opportunity.
    expect(probe.usableStateMs).toBeUndefined();
    expect(probe.renderToInteractiveMs).toBeUndefined();
    frame(1032);
    expect(probe.usableStateMs).toBe(32);
    expect(probe.renderToInteractiveMs).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('records a real readiness delay above the unchanged 50ms budget', async () => {
    installBrowserChatProbe({
      user: 'Sent message',
      assistant: 'Received reply',
    });
    if (probeWindow.__jovieChatPerformanceProbe!.sendMs === undefined)
      probeWindow.__jovieChatPerformanceProbe!.markSend();
    row('chat-user-bubble', 'Sent message');
    row('chat-message-reply', 'Received reply');
    const composer = document.createElement('textarea');
    composer.setAttribute('aria-label', 'Chat Message Input');
    composer.disabled = true;
    document.body.append(composer);
    await Promise.resolve();
    frame(110);
    frame(120);
    const probe = probeWindow.__jovieChatPerformanceProbe!;
    frame(140);
    frame(160);
    expect(probe.renderToInteractiveMs).toBeUndefined();
    composer.disabled = false;
    frame(180);
    frame(200);
    expect(probe.renderToInteractiveMs).toBe(80);
  });

  it('intersects horizontal and nested clipping regions before scoring a row', async () => {
    installBrowserChatProbe({
      user: 'Sent message',
      assistant: 'Received reply',
    });
    probeWindow.__jovieChatPerformanceProbe!.markSend();
    const horizontal = document.createElement('div');
    horizontal.style.overflowX = 'hidden';
    vi.spyOn(horizontal, 'getBoundingClientRect').mockReturnValue({
      left: 300,
      right: 500,
    } as DOMRect);
    horizontal.append(row('chat-user-bubble', 'Sent message'));
    document.body.append(horizontal);

    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.style.overflowY = 'hidden';
    inner.style.overflowY = 'hidden';
    vi.spyOn(outer, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 20,
    } as DOMRect);
    vi.spyOn(inner, 'getBoundingClientRect').mockReturnValue({
      top: 20,
      bottom: 30,
    } as DOMRect);
    inner.append(row('chat-message-reply', 'Received reply'));
    outer.append(inner);
    document.body.append(outer);
    await Promise.resolve();
    frame(110);
    frame(120);
    const probe = probeWindow.__jovieChatPerformanceProbe!;
    expect(probe.firstFeedbackMs).toBeUndefined();
    expect(probe.usableStateMs).toBeUndefined();
  });
  function mockObservers() {
    const instances: {
      type: string;
      pending: PerformanceEntry[];
      disconnect: ReturnType<typeof vi.fn>;
      deliver: (entries: PerformanceEntry[]) => void;
    }[] = [];
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        static supportedEntryTypes = ['longtask', 'long-animation-frame'];
        type = '';
        pending: PerformanceEntry[] = [];
        disconnect = vi.fn();
        constructor(private callback: PerformanceObserverCallback) {
          instances.push(this);
        }
        observe(options: PerformanceObserverInit) {
          this.type = options.type!;
        }
        takeRecords() {
          return this.pending.splice(0);
        }
        deliver(entries: PerformanceEntry[]) {
          this.callback(
            { getEntries: () => entries } as PerformanceObserverEntryList,
            this as unknown as PerformanceObserver
          );
        }
      }
    );
    return instances;
  }
  const task = (startTime: number, duration: number) =>
    ({ entryType: 'longtask', startTime, duration }) as PerformanceEntry;

  it('keeps tasks overlapping send and stop, drains late records, and excludes setup and later tasks', () => {
    const observers = mockObservers();
    installBrowserChatProbe({ user: 'Sent', assistant: 'Reply' });
    const probe = probeWindow.__jovieChatPerformanceProbe!;
    observers[0].pending.push(task(10, 60));
    now = 200;
    probe.markSend();
    observers[0].deliver([task(100, 60), task(180, 80), task(230, 100)]);
    observers[0].pending.push(task(260, 55), task(400, 60));
    now = 300;
    const receipt = probe.stop();
    expect(receipt.longTasks).toEqual([
      { startMs: -20, durationMs: 80, sourceBucket: 'unknown' },
      { startMs: 30, durationMs: 100, sourceBucket: 'unknown' },
      { startMs: 60, durationMs: 55, sourceBucket: 'unknown' },
    ]);
    expect(receipt.longTaskCount).toBe(3);
    expect(receipt.maxLongTaskMs).toBe(100);
    observers[0].deliver([task(250, 90)]);
    expect(probe.stop()).toBe(receipt);
    expect(
      observers.every(observer => observer.disconnect.mock.calls.length === 1)
    ).toBe(true);
  });

  it('reduces supported script evidence to buckets without guessing script attribution from a long task', () => {
    const observers = mockObservers();
    installBrowserChatProbe({ user: 'Sent', assistant: 'Reply' });
    probeWindow.__jovieChatPerformanceProbe!.markSend();
    observers[1].pending.push({
      entryType: 'long-animation-frame',
      startTime: 100,
      duration: 80,
      scripts: [
        {
          startTime: 105,
          duration: 30,
          sourceURL: `${location.origin}/_next/static/private.js?token=secret`,
        },
        {
          startTime: 135,
          duration: 30,
          sourceURL: 'https://other.example/private.js',
        },
        { startTime: 165, duration: 5 },
      ],
    } as unknown as PerformanceEntry);
    now = 200;
    const receipt = probeWindow.__jovieChatPerformanceProbe!.stop();
    expect(receipt.scripts.map(script => script.sourceBucket)).toEqual([
      'first-party-next',
      'third-party',
      'unknown',
    ]);
    expect(JSON.stringify(receipt)).not.toMatch(/secret|private|https:/);
  });

  it('treats missing and rejected observer APIs as unsupported, with usable fetch checkpoints', async () => {
    for (const implementation of [
      undefined,
      class {
        static supportedEntryTypes = ['longtask'];
        disconnect() {}
        observe() {
          throw new Error('not supported');
        }
      },
    ]) {
      vi.stubGlobal('PerformanceObserver', implementation);
      installBrowserChatProbe({ user: 'Sent', assistant: 'Reply' });
      const probe = probeWindow.__jovieChatPerformanceProbe!;
      probe.markSend();
      now += 10;
      await window.fetch('/api/chat', { method: 'POST' });
      expect(probe.stop()).toMatchObject({
        longTaskSupported: false,
        scriptTimingSupported: false,
        longTasks: [],
        dataReadyMs: 10,
      });
    }
  });

  it('repeated installation cancels callbacks, restores fetch, and ignores a prior pending response', async () => {
    const observers = mockObservers();
    let respond!: (response: Response) => void;
    const originalFetch = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          respond = resolve;
        })
    );
    window.fetch = originalFetch;
    installBrowserChatProbe({ user: 'Old', assistant: 'Old' });
    const old = probeWindow.__jovieChatPerformanceProbe!;
    old.markSend();
    const pending = window.fetch('/api/chat', { method: 'POST' });
    row('chat-user-bubble', 'Old');
    await Promise.resolve();
    frame(110); // Inner animation callback is now queued.
    expect(frames.size).toBe(1);
    installBrowserChatProbe({ user: 'New', assistant: 'New' });
    const current = probeWindow.__jovieChatPerformanceProbe!;
    expect(frames.size).toBe(0);
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    respond(new Response(''));
    await pending;
    expect(old.dataReadyMs).toBeUndefined();
    expect(current.dataReadyMs).toBeUndefined();
    current.stop();
    expect(window.fetch).toBe(originalFetch);
  });
});
