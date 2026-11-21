import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TaskRowActionMenu } from './TaskRowActionMenu';

describe('TaskRowActionMenu certificate', () => {
  it('keeps the closed trigger axe-clean in both visibilities', async () => {
    const items = [{ id: 'archive', label: 'Archive', onClick: vi.fn() }];
    const always = render(<TaskRowActionMenu items={items} />);
    expect(
      screen.getByRole('button', { name: 'Open task actions' })
    ).toBeVisible();
    await expectNoA11yViolations(always.container);
    always.unmount();

    const hover = render(
      <TaskRowActionMenu items={items} visibility='hover' selected />
    );
    await expectNoA11yViolations(hover.container);
  });

  it('runs the chosen action once from the open menu', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(
      <TaskRowActionMenu
        items={[{ id: 'archive', label: 'Archive', onClick: onArchive }]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Open task actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledOnce();
  });
});
