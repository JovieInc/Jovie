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
  });

  it('calls keyboard handler only when focus is inside the drawer', () => {
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
    expect(onKeyDown).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Inside' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'Escape' })
    );
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
    expect(mobileAside).toHaveClass('fixed', 'inset-0', 'translate-x-full');

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
    expect(desktopAside).toHaveClass('border-l', 'transition-[width,opacity]');
    expect(desktopAside).toHaveStyle({ width: '420px' });
    expect(mockUseBreakpointDown).toHaveBeenCalledWith('lg');
  });
});
