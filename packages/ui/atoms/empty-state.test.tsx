import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders heading', () => {
    render(<EmptyState heading='No items' />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState heading='No items' description='Add items to get started.' />
    );
    expect(screen.getByText('Add items to get started.')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState heading='No items' />);
    expect(
      container.querySelector('[aria-describedby]')
    ).not.toBeInTheDocument();
  });

  it('renders primary action button and calls onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <EmptyState
        heading='No items'
        primaryAction={{ label: 'Add Item', onClick }}
      />
    );

    const button = screen.getByRole('button', { name: 'Add Item' });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders primary action link with href', () => {
    render(
      <EmptyState
        heading='No items'
        primaryAction={{ label: 'Go to Settings', href: '/settings' }}
      />
    );

    const link = screen.getByRole('link', { name: 'Go to Settings' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('renders secondary action', () => {
    render(
      <EmptyState
        heading='No items'
        primaryAction={{ label: 'Create', onClick: () => {} }}
        secondaryAction={{ label: 'Learn more', href: '/support' }}
      />
    );

    expect(
      screen.getByRole('link', { name: 'Learn more' })
    ).toBeInTheDocument();
  });

  it('disables primary action when disabled is set', () => {
    render(
      <EmptyState
        heading='No items'
        primaryAction={{
          label: 'Copy link',
          onClick: () => {},
          disabled: true,
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'Copy link' });
    expect(button).toBeDisabled();
  });

  it('applies custom testId', () => {
    render(<EmptyState heading='No items' testId='custom-empty-state' />);

    expect(screen.getByTestId('custom-empty-state')).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(<EmptyState heading='No items' />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
