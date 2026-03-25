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
    const { container } = render(
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

    const stickyRailCard = container.querySelector('[class*="backdrop-blur"]');
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
});
