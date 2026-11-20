import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableErrorFallback } from './TableErrorFallback';

describe('TableErrorFallback', () => {
  it('names the table failure and resets the boundary on retry', async () => {
    const user = userEvent.setup();
    const resetErrorBoundary = vi.fn();
    const { container } = render(
      <TableErrorFallback
        error={Object.assign(new Error('The releases table failed to load.'), {
          digest: 'releases-table-error',
        })}
        resetErrorBoundary={resetErrorBoundary}
      />
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Unable to load table data' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('The releases table failed to load.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload table' }));
    expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('falls back to the default copy when the error has no message', async () => {
    const { container } = render(
      <TableErrorFallback error={new Error('')} resetErrorBoundary={vi.fn()} />
    );

    expect(
      screen.getByText('An unexpected error occurred while loading the table.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows an offline fetch failure and an Arabic message', async () => {
    const { container, unmount } = render(
      <TableErrorFallback
        error={new TypeError('Failed to fetch')}
        resetErrorBoundary={vi.fn()}
      />
    );
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <TableErrorFallback
          error={new Error('تعذر تحميل جدول الإصدارات.')}
          resetErrorBoundary={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText('تعذر تحميل جدول الإصدارات.')).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
