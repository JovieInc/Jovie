import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LinkActions } from '@/components/dashboard/atoms/link-actions';

// Mock Icon — lightweight stub
vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

// Use real ConfirmDialog wiring via @jovie/ui AlertDialog
// ConfirmDialog is a local component that uses @jovie/ui primitives
vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    onConfirm,
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
      <div role='alertdialog' aria-label={title}>
        <p>{title}</p>
        <p>{description}</p>
        <button type='button' onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type='button' onClick={onConfirm}>
          {confirmLabel ?? 'Confirm'}
        </button>
      </div>
    ) : null,
}));

// Mock @jovie/ui to avoid Radix rendering issues in jsdom
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

describe('LinkActions negative/error states', () => {
  it('confirm dialog shows correct title and description', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions onToggle={vi.fn()} onRemove={vi.fn()} isVisible={true} />
    );

    // Open menu
    await user.click(screen.getByRole('button', { name: /link actions/i }));

    // Click Delete to open confirm dialog
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    // Verify dialog content
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAttribute('aria-label', 'Delete link?');
    expect(screen.getByText('Delete link?')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This action cannot be undone. The link will be permanently removed from your profile.'
      )
    ).toBeInTheDocument();
  });

  it('cancel in confirm dialog does NOT call onRemove', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <LinkActions onToggle={vi.fn()} onRemove={onRemove} isVisible={true} />
    );

    // Open menu → click Delete → confirm dialog appears
    await user.click(screen.getByRole('button', { name: /link actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirm in dialog calls onRemove', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <LinkActions onToggle={vi.fn()} onRemove={onRemove} isVisible={true} />
    );

    // Open menu → click Delete → confirm
    await user.click(screen.getByRole('button', { name: /link actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('undefined onEdit hides Edit menu item', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={vi.fn()}
        onRemove={vi.fn()}
        isVisible={true}
        // onEdit intentionally omitted
      />
    );

    await user.click(screen.getByRole('button', { name: /link actions/i }));

    expect(
      screen.queryByRole('menuitem', { name: /edit/i })
    ).not.toBeInTheDocument();
    // Only Hide and Delete should be present
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });
});
