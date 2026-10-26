import { runInNewContext } from 'node:vm';
import type { Page } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectEssentialViewport } from '../../e2e/helpers/golden-path-keyframes';

const requiredSelectors = ['#input', '#send'];
const options = { whenRenderedSelectors: ['#intro'] };
let boxes: WeakMap<Element, DOMRect>;
let page: Page;
let originalElementFromPoint: PropertyDescriptor | undefined;

function element(selector: string): HTMLElement {
  const match = document.querySelector<HTMLElement>(selector);
  if (!match) throw new Error(`Missing test fixture ${selector}`);
  return match;
}

function setBox(
  target: Element,
  x: number,
  y: number,
  width = 240,
  height = 40
) {
  boxes.set(target, new DOMRect(x, y, width, height));
}

beforeEach(() => {
  boxes = new WeakMap();
  document.body.innerHTML = `
    <style>* { opacity: 1; visibility: visible; }</style>
    <h1 id="intro">Your first message</h1>
    <textarea id="input"></textarea>
    <button id="send">Send</button>`;
  setBox(element('#intro'), 20, 20);
  setBox(element('#input'), 20, 120);
  setBox(element('#send'), 270, 120, 80);
  vi.stubGlobal('visualViewport', {
    offsetLeft: 0,
    offsetTop: 0,
    width: 390,
    height: 844,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (getComputedStyle(this).display === 'none') return new DOMRect();
      return boxes.get(this) ?? new DOMRect();
    }
  );
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    function (this: HTMLElement) {
      const rect = this.getBoundingClientRect();
      const rects = rect.width > 0 && rect.height > 0 ? [rect] : [];
      return Object.assign(rects, {
        item: (index: number) => rects[index] ?? null,
      });
    }
  );
  originalElementFromPoint = Object.getOwnPropertyDescriptor(
    document,
    'elementFromPoint'
  );
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: (x: number, y: number) =>
      Array.from(document.querySelectorAll<HTMLElement>('body *'))
        .reverse()
        .find(target => {
          const rect = target.getBoundingClientRect();
          return (
            x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
          );
        }) ?? null,
  });
  page = {
    evaluate: vi.fn(async (source: string) => {
      // A browser command may execute after the caller's current DOM state.
      await Promise.resolve();
      return runInNewContext(source, { window, document, getComputedStyle });
    }),
  } as unknown as Page;
});

afterEach(() => {
  document.body.replaceChildren();
  if (originalElementFromPoint) {
    Object.defineProperty(
      document,
      'elementFromPoint',
      originalElementFromPoint
    );
  } else {
    Reflect.deleteProperty(document, 'elementFromPoint');
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('current-state essential viewport audit', () => {
  it('audits rendered optional landmarks and required controls together', async () => {
    expect(
      await inspectEssentialViewport(page, requiredSelectors, options)
    ).toEqual({
      supported: true,
      findings: [],
    });
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('uses the snapshot after an intro disappears instead of a stale required selection', async () => {
    // This is the state transition that could happen after isVisible() but
    // before the old audit: the starter replaces its heading with a message.
    const staleSelection = inspectEssentialViewport(page, [
      ...requiredSelectors,
      '#intro',
    ]);
    const currentState = inspectEssentialViewport(
      page,
      requiredSelectors,
      options
    );
    element('#intro').remove();

    expect((await staleSelection).findings).toEqual([
      { selector: '#intro', reason: 'missing' },
    ]);
    expect(await currentState).toEqual({ supported: true, findings: [] });
  });

  it.each(['display: none', 'visibility: hidden', 'width: 0'])(
    'omits an optional landmark without a visible layout box (%s)',
    async style => {
      if (style === 'width: 0') {
        setBox(element('#intro'), 20, 20, 0);
      } else {
        element('#intro').style.cssText = style;
      }
      expect(
        await inspectEssentialViewport(page, requiredSelectors, options)
      ).toEqual({
        supported: true,
        findings: [],
      });
    }
  );

  it.each(['self', 'ancestor'])(
    'still rejects a rendered optional landmark with zero opacity on its %s',
    async target => {
      if (target === 'self') {
        element('#intro').style.opacity = '0';
      } else {
        const wrapper = document.createElement('div');
        wrapper.style.opacity = '0';
        element('#intro').before(wrapper);
        wrapper.append(element('#intro'));
      }
      expect(
        (await inspectEssentialViewport(page, requiredSelectors, options))
          .findings
      ).toEqual([{ selector: '#intro', reason: 'missing' }]);
    }
  );

  it('rejects clipping of a rendered optional landmark', async () => {
    setBox(element('#intro'), 360, 20);
    expect(
      (await inspectEssentialViewport(page, requiredSelectors, options))
        .findings
    ).toEqual([
      expect.objectContaining({ selector: '#intro', reason: 'clipped' }),
    ]);
  });

  it('rejects an occluded optional landmark and restores its pointer-events', async () => {
    element('#intro').style.pointerEvents = 'none';
    const cover = document.createElement('div');
    document.body.append(cover);
    setBox(cover, 20, 20);
    expect(
      (await inspectEssentialViewport(page, requiredSelectors, options))
        .findings
    ).toEqual([
      expect.objectContaining({ selector: '#intro', reason: 'occluded' }),
    ]);
    expect(element('#intro').style.pointerEvents).toBe('none');
  });

  it('rejects duplicate rendered optional landmarks', async () => {
    const duplicate = element('#intro').cloneNode(true) as HTMLElement;
    document.body.append(duplicate);
    setBox(duplicate, 20, 65);
    expect(
      (await inspectEssentialViewport(page, requiredSelectors, options))
        .findings
    ).toEqual([{ selector: '#intro', reason: 'duplicate' }]);
  });

  it('still rejects a missing required control when optional landmarks disappear', async () => {
    element('#intro').remove();
    element('#input').remove();
    expect(
      (await inspectEssentialViewport(page, requiredSelectors, options))
        .findings
    ).toEqual([{ selector: '#input', reason: 'missing' }]);
  });
});
