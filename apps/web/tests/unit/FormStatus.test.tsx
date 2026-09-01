import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormStatus } from '@/components/molecules/FormStatus';

vi.mock('@jovie/ui', () => ({
  Spinner: ({ size }: { size?: string }) => (
    <div data-testid='loading-spinner' data-size={size}>
      Loading...
    </div>
  ),
}));

describe('FormStatus', () => {
  it('reserves a stable status slot when no props are provided', () => {
    const { container } = render(<FormStatus />);
    const status = container.firstChild as HTMLElement;
    expect(status).toHaveAttribute('data-slot', 'form-status');
    expect(status).toHaveAttribute('data-state', 'idle');
    expect(status).toHaveClass('min-h-5');
    expect(status).toBeEmptyDOMElement();
  });

  it('keeps the status slot when all values are falsy', () => {
    const { container } = render(
      <FormStatus loading={false} error='' success='' />
    );
    expect(container.firstChild).toHaveAttribute('data-state', 'idle');
  });

  it('displays loading state with spinner and text', () => {
    render(<FormStatus loading={true} />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute(
      'data-size',
      'sm'
    );
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(
      screen.getByText('Processing...').closest('[data-slot]')
    ).toHaveAttribute('data-state', 'loading');
  });

  it('displays error message with correct styling', () => {
    const errorMessage = 'Something went wrong!';
    render(<FormStatus error={errorMessage} />);

    const errorElement = screen.getByText(errorMessage);
    expect(errorElement).toBeInTheDocument();
    expect(errorElement).toHaveClass('font-medium', 'text-error');
    expect(errorElement).toHaveAttribute('role', 'alert');
    expect(errorElement.tagName.toLowerCase()).toBe('p');
  });

  it('displays success message with correct styling', () => {
    const successMessage = 'Operation completed successfully!';
    render(<FormStatus success={successMessage} />);

    const successElement = screen.getByText(successMessage);
    expect(successElement).toBeInTheDocument();
    expect(successElement).toHaveClass('font-medium', 'text-success');
    expect(successElement).not.toHaveAttribute('role');
    expect(successElement.tagName.toLowerCase()).toBe('output');
  });

  it('does not render error copy when error is only whitespace', () => {
    const { container } = render(<FormStatus error='   ' />);
    expect(container.firstChild).toHaveAttribute('data-state', 'idle');
    expect(container).not.toHaveTextContent(/\S/);
  });

  it('does not render success copy when success is only whitespace', () => {
    const { container } = render(<FormStatus success='   ' />);
    expect(container.firstChild).toHaveAttribute('data-state', 'idle');
    expect(container).not.toHaveTextContent(/\S/);
  });

  it('can display multiple states simultaneously', () => {
    render(
      <FormStatus
        loading={true}
        error='An error occurred'
        success='Success message'
      />
    );

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('applies custom className to the container', () => {
    const customClass = 'custom-form-status';
    render(<FormStatus loading={true} className={customClass} />);

    const container = screen.getByTestId('loading-spinner').parentElement
      ?.parentElement as HTMLElement;
    expect(container).toHaveClass(customClass, 'space-y-1');
  });

  it('has proper semantic structure for accessibility', () => {
    render(
      <FormStatus
        loading={true}
        error='Error message'
        success='Success message'
      />
    );

    // Check that loading state is in a div with proper content structure
    const loadingContainer = screen.getByText('Processing...').closest('div');
    expect(loadingContainer).toHaveClass('flex', 'items-center', 'gap-2');

    // Check that error is announced immediately and success uses output semantics
    expect(screen.getByText('Error message').tagName.toLowerCase()).toBe('p');
    expect(screen.getByText('Success message').tagName.toLowerCase()).toBe(
      'output'
    );
    expect(
      screen.getByText('Error message').closest('[data-slot]')
    ).not.toHaveAttribute('aria-atomic');
  });

  it('maintains proper spacing between elements', () => {
    render(
      <FormStatus
        loading={true}
        error='Error message'
        success='Success message'
      />
    );

    const container = screen.getByTestId('loading-spinner').parentElement
      ?.parentElement as HTMLElement;
    expect(container).toHaveClass('space-y-1', 'min-h-5');
  });
});
