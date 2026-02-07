import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkActions } from '@/components/dashboard/atoms/link-actions';

// Mock Tooltip and AlertDialog components
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
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid='alert-dialog'>{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogCancel: ({
    children,
    ...props
  }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
    ...props
  }: React.ComponentProps<'button'>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

// Mock Icon
vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
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

  it('menu button opens dropdown and remove shows confirmation', async () => {
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

    await user.click(removeButton);
    // Should open confirmation dialog, not call onRemove directly
    expect(mockOnRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();

    // Confirm the deletion
    const confirmButton = screen.getByRole('button', { name: /delete/i });
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
