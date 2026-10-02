import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
