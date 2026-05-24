import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  getTaskRowActionTriggerClassName,
  TaskRowActionMenu,
} from './TaskRowActionMenu';

describe('TaskRowActionMenu', () => {
  it('includes the hover/open visibility hooks for board cards', () => {
    const className = getTaskRowActionTriggerClassName({
      visibility: 'hover',
    });

    expect(className).toContain('opacity-0');
    expect(className).toContain(
      'group-hover/task-board-card-shell:opacity-100'
    );
    expect(className).toContain('group-hover/task-row:opacity-100');
    expect(className).toContain('data-[state=open]:opacity-100');
  });

  it('forces selected board-card triggers visible', () => {
    const className = getTaskRowActionTriggerClassName({
      visibility: 'hover',
      selected: true,
    });

    expect(className).toContain('opacity-100');
  });

  it('keeps always-visible triggers out of hover-only opacity rules', () => {
    const className = getTaskRowActionTriggerClassName({
      visibility: 'always',
    });

    expect(className).not.toContain('opacity-0');
    expect(className).not.toContain('group-hover/task-board-card-shell');
    expect(className).toContain('hover:text-primary-token');
  });

  it('opens the menu from the trigger without bubbling row clicks', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Open task actions' }));

    expect(onParentClick).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
  });

  it.each([
    '{Enter}',
    ' ',
  ])('opens the menu with keyboard activation %s', async key => {
    const user = userEvent.setup();

    render(
      <TaskRowActionMenu
        items={[{ id: 'archive', label: 'Archive', onClick: vi.fn() }]}
      />
    );

    screen.getByRole('button', { name: 'Open task actions' }).focus();
    await user.keyboard(key);

    expect(
      await screen.findByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();
  });
});
