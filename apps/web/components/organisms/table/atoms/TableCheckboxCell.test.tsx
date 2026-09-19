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
});
