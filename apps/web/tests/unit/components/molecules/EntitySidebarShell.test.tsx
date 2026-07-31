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
  it('keeps the entity header pinned and leaves minimal-mode tab composition to the body', () => {
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

    expect(screen.getByText('Release title')).toBeInTheDocument();
    expect(screen.queryByText('Release details')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('entity-sidebar-entity-header')
    ).toHaveTextContent('Entity header content');
    expect(screen.queryByText('Drawer tabs')).not.toBeInTheDocument();
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

  it('wraps the minimal-mode entity header in a card surface by default', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        headerMode='minimal'
        hideMinimalHeaderBar
        entityHeader={<div>Entity header content</div>}
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    const headerSurface = screen.getByTestId('entity-sidebar-entity-header');
    expect(headerSurface).toHaveAttribute('data-surface-variant', 'card');
    expect(headerSurface).toHaveAttribute('data-variant', 'card');
  });

  it('renders the minimal-mode entity header without an outer card surface when entityHeaderSurface is flat', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Release details'
        headerMode='minimal'
        hideMinimalHeaderBar
        entityHeaderSurface='flat'
        entityHeader={<div>Entity header content</div>}
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    const headerSurface = screen.getByTestId('entity-sidebar-entity-header');
    expect(headerSurface).toHaveAttribute('data-surface-variant', 'flat');
    expect(headerSurface).not.toHaveAttribute('data-variant', 'card');
    expect(headerSurface).toHaveTextContent('Entity header content');
  });

  it('can promote minimal-mode tabs into the full-width sticky header and hide the empty utility bar', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Profile drawer'
        title='Profile title'
        headerMode='minimal'
        hideMinimalHeaderBar
        minimalTabsPlacement='header'
        entityHeader={<div>Entity header content</div>}
        tabs={<div>Drawer tabs</div>}
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    expect(screen.getByText('Drawer tabs')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('skips rendering an empty sticky rail when the minimal utility bar is hidden', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Add release'
        headerMode='minimal'
        hideMinimalHeaderBar
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    expect(
      screen.queryByTestId('entity-sidebar-entity-header')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('right-drawer').querySelector('[data-variant="card"]')
    ).not.toBeInTheDocument();
  });

  it('skips rendering an empty sticky rail in standard mode when no header content is provided', () => {
    render(
      <EntitySidebarShell isOpen ariaLabel='Empty drawer'>
        <div>Body content</div>
      </EntitySidebarShell>
    );

    expect(
      screen.getByTestId('right-drawer').querySelector('[data-variant="card"]')
    ).not.toBeInTheDocument();
  });

  it('can render a flat pinned footer without card chrome', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Add release'
        headerMode='minimal'
        hideMinimalHeaderBar
        footerSurface='flat'
        footer={<button type='button'>Create Release</button>}
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    const footerButton = screen.getByRole('button', { name: 'Create Release' });
    const footerContainer = footerButton.parentElement;

    expect(footerButton).toBeInTheDocument();
    expect(footerContainer).not.toHaveAttribute('data-variant', 'card');
    expect(footerContainer).toHaveClass('px-3', 'py-2.5');
  });

  it('defaults to child-owned scrolling for drawer body content', () => {
    const { container } = render(
      <EntitySidebarShell isOpen ariaLabel='Child scroll drawer'>
        <div>Body content</div>
      </EntitySidebarShell>
    );

    const body = container.querySelector('[data-scroll-strategy="child"]');

    expect(body).toBeInTheDocument();
    expect(body).not.toHaveClass('overflow-y-auto');
    expect(body).toHaveClass('flex', 'flex-1', 'min-h-0', 'flex-col');
  });

  it('preserves shell-owned scrolling when explicitly requested', () => {
    const { container } = render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Shell scroll drawer'
        scrollStrategy='shell'
      >
        <div>Body content</div>
      </EntitySidebarShell>
    );

    const body = container.querySelector('[data-scroll-strategy="shell"]');

    expect(body).toBeInTheDocument();
    expect(body).toHaveClass(
      'overflow-y-auto',
      'overflow-x-hidden',
      'overscroll-contain'
    );
  });

  it('renders raised identity before the ordered section stack', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Raised entity rail'
        workspaceSurface='raised'
        headerMode='minimal'
        hideMinimalHeaderBar
        entityHeaderSurface='flat'
        entityHeader={<div>Compact entity identity</div>}
      >
        <div>Tabbed details</div>
      </EntitySidebarShell>
    );

    const drawer = screen.getByTestId('right-drawer');
    const workspace = drawer.querySelector('[data-right-rail-workspace]');
    const identity = drawer.querySelector(
      '[data-right-rail-section="identity"]'
    );
    const sectionStack = drawer.querySelector(
      '[data-right-rail-section-stack]'
    );

    expect(workspace).toHaveAttribute('data-surface-variant', 'raised');
    expect(workspace).toHaveClass('bg-surface-1', 'shadow-card');
    expect(identity).toHaveTextContent('Compact entity identity');
    expect(sectionStack).toHaveTextContent('Tabbed details');
    expect(
      (identity?.compareDocumentPosition(sectionStack as Node) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
