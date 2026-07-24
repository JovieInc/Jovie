import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '@/components/molecules/EmptyState';

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

describe('EmptyState (canonical molecule API)', () => {
  it('renders heading, description, and greyscale icon chip', () => {
    render(
      <EmptyState
        heading='No Data Yet'
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
    const iconWrapper = screen.getByTestId('test-icon').parentElement;
    expect(iconWrapper?.className).toContain('h-9');
    expect(iconWrapper?.className).toContain('text-tertiary-token');
  });

  it('invokes primary action callback when clicked', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        heading='Invite Your Audience'
        action={{ label: 'Share Profile', onClick: handleClick }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /share profile/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders primary action as link when href is provided', () => {
    render(
      <EmptyState
        heading='Upgrade Your Plan'
        action={{ label: 'View Pricing', href: '/pricing' }}
      />
    );

    const link = screen.getByRole('link', { name: /view pricing/i });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('supports disabled primary action', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        heading='No Insights Yet'
        action={{
          label: 'Generating...',
          onClick: handleClick,
          disabled: true,
        }}
      />
    );

    const button = screen.getByRole('button', { name: /generating/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders secondary action as a text link (button or href)', () => {
    const handleSecondary = vi.fn();
    render(
      <EmptyState
        heading='Need Permissions'
        secondaryAction={{ label: 'Request Access', onClick: handleSecondary }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /request access/i }));
    expect(handleSecondary).toHaveBeenCalledTimes(1);

    render(
      <EmptyState
        heading='Learn More'
        secondaryAction={{ label: 'Open Docs', href: 'https://docs.jov.ie' }}
      />
    );

    expect(screen.getByRole('link', { name: /open docs/i })).toHaveAttribute(
      'href',
      'https://docs.jov.ie'
    );
  });

  it('keeps error variant greyscale-first (semantic icon only)', () => {
    render(
      <EmptyState
        heading='Access Denied'
        variant='error'
        description='You do not have access'
        icon={<span data-testid='error-icon'>*</span>}
      />
    );

    const heading = screen.getByRole('heading', { name: /access denied/i });
    expect(heading.className).toContain('text-secondary-token');
    expect(screen.getByTestId('error-icon').parentElement?.className).toContain(
      'text-error'
    );
  });

  it('exposes a stable props surface for consumers', () => {
    const props = {
      icon: <span />,
      heading: 'Stable API',
      description: 'One sentence.',
      action: { label: 'Primary', onClick: () => undefined },
      secondaryAction: { label: 'Secondary', href: '/x' },
      variant: 'default' as const,
      size: 'sm' as const,
      className: 'custom',
      testId: 'empty-contract',
    };

    render(<EmptyState {...props} />);
    expect(screen.getByTestId('empty-contract')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Stable API' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Secondary' })).toHaveAttribute(
      'href',
      '/x'
    );
  });
});
