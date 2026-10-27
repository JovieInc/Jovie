import { runInNewContext } from 'node:vm';
import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectEssentialViewport } from '../../e2e/helpers/golden-path-keyframes';
import { inspectStartEntryEssentialViewport } from '../../e2e/utils/start-entry-layout';

const input = '[aria-label="Chat message input" i]';
const action =
  'button[aria-label="Send message"], button[aria-label="Stop generating"], button[aria-label="Interrupt and send"]';
const intro = '[data-testid="onboarding-empty-intro"] h1';
const status = '[data-testid="onboarding-flow-status"] [role="status"]';

function box(element: HTMLElement): DOMRect {
  const [x, y, width, height] = (element.dataset.box ?? '0,0,390,844')
    .split(',')
    .map(Number);
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  };
}

function visible(element: Element) {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node.hasAttribute('hidden') || style.display === 'none') return false;
  }
  return true;
}

function pageAtAuditBoundary(transition: () => void = () => {}): Page {
  return {
    locator: (selector: string) => ({
      isVisible: async () => {
        const element = document.querySelector(selector);
        return Boolean(element && visible(element));
      },
    }),
    evaluate: async (source: string) => {
      // The same DOM transition precedes the audit in both implementations.
      // Run the real serialized audit; do not duplicate its selection or checks.
      transition();
      return runInNewContext(source, { window, document, getComputedStyle });
    },
  } as unknown as Page;
}

function addStatus(attributes = '') {
  document
    .querySelector('main')!
    .insertAdjacentHTML(
      'beforeend',
      `<div data-testid="onboarding-flow-status"><p role="status" data-box="20,180,200,44" ${attributes}>Checking</p></div>`
    );
  return document.querySelector<HTMLElement>(status)!;
}

beforeEach(() => {
  document.body.innerHTML = `
    <main data-onboarding-session>
      <div data-testid="onboarding-empty-intro"><h1 data-box="20,20,200,50">Welcome</h1></div>
      <textarea aria-label="Chat message input" data-box="20,120,200,44"></textarea>
      <button aria-label="Send message" data-box="240,120,100,44">Send</button>
    </main>`;
  vi.stubGlobal('visualViewport', {
    offsetLeft: 0,
    offsetTop: 0,
    width: 390,
    height: 844,
  });
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const style = computedStyle(element);
    // jsdom leaves the browser's initial opacity value empty.
    return new Proxy(style, {
      get: (target, property) =>
        property === 'opacity'
          ? target.opacity || '1'
          : Reflect.get(target, property),
    });
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return box(this);
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    function (this: HTMLElement) {
      return (visible(this) ? [box(this)] : []) as unknown as DOMRectList;
    }
  );
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-box]'))
        .reverse()
        .find(element => {
          const rect = box(element);
          return (
            visible(element) &&
            element.style.pointerEvents !== 'none' &&
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          );
        }) ?? document.body,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'elementFromPoint');
  document.body.innerHTML = '';
});

describe('start entry essential viewport snapshot', () => {
  it('accepts an intro removed at the audit boundary', async () => {
    const page = pageAtAuditBoundary(() =>
      document.querySelector(intro)!.remove()
    );
    expect(await inspectStartEntryEssentialViewport(page)).toEqual({
      supported: true,
      findings: [],
    });
    expect(document.querySelector(intro)).toBeNull();
  });

  it('rejects a clipped optional status introduced at the audit boundary', async () => {
    const page = pageAtAuditBoundary(() => {
      addStatus().dataset.box = '20,830,200,44';
    });
    expect((await inspectStartEntryEssentialViewport(page)).findings).toEqual([
      expect.objectContaining({ selector: status, reason: 'clipped' }),
    ]);
  });

  it.each([input, action])(
    'still requires %s after a transition',
    async selector => {
      const page = pageAtAuditBoundary(() =>
        document.querySelector(selector)!.remove()
      );
      expect((await inspectStartEntryEssentialViewport(page)).findings).toEqual(
        [{ selector, reason: 'missing' }]
      );
    }
  );

  it('accepts the current stop action when it replaces send', async () => {
    const page = pageAtAuditBoundary(() => {
      document
        .querySelector('button')!
        .setAttribute('aria-label', 'Stop generating');
    });
    expect((await inspectStartEntryEssentialViewport(page)).findings).toEqual(
      []
    );
  });

  it('rejects two visible current actions', async () => {
    const button = document.querySelector('button')!;
    const stop = button.cloneNode(true) as HTMLElement;
    stop.setAttribute('aria-label', 'Stop generating');
    button.after(stop);
    expect(
      (await inspectStartEntryEssentialViewport(pageAtAuditBoundary())).findings
    ).toEqual([{ selector: action, reason: 'duplicate' }]);
  });

  it('rejects duplicate visible optional statuses', async () => {
    addStatus();
    addStatus();
    expect(
      (await inspectStartEntryEssentialViewport(pageAtAuditBoundary())).findings
    ).toEqual([{ selector: status, reason: 'duplicate' }]);
  });

  it('ignores a hidden optional alternative alongside its visible sibling', async () => {
    addStatus('hidden');
    addStatus();
    expect(
      (await inspectStartEntryEssentialViewport(pageAtAuditBoundary())).findings
    ).toEqual([]);
  });

  it('rejects an occluded optional status and restores pointer events', async () => {
    const message = addStatus();
    message.style.pointerEvents = 'none';
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div data-box="20,180,200,44">Cover</div>'
    );
    expect(
      (await inspectStartEntryEssentialViewport(pageAtAuditBoundary())).findings
    ).toEqual([
      expect.objectContaining({ selector: status, reason: 'occluded' }),
    ]);
    expect(message.style.pointerEvents).toBe('none');
  });

  it('keeps the one-pixel clipping tolerance for visible optional states', async () => {
    const message = addStatus();
    message.dataset.box = '20,801,200,44';
    expect(
      (await inspectStartEntryEssentialViewport(pageAtAuditBoundary())).findings
    ).toEqual([]);
    message.dataset.box = '20,802,200,44';
    expect(
      (await inspectStartEntryEssentialViewport(pageAtAuditBoundary())).findings
    ).toEqual([
      expect.objectContaining({ selector: status, reason: 'clipped' }),
    ]);
  });

  it('preserves required-only callers and unavailable viewport evidence', async () => {
    expect(
      (await inspectEssentialViewport(pageAtAuditBoundary(), ['#missing']))
        .findings
    ).toEqual([{ selector: '#missing', reason: 'missing' }]);
    vi.stubGlobal('visualViewport', undefined);
    expect(
      await inspectStartEntryEssentialViewport(pageAtAuditBoundary())
    ).toEqual({
      supported: false,
      findings: [],
    });
  });
});
