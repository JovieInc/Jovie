import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
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

type Probe = {
  start: number;
  fetchStartedMs?: number;
  firstFeedbackMs?: number;
  usableStateMs?: number;
  renderToInteractiveMs?: number;
  frameId?: number;
  observer: MutationObserver;
};
const probeWindow = window as Window & { __jovieChatPerformanceProbe?: Probe };

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
    probeWindow.__jovieChatPerformanceProbe?.observer.disconnect();
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
    probe.start = 1000;
    now = 1007;
    await window.fetch('/api/chat');
    expect(probe.fetchStartedMs).toBe(7);

    const hidden = row('chat-user-bubble', 'Sent message');
    hidden.style.display = 'none';
    row('chat-message-reply', 'Received reply', innerHeight + 10);
    await Promise.resolve();
    frame(1010);
    frame(1020);
    expect(probe.firstFeedbackMs).toBeUndefined();
    expect(probe.usableStateMs).toBeUndefined();

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

  it('intersects horizontal and nested clipping regions before scoring a row', async () => {
    installBrowserChatProbe({
      user: 'Sent message',
      assistant: 'Received reply',
    });
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
});
