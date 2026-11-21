import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminCreatorsTableHeader } from './AdminCreatorsTableHeader';

function renderHeader(
  props: Partial<React.ComponentProps<typeof AdminCreatorsTableHeader>> = {}
) {
  const onToggleSelectAll = vi.fn();
  const onSortChange = vi.fn();
  const result = render(
    <table>
      <AdminCreatorsTableHeader
        sort='created_desc'
        headerCheckboxState={false}
        selectedCount={0}
        headerElevated={false}
        stickyTopPx={0}
        onToggleSelectAll={onToggleSelectAll}
        onSortChange={onSortChange}
        {...props}
      />
    </table>
  );
  return { ...result, onToggleSelectAll, onSortChange };
}

describe('AdminCreatorsTableHeader certificate', () => {
  it('toggles select-all from the header checkbox', async () => {
    const user = userEvent.setup();
    const { container, onToggleSelectAll } = renderHeader();
    await user.click(
      screen.getByRole('checkbox', { name: 'Select All Creators' })
    );
    expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the indeterminate checkbox for a partial selection', async () => {
    const { container } = renderHeader({
      headerCheckboxState: 'indeterminate',
      selectedCount: 2,
    });
    expect(
      screen.getByRole('checkbox', { name: 'Select All Creators' })
    ).toHaveAttribute('aria-checked', 'mixed');
    await expectNoA11yViolations(container);
  });

  it('shows header actions in place of the Actions label', async () => {
    const { container } = renderHeader({
      headerActions: <span>Ingest</span>,
    });
    expect(screen.getByText('Ingest')).toBeInTheDocument();
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
