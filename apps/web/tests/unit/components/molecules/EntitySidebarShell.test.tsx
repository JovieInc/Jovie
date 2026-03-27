import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EntitySidebarShell } from '@/components/molecules/drawer';

vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({
    children,
    ariaLabel,
    'data-testid': testId,
  }: {
    readonly children: ReactNode;
    readonly ariaLabel?: string;
    readonly 'data-testid'?: string;
  }) => (
    <aside data-testid={testId ?? 'right-drawer'} aria-label={ariaLabel}>
      {children}
    </aside>
  ),
}));

describe('EntitySidebarShell', () => {
  it('moves entity header and tabs into the scrollable stack in minimal mode', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        title='Release title'
        headerMode='minimal'
        headerActions={<div>Header actions</div>}
        entityHeader={<div>Entity header content</div>}
        tabs={<div>Drawer tabs</div>}
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    expect(screen.getByText('Release details')).toHaveClass('sr-only');
    expect(screen.queryByText('Release title')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('entity-sidebar-entity-header')
    ).toHaveTextContent('Entity header content');
    expect(screen.getByTestId('entity-sidebar-tabs-card')).toHaveTextContent(
      'Drawer tabs'
    );
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('keeps the title in the sticky top chrome in standard mode', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        title='Release title'
        headerActions={<div>Header actions</div>}
        entityHeader={<div>Entity header content</div>}
        tabs={<div>Drawer tabs</div>}
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    expect(screen.getByText('Release title')).toBeInTheDocument();
    expect(
      screen.queryByTestId('entity-sidebar-entity-header')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('entity-sidebar-tabs-card')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Entity header content')).toBeInTheDocument();
    expect(screen.getByText('Drawer tabs')).toBeInTheDocument();
  });
});
