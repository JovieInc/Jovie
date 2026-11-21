import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LinkActions } from './LinkActions';

function setup(overrides: Partial<Parameters<typeof LinkActions>[0]> = {}) {
  const props = {
    isVisible: true,
    onToggle: vi.fn(),
    onRemove: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  const view = render(<LinkActions {...props} />);
  return { props, ...view };
}

describe('LinkActions', () => {
  it('has an accessible closed trigger', async () => {
    const { container } = setup();
    expect(
      screen.getByRole('button', { name: 'Link Actions' })
    ).toHaveAttribute('aria-expanded', 'false');
    await expectNoA11yViolations(container);
  });

  it('opens the menu and runs edit and toggle', async () => {
    const user = userEvent.setup();
    const { props, container } = setup();
    await user.click(screen.getByRole('button', { name: 'Link Actions' }));
    expect(
      screen.getByRole('menu', { name: 'Link Actions Menu' })
    ).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('menuitem', { name: /edit/i }));
    expect(props.onEdit).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Link Actions' }));
    await user.click(screen.getByRole('menuitem', { name: /hide/i }));
    expect(props.onToggle).toHaveBeenCalledOnce();
  });

  it('confirms before removing a link', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole('button', { name: 'Link Actions' }));
    await user.click(screen.getByRole('menuitem', { name: /delete|remove/i }));
    expect(props.onRemove).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(props.onRemove).toHaveBeenCalledOnce();
  });

  it('closes the menu with Escape and omits edit when not provided', async () => {
    const user = userEvent.setup();
    setup({ onEdit: undefined });
    await user.click(screen.getByRole('button', { name: 'Link Actions' }));
    expect(screen.queryByRole('menuitem', { name: /edit/i })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders the drag handle and reports pointer down', async () => {
    const onDragHandlePointerDown = vi.fn();
    const { container } = setup({
      showDragHandle: true,
      onDragHandlePointerDown,
    });
    const handle = screen.getByRole('button', { name: 'Drag To Reorder' });
    await userEvent.pointer({ keys: '[MouseLeft>]', target: handle });
    expect(onDragHandlePointerDown).toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
