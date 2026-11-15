import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceTableHeader } from './AudienceTableHeader';

type Props = React.ComponentProps<typeof AudienceTableHeader>;

function renderHeader(overrides: Partial<Props> = {}, dir?: 'rtl') {
  const props: Props = {
    mode: 'members',
    sort: 'visits',
    direction: 'desc',
    headerCheckboxState: false,
    selectedCount: 0,
    headerElevated: false,
    totalCount: 12,
    onSortChange: vi.fn(),
    onToggleSelectAll: vi.fn(),
    bulkActions: [],
    ...overrides,
  };
  const result = render(
    <table dir={dir}>
      <AudienceTableHeader {...props} />
      <tbody>
        <tr>
          <td>row</td>
        </tr>
      </tbody>
    </table>
  );
  return { ...result, props };
}

describe('AudienceTableHeader certificate', () => {
  it('toggles select-all from the header checkbox', async () => {
    const user = userEvent.setup();
    const { container, props } = renderHeader();

    await user.click(screen.getByRole('checkbox', { name: 'Select All' }));
    expect(props.onToggleSelectAll).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('sorts by each sortable member and subscriber column', async () => {
    const user = userEvent.setup();
    const { props, unmount } = renderHeader();

    await user.click(screen.getByRole('button', { name: /Visits/ }));
    await user.click(screen.getByRole('button', { name: /Last Seen/ }));
    expect(props.onSortChange).toHaveBeenNthCalledWith(1, 'visits');
    expect(props.onSortChange).toHaveBeenNthCalledWith(2, 'lastSeen');
    unmount();

    const subscribers = renderHeader({ mode: 'subscribers', sort: 'email' });
    await user.click(screen.getByRole('button', { name: /Country/ }));
    expect(subscribers.props.onSortChange).toHaveBeenCalledWith('country');
  });

  it('shows an empty audience count with no bulk actions', async () => {
    const { container } = renderHeader({ totalCount: 0 });

    expect(screen.getByText('0 people')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /User/ })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('runs an enabled bulk action and leaves disabled ones inert', async () => {
    const user = userEvent.setup();
    const exportAction = vi.fn();
    const removeAction = vi.fn();
    const { container } = renderHeader({
      selectedCount: 3,
      headerCheckboxState: 'indeterminate',
      totalCount: 1284903,
      bulkActions: [
        { label: 'Export the selected people to CSV', onClick: exportAction },
        {
          label: 'Remove the selected people from this audience',
          onClick: removeAction,
          disabled: true,
        },
      ],
    });
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Bulk Actions' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu).getByRole('menuitem', {
        name: 'Remove the selected people from this audience',
      })
    ).toHaveAttribute('aria-disabled', 'true');
    await user.click(
      within(menu).getByRole('menuitem', {
        name: 'Export the selected people to CSV',
      })
    );
    expect(exportAction).toHaveBeenCalledTimes(1);
    expect(removeAction).not.toHaveBeenCalled();
  });

  it('stays accessible in a right-to-left table', async () => {
    const { container } = renderHeader(
      { mode: 'subscribers', sort: 'email', totalCount: 1 },
      'rtl'
    );

    expect(screen.getByText('1 person')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Email/ })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
