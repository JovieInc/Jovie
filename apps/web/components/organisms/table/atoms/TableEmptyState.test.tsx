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

  it('places the test id on the stable table surface and keeps status semantics inside', () => {
    render(
      <TableEmptyState
        heading='No Releases Yet'
        variant='error'
        testId='release-empty'
      />
    );

    const surface = screen.getByTestId('release-empty');
    expect(surface).toHaveClass('min-h-55');
    expect(surface).toHaveClass('bg-(--app-shell-content-surface)');
    expect(surface).not.toHaveAttribute('data-variant', 'card');
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-content-state',
      'error'
    );
  });

  it('never puts the empty state on a bordered card (founder ban 2026-10-28)', () => {
    const { container } = render(
      <TableEmptyState heading='No Releases Yet' description='Add one.' />
    );
    expect(
      container.querySelector('[data-empty-state-presentation]')
    ).toHaveAttribute('data-empty-state-presentation', 'default');
    expect(container.querySelector('[data-empty-state-card]')).toBeNull();
  });
});
