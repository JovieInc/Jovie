import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RightDrawer } from '@/components/molecules/drawer/RightDrawer';

const mockUseBreakpointDown = vi.fn();

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (...args: unknown[]) => mockUseBreakpointDown(...args),
}));

vi.mock('@jovie/ui', () => ({
  CommonDropdown: ({
    children,
    items,
  }: {
    children: React.ReactNode;
    items: unknown[];
  }) => (
    <div data-testid='context-dropdown' data-items-count={items.length}>
      {children}
    </div>
  ),
}));

describe('RightDrawer', () => {
  beforeEach(() => {
    mockUseBreakpointDown.mockReset();
    mockUseBreakpointDown.mockReturnValue(false);
  });

  it('updates aria-hidden when toggling open and closed', () => {
    const { rerender } = render(
      <RightDrawer isOpen={false} width={360} ariaLabel='Details drawer'>
        <button type='button'>Focusable child</button>
      </RightDrawer>
    );

    const aside = screen.getByLabelText('Details drawer');
    expect(aside).toHaveAttribute('aria-hidden', 'true');

    rerender(
      <RightDrawer isOpen={true} width={360} ariaLabel='Details drawer'>
        <button type='button'>Focusable child</button>
      </RightDrawer>
    );

    expect(aside).toHaveAttribute('aria-hidden', 'false');
    expect(aside).toHaveStyle({ width: '360px' });
    expect(aside).not.toHaveClass('border-l');
    expect(aside).not.toHaveClass('bg-surface-0');
    expect(aside).toHaveClass(
      'rounded-(--app-shell-radius)',
      'border-(--app-shell-frame-seam)',
      'bg-surface-1',
      'shadow-(--app-shell-drawer-shadow)'
    );
    expect(aside).toHaveClass('outline-none', 'focus:outline-none');
  });

  it('handles Escape while open even when focus remains outside the drawer', () => {
    const onKeyDown = vi.fn();

    render(
      <>
        <button type='button'>Outside</button>
        <RightDrawer
          isOpen={true}
          width={360}
          ariaLabel='Keyboard drawer'
          onKeyDown={onKeyDown}
        >
          <button type='button'>Inside</button>
        </RightDrawer>
      </>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' })
    );

    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);

    screen.getByRole('button', { name: 'Inside' }).focus();
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Enter' })
    );
  });

  it('handles Escape on the active mobile drawer without treating itself as another modal', async () => {
    mockUseBreakpointDown.mockReturnValue(true);
    const onKeyDown = vi.fn();

    render(
      <RightDrawer
        isOpen
        width={360}
        ariaLabel='Mobile keyboard drawer'
        onKeyDown={onKeyDown}
      >
        <button type='button'>Inside</button>
      </RightDrawer>
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Mobile keyboard drawer')).toHaveAttribute(
        'aria-modal',
        'true'
      )
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('does not handle Escape when a modal dialog is open above the drawer', () => {
    const onKeyDown = vi.fn();

    render(
      <>
        <div role='dialog' aria-modal='true'>
          Modal
        </div>
        <RightDrawer
          isOpen={true}
          width={360}
          ariaLabel='Modal-aware drawer'
          onKeyDown={onKeyDown}
        >
          <button type='button'>Inside</button>
        </RightDrawer>
      </>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('does not handle Escape when a child popup has already prevented dismissal', () => {
    const onKeyDown = vi.fn();

    render(
      <RightDrawer
        isOpen={true}
        width={360}
        ariaLabel='Popup-aware drawer'
        onKeyDown={onKeyDown}
      >
        <button
          type='button'
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
            }
          }}
        >
          Nested popup item
        </button>
      </RightDrawer>
    );

    const popupItem = screen.getByRole('button', { name: 'Nested popup item' });
    popupItem.focus();
    fireEvent.keyDown(popupItem, { key: 'Escape' });

    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('renders context menu wrapper when context menu items are provided', () => {
    render(
      <RightDrawer
        isOpen={true}
        width={360}
        ariaLabel='Context drawer'
        contextMenuItems={[
          { id: 'open', type: 'action', label: 'Open', onClick: vi.fn() },
        ]}
      >
        <p>Drawer content</p>
      </RightDrawer>
    );

    expect(screen.getByTestId('context-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('context-dropdown')).toHaveAttribute(
      'data-items-count',
      '1'
    );
  });

  it('renders mobile and desktop layouts based on breakpoint', () => {
    mockUseBreakpointDown.mockReturnValue(true);

    const { rerender } = render(
      <RightDrawer isOpen={false} width={360} ariaLabel='Responsive drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    const mobileAside = screen.getByLabelText('Responsive drawer');
    expect(mobileAside).toHaveClass(
      'fixed',
      'inset-0',
      'translate-x-full',
      'bg-(--app-shell-content-surface)',
      'outline-none',
      'motion-reduce:transition-none'
    );

    rerender(
      <RightDrawer isOpen={true} width={360} ariaLabel='Responsive drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    expect(mobileAside).toHaveClass('translate-x-0');

    mockUseBreakpointDown.mockReturnValue(false);
    rerender(
      <RightDrawer isOpen={true} width={420} ariaLabel='Responsive drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    const desktopAside = screen.getByLabelText('Responsive drawer');
    expect(desktopAside).toHaveClass(
      'transition-[width,opacity]',
      'opacity-100'
    );
    expect(desktopAside).not.toHaveClass('lg:border');
    expect(desktopAside).not.toHaveClass('lg:rounded-(--app-shell-radius)');
    expect(desktopAside).toHaveStyle({ width: '420px' });
    expect(mockUseBreakpointDown).toHaveBeenCalledWith('lg');
  });

  it('sets tab focusability only while open', () => {
    const { rerender } = render(
      <RightDrawer isOpen={false} width={320} ariaLabel='Focusable drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    const drawer = screen.getByLabelText('Focusable drawer');
    expect(drawer).not.toHaveAttribute('tabindex');

    rerender(
      <RightDrawer isOpen={true} width={320} ariaLabel='Focusable drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    expect(drawer).toHaveAttribute('tabindex', '-1');
  });

  it('keeps rendering children content while closed for transition safety', () => {
    render(
      <RightDrawer isOpen={false} width={360} ariaLabel='Transition drawer'>
        <p>Always mounted content</p>
      </RightDrawer>
    );

    expect(screen.getByText('Always mounted content')).toBeInTheDocument();
    expect(screen.getByLabelText('Transition drawer')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('keeps the inner content container unclipped for nested menus and popovers', () => {
    const { container } = render(
      <RightDrawer isOpen={true} width={360} ariaLabel='Popover drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    const innerContent = container.querySelector('aside > div > div');
    expect(innerContent).toHaveClass('h-full', 'min-h-0');
    expect(innerContent).not.toHaveClass('overflow-hidden');
  });

  it('supports rapid open and close cycles without stale width state', () => {
    const { rerender } = render(
      <RightDrawer isOpen={false} width={300} ariaLabel='Rapid drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    const drawer = screen.getByLabelText('Rapid drawer');

    rerender(
      <RightDrawer isOpen={true} width={420} ariaLabel='Rapid drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );
    rerender(
      <RightDrawer isOpen={false} width={420} ariaLabel='Rapid drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );
    rerender(
      <RightDrawer isOpen={true} width={280} ariaLabel='Rapid drawer'>
        <p>Drawer content</p>
      </RightDrawer>
    );

    expect(drawer).toHaveStyle({ width: '280px' });
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
  });

  it('moves initial focus into the active mobile drawer and restores its trigger on close', async () => {
    mockUseBreakpointDown.mockReturnValue(true);

    const { rerender } = render(
      <>
        <button type='button'>Open details</button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Mobile drawer'>
          <button type='button' data-drawer-initial-focus>
            Close details
          </button>
          <button type='button'>Secondary action</button>
        </RightDrawer>
      </>
    );

    const trigger = screen.getByRole('button', { name: 'Open details' });
    trigger.focus();

    rerender(
      <>
        <button type='button'>Open details</button>
        <RightDrawer isOpen width={360} ariaLabel='Mobile drawer'>
          <button type='button' data-drawer-initial-focus>
            Close details
          </button>
          <button type='button'>Secondary action</button>
        </RightDrawer>
      </>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Close details' })
      ).toHaveFocus();
    });
    expect(screen.getByLabelText('Mobile drawer')).toHaveAttribute(
      'aria-modal',
      'true'
    );

    rerender(
      <>
        <button type='button'>Open details</button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Mobile drawer'>
          <button type='button'>Close details</button>
        </RightDrawer>
      </>
    );

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('restores a valid page target when an open drawer unmounts after its opener is removed', async () => {
    mockUseBreakpointDown.mockReturnValue(true);

    const { rerender } = render(
      <>
        <button key='original-opener' type='button'>
          Open details
        </button>
        <button type='button'>Page fallback</button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Unmounting drawer'>
          <button type='button' data-drawer-initial-focus>
            Drawer action
          </button>
        </RightDrawer>
      </>
    );

    const opener = screen.getByRole('button', { name: 'Open details' });
    opener.focus();

    rerender(
      <>
        <button key='original-opener' type='button'>
          Open details
        </button>
        <button type='button'>Page fallback</button>
        <RightDrawer isOpen width={360} ariaLabel='Unmounting drawer'>
          <button type='button' data-drawer-initial-focus>
            Drawer action
          </button>
        </RightDrawer>
      </>
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Drawer action' })
      ).toHaveFocus()
    );

    rerender(
      <>
        <div key='replacement-opener'>Replacement opener</div>
        <button type='button'>Page fallback</button>
      </>
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Page fallback' })
      ).toHaveFocus()
    );
    expect(document.body).not.toHaveFocus();
  });

  it('does not steal focus from unrelated navigation when the drawer closes', async () => {
    mockUseBreakpointDown.mockReturnValue(true);

    const { rerender } = render(
      <>
        <button type='button'>Open details</button>
        <button type='button' data-modal-backdrop>
          Navigate elsewhere
        </button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Navigation drawer'>
          <button type='button' data-drawer-initial-focus>
            Drawer action
          </button>
        </RightDrawer>
      </>
    );

    const opener = screen.getByRole('button', { name: 'Open details' });
    const navigation = screen.getByRole('button', {
      name: 'Navigate elsewhere',
    });
    opener.focus();

    rerender(
      <>
        <button type='button'>Open details</button>
        <button type='button' data-modal-backdrop>
          Navigate elsewhere
        </button>
        <RightDrawer isOpen width={360} ariaLabel='Navigation drawer'>
          <button type='button' data-drawer-initial-focus>
            Drawer action
          </button>
        </RightDrawer>
      </>
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Drawer action' })
      ).toHaveFocus()
    );
    navigation.focus();
    expect(navigation).toHaveFocus();

    rerender(
      <>
        <button type='button'>Open details</button>
        <button type='button' data-modal-backdrop>
          Navigate elsewhere
        </button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Navigation drawer'>
          <button type='button'>Drawer action</button>
        </RightDrawer>
      </>
    );

    await waitFor(() => expect(navigation).toHaveFocus());
  });

  it('restores focus once when a drawer closes under StrictMode', async () => {
    mockUseBreakpointDown.mockReturnValue(true);

    const { rerender } = render(
      <React.StrictMode>
        <button type='button'>Open details</button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Strict drawer'>
          <button type='button' data-drawer-initial-focus>
            Drawer action
          </button>
        </RightDrawer>
      </React.StrictMode>
    );

    const trigger = screen.getByRole('button', { name: 'Open details' });
    trigger.focus();
    const focusSpy = vi.spyOn(trigger, 'focus');

    rerender(
      <React.StrictMode>
        <button type='button'>Open details</button>
        <RightDrawer isOpen width={360} ariaLabel='Strict drawer'>
          <button type='button' data-drawer-initial-focus>
            Drawer action
          </button>
        </RightDrawer>
      </React.StrictMode>
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Drawer action' })
      ).toHaveFocus()
    );

    rerender(
      <React.StrictMode>
        <button type='button'>Open details</button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Strict drawer'>
          <button type='button'>Drawer action</button>
        </RightDrawer>
      </React.StrictMode>
    );

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps mobile focus within the drawer and locks background interaction', async () => {
    mockUseBreakpointDown.mockReturnValue(true);

    const { rerender } = render(
      <>
        <button type='button'>Background action</button>
        <RightDrawer isOpen width={360} ariaLabel='Focus trap drawer'>
          <button type='button'>First action</button>
          <button type='button'>Last action</button>
        </RightDrawer>
      </>
    );

    const background = screen.getByText('Background action');
    const first = screen.getByRole('button', { name: 'First action' });
    const last = screen.getByRole('button', { name: 'Last action' });

    await waitFor(() => expect(background.inert).toBe(true));
    expect(document.body.style.overflow).toBe('hidden');

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    rerender(
      <>
        <button type='button'>Background action</button>
        <RightDrawer isOpen={false} width={360} ariaLabel='Focus trap drawer'>
          <button type='button'>First action</button>
        </RightDrawer>
      </>
    );

    await waitFor(() => expect(background.inert).toBeFalsy());
    expect(document.body.style.overflow).toBe('');
  });

  it('exposes only the last opened mobile rail as the active modal surface', async () => {
    mockUseBreakpointDown.mockReturnValue(true);

    render(
      <>
        <RightDrawer isOpen width={320} ariaLabel='First rail'>
          <button type='button'>First rail action</button>
        </RightDrawer>
        <RightDrawer isOpen width={320} ariaLabel='Second rail'>
          <button type='button'>Second rail action</button>
        </RightDrawer>
      </>
    );

    const firstRail = screen.getByLabelText('First rail');
    const secondRail = screen.getByLabelText('Second rail');

    await waitFor(() => {
      expect(firstRail).toHaveAttribute('aria-hidden', 'true');
      expect(secondRail).toHaveAttribute('aria-modal', 'true');
    });
    expect(firstRail.inert).toBe(true);
    expect(secondRail.inert).toBeFalsy();
  });
});
