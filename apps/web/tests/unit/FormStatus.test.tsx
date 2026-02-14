import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormStatus } from '@/components/molecules/FormStatus';

// Mock the LoadingSpinner component
vi.mock('@/components/atoms/LoadingSpinner', () => ({
  LoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid='loading-spinner' data-size={size}>
      Loading...
    </div>
  ),
}));

describe('FormStatus', () => {
  it('renders nothing when no props are provided', () => {
    const { container } = render(<FormStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all values are falsy', () => {
    const { container } = render(
      <FormStatus loading={false} error='' success='' />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays loading state with spinner and text', () => {
    render(<FormStatus loading={true} />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute(
      'data-size',
      'sm'
    );
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('displays error message with correct styling', () => {
    const errorMessage = 'Something went wrong!';
    render(<FormStatus error={errorMessage} />);

    const errorElement = screen.getByText(errorMessage);
    expect(errorElement).toBeInTheDocument();
    expect(errorElement).toHaveClass('text-sm', 'text-destructive');
    expect(errorElement.tagName.toLowerCase()).toBe('p');
  });

  it('displays success message with correct styling', () => {
    const successMessage = 'Operation completed successfully!';
    render(<FormStatus success={successMessage} />);

    const successElement = screen.getByText(successMessage);
    expect(successElement).toBeInTheDocument();
    expect(successElement).toHaveClass('text-sm', 'text-success');
    expect(successElement.tagName.toLowerCase()).toBe('p');
  });

  it('does not render error when error is only whitespace', () => {
    const { container } = render(<FormStatus error='   ' />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render success when success is only whitespace', () => {
    const { container } = render(<FormStatus success='   ' />);
    expect(container.firstChild).toBeNull();
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
    expect(container).toHaveClass(customClass, 'space-y-2');
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
    expect(loadingContainer).toHaveClass('flex', 'items-center', 'space-x-2');

    // Check that error and success are paragraph elements
    expect(screen.getByText('Error message').tagName.toLowerCase()).toBe('p');
    expect(screen.getByText('Success message').tagName.toLowerCase()).toBe('p');
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
    expect(container).toHaveClass('space-y-2');
  });
});
