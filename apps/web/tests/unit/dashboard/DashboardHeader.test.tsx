import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';

describe('DashboardHeader', () => {
  it('mounts shared responsive controls exactly once', () => {
    render(
      <DashboardHeader
        breadcrumbs={[{ label: 'New Chat', href: '/app/chat' }]}
        leading={<button type='button'>Go back</button>}
        sidebarTrigger={<button type='button'>Toggle sidebar</button>}
        searchSurface={<button type='button'>Search chats</button>}
        action={
          <button type='button' aria-label='Show Tim White profile'>
            TW
          </button>
        }
      />
    );

    expect(
      screen.getAllByRole('heading', { name: 'New Chat', level: 1 })
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Go back' })).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Toggle sidebar' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Search chats' })
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'Show Tim White profile' })
    ).toHaveLength(1);
  });

  it('keeps the mobile profile fallback when no route action is registered', () => {
    render(
      <DashboardHeader
        breadcrumbs={[{ label: 'New Chat', href: '/app/chat' }]}
        mobileProfileSlot={
          <button type='button' aria-label='Open profile'>
            Profile
          </button>
        }
      />
    );

    expect(
      screen.getAllByRole('button', { name: 'Open profile' })
    ).toHaveLength(1);
  });

  it('renders mobile actions in a flat wrapper without pill chrome', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Releases', href: '/app/dashboard/releases' }]}
        action={<button type='button'>Add release</button>}
      />
    );

    const headerRow = container.querySelector(
      '[data-testid="dashboard-header"] > div'
    );
    const actionButton = within(headerRow!).getByRole('button', {
      name: 'Add release',
    });
    const actionWrapper = actionButton.parentElement;

    expect(actionButton).toBeInTheDocument();
    expect(actionWrapper).not.toHaveClass(
      'rounded-full',
      'border',
      'bg-(--linear-app-content-surface)',
      'p-1'
    );
    expect(actionWrapper).toHaveClass('flex', 'items-center', 'gap-1');
  });

  it('renders the breadcrumb alongside the closed search surface', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Releases', href: '/app/dashboard/releases' }]}
        searchSurface={<button type='button'>Search Releases</button>}
        isSearchActive={false}
      />
    );

    const desktopRow = container.querySelector(
      '[data-search-active="false"]'
    ) as HTMLElement | null;
    expect(desktopRow).not.toBeNull();
    // Breadcrumb label remains visible alongside the inline trigger.
    expect(within(desktopRow!).getAllByText('Releases').length).toBeGreaterThan(
      0
    );
    expect(
      within(desktopRow!).getByRole('button', { name: 'Search Releases' })
    ).toBeInTheDocument();
  });

  it('keeps the closed search surface reachable in the mobile header', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Library', href: '/app/library' }]}
        searchSurface={<button type='button'>Filter Library</button>}
        isSearchActive={false}
      />
    );

    const header = container.querySelector('[data-testid="dashboard-header"]');

    expect(header).not.toBeNull();
    expect(within(header!).getByText('Library')).toBeInTheDocument();
    expect(
      within(header!).getByRole('button', { name: 'Filter Library' })
    ).toBeInTheDocument();
  });

  it('prefers the breadcrumb suffix for the mobile title when present', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'New Chat', href: '/app/chat/conv-123' }]}
        breadcrumbSuffix={<span>Release planning thread</span>}
      />
    );

    const header = container.querySelector('[data-testid="dashboard-header"]');

    expect(header).not.toBeNull();
    expect(
      within(header!).getByRole('heading', {
        name: 'Release planning thread',
        level: 1,
      })
    ).toBeInTheDocument();
    expect(
      within(header!).queryByRole('heading', { name: 'New Chat' })
    ).toBeNull();
  });

  it('keeps the breadcrumb in its slot when search activates', () => {
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Releases', href: '/app/dashboard/releases' }]}
        searchSurface={
          <input type='search' aria-label='Filter releases' defaultValue='' />
        }
        isSearchActive
      />
    );

    const desktopRow = container.querySelector(
      '[data-search-active="true"]'
    ) as HTMLElement | null;
    expect(desktopRow).not.toBeNull();
    expect(within(desktopRow!).getByText('Releases')).toBeInTheDocument();
    expect(
      within(desktopRow!).getByRole('searchbox', { name: 'Filter releases' })
    ).toBeInTheDocument();
  });

  it('paints an opaque surface fill by default', () => {
    const { getByTestId } = render(
      <DashboardHeader breadcrumbs={[{ label: 'Releases' }]} />
    );

    const header = getByTestId('dashboard-header');
    expect(header).toHaveClass('bg-(--linear-app-content-surface)');
    expect(header).not.toHaveClass('bg-transparent');
  });

  it('drops the opaque fill when transparent so the shell ambient wash bleeds through (#13386)', () => {
    const { getByTestId, container } = render(
      <DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} transparent />
    );

    const header = getByTestId('dashboard-header');
    expect(header).toHaveClass('bg-transparent');
    expect(header).not.toHaveClass('bg-(--linear-app-content-surface)');
    // Layout is unchanged — the desktop row keeps the compact header height.
    expect(
      container.querySelector(
        '.sm\\:h-\\(--linear-app-header-height-compact\\)'
      )
    ).not.toBeNull();
  });
});
