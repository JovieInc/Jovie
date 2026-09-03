import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableCell } from './TableCell';

function renderInTable(child: React.ReactNode) {
  return render(
    <table>
      <tbody>
        <tr>{child}</tr>
      </tbody>
    </table>
  );
}

describe('TableCell', () => {
  it('uses the canonical table cell density and typography preset', () => {
    renderInTable(<TableCell>Title</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('px-3');
    expect(cell).toHaveClass('py-1');
    expect(cell).toHaveClass('text-app');
    expect(cell).toHaveClass('text-primary-token');
    expect(cell).not.toHaveClass('py-0.5');
  });

  it('applies right alignment without dropping the canonical cell preset', () => {
    renderInTable(<TableCell align='right'>42</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('text-right');
    expect(cell).toHaveClass('px-3');
    expect(cell).toHaveClass('py-1');
  });

  it('lets consumer tone overrides replace the canonical cell tone', () => {
    renderInTable(
      <TableCell className='text-secondary-token'>Muted</TableCell>
    );

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('text-secondary-token');
    expect(cell).not.toHaveClass('text-primary-token');
  });
});
