import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkActions } from '@/components/dashboard/atoms/link-actions';

// Mock Tooltip components
vi.mock('@jovie/ui', () => ({
  Button: ({
    children,
    className,
    onClick,
    ...props
  }: React.ComponentProps<'button'>) => (
    <button className={className} onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span className='tooltip-content'>{children}</span>
  ),
}));

// Mock Icon
vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// Mock ConfirmDialog to render a simple confirm button when open
vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmLabel,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <button type='button' data-testid='confirm-delete' onClick={onConfirm}>
        {confirmLabel ?? 'Confirm'}
      </button>
    ) : null,
}));

describe('LinkActions Keyboard Accessibility', () => {
  const mockOnToggle = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnDragHandlePointerDown = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menu button opens dropdown and toggle is accessible', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
      />
    );

    // Open the menu
    const menuButton = screen.getByRole('button', { name: /link actions/i });
    await user.click(menuButton);

    // Find and click the Hide button in the dropdown
    const toggleButton = screen.getByRole('menuitem', { name: /^hide$/i });
    expect(toggleButton).toBeInTheDocument();

    await user.click(toggleButton);
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('menu button opens dropdown and remove is accessible', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
      />
    );

    // Open the menu
    const menuButton = screen.getByRole('button', { name: /link actions/i });
    await user.click(menuButton);

    // Find and click the Delete button in the dropdown
    const removeButton = screen.getByRole('menuitem', { name: /delete/i });
    expect(removeButton).toBeInTheDocument();

    // Clicking Delete opens the confirm dialog
    await user.click(removeButton);

    // Confirm the deletion via the ConfirmDialog mock
    const confirmButton = screen.getByTestId('confirm-delete');
    await user.click(confirmButton);
    expect(mockOnRemove).toHaveBeenCalledTimes(1);
  });

  it('shows correct toggle text based on visibility', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
      />
    );

    // Open menu and check for Hide
    const menuButton = screen.getByRole('button', { name: /link actions/i });
    await user.click(menuButton);
    expect(
      screen.getByRole('menuitem', { name: /^hide$/i })
    ).toBeInTheDocument();

    // Close menu and rerender with isVisible=false
    await user.click(menuButton);
    rerender(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={false}
      />
    );

    // Open menu and check for Show
    await user.click(screen.getByRole('button', { name: /link actions/i }));
    expect(
      screen.getByRole('menuitem', { name: /^show$/i })
    ).toBeInTheDocument();
  });

  it('drag handle has correct aria-label', () => {
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
        showDragHandle={true}
        onDragHandlePointerDown={mockOnDragHandlePointerDown}
      />
    );

    const dragHandle = screen.getByRole('button', { name: /drag to reorder/i });
    expect(dragHandle).toBeInTheDocument();
  });

  it('Tab navigates to menu button and drag handle', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
        showDragHandle={true}
        onDragHandlePointerDown={mockOnDragHandlePointerDown}
      />
    );

    // Tab to drag handle (first focusable)
    await user.tab();
    expect(
      screen.getByRole('button', { name: /drag to reorder/i })
    ).toHaveFocus();

    // Tab to menu button
    await user.tab();
    expect(screen.getByRole('button', { name: /link actions/i })).toHaveFocus();
  });
});
