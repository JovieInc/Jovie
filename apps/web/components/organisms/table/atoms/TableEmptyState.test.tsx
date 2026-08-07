import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TableEmptyState } from './TableEmptyState';

vi.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: ReactNode;
      [key: string]: unknown;
    }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
});

describe('TableEmptyState', () => {
  it('renders the heading and description', () => {
    render(
      <TableEmptyState
        heading='No Releases Yet'
        description='Create your first release to see it here.'
      />
    );

    expect(
      screen.getByRole('heading', { name: 'No Releases Yet' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Create your first release to see it here.')
    ).toBeInTheDocument();
  });

  it('renders a structured action as its CTA', () => {
    render(
      <TableEmptyState
        heading='No Releases Yet'
        action={{ label: 'Create Release', onClick: vi.fn() }}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Create Release' })
    ).toBeInTheDocument();
  });

  it('renders a structured secondary action with href as a link', () => {
    render(
      <TableEmptyState
        heading='No Releases Yet'
        action={{ label: 'Create Release', onClick: vi.fn() }}
        secondaryAction={{ label: 'Learn More', href: '/docs/releases' }}
      />
    );

    expect(screen.getByRole('link', { name: 'Learn More' })).toHaveAttribute(
      'href',
      '/docs/releases'
    );
  });

  it('keeps the stable min-height class on the wrapper (layout-shift guard, JOV-4869)', () => {
    const { container } = render(<TableEmptyState heading='No Releases Yet' />);

    expect(container.firstElementChild).toHaveClass('min-h-55');
  });
});
