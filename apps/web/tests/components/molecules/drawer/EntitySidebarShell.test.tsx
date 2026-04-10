import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';

vi.mock('@/components/organisms/RightDrawer', () => ({
  RightDrawer: ({ children }: { children: React.ReactNode }) => (
    <aside data-testid='right-drawer'>{children}</aside>
  ),
}));

describe('EntitySidebarShell', () => {
  it('keeps header, identity area, and tabs together in a sticky top rail', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Details drawer'
        title='Release details'
        entityHeader={<p>Header content</p>}
        tabs={<p>Tab controls</p>}
      >
        <p>Body content</p>
      </EntitySidebarShell>
    );

    // The first DrawerSurfaceCard with variant='card' is the sticky header rail
    const stickyRailCard = screen
      .getByTestId('right-drawer')
      .querySelector('[data-variant="card"]');
    expect(stickyRailCard).toBeInTheDocument();
    expect(stickyRailCard).toContainElement(
      screen.getByText('Release details')
    );
    expect(stickyRailCard).toContainElement(screen.getByText('Header content'));
    expect(stickyRailCard).toContainElement(screen.getByText('Tab controls'));
    expect(stickyRailCard).not.toContainElement(
      screen.getByText('Body content')
    );
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('does not render a sticky rail card when minimal mode hides all top chrome', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Add release drawer'
        headerMode='minimal'
        hideMinimalHeaderBar
      >
        <p>Body content</p>
      </EntitySidebarShell>
    );

    expect(
      screen.getByTestId('right-drawer').querySelector('[data-variant="card"]')
    ).not.toBeInTheDocument();
  });

  it('keeps a flat footer outside the card surface when requested', () => {
    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Add release drawer'
        headerMode='minimal'
        hideMinimalHeaderBar
        footerSurface='flat'
        footer={<button type='button'>Create Release</button>}
      >
        <p>Body content</p>
      </EntitySidebarShell>
    );

    const footerButton = screen.getByRole('button', { name: 'Create Release' });
    expect(footerButton.parentElement).not.toHaveAttribute(
      'data-variant',
      'card'
    );
    expect(footerButton.parentElement).toHaveClass('px-3', 'py-2.5');
  });
});
