import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_SIDE_OFFSET } from '../lib/dropdown-styles';
import { CommonDropdown } from './common-dropdown';
import {
  measureSubmenuPlacement,
  useSubmenuLayout,
} from './common-dropdown-submenu-layout';
import type { CommonDropdownItem } from './common-dropdown-types';

function box(left: number, right: number): DOMRect {
  return {
    x: left,
    y: 100,
    left,
    right,
    top: 100,
    bottom: 132,
    width: right - left,
    height: 32,
    toJSON: () => ({}),
  };
}

function fixture({ left = 13, right = 243, padding = 4, border = 1 } = {}) {
  const parent = document.createElement('div');
  parent.dataset.slot = 'common-dropdown-content';
  parent.getBoundingClientRect = () => box(8, 248);
  const trigger = document.createElement('div');
  trigger.getBoundingClientRect = () => box(left, right);
  parent.append(trigger);
  const content = document.createElement('div');
  content.dataset.side = 'right';
  content.style.paddingTop = `${padding}px`;
  content.style.borderTop = `${border}px solid`;
  document.body.append(parent, content);
  return { parent, trigger, content };
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('submenu surface placement', () => {
  it('aligns the first row and leaves the canonical gap outside the parent', () => {
    const { trigger, content } = fixture();
    const result = measureSubmenuPlacement(trigger, content);
    // Real regression geometry: row edge243, panel edge248, own inset5.
    expect(243 + result.sideOffset - 248).toBe(OVERLAY_SIDE_OFFSET);
    expect(100 + result.alignOffset + 5).toBe(100);
  });

  it('derives compact insets instead of hardcoding the account-menu offset', () => {
    const { trigger, content } = fixture({ left: 11, right: 245, padding: 2 });
    const result = measureSubmenuPlacement(trigger, content);
    expect(245 + result.sideOffset - 248).toBe(OVERLAY_SIDE_OFFSET);
    expect(100 + result.alignOffset + 3).toBe(100);
  });

  it('uses the actual left edge after RTL or collision placement flips left', () => {
    const { trigger, content } = fixture({ left: 16, right: 243 });
    content.dataset.side = 'left';
    const result = measureSubmenuPlacement(trigger, content);
    expect(16 - result.sideOffset - 8).toBe(-OVERLAY_SIDE_OFFSET);
    expect(result.alignOffset).toBe(-5);
  });

  it('accounts for scaled spacing and border widths', () => {
    const { trigger, content } = fixture({ right: 238, padding: 8, border: 2 });
    const result = measureSubmenuPlacement(trigger, content);
    expect(238 + result.sideOffset - 248).toBe(OVERLAY_SIDE_OFFSET);
    expect(result.alignOffset).toBe(-10);
  });

  it('finds the nearest owning surface in a nested submenu', () => {
    const { parent, trigger, content } = fixture();
    const nested = document.createElement('div');
    nested.dataset.slot = 'common-dropdown-subcontent';
    nested.getBoundingClientRect = () => box(10, 246);
    parent.append(nested);
    nested.append(trigger);
    expect(measureSubmenuPlacement(trigger, content).sideOffset).toBe(7);
  });

  it('never uses a negative parent inset to pull surfaces together', () => {
    const { trigger, content } = fixture({ right: 250 });
    expect(measureSubmenuPlacement(trigger, content).sideOffset).toBe(4);
  });

  it.each([320, 390])(
    'keeps full-width actions over the parent at %ipx',
    width => {
      vi.stubGlobal('innerWidth', width);
      const { trigger, content } = fixture();
      const result = measureSubmenuPlacement(trigger, content);
      const left = 243 + result.sideOffset;
      expect(left).toBe(8);
      expect(left + trigger.getBoundingClientRect().width).toBeLessThanOrEqual(
        width - 8
      );
      expect(result.alignOffset).toBe(-5);
    }
  );

  it('aligns the right outer edge when a narrow submenu opens left', () => {
    vi.stubGlobal('innerWidth', 320);
    const { trigger, content } = fixture();
    content.dataset.side = 'left';
    const result = measureSubmenuPlacement(trigger, content);
    expect(13 - result.sideOffset).toBe(248);
    expect(
      13 - result.sideOffset - trigger.getBoundingClientRect().width
    ).toBeGreaterThanOrEqual(8);
  });
});

describe('submenu portal layout lifecycle', () => {
  it('measures a later portal mount, keeps matching width and bounds it to the viewport', async () => {
    const { trigger, content } = fixture();
    const triggerRef = { current: trigger } as RefObject<HTMLDivElement>;
    const contentRef = { current: null } as RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() =>
      useSubmenuLayout({
        open: true,
        triggerRef,
        contentRef,
        kind: 'dropdown',
      })
    );
    act(() => {
      result.current.measureTriggerWidth();
      result.current.setContentRef(content);
    });
    await waitFor(() =>
      expect(result.current.placement).toEqual({
        sideOffset: 9,
        alignOffset: -5,
        collisionPadding: 8,
      })
    );
    expect(contentRef.current).toBe(content);
    expect(result.current.style.minWidth).toBe(
      'min(230px, var(--radix-dropdown-menu-content-available-width))'
    );
    expect(result.current.style.maxWidth).toBe(
      'var(--radix-dropdown-menu-content-available-width)'
    );
  });

  it('preserves an explicit preferred width and max-height for context menus', () => {
    const { trigger } = fixture();
    const triggerRef = { current: trigger } as RefObject<HTMLDivElement>;
    const contentRef = { current: null } as RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() =>
      useSubmenuLayout({
        open: false,
        triggerRef,
        contentRef,
        kind: 'context',
        minWidth: '20rem',
        maxHeight: 240,
      })
    );
    act(() => result.current.measureTriggerWidth());
    expect(result.current.style.minWidth).toBe(
      'min(20rem, var(--radix-context-menu-content-available-width))'
    );
    expect(result.current.style.maxHeight).toBe(
      'min(240px, var(--radix-context-menu-content-available-height))'
    );
  });

  it('remeasures the chosen side and removes observers when closed', async () => {
    const { trigger, content } = fixture({ left: 16 });
    const disconnect = vi.fn();
    const originalResize = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    };
    const triggerRef = { current: trigger } as RefObject<HTMLDivElement>;
    const contentRef = { current: null } as RefObject<HTMLDivElement | null>;
    const { result, rerender, unmount } = renderHook(
      ({ open }) =>
        useSubmenuLayout({
          open,
          triggerRef,
          contentRef,
          kind: 'dropdown',
        }),
      { initialProps: { open: true } }
    );
    act(() => result.current.setContentRef(content));
    expect(result.current.placement.sideOffset).toBe(9);
    await act(async () => {
      content.dataset.side = 'left';
    });
    await waitFor(() => expect(result.current.placement.sideOffset).toBe(12));
    rerender({ open: false });
    expect(disconnect).toHaveBeenCalledOnce();
    act(() => result.current.setContentRef(null));
    expect(contentRef.current).toBeNull();
    unmount();
    globalThis.ResizeObserver = originalResize;
  });
});

