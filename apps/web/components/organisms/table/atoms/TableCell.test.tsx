import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('stays axe-clean as a data cell beside a header cell', async () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableCell as='th'>Release</TableCell>
            <TableCell align='right'>42</TableCell>
          </tr>
        </tbody>
      </table>
    );

    expect(screen.getByText('Release').closest('th')).not.toBeNull();
    expect(screen.getByRole('cell')).toHaveClass('text-right');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with long copy and in a right-to-left table', async () => {
    const { container } = render(
      <div>
        <table>
          <tbody>
            <tr>
              <TableCell hideOnMobile>
                Never Say A Word (Extended Club Mix) feat. a long guest list
              </TableCell>
            </tr>
          </tbody>
        </table>
        <table dir='rtl' lang='ar'>
          <tbody>
            <tr>
              <TableCell>عنوان الإصدار</TableCell>
            </tr>
          </tbody>
        </table>
      </div>
    );

    expect(screen.getAllByRole('cell')[0]).toHaveClass('max-md:hidden');
    expect(screen.getByText('عنوان الإصدار')).toHaveAttribute(
      'data-table-cell-content',
      'stable'
    );
    await expectNoA11yViolations(container);
  });
});
