import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '@/components/organisms/EmptyState';

vi.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
});

describe('EmptyState', () => {
  it('renders heading, description, and icon', () => {
    render(
      <EmptyState
        heading='No data yet'
        description='Add content to see insights'
        icon={<span data-testid='test-icon'>*</span>}
      />
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /no data yet/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/add content/i)).toBeInTheDocument();
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('invokes primary action callback when clicked', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        heading='Invite your audience'
        action={{ label: 'Share profile', onClick: handleClick }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /share profile/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders primary action as link when href is provided', () => {
    render(
      <EmptyState
        heading='Upgrade your plan'
        action={{ label: 'View pricing', href: '/pricing' }}
      />
    );

    const link = screen.getByRole('link', { name: /view pricing/i });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('supports secondary actions as link or button', () => {
    const handleSecondary = vi.fn();
    render(
      <EmptyState
        heading='Need permissions'
        secondaryAction={{ label: 'Request access', onClick: handleSecondary }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    expect(handleSecondary).toHaveBeenCalledTimes(1);

    render(
      <EmptyState
        heading='Learn more'
        secondaryAction={{ label: 'Open docs', href: '/docs' }}
      />
    );

    expect(screen.getByRole('link', { name: /open docs/i })).toHaveAttribute(
      'href',
      '/docs'
    );
  });

  it('applies variant styles', () => {
    render(
      <EmptyState
        heading='Access denied'
        variant='error'
        description='You do not have access'
      />
    );

    const heading = screen.getByRole('heading', { name: /access denied/i });
    expect(heading.className).toContain('text-rose');
  });
});
