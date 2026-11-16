import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ActionsCell } from './ActionsCell';

describe('ActionsCell certificate', () => {
  it('passes clicks through to the slotted action and menu controls', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const onMore = vi.fn();
    const { container } = render(
      <ActionsCell
        actions={
          <button type='button' onClick={onRefresh}>
            Refresh
          </button>
        }
        menu={
          <button type='button' onClick={onMore}>
            More
          </button>
        }
      />
    );

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onMore).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('pins both slots open while the menu is open', async () => {
    const { container } = render(
      <ActionsCell
        actions={<button type='button'>Refresh</button>}
        menu={<button type='button'>More</button>}
        isMenuOpen
        className='custom-cell'
      />
    );

    expect(container.firstElementChild).toHaveClass('custom-cell');
    for (const name of ['Refresh', 'More']) {
      expect(
        screen.getByRole('button', { name }).parentElement
      ).toHaveAttribute('data-menu-open', 'true');
    }
    await expectNoA11yViolations(container);
  });

  it('renders an empty slot with no controls when nothing is passed', async () => {
    const { container } = render(<ActionsCell />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(
      container.querySelector('.system-b-table-contextual-action')
    ).toBeNull();
    await expectNoA11yViolations(container);
  });
});
