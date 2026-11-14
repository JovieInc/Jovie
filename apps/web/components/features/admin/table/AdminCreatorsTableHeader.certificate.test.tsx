import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminCreatorsTableHeader } from './AdminCreatorsTableHeader';

type Props = React.ComponentProps<typeof AdminCreatorsTableHeader>;

function renderHeader(overrides: Partial<Props> = {}, dir?: 'rtl') {
  const onSortChange = vi.fn();
  const onToggleSelectAll = vi.fn();
  const result = render(
    <TooltipProvider>
      <table dir={dir}>
        <AdminCreatorsTableHeader
          sort='created_desc'
          headerCheckboxState={false}
          selectedCount={0}
          headerElevated={false}
          stickyTopPx={48}
          onToggleSelectAll={onToggleSelectAll}
          onSortChange={onSortChange}
          {...overrides}
        />
        <tbody>
          <tr>
            <td>select</td>
            <td>Ada</td>
            <td>@ada</td>
            <td>Jan 10</td>
            <td>menu</td>
          </tr>
        </tbody>
      </table>
    </TooltipProvider>
  );
  return { ...result, onSortChange, onToggleSelectAll };
}

describe('AdminCreatorsTableHeader certificate states', () => {
  it('toggles select-all from the header checkbox', async () => {
    const user = userEvent.setup();
    const { container, onToggleSelectAll } = renderHeader();
    const selectAll = screen.getByRole('checkbox', {
      name: 'Select All Creators',
    });
    expect(selectAll).not.toBeChecked();
    await user.click(selectAll);
    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('reflects a full and a partial selection on the checkbox', async () => {
    const { container, unmount } = renderHeader({
      headerCheckboxState: true,
      selectedCount: 3,
    });
    expect(
      screen.getByRole('checkbox', { name: 'Select All Creators' })
    ).toBeChecked();
    await expectNoA11yViolations(container);
    unmount();

    renderHeader({ headerCheckboxState: 'indeterminate', selectedCount: 1 });
    expect(
      screen.getByRole('checkbox', { name: 'Select All Creators' })
    ).toHaveAttribute('aria-checked', 'mixed');
  });

  it('asks to sort by created date by click and by keyboard', async () => {
    const user = userEvent.setup();
    const { onSortChange } = renderHeader();
    const created = screen.getByRole('button', { name: /Created/ });
    await user.click(created);
    expect(onSortChange).toHaveBeenLastCalledWith('created');
    created.focus();
    await user.keyboard('{Enter}');
    expect(onSortChange).toHaveBeenCalledTimes(2);
  });

  it('pins every header cell at the sticky offset and lifts it when scrolled', () => {
    const { container, unmount } = renderHeader({ stickyTopPx: 48 });
    const cells = Array.from(container.querySelectorAll('th'));
    expect(cells).toHaveLength(5);
    for (const cell of cells) {
      expect(cell).toHaveStyle({ top: '48px' });
      expect(cell).not.toHaveClass('shadow-sm');
    }
    unmount();

    const elevated = renderHeader({ headerElevated: true });
    for (const cell of elevated.container.querySelectorAll('th')) {
      expect(cell).toHaveClass('shadow-sm');
    }
  });

  it('swaps the Actions label for caller header actions', async () => {
    const onIngest = vi.fn();
    const user = userEvent.setup();
    const { container } = renderHeader({
      headerActions: (
        <button type='button' onClick={onIngest}>
          Ingest Profile
        </button>
      ),
    });
    expect(screen.queryByText('Actions')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ingest Profile' }));
    expect(onIngest).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('stays axe clean inside a right-to-left table', async () => {
    const { container } = renderHeader({}, 'rtl');
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
    await expectNoA11yViolations(container);
  });
});
