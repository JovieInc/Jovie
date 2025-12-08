import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LinkActions } from '@/components/dashboard/atoms/LinkActions';

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

describe('LinkActions Keyboard Accessibility', () => {
  const mockOnToggle = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnDragHandlePointerDown = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggle button is keyboard accessible', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /hide link/i });

    // Focus and activate with keyboard
    toggleButton.focus();
    expect(toggleButton).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(mockOnToggle).toHaveBeenCalledTimes(1);

    await user.keyboard(' '); // Space
    expect(mockOnToggle).toHaveBeenCalledTimes(2);
  });

  it('remove button is keyboard accessible', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
      />
    );

    const removeButton = screen.getByRole('button', { name: /remove link/i });

    removeButton.focus();
    expect(removeButton).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(mockOnRemove).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-pressed state for toggle', () => {
    const { rerender } = render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /hide link/i });
    expect(toggleButton).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={false}
      />
    );

    const toggleButtonHidden = screen.getByRole('button', {
      name: /show link/i,
    });
    expect(toggleButtonHidden).toHaveAttribute('aria-pressed', 'false');
  });

  it('drag handle has correct aria attributes', () => {
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
    expect(dragHandle).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('buttons have focus-visible ring classes', () => {
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
        showDragHandle={true}
        onDragHandlePointerDown={mockOnDragHandlePointerDown}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /hide link/i });
    const removeButton = screen.getByRole('button', { name: /remove link/i });
    const dragHandle = screen.getByRole('button', { name: /drag to reorder/i });

    expect(toggleButton.className).toContain('focus-visible:ring-2');
    expect(removeButton.className).toContain('focus-visible:ring-2');
    expect(dragHandle.className).toContain('focus-visible:ring-2');
  });

  it('buttons have group-focus-within opacity class for keyboard visibility', () => {
    render(
      <LinkActions
        onToggle={mockOnToggle}
        onRemove={mockOnRemove}
        isVisible={true}
        showDragHandle={true}
        onDragHandlePointerDown={mockOnDragHandlePointerDown}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /hide link/i });
    const removeButton = screen.getByRole('button', { name: /remove link/i });
    const dragHandle = screen.getByRole('button', { name: /drag to reorder/i });

    expect(toggleButton.className).toContain('group-focus-within:opacity-100');
    expect(removeButton.className).toContain('group-focus-within:opacity-100');
    expect(dragHandle.className).toContain('group-focus-within:opacity-100');
  });

  it('Tab navigates through all action buttons', async () => {
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

    // Tab to first button (toggle)
    await user.tab();
    expect(screen.getByRole('button', { name: /hide link/i })).toHaveFocus();

    // Tab to second button (remove)
    await user.tab();
    expect(screen.getByRole('button', { name: /remove link/i })).toHaveFocus();

    // Tab to third button (drag handle)
    await user.tab();
    expect(
      screen.getByRole('button', { name: /drag to reorder/i })
    ).toHaveFocus();
  });
});
