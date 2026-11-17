import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableHeaderCell } from './TableHeaderCell';

function renderHead(cells: ReactNode, dir?: 'rtl') {
  return render(
    <table dir={dir}>
      <thead>
        <tr>{cells}</tr>
      </thead>
      <tbody>
        <tr>
          <td>Row</td>
          <td>Row</td>
        </tr>
      </tbody>
    </table>
  );
}

describe('TableHeaderCell certificate', () => {
  it('sorts on click and keyboard with an axe-clean head', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const { container } = renderHead(
      <>
        <TableHeaderCell>Title</TableHeaderCell>
        <TableHeaderCell sortable sortDirection='asc' onSort={onSort}>
          Release Date
        </TableHeaderCell>
      </>
    );

    const button = screen.getByRole('button', { name: 'Release Date' });
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    expect(onSort).toHaveBeenCalledTimes(2);
    expect(screen.getByText('▴')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a plain clamped label when sortable has no handler', async () => {
    const { container } = renderHead(
      <>
        <TableHeaderCell sortable sticky={false}>
          Most recent distribution delivery date across every provider
        </TableHeaderCell>
        <TableHeaderCell align='right'>Count</TableHeaderCell>
      </>
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByText(
        'Most recent distribution delivery date across every provider'
      )
    ).toHaveClass('line-clamp-1');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with RTL headings', async () => {
    const { container } = renderHead(
      <>
        <TableHeaderCell>العنوان</TableHeaderCell>
        <TableHeaderCell sortable sortDirection='desc' onSort={vi.fn()}>
          تاريخ الإصدار
        </TableHeaderCell>
      </>,
      'rtl'
    );

    expect(
      screen.getByRole('button', { name: 'تاريخ الإصدار' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
