import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { layoutStability } from '../table.styles';
import { TableHeaderRow } from './TableHeaderRow';

describe('TableHeaderRow', () => {
  it('uses the canonical 32px table header row density', () => {
    render(
      <table>
        <thead>
          <TableHeaderRow>
            <th scope='col'>Title</th>
          </TableHeaderRow>
        </thead>
      </table>
    );

    const row = screen.getByRole('row');
    expect(layoutStability.headerHeight).toBe('32px');
    expect(row).toHaveClass('h-8');
    expect(row).not.toHaveClass('h-12');
  });

  it('keeps sticky offset explicit without changing row height', () => {
    render(
      <table>
        <thead>
          <TableHeaderRow stickyOffset={40}>
            <th scope='col'>Title</th>
          </TableHeaderRow>
        </thead>
      </table>
    );

    const row = screen.getByRole('row');
    expect(row).toHaveStyle({ top: '40px' });
    expect(row).toHaveClass('h-8');
  });
});
