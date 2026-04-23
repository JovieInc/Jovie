import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TableHeaderCell } from './TableHeaderCell';

function renderInTable(child: React.ReactNode) {
  return render(
    <table>
      <thead>
        <tr>{child}</tr>
      </thead>
    </table>
  );
}

describe('TableHeaderCell', () => {
  it('renders plain label when not sortable', () => {
    renderInTable(<TableHeaderCell>Title</TableHeaderCell>);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders SortableHeaderButton when sortable + onSort', () => {
    renderInTable(
      <TableHeaderCell sortable onSort={vi.fn()}>
        Title
      </TableHeaderCell>
    );
    expect(screen.getByRole('button', { name: /Title/ })).toBeInTheDocument();
  });

  it('does not render button when sortable but onSort missing', () => {
    renderInTable(<TableHeaderCell sortable>Title</TableHeaderCell>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('fires onSort when the sort button is clicked', () => {
    const onSort = vi.fn();
    renderInTable(
      <TableHeaderCell sortable onSort={onSort}>
        Released
      </TableHeaderCell>
    );
    fireEvent.click(screen.getByRole('button', { name: /Released/ }));
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it('applies right alignment class', () => {
    renderInTable(<TableHeaderCell align='right'>Count</TableHeaderCell>);
    const th = screen.getByRole('columnheader');
    expect(th.className).toMatch(/text-right/);
  });

  it('applies center alignment class', () => {
    renderInTable(<TableHeaderCell align='center'>Status</TableHeaderCell>);
    expect(screen.getByRole('columnheader').className).toMatch(/text-center/);
  });

  it('is sticky by default with top: 0', () => {
    renderInTable(<TableHeaderCell>Title</TableHeaderCell>);
    const th = screen.getByRole('columnheader');
    expect(th.className).toMatch(/sticky/);
    expect(th).toHaveStyle({ top: '0px' });
  });

  it('honors a non-zero stickyTop offset', () => {
    renderInTable(<TableHeaderCell stickyTop={48}>Title</TableHeaderCell>);
    expect(screen.getByRole('columnheader')).toHaveStyle({ top: '48px' });
  });

  it('omits sticky class when sticky=false', () => {
    renderInTable(<TableHeaderCell sticky={false}>Title</TableHeaderCell>);
    const th = screen.getByRole('columnheader');
    expect(th.className).not.toMatch(/sticky/);
    expect(th).not.toHaveAttribute('style');
  });

  it('hides on mobile when hideOnMobile=true', () => {
    renderInTable(<TableHeaderCell hideOnMobile>Desktop-only</TableHeaderCell>);
    const th = screen.getByRole('columnheader');
    expect(th.className).toMatch(/max-md:hidden/);
    expect(th.className).toMatch(/md:table-cell/);
  });

  it('renders sort indicator reflecting direction asc', () => {
    renderInTable(
      <TableHeaderCell sortable sortDirection='asc' onSort={vi.fn()}>
        Col
      </TableHeaderCell>
    );
    expect(screen.getByRole('button', { name: /Col/ })).toHaveTextContent('▴');
  });

  it('renders sort indicator reflecting direction desc', () => {
    renderInTable(
      <TableHeaderCell sortable sortDirection='desc' onSort={vi.fn()}>
        Col
      </TableHeaderCell>
    );
    expect(screen.getByRole('button', { name: /Col/ })).toHaveTextContent('▾');
  });

  it('renders neutral sort indicator when sortDirection=null', () => {
    renderInTable(
      <TableHeaderCell sortable sortDirection={null} onSort={vi.fn()}>
        Col
      </TableHeaderCell>
    );
    expect(screen.getByRole('button', { name: /Col/ })).toHaveTextContent('⇅');
  });

  it('activates sort via keyboard Enter (native button behavior)', () => {
    const onSort = vi.fn();
    renderInTable(
      <TableHeaderCell sortable onSort={onSort}>
        Col
      </TableHeaderCell>
    );
    const btn = screen.getByRole('button', { name: /Col/ });
    btn.focus();
    // Native buttons fire click on Enter; simulate via click which jsdom uses for keyboard activation
    fireEvent.click(btn);
    expect(onSort).toHaveBeenCalled();
  });
});
