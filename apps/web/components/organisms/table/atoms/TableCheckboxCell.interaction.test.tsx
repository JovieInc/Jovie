import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TableCheckboxCell } from './TableCheckboxCell';

it('keeps row number and checkbox mounted through keyboard selection and engagement', async () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <table>
      <tbody>
        <tr className='group'>
          <TableCheckboxCell
            checked={false}
            rowNumber={2}
            onChange={onChange}
            ariaLabel='Select row 2'
          />
        </tr>
      </tbody>
    </table>
  );
  const checkbox = screen.getByRole('checkbox', { name: 'Select row 2' });
  const number = screen.getByText('2');
  expect(number).toHaveClass('group-focus-within:opacity-0');
  expect(checkbox.parentElement).toHaveClass(
    'opacity-0',
    'group-focus-within:opacity-100'
  );
  await userEvent.tab();
  expect(checkbox).toHaveFocus();
  await userEvent.keyboard(' ');
  expect(onChange).toHaveBeenCalledWith(true);
  rerender(
    <table>
      <tbody>
        <tr className='group'>
          <TableCheckboxCell
            checked
            rowNumber={2}
            onChange={onChange}
            ariaLabel='Select row 2'
          />
        </tr>
      </tbody>
    </table>
  );
  expect(screen.getByText('2')).toBe(number);
  expect(number).toHaveClass('opacity-0');
  expect(checkbox.parentElement).toHaveClass('opacity-100');
});

it.each([
  { isHeader: true, indeterminate: false, rowNumber: 2 },
  { isHeader: false, indeterminate: true, rowNumber: 2 },
  { isHeader: false, indeterminate: false, rowNumber: undefined },
])(
  'keeps header, indeterminate and unnumbered controls visible: %j',
  async props => {
    const onChange = vi.fn();
    render(
      <table>
        <tbody>
          <tr className='group'>
            <TableCheckboxCell
              {...props}
              checked={false}
              onChange={onChange}
              ariaLabel='Select Rows'
            />
          </tr>
        </tbody>
      </table>
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Select Rows' });
    expect(checkbox.parentElement).toHaveClass('opacity-100');
    expect(checkbox.parentElement).not.toHaveClass('opacity-0');
    if (props.indeterminate) {
      expect(checkbox).toBePartiallyChecked();
      expect(screen.getByText('2')).toHaveClass('opacity-0');
    }
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  }
);
