import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasGenuineBlockingOverlay,
  OVERLAY_LOCK_ATTR,
  restoreLeakedOverlayLocks,
} from './overlay-interaction-lock';

function resetLockDom() {
  document.body.style.removeProperty('pointer-events');
  document.documentElement.removeAttribute(OVERLAY_LOCK_ATTR);
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-desktop-runtime');
}

afterEach(() => {
  cleanup();
  resetLockDom();
});

describe('hasGenuineBlockingOverlay', () => {
  it('treats an open modal dialog as a genuine blocker', () => {
    render(
      <div
        role='dialog'
        aria-modal='true'
        aria-label='Confirm'
        data-state='open'
      >
        Dialog
      </div>
    );
    expect(hasGenuineBlockingOverlay()).toBe('dialog');
  });

  it('treats an open menu as a genuine blocker', () => {
    render(
      <div role='menu' data-state='open'>
        <button type='button' role='menuitem'>
          Edit
        </button>
      </div>
    );
    expect(hasGenuineBlockingOverlay()).toBe('menu');
  });

  it('classifies an open dialog overlay and an open sheet overlay by slot', () => {
    const { unmount } = render(
      <div data-slot='dialog-overlay' data-state='open' />
    );
    expect(hasGenuineBlockingOverlay()).toBe('overlay');
    unmount();

    render(<div data-slot='sheet-overlay' data-state='open' />);
    expect(hasGenuineBlockingOverlay()).toBe('overlay');
  });

  it('does not treat a closed leftover overlay as a genuine blocker', () => {
    render(
      <div
        data-slot='dialog-overlay'
        data-state='closed'
        data-testid='dialog-overlay'
      />
    );
    expect(hasGenuineBlockingOverlay()).toBeNull();
  });

  it('does not treat an inert dialog as a genuine blocker', () => {
    render(
      <div role='dialog' aria-modal='true' aria-label='Stale' inert>
        Stale
      </div>
    );
    expect(hasGenuineBlockingOverlay()).toBeNull();
  });
});

