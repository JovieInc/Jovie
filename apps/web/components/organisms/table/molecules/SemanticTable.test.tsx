import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableCell } from '../atoms/TableCell';
import { TableBody, TableHead, TableRoot, TableRow } from './SemanticTable';

describe('SemanticTable row geometry', () => {
  it('forwards the selected row mode to the semantic table containing investor cells', () => {
    render(
      <TableRoot rowMode='two-line'>
        <TableBody>
          <TableRow>
            <TableCell multiline>
              <span>Investor name</span>
              <button type='button'>Copy token</button>
            </TableCell>
          </TableRow>
        </TableBody>
      </TableRoot>
    );
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'two-line');
    expect(table.style.getPropertyValue('--table-row-height')).toBe('56px');
    expect(table.style.getPropertyValue('--table-cell-content-height')).toBe(
      '48px'
    );
    expect(screen.getByRole('cell')).toContainElement(
      screen.getByRole('button', { name: 'Copy token' })
    );
  });

  it('leaves legacy table geometry unchanged when no mode is selected', () => {
    render(
      <TableRoot>
        <TableBody>
          <TableRow>
            <TableCell>Value</TableCell>
          </TableRow>
        </TableBody>
      </TableRoot>
    );
    expect(screen.getByRole('table')).not.toHaveAttribute(
      'data-table-row-mode'
    );
    expect(
      screen.getByRole('table').style.getPropertyValue('--table-row-height')
    ).toBe('');
  });

  it('composes an axe-clean table with a header row', async () => {
    const { container } = render(
      <TableRoot className='w-96' rowMode='two-line'>
        <TableHead className='text-secondary-token'>
          <TableRow>
            <th>Name</th>
            <th>Status</th>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow className='text-primary-token'>
            <td>Midnight EP</td>
            <td>Published</td>
          </TableRow>
        </TableBody>
      </TableRoot>
    );

    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('row')[1]).toHaveClass('text-primary-token');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with long copy in a right-to-left table', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TableRoot>
          <TableHead>
            <TableRow>
              <th>الاسم</th>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>
                عنوان إصدار طويل جدا يجب ألا يوسع صف الجدول مهما طال
              </TableCell>
            </TableRow>
          </TableBody>
        </TableRoot>
      </div>
    );

    expect(screen.getByRole('columnheader')).toHaveTextContent('الاسم');
    await expectNoA11yViolations(container);
  });
});
