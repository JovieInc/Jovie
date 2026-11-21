import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableCheckboxCell } from './TableCheckboxCell';

function renderInTable(node: React.ReactNode, dir?: 'rtl') {
  return render(
    <table dir={dir}>
      <tbody>
        <tr className='group'>{node}</tr>
      </tbody>
    </table>
  );
}

describe('TableCheckboxCell certificate', () => {
  it('toggles a legacy row by click and keyboard, axe-clean', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderInTable(
      <TableCheckboxCell
        checked={false}
        onChange={onChange}
        ariaLabel='Select row 1'
        rowNumber={1}
      />
    );

    const box = screen.getByRole('checkbox', { name: 'Select row 1' });
    await user.click(box);
    expect(onChange).toHaveBeenLastCalledWith(true);
    box.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('renders an indeterminate header and a checked right-to-left row axe-clean', async () => {
    const header = renderInTable(
      <TableCheckboxCell
        isHeader
        indeterminate
        checked={false}
        onChange={vi.fn()}
        ariaLabel='Select All Rows'
      />
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select All Rows' })
    ).toHaveAttribute('aria-checked', 'mixed');
    await expectNoA11yViolations(header.container);
    header.unmount();

    const row = renderInTable(
      <TableCheckboxCell
        checked
        onChange={vi.fn()}
        ariaLabel='Select row 12345'
        rowNumber={12345}
      />,
      'rtl'
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select row 12345' })
    ).toBeChecked();
    expect(screen.getByText('12345')).toBeInTheDocument();
    await expectNoA11yViolations(row.container);
  });

  it('toggles TanStack row and header modes without bubbling to the row', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const onToggleSelectAll = vi.fn();
    const onRowClick = vi.fn();
    const table = {} as never;
    const row = {} as never;
    // Events that bubble past the component would reach the document body.
    document.body.addEventListener('click', onRowClick);
    const { container } = render(
      <>
        <TableCheckboxCell
          table={table}
          headerCheckboxState='indeterminate'
          onToggleSelectAll={onToggleSelectAll}
        />
        <TableCheckboxCell
          row={row}
          rowNumber={2}
          isChecked={false}
          onToggleSelect={onToggleSelect}
        />
      </>
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select All Rows' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select row 2' }));
    expect(onToggleSelectAll).toHaveBeenCalledOnce();
    expect(onToggleSelect).toHaveBeenCalledOnce();
    document.body.removeEventListener('click', onRowClick);
    expect(onRowClick).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('renders nothing for an incomplete TanStack configuration', () => {
    const { container } = render(<TableCheckboxCell />);
    expect(container).toBeEmptyDOMElement();
  });
});
