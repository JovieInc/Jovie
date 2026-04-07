import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { RightDrawer } = await import('@/components/organisms/RightDrawer');

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
    expect(aside).not.toHaveClass('lg:border');
    expect(aside).not.toHaveClass('shadow-[var(--linear-app-drawer-shadow)]');
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
      'bg-(--linear-app-content-surface)'
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
    expect(desktopAside).not.toHaveClass(
      'lg:rounded-[var(--linear-app-shell-radius)]'
    );
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
});
