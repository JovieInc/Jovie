import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminTablePagination } from './AdminTablePagination';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly href: string;
    readonly children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  page: 2,
  totalPages: 5,
  from: 21,
  to: 40,
  total: 91,
  entityLabel: 'records',
};

describe('AdminTablePagination certificate states', () => {
  it('pages with client handlers by click and by keyboard', async () => {
    const user = userEvent.setup();
    const onPrevClick = vi.fn();
    const onNextClick = vi.fn();
    const { container } = render(
      <AdminTablePagination
        {...baseProps}
        canPrev
        canNext
        onPrevClick={onPrevClick}
        onNextClick={onNextClick}
      />
    );
    expect(screen.getByTestId('admin-pagination-range')).toHaveTextContent(
      '21–40 of 91 records'
    );
    await user.click(screen.getByRole('button', { name: 'Next Page' }));
    expect(onNextClick).toHaveBeenCalledTimes(1);
    expect(onPrevClick).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Previous Page' }).focus();
    await user.keyboard('{Enter}');
    expect(onPrevClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('does not call a handler for a disabled direction', async () => {
    const user = userEvent.setup();
    const onPrevClick = vi.fn();
    const onNextClick = vi.fn();
    render(
      <AdminTablePagination
        {...baseProps}
        page={1}
        canPrev={false}
        canNext={false}
        onPrevClick={onPrevClick}
        onNextClick={onNextClick}
      />
    );
    const previous = screen.getByRole('button', { name: 'Previous Page' });
    const next = screen.getByRole('button', { name: 'Next Page' });
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();
    await user.click(previous);
    await user.click(next);
    expect(onPrevClick).not.toHaveBeenCalled();
    expect(onNextClick).not.toHaveBeenCalled();
  });

  it('shows an empty result with both directions disabled', async () => {
    const { container } = render(
      <AdminTablePagination
        page={1}
        totalPages={1}
        from={0}
        to={0}
        total={0}
        canPrev={false}
        canNext={false}
        entityLabel='records'
      />
    );
    expect(screen.getByTestId('admin-pagination-range')).toHaveTextContent(
      '0–0 of 0 records'
    );
    expect(
      screen.getByRole('button', { name: 'Previous Page' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows only the page count when the range is incomplete', async () => {
    const { container } = render(
      <AdminTablePagination
        page={3}
        totalPages={7}
        from={41}
        canPrev
        canNext
        prevHref='/admin?page=2'
        nextHref='/admin?page=4'
      />
    );
    expect(screen.getByTestId('admin-pagination-page-count')).toHaveTextContent(
      'Page 3 of / 7'
    );
    expect(screen.queryByTestId('admin-pagination-range')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Next Page' })).toHaveAttribute(
      'href',
      '/admin?page=4'
    );
    await expectNoA11yViolations(container);
  });

  it('formats large ranges with separators and omits a missing label', () => {
    render(
      <AdminTablePagination
        page={48213}
        totalPages={126044}
        from={964241}
        to={964260}
        total={2520871}
        canPrev
        canNext
        onPrevClick={vi.fn()}
        onNextClick={vi.fn()}
      />
    );
    expect(screen.getByTestId('admin-pagination-range').textContent).toBe(
      `${(964241).toLocaleString()}–${(964260).toLocaleString()} of ${(2520871).toLocaleString()}`
    );
  });

  it('shows the page-size control only with both a size and a handler', async () => {
    const { container, rerender } = render(
      <AdminTablePagination {...baseProps} canPrev canNext pageSize={20} />
    );
    expect(screen.queryByRole('combobox')).toBeNull();

    rerender(
      <div dir='rtl'>
        <AdminTablePagination
          {...baseProps}
          canPrev
          canNext
          pageSize={20}
          onPageSizeChange={vi.fn()}
          pageSizeOptions={[20, 100]}
        />
      </div>
    );
    expect(
      screen.getByRole('combobox', { name: 'Rows Per Page' })
    ).toHaveTextContent('20');
    expect(screen.getByText('Rows per page')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
