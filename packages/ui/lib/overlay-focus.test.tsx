import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  resolveMenuOriginTrigger,
  useMenuOriginFocusRestore,
} from './overlay-focus';

function mountMenuTree() {
  document.body.innerHTML = `
    <button id="root-trigger">Actions</button>
    <div role="menu" aria-labelledby="root-trigger">
      <div role="menuitem" id="sub-trigger" tabindex="-1">Move to</div>
      <div role="menuitem" id="root-item" tabindex="-1">Rename</div>
    </div>
    <div role="menu" aria-labelledby="sub-trigger">
      <div role="menuitem" id="nested-item" tabindex="-1">Playlist</div>
    </div>
    <button id="plain">Plain</button>
  `;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveMenuOriginTrigger', () => {
  it('walks from a menu item to the menu trigger', () => {
    mountMenuTree();
    expect(
      resolveMenuOriginTrigger(document.getElementById('root-item'))?.id
    ).toBe('root-trigger');
  });

  it('walks nested submenus back to the root trigger', () => {
    mountMenuTree();
    expect(
      resolveMenuOriginTrigger(document.getElementById('nested-item'))?.id
    ).toBe('root-trigger');
  });

  it('returns null when focus did not start in a menu', () => {
    mountMenuTree();
    expect(resolveMenuOriginTrigger(document.getElementById('plain'))).toBe(
      null
    );
    expect(resolveMenuOriginTrigger(null)).toBe(null);
  });

  it('returns null when the menu has no resolvable trigger', () => {
    document.body.innerHTML =
      '<div role="menu"><div role="menuitem" id="orphan">x</div></div>';
    expect(resolveMenuOriginTrigger(document.getElementById('orphan'))).toBe(
      null
    );
  });
});

function Harness({
  onCloseAutoFocus,
  exposeClose,
}: {
  readonly onCloseAutoFocus?: (event: Event) => void;
  readonly exposeClose: (close: (event: Event) => void) => void;
}) {
  const { contentRef, handleCloseAutoFocus } =
    useMenuOriginFocusRestore<HTMLDivElement>(undefined, onCloseAutoFocus);
  exposeClose(handleCloseAutoFocus);
  return <div ref={contentRef} data-testid='modal' />;
}

describe('useMenuOriginFocusRestore', () => {
  it('refocuses the menu trigger when a modal opened from a menu item closes', () => {
    mountMenuTree();
    const menuItem = document.getElementById('root-item') as HTMLElement;
    menuItem.focus();
    let close: (event: Event) => void = () => {};
    const host = document.createElement('div');
    document.body.append(host);
    render(<Harness exposeClose={fn => (close = fn)} />, { container: host });
    menuItem.closest('[role="menu"]')?.remove();

    const event = new Event('focusOutside', { cancelable: true });
    act(() => close(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('root-trigger');
  });

  it('leaves Radix default focus handling alone outside menus', () => {
    mountMenuTree();
    (document.getElementById('plain') as HTMLElement).focus();
    let close: (event: Event) => void = () => {};
    const host = document.createElement('div');
    document.body.append(host);
    render(<Harness exposeClose={fn => (close = fn)} />, { container: host });
    const event = new Event('focusOutside', { cancelable: true });
    act(() => close(event));
    expect(event.defaultPrevented).toBe(false);
  });

  it('respects a consumer that prevents the default close focus', () => {
    mountMenuTree();
    (document.getElementById('root-item') as HTMLElement).focus();
    const consumer = vi.fn((event: Event) => event.preventDefault());
    let close: (event: Event) => void = () => {};
    const host = document.createElement('div');
    document.body.append(host);
    render(
      <Harness onCloseAutoFocus={consumer} exposeClose={fn => (close = fn)} />,
      { container: host }
    );
    const event = new Event('focusOutside', { cancelable: true });
    act(() => close(event));
    expect(consumer).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).not.toBe('root-trigger');
  });
});
