import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';

vi.mock('@/components/molecules/drawer/RightDrawer', () => ({
  RightDrawer: ({
    children,
    onKeyDown,
  }: {
    children: React.ReactNode;
    onKeyDown?: (event: KeyboardEvent) => void;
  }) => (
    <aside
      data-testid='right-drawer'
      onKeyDown={event => onKeyDown?.(event.nativeEvent)}
    >
      {children}
    </aside>
  ),
}));

describe('EntitySidebarShell', () => {
  it('derives Escape dismissal from the existing close handler', () => {
    const onClose = vi.fn();

    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Dismissible drawer'
        onClose={onClose}
      >
        <p>Body content</p>
      </EntitySidebarShell>
    );

    fireEvent.keyDown(screen.getByTestId('right-drawer'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps an explicit keyboard handler ahead of derived Escape dismissal', () => {
    const onClose = vi.fn();
    const onKeyDown = vi.fn();

    render(
      <EntitySidebarShell
        isOpen
        ariaLabel='Explicit keyboard drawer'
        onClose={onClose}
        onKeyDown={onKeyDown}
      >
        <p>Body content</p>
      </EntitySidebarShell>
    );

    fireEvent.keyDown(screen.getByTestId('right-drawer'), { key: 'Escape' });

    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

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

    // The shared flat header keeps identity and tabs pinned together.
    const stickyRailHeader = screen
      .getByTestId('right-drawer')
      .querySelector('[data-variant="flat"]');
    expect(stickyRailHeader).toBeInTheDocument();
    expect(stickyRailHeader).toContainElement(
      screen.getByText('Release details')
    );
    expect(stickyRailHeader).toContainElement(
      screen.getByText('Header content')
    );
    expect(stickyRailHeader).toContainElement(screen.getByText('Tab controls'));
    expect(stickyRailHeader).not.toContainElement(
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
