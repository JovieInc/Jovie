import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableCell } from '../atoms/TableCell';
import { TableBody, TableRoot, TableRow } from './SemanticTable';

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
});
