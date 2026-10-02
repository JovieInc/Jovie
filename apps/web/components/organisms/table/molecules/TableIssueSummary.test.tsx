import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableIssueSummary } from './TableIssueSummary';

describe('TableIssueSummary', () => {
  it('opens the full issue list by keyboard without selecting the parent row', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <table>
        <tbody>
          <tr onClick={onRowClick}>
            <td>
              <TableIssueSummary
                issues={[
                  { label: 'No artwork' },
                  { label: 'No providers' },
                  { label: 'A long issue that must remain available' },
                ]}
              />
            </td>
          </tr>
        </tbody>
      </table>
    );
    const trigger = screen.getByRole('button', { name: 'View 3 issues' });
    expect(screen.queryByText('No artwork')).toBeNull();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('No artwork')).toBeVisible();
    expect(
      screen.getByText('A long issue that must remain available')
    ).toBeVisible();
    expect(onRowClick).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
  it('renders no action when there are no issues', () => {
    render(<TableIssueSummary issues={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
