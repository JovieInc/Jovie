import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRowActionMenu } from './TaskRowActionMenu';

describe('TaskRowActionMenu', () => {
  it('opens the menu from the shared overflow trigger without bubbling row clicks', async () => {
    const onParentClick = vi.fn();
    const onActionClick = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(
        'div',
        { onClick: onParentClick },
        <TaskRowActionMenu
          items={[{ id: 'archive', label: 'Archive', onClick: onActionClick }]}
        />
      )
    );

    await user.click(screen.getByRole('button', { name: 'Open Task Actions' }));

    expect(onParentClick).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
  });

  it.each(['{Enter}', ' '])(
    'opens the menu with keyboard activation %s',
    async key => {
      const user = userEvent.setup();

      render(
        <TaskRowActionMenu
          items={[{ id: 'archive', label: 'Archive', onClick: vi.fn() }]}
        />
      );

      screen.getByRole('button', { name: 'Open Task Actions' }).focus();
      await user.keyboard(key);

      expect(
        await screen.findByRole('menuitem', { name: 'Archive' })
      ).toBeInTheDocument();
    }
  );

  it('renders the shared IconButton overflow trigger with a popup menu', () => {
    render(
      <TaskRowActionMenu
        items={[{ id: 'archive', label: 'Archive', onClick: vi.fn() }]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open Task Actions' });
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });
});
