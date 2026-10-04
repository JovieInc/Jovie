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
  it('allows multiline wrapping without removing the fixed content ceiling', () => {
    renderInTable(
      <TableCell multiline>
        <div>Investor</div>
        <button type='button'>Copy token</button>
      </TableCell>
    );

    const content = screen.getByRole('button', {
      name: 'Copy token',
    }).parentElement;
    expect(content).toHaveClass('h-8', 'max-h-8', 'whitespace-normal');
    expect(content).not.toHaveClass(
      'h-auto',
      'max-h-none',
      'whitespace-nowrap'
    );
  });
  it('uses the canonical table cell density and typography preset', () => {
    renderInTable(<TableCell>Title</TableCell>);

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('px-3');
    expect(cell).toHaveClass('py-1');
    expect(cell).toHaveClass('text-app');
    expect(cell).toHaveClass('text-primary-token');
    expect(cell).not.toHaveClass('py-0.5');
  });

  it.each(['left', 'center', 'right'] as const)(
    'preserves %s alignment for inline content within the stable cell',
    align => {
      renderInTable(
        <TableCell align={align}>
          <span>High</span>
        </TableCell>
      );

      const cell = screen.getByRole('cell');
      expect(cell).toHaveClass(`text-${align}`);
      expect(cell).toHaveClass('px-3');
      expect(cell).toHaveClass('py-1');
      expect(screen.getByText('High').parentElement).toHaveAttribute(
        'data-table-cell-content',
        'stable'
      );
    }
  );

  it('lets consumer tone overrides replace the canonical cell tone', () => {
    renderInTable(
      <TableCell className='text-secondary-token'>Muted</TableCell>
    );

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('text-secondary-token');
    expect(cell).not.toHaveClass('text-primary-token');
  });

  it('clips extra copy inside the fixed row-height budget', () => {
    renderInTable(
      <TableCell>
        A deliberately long value that must not expand the table row
      </TableCell>
    );

    const content = screen
      .getByRole('cell')
      .querySelector('[data-table-cell-content="stable"]');
    expect(content).toHaveClass('h-8', 'max-h-8', 'overflow-hidden');
    expect(content).toHaveClass('whitespace-nowrap', 'text-ellipsis');
  });
});
