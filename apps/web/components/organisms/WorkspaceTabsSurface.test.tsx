import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceTabsSurface } from './WorkspaceTabsSurface';

let pathname = '/app/ov/people';
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    readonly href: string;
    readonly prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const primaryOptions = [
  { value: 'creators', label: 'Creators' },
  { value: 'users', label: 'Users' },
] as const;

describe('WorkspaceTabsSurface', () => {
  beforeEach(() => {
    pathname = '/app/ov/people';
    searchParams = new URLSearchParams(
      'view=creators&page=3&pageSize=50&q=ada&sort=name&status=active&retained=yes'
    );
  });

  it('renders one titled surface with actions and URL-backed primary tabs', () => {
    render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators and users.'
        primaryParam='view'
        primaryValue='creators'
        primaryOptions={primaryOptions}
        clearOnPrimaryChange={['status']}
        actions={<button type='button'>Invite</button>}
      >
        <div>People table</div>
      </WorkspaceTabsSurface>
    );

    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(screen.getByText('Manage creators and users.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    expect(screen.getByText('People table')).toBeInTheDocument();

    const creators = screen.getByRole('tab', { name: 'Creators' });
    const users = screen.getByRole('tab', { name: 'Users' });
    expect(creators).toHaveAttribute('aria-selected', 'true');
    expect(creators).toHaveAttribute('tabindex', '0');
    expect(users).toHaveAttribute('aria-selected', 'false');
    expect(users).toHaveAttribute('tabindex', '-1');
    expect(users).toHaveAttribute(
      'href',
      '/app/ov/people?view=users&retained=yes'
    );
  });

  it('preserves unrelated params when building secondary tab hrefs', () => {
    searchParams = new URLSearchParams(
      'view=creators&group=active&page=2&retained=yes'
    );

    render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators and users.'
        primaryParam='view'
        primaryValue='creators'
        primaryOptions={primaryOptions}
        secondaryParam='group'
        secondaryValue='active'
        secondaryOptions={[
          { value: 'active', label: 'Active' },
          { value: 'archived', label: 'Archived' },
        ]}
      >
        <div>People table</div>
      </WorkspaceTabsSurface>
    );

    expect(
      screen.getByRole('tablist', { name: 'People secondary views' })
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Archived' })).toHaveAttribute(
      'href',
      '/app/ov/people?view=creators&group=archived&page=2&retained=yes'
    );
  });

  it('omits duplicate page chrome when a headerless surface has no tabs', () => {
    render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators and users.'
        primaryParam='view'
        primaryValue='creators'
        primaryOptions={[primaryOptions[0]]}
        headerless
      >
        <div>Only content</div>
      </WorkspaceTabsSurface>
    );

    expect(
      screen.queryByRole('heading', { name: 'People' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Only content')).toBeInTheDocument();
  });

  it('keeps tabs but suppresses a duplicate title in headerless mode', () => {
    render(
      <WorkspaceTabsSurface
        title='People'
        description='Manage creators and users.'
        primaryParam='view'
        primaryValue='creators'
        primaryOptions={primaryOptions}
        headerless
      >
        <div>People table</div>
      </WorkspaceTabsSurface>
    );

    expect(
      screen.queryByRole('heading', { name: 'People' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: 'People primary views' })
    ).toBeVisible();
  });
});
