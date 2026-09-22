import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableCheckboxCell } from './TableCheckboxCell';

describe('TableCheckboxCell', () => {
  it('toggles the nested checkbox in legacy row mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <table>
        <tbody>
          <tr>
            <TableCheckboxCell
              checked={false}
              onChange={onChange}
              ariaLabel='Select row 2'
              rowNumber={2}
            />
          </tr>
        </tbody>
      </table>
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select row 2' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles via onToggleSelect in TanStack row mode', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();

    render(
      <table>
        <tbody>
          <tr>
            <td>
              <TableCheckboxCell
                isChecked={false}
                onToggleSelect={onToggleSelect}
                row={{} as never}
                rowNumber={3}
              />
            </td>
          </tr>
        </tbody>
      </table>
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select row 3' }));
    expect(onToggleSelect).toHaveBeenCalled();
  });

  it('toggles select-all via onToggleSelectAll in TanStack header mode', async () => {
    const user = userEvent.setup();
    const onToggleSelectAll = vi.fn();

    render(
      <table>
        <thead>
          <tr>
            <th>
              <TableCheckboxCell
                headerCheckboxState={false}
                onToggleSelectAll={onToggleSelectAll}
                table={{} as never}
              />
            </th>
          </tr>
        </thead>
      </table>
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select All Rows' }));
    expect(onToggleSelectAll).toHaveBeenCalled();
  });
});
