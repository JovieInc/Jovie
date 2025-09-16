import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FormStatus } from '@/components/molecules/FormStatus';

describe('FormStatus', () => {
  afterEach(cleanup);

  it('renders nothing when no status is provided', () => {
    const { container } = render(<FormStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', () => {
    render(<FormStatus loading />);

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders error message', () => {
    render(<FormStatus error='Something went wrong' />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toHaveClass(
      'text-red-600'
    );
  });

  it('renders success message', () => {
    render(<FormStatus success='Operation completed successfully' />);

    expect(
      screen.getByText('Operation completed successfully')
    ).toBeInTheDocument();
    expect(screen.getByText('Operation completed successfully')).toHaveClass(
      'text-green-600'
    );
  });

  it('renders all states together', () => {
    render(
      <FormStatus loading error='Error message' success='Success message' />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<FormStatus loading className='custom-status' />);

    const statusContainer = screen
      .getByText('Processing...')
      .closest('div[class*="space-y-2"]');
    expect(statusContainer).toHaveClass('custom-status');
  });

  it('renders with proper spacing classes', () => {
    render(<FormStatus loading />);

    const statusContainer = screen
      .getByText('Processing...')
      .closest('div[class*="space-y-2"]');
    expect(statusContainer).toHaveClass('space-y-2');
  });

  it('renders loading spinner with correct size', () => {
    render(<FormStatus loading />);

    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    expect(spinner.querySelector('svg')).toBeInTheDocument();
  });

  it('handles empty error message', () => {
    render(<FormStatus error='' />);
    // Should not render error text when error is empty
    expect(screen.queryByText('error=""')).not.toBeInTheDocument();
  });

  it('handles empty success message', () => {
    render(<FormStatus success='' />);
    // Should not render success text when success is empty
    expect(screen.queryByText('success=""')).not.toBeInTheDocument();
  });

  it('renders with dark mode classes', () => {
    render(<FormStatus error='Error' success='Success' />);

    const errorElement = screen.getByText('Error');
    const successElement = screen.getByText('Success');

    expect(errorElement).toHaveClass('dark:text-red-400');
    expect(successElement).toHaveClass('dark:text-green-400');
  });
});
