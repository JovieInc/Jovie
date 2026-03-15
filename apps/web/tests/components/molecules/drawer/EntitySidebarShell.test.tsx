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

    const stickyRail = container.querySelector('.sticky.top-0');
    expect(stickyRail).toBeInTheDocument();
    expect(stickyRail).toContainElement(screen.getByText('Release details'));
    expect(stickyRail).toContainElement(screen.getByText('Header content'));
    expect(stickyRail).toContainElement(screen.getByText('Tab controls'));
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });
});
