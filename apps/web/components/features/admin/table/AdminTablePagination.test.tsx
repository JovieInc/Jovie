import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME,
  ADMIN_TABLE_PAGINATION_ROOT_CLASSNAME,
  AdminTablePagination,
} from './AdminTablePagination';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly href: string;
    readonly children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  page: 2,
  totalPages: 5,
  from: 21,
  to: 40,
  total: 91,
  entityLabel: 'records',
};

describe('AdminTablePagination', () => {
  it('fails closed when hrefs are stale but navigation is disabled', () => {
    render(
      <AdminTablePagination
        {...baseProps}
        canPrev={false}
        canNext={false}
        prevHref='/admin?page=1'
        nextHref='/admin?page=3'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Previous Page' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled();
    expect(
      screen.queryByRole('link', { name: 'Previous Page' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Next Page' })
    ).not.toBeInTheDocument();
  });

  it('renders href navigation only when the matching can flag allows it', () => {
    render(
      <AdminTablePagination
        {...baseProps}
        canPrev
        canNext
        prevHref='/admin?page=1'
        nextHref='/admin?page=3'
      />
    );

    expect(screen.getByRole('link', { name: 'Previous Page' })).toHaveAttribute(
      'href',
      '/admin?page=1'
    );
    expect(screen.getByRole('link', { name: 'Next Page' })).toHaveAttribute(
      'href',
      '/admin?page=3'
    );
  });

  it('keeps compact mobile icon controls and desktop labels on the canonical class contract', () => {
    render(
      <AdminTablePagination
        {...baseProps}
        canPrev
        canNext
        prevHref='/admin?page=1'
        nextHref='/admin?page=3'
      />
    );

    const previous = screen.getByRole('link', { name: 'Previous Page' });
    const previousIcon = previous.querySelector('svg');
    const previousLabel = screen.getByText('Previous');

    expect(ADMIN_TABLE_PAGINATION_ROOT_CLASSNAME).toContain('overflow-x-auto');
    expect(ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME).toContain('h-8');
    expect(ADMIN_TABLE_PAGINATION_BUTTON_CLASSNAME).toContain('min-w-8');
    expect(previous).toHaveClass('h-8', 'min-w-8', 'rounded-full');
    expect(previousIcon).toHaveClass('sm:hidden');
    expect(previousLabel).toHaveClass('max-sm:hidden', 'sm:inline');
  });

  it('can hide item ranges for page-only pagination variants', () => {
    render(
      <AdminTablePagination
        page={1}
        totalPages={3}
        canPrev={false}
        canNext
        nextHref='/admin?page=2'
        showRange={false}
      />
    );

    expect(screen.getByTestId('admin-pagination-page-count')).toHaveTextContent(
      '1'
    );
    expect(screen.getByTestId('admin-pagination-page-count')).toHaveTextContent(
      '3'
    );
    expect(screen.queryByTestId('admin-pagination-range')).toBeNull();
  });
});