describe('restoreLeakedOverlayLocks', () => {
  it('leaves a leaked body lock in place until restore runs, then clears it', () => {
    document.body.style.pointerEvents = 'none';
    expect(document.body.style.pointerEvents).toBe('none');

    const result = restoreLeakedOverlayLocks();

    expect(result.blocked).toBe(false);
    expect(result.restored).toContain('body-pointer-events');
    expect(document.body.style.pointerEvents).not.toBe('none');
    expect(document.documentElement).not.toHaveAttribute(OVERLAY_LOCK_ATTR);
  });

  it('does not restore body pointer-events while a dialog is open', () => {
    document.body.style.pointerEvents = 'none';
    render(
      <div role='dialog' aria-modal='true' aria-label='Confirm'>
        Dialog
      </div>
    );

    const result = restoreLeakedOverlayLocks();

    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('dialog');
    expect(result.restored).toEqual([]);
    expect(document.body.style.pointerEvents).toBe('none');
    expect(document.documentElement).toHaveAttribute(
      OVERLAY_LOCK_ATTR,
      'dialog'
    );
  });

  it('focuses the chat composer when the active element stays inert', () => {
    const { container } = render(
      <div>
        <div data-app-shell-frame='true'>
          <div id='main-content' inert>
            Library
          </div>
        </div>
        <textarea aria-label='Chat Message Input' />
        <button type='button' inert>
          Stuck
        </button>
      </div>
    );
    const stuck = container.querySelector('button') as HTMLButtonElement;
    const composer = container.querySelector(
      '[aria-label="Chat Message Input"]'
    ) as HTMLTextAreaElement;
    stuck.focus();

    const withComposer = restoreLeakedOverlayLocks();

    expect(withComposer.restored).toContain('focus');
    expect(document.activeElement).toBe(composer);
  });

  it('focuses main when the chat composer is absent and the active element stays inert', () => {
    const { container } = render(
      <div>
        <div data-app-shell-frame='true'>
          <button id='main-content' type='button' inert>
            Library
          </button>
        </div>
        <button type='button' inert>
          Stuck
        </button>
      </div>
    );
    const stuck = container.querySelector(
      'button[type="button"]:not(#main-content)'
    ) as HTMLButtonElement;
    const main = container.querySelector('#main-content') as HTMLButtonElement;
    stuck.focus();

    const result = restoreLeakedOverlayLocks();

    expect(result.restored).toContain('focus');
    expect(document.activeElement).toBe(main);
  });

  it('restores leaked inert on the app-shell main plane after overlays close', () => {
    const { container } = render(
      <div data-app-shell-frame='true'>
        <div id='main-content' data-app-shell-main-content='true' inert>
          Library
        </div>
      </div>
    );
    const main = container.querySelector('#main-content') as HTMLElement;
    main.setAttribute('aria-hidden', 'true');

    const result = restoreLeakedOverlayLocks();

    expect(result.restored).toContain('shell-inert');
    expect(main).not.toHaveAttribute('inert');
    expect(main.inert).toBe(false);
    expect(main).not.toHaveAttribute('aria-hidden');
  });

  it('keeps a closed right-drawer inert', () => {
    const { container } = render(
      <div data-app-shell-frame='true'>
        <div id='main-content'>
          <aside data-testid='app-shell-right-rail'>
            <aside inert aria-hidden='true' aria-label='Context'>
              Rail
            </aside>
          </aside>
        </div>
      </div>
    );
    const drawer = container.querySelector(
      '[aria-label="Context"]'
    ) as HTMLElement;

    restoreLeakedOverlayLocks();

    expect(drawer).toHaveAttribute('inert');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
  });

  it('neutralizes a closed dialog overlay that would still intercept hit-testing', () => {
    const { container } = render(
      <div
        data-slot='dialog-overlay'
        data-state='closed'
        data-testid='dialog-overlay'
      />
    );
    const overlay = container.querySelector(
      '[data-testid="dialog-overlay"]'
    ) as HTMLElement;

    const result = restoreLeakedOverlayLocks();

    expect(result.restored).toContain('closed-overlay');
    expect(overlay.inert).toBe(true);
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('desktop drag-region contract', () => {
  it('keeps the route canvas and composer out of the Electron drag region', () => {
    const css = readFileSync(
      resolve(__dirname, '../../app/globals.css'),
      'utf8'
    );
    expect(css).toContain(
      'html[data-desktop-runtime="electron"] [data-app-shell-scroll]'
    );
    expect(css).toContain(
      'html[data-desktop-runtime="electron"] [data-testid="chat-composer-surface"]'
    );
    expect(css).toContain('-webkit-app-region: no-drag');
  });
});

describe('hasGenuineBlockingOverlay edge cases', () => {
  it('detects every genuine overlay selector with the right reason', () => {
    const cases: Array<[React.ReactElement, string]> = [
      [<div key='l' role='listbox' />, 'listbox'],
      [<div key='a' role='alertdialog' aria-modal='true' />, 'dialog'],
      [<dialog key='d' open />, 'dialog'],
      [<div key='s' data-slot='sheet-overlay' />, 'overlay'],
      [<div key='m' role='menu' />, 'menu'],
    ];
    for (const [element, reason] of cases) {
      const { unmount } = render(element);
      expect(hasGenuineBlockingOverlay()).toBe(reason);
      unmount();
    }
  });

  it('ignores aria-hidden="true" overlays but not aria-hidden="false"', () => {
    const { unmount } = render(
      <div role='dialog' aria-modal='true' aria-hidden='true' />
    );
    expect(hasGenuineBlockingOverlay()).toBeNull();
    unmount();
    render(<div role='dialog' aria-modal='true' aria-hidden='false' />);
    expect(hasGenuineBlockingOverlay()).toBe('dialog');
  });

  it('ignores overlays hidden by display:none or visibility:hidden individually', () => {
    const { unmount } = render(<div role='menu' style={{ display: 'none' }} />);
    expect(hasGenuineBlockingOverlay()).toBeNull();
    unmount();
    const second = render(<div role='menu' style={{ visibility: 'hidden' }} />);
    expect(hasGenuineBlockingOverlay()).toBeNull();
    second.unmount();
    render(
      <div role='menu' style={{ display: 'block', visibility: 'visible' }} />
    );
    expect(hasGenuineBlockingOverlay()).toBe('menu');
  });

  it('ignores a data-state=closed dialog', () => {
    render(<div role='dialog' aria-modal='true' data-state='closed' />);
    expect(hasGenuineBlockingOverlay()).toBeNull();
  });
});

describe('restoreLeakedOverlayLocks edge cases', () => {
  it('does not claim to restore a body pointer-events value other than none', () => {
    document.body.style.pointerEvents = 'auto';
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toEqual([]);
    expect(document.body.style.pointerEvents).toBe('auto');
  });

  it('skips closed overlays that are already inert', () => {
    const { container } = render(
      <div data-slot='sheet-overlay' data-state='closed' inert />
    );
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).not.toContain('closed-overlay');
    expect(container.firstElementChild).not.toHaveAttribute('aria-hidden');
  });

  it('removes the lock attribute when no overlay is open', () => {
    document.documentElement.setAttribute(OVERLAY_LOCK_ATTR, 'dialog');
    restoreLeakedOverlayLocks();
    expect(document.documentElement).not.toHaveAttribute(OVERLAY_LOCK_ATTR);
  });

  it('keeps shell elements nested in the right rail inert', () => {
    const { container } = render(
      <div data-app-shell-frame='true'>
        <div data-testid='app-shell-right-rail'>
          <aside>
            <div data-app-shell-scroll inert aria-hidden='true' />
          </aside>
        </div>
      </div>
    );
    const nested = container.querySelector(
      '[data-app-shell-scroll]'
    ) as HTMLElement;
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).not.toContain('shell-inert');
    expect(nested).toHaveAttribute('inert');
    expect(nested).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves healthy shell elements alone', () => {
    const { container } = render(<div data-app-shell-frame='true' />);
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toEqual([]);
    expect(container.firstElementChild).not.toHaveAttribute('inert');
  });

  it('clears aria-hidden on a shell element that is not inert', () => {
    const { container } = render(
      <div data-app-shell-frame='true' aria-hidden='true' />
    );
    const frame = container.firstElementChild as HTMLElement;
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toContain('shell-inert');
    expect(frame).not.toHaveAttribute('aria-hidden');
  });

  it('keeps a non-true aria-hidden value on a leaked inert shell element', () => {
    const { container } = render(
      <div data-app-shell-frame='true' inert aria-hidden='false' />
    );
    const frame = container.firstElementChild as HTMLElement;
    restoreLeakedOverlayLocks();
    expect(frame).not.toHaveAttribute('inert');
    expect(frame).toHaveAttribute('aria-hidden', 'false');
  });

  it('does not move focus when the active element is healthy', () => {
    document.body.style.pointerEvents = 'none';
    const { container } = render(
      <div>
        <textarea aria-label='Chat Message Input' />
        <button type='button'>Healthy</button>
      </div>
    );
    const healthy = container.querySelector('button') as HTMLButtonElement;
    healthy.focus();
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toEqual(['body-pointer-events']);
    expect(document.activeElement).toBe(healthy);
  });

  it('refocuses when the active element sits inside an inert ancestor', () => {
    const { container } = render(
      <div>
        <div inert>
          <button type='button'>Nested</button>
        </div>
        <textarea aria-label='Chat Message Input' />
      </div>
    );
    const nested = container.querySelector('button') as HTMLButtonElement;
    const composer = container.querySelector('textarea') as HTMLTextAreaElement;
    nested.focus();
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toEqual([]);
    expect(document.activeElement).toBe(nested);

    document.body.style.pointerEvents = 'none';
    const second = restoreLeakedOverlayLocks();
    expect(second.restored).toContain('focus');
    expect(document.activeElement).toBe(composer);
  });

  it('focuses the composer without scrolling', () => {
    document.body.style.pointerEvents = 'none';
    const { container } = render(
      <div>
        <textarea aria-label='Chat Message Input' />
        <button type='button' inert>
          Stuck
        </button>
      </div>
    );
    const composer = container.querySelector('textarea') as HTMLTextAreaElement;
    const focus = vi.spyOn(composer, 'focus');
    (container.querySelector('button') as HTMLButtonElement).focus();
    restoreLeakedOverlayLocks();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does not refocus when no composer exists and main is inside an inert ancestor', () => {
    document.body.style.pointerEvents = 'none';
    const { container } = render(
      <div>
        <div inert>
          <div id='main-content' />
        </div>
        <button type='button' inert>
          Stuck
        </button>
      </div>
    );
    (container.querySelector('button') as HTMLButtonElement).focus();
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toEqual(['body-pointer-events']);
  });

  it('does not throw or refocus when neither composer nor main exist', () => {
    document.body.style.pointerEvents = 'none';
    const { container } = render(
      <button type='button' inert>
        Stuck
      </button>
    );
    (container.querySelector('button') as HTMLButtonElement).focus();
    const result = restoreLeakedOverlayLocks();
    expect(result.restored).toEqual(['body-pointer-events']);
  });

  it('does not attempt focus recovery when nothing was restored', () => {
    const { container } = render(
      <div>
        <textarea aria-label='Chat Message Input' />
        <button type='button' inert>
          Stuck
        </button>
      </div>
    );
    const stuck = container.querySelector('button') as HTMLButtonElement;
    stuck.focus();
    const result = restoreLeakedOverlayLocks();
    expect(result).toEqual({ restored: [], blocked: false, reason: null });
    expect(document.activeElement).toBe(stuck);
  });

  it('returns an empty inert result when there is no document', () => {
    vi.stubGlobal('document', undefined);
    try {
      expect(restoreLeakedOverlayLocks()).toEqual({
        restored: [],
        blocked: false,
        reason: null,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