describe('submenu width integration', () => {
  it('inherits submenu min-width from the trigger row when no override is provided', async () => {
    const items: CommonDropdownItem[] = [
      {
        type: 'submenu',
        id: 'share',
        label: 'Share',
        items: [
          {
            type: 'action',
            id: 'copy-link',
            label: 'Copy Link',
            onClick: vi.fn(),
          },
        ],
      },
    ];
    const user = userEvent.setup({ delay: null });
    render(<CommonDropdown items={items} open={true} />);

    const shareTrigger = screen.getByRole('menuitem', { name: 'Share' });
    const triggerRectSpy = vi
      .spyOn(shareTrigger, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 236.6, 32));

    await user.hover(shareTrigger);

    await waitFor(() => {
      const submenu = screen
        .getByRole('menuitem', { name: 'Copy Link' })
        .closest('[role="menu"]');
      expect(submenu).toHaveStyle({
        minWidth:
          'min(237px, var(--radix-dropdown-menu-content-available-width))',
        maxWidth: 'var(--radix-dropdown-menu-content-available-width)',
      });
    });

    expect(triggerRectSpy).toHaveBeenCalled();
  });

  it('keeps an explicit submenu min-width override when present', async () => {
    const items: CommonDropdownItem[] = [
      {
        type: 'submenu',
        id: 'share',
        label: 'Share',
        minWidth: '320px',
        items: [
          {
            type: 'action',
            id: 'copy-link',
            label: 'Copy Link',
            onClick: vi.fn(),
          },
        ],
      },
    ];
    const user = userEvent.setup({ delay: null });
    render(<CommonDropdown items={items} open={true} />);

    const shareTrigger = screen.getByRole('menuitem', { name: 'Share' });
    vi.spyOn(shareTrigger, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 240, 32)
    );

    await user.hover(shareTrigger);

    await waitFor(() => {
      const submenu = screen
        .getByRole('menuitem', { name: 'Copy Link' })
        .closest('[role="menu"]');
      expect(submenu).toHaveStyle({
        minWidth:
          'min(320px, var(--radix-dropdown-menu-content-available-width))',
        maxWidth: 'var(--radix-dropdown-menu-content-available-width)',
      });
    });
  });
});
