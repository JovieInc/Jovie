import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from '@/components/feedback/ErrorBanner';

describe('ErrorBanner', () => {
  it('renders title and description with test id', () => {
    render(
      <ErrorBanner
        title='Test error'
        description='Something failed'
        testId='error-banner-test'
      />
    );

    expect(screen.getByTestId('error-banner-test')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('invokes button actions', () => {
    const onClick = vi.fn();
    render(
      <ErrorBanner
        title='Actionable error'
        actions={[{ label: 'Retry now', onClick }]}
      />
    );

    const actionButton = screen.getByText('Retry now');
    fireEvent.click(actionButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders link actions', () => {
    render(
      <ErrorBanner
        title='Link error'
        actions={[{ label: 'Open help', href: '/support' }]}
      />
    );

    const link = screen.getByText('Open help');
    expect(link).toHaveAttribute('href', '/support');
  });

  describe('dismiss functionality', () => {
    it('renders close button when onDismiss is provided', () => {
      const onDismiss = vi.fn();
      render(<ErrorBanner title='Dismissible error' onDismiss={onDismiss} />);

      const closeButton = screen.getByRole('button', {
        name: 'Dismiss error',
      });
      expect(closeButton).toBeInTheDocument();
    });

    it('does not render close button when onDismiss is not provided', () => {
      render(<ErrorBanner title='Non-dismissible error' />);

      const closeButton = screen.queryByRole('button', {
        name: 'Dismiss error',
      });
      expect(closeButton).not.toBeInTheDocument();
    });

    it('invokes onDismiss callback when close button is clicked', () => {
      const onDismiss = vi.fn();
      render(<ErrorBanner title='Dismissible error' onDismiss={onDismiss} />);

      const closeButton = screen.getByRole('button', {
        name: 'Dismiss error',
      });
      fireEvent.click(closeButton);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('close button has correct aria-label for accessibility', () => {
      const onDismiss = vi.fn();
      render(<ErrorBanner title='Dismissible error' onDismiss={onDismiss} />);

      const closeButton = screen.getByRole('button', {
        name: 'Dismiss error',
      });
      expect(closeButton).toHaveAttribute('aria-label', 'Dismiss error');
    });
  });
});
