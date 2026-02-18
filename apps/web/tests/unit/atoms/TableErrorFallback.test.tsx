import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableErrorFallback } from '@/components/atoms/TableErrorFallback';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('TableErrorFallback', () => {
  const defaultProps = {
    error: new Error('Something went wrong'),
    resetErrorBoundary: vi.fn(),
  };

  it('renders the error heading', () => {
    render(<TableErrorFallback {...defaultProps} />);
    expect(screen.getByText('Unable to load table data')).toBeInTheDocument();
  });

  it('renders the error message', () => {
    render(<TableErrorFallback {...defaultProps} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders a fallback message when error has no message', () => {
    const error = new Error();
    error.message = '';
    render(<TableErrorFallback error={error} resetErrorBoundary={vi.fn()} />);
    expect(
      screen.getByText('An unexpected error occurred while loading the table.')
    ).toBeInTheDocument();
  });

  it('renders a retry button', () => {
    render(<TableErrorFallback {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: 'Reload table' })
    ).toBeInTheDocument();
  });

  it('calls resetErrorBoundary when retry button is clicked', async () => {
    const resetFn = vi.fn();
    render(
      <TableErrorFallback
        error={new Error('fail')}
        resetErrorBoundary={resetFn}
      />
    );
    const button = screen.getByRole('button', { name: 'Reload table' });
    await userEvent.click(button);
    expect(resetFn).toHaveBeenCalledTimes(1);
  });

  it('renders a copy details button', () => {
    render(<TableErrorFallback {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: 'Copy error details to clipboard' })
    ).toBeInTheDocument();
  });

  it('has role=alert on the container', () => {
    render(<TableErrorFallback {...defaultProps} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays error digest when present', () => {
    const errorWithDigest = Object.assign(new Error('fail'), {
      digest: 'abc123',
    });
    render(
      <TableErrorFallback
        error={errorWithDigest}
        resetErrorBoundary={vi.fn()}
      />
    );
    expect(screen.getByText(/Error ID: abc123/)).toBeInTheDocument();
  });

  it('passes a11y checks', async () => {
    const { container } = render(<TableErrorFallback {...defaultProps} />);
    await expectNoA11yViolations(container);
  });
});
