import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSelector } from './WorkspaceSelector';

vi.mock('@jovie/ui', () => ({
  DropdownMenu: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

const workspaces = [
  {
    id: 'customer',
    label: 'Jovie',
    href: '/app',
    brandVariant: 'jovie',
  },
  {
    id: 'ov',
    label: 'OV',
    href: '/app/ov',
    brandVariant: 'ov',
  },
  {
    id: 'support',
    label: 'Support',
    href: '/app/support',
    brandVariant: 'jovie',
  },
] as const;

describe('WorkspaceSelector', () => {
  it('renders the active workspace in a stable selector trigger', () => {
    render(
      <WorkspaceSelector currentWorkspaceId='ov' workspaces={workspaces} />
    );

    expect(
      screen.getByRole('button', { name: 'Switch Workspace' })
    ).toHaveTextContent('OV');
  });

  it('renders every supplied workspace with the active destination marked', () => {
    render(
      <WorkspaceSelector currentWorkspaceId='ov' workspaces={workspaces} />
    );

    expect(screen.getByRole('link', { name: 'Jovie' })).toHaveAttribute(
      'href',
      '/app'
    );
    expect(screen.getByRole('link', { name: 'OV' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute(
      'href',
      '/app/support'
    );
  });

  it('falls back to the first workspace for an unknown current id', () => {
    render(
      <WorkspaceSelector
        currentWorkspaceId={'missing' as (typeof workspaces)[number]['id']}
        workspaces={workspaces}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Switch Workspace' })
    ).toHaveTextContent('Jovie');
  });

  it('renders nothing for an empty workspace registry', () => {
    const { container } = render(
      <WorkspaceSelector
        currentWorkspaceId='missing'
        workspaces={[] as const}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
