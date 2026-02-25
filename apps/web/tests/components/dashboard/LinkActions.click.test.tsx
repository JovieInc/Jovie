import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkActions } from '@/components/dashboard/atoms/link-actions';

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

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
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
      <button
        type='button'
        data-testid='confirm-delete'
        onClick={() => {
          onConfirm();
          onOpenChange(false);
        }}
      >
        {confirmLabel ?? 'Confirm'}
      </button>
    ) : null,
}));

describe('LinkActions click interactions', () => {
  const onToggle = vi.fn();
  const onRemove = vi.fn();
  const onEdit = vi.fn();
  const onDragHandlePointerDown = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking Edit triggers edit mode', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={onToggle}
        onRemove={onRemove}
        onEdit={onEdit}
        isVisible={true}
      />
    );

    await user.click(screen.getByRole('button', { name: /link actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /edit/i }));

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('clicking Hide calls onToggle', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions onToggle={onToggle} onRemove={onRemove} isVisible={true} />
    );

    await user.click(screen.getByRole('button', { name: /link actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /^hide$/i }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('clicking Delete then confirming calls onRemove once', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions onToggle={onToggle} onRemove={onRemove} isVisible={true} />
    );

    await user.click(screen.getByRole('button', { name: /link actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));
    await user.click(screen.getByTestId('confirm-delete'));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('double-clicking delete menu item does not perform delete before confirmation', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions onToggle={onToggle} onRemove={onRemove} isVisible={true} />
    );

    await user.click(screen.getByRole('button', { name: /link actions/i }));
    await user.dblClick(screen.getByRole('menuitem', { name: /delete/i }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-delete')).toBeInTheDocument();
  });

  it('clicking drag handle fires pointer callback', async () => {
    const user = userEvent.setup();
    render(
      <LinkActions
        onToggle={onToggle}
        onRemove={onRemove}
        isVisible={true}
        showDragHandle={true}
        onDragHandlePointerDown={onDragHandlePointerDown}
      />
    );

    await user.pointer({
      keys: '[MouseLeft]',
      target: screen.getByRole('button', { name: /drag to reorder/i }),
    });

    expect(onDragHandlePointerDown).toHaveBeenCalledTimes(1);
  });
});
