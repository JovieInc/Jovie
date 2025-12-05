import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
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
});
