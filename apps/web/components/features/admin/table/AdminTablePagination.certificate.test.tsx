import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminTablePagination } from './AdminTablePagination';

describe('AdminTablePagination certificate', () => {
  it('shows the empty state with both controls disabled', async () => {
    const { container } = render(
      <AdminTablePagination
        page={1}
        totalPages={1}
        from={0}
        to={0}
        total={0}
        canPrev={false}
        canNext={false}
        entityLabel='creators'
        onPrevClick={vi.fn()}
        onNextClick={vi.fn()}
      />
    );
    expect(screen.getByTestId('admin-pagination-range')).toHaveTextContent(
      '0–0 of 0 creators'
    );
    expect(
      screen.getByRole('button', { name: 'Previous Page' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('calls the client-side handlers and stays axe-clean', async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const { container } = render(
      <AdminTablePagination
        page={2}
        totalPages={5}
        canPrev
        canNext
        onPrevClick={onPrev}
        onNextClick={onNext}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Next Page' }));
    await user.click(screen.getByRole('button', { name: 'Previous Page' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('renders href navigation as links and formats large totals', async () => {
    const { container } = render(
      <AdminTablePagination
        page={3}
        totalPages={20000}
        from={120301}
        to={120400}
        total={1999999}
        canPrev
        canNext
        prevHref='/admin?page=2'
        nextHref='/admin?page=4'
      />
    );
    expect(screen.getByRole('link', { name: 'Next Page' })).toHaveAttribute(
      'href',
      '/admin?page=4'
    );
    expect(screen.getByTestId('admin-pagination-range')).toHaveTextContent(
      '120,301–120,400 of 1,999,999'
    );
    await expectNoA11yViolations(container);
  });
});
