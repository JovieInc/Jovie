import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHeader } from './DashboardHeader';

describe('DashboardHeader', () => {
  it('renders the deepest breadcrumb as the page title', () => {
    render(
      <DashboardHeader
        breadcrumbs={[
          { label: 'Jovie', href: '/' },
          { label: 'Releases', href: '/app/releases' },
        ]}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Releases' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
  });

  it('keeps a single-crumb title without duplicating the root label', () => {
    render(<DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} />);

    expect(
      screen.getByRole('heading', { name: 'New Chat' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Jovie')).not.toBeInTheDocument();
  });

  it('exposes the header row as an Electron drag region', () => {
    render(<DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} />);

    expect(screen.getByTestId('dashboard-header')).toHaveAttribute(
      'data-electron-drag-region',
      'true'
    );
  });

  it('renders the desktop release identity inside the header, not a second titlebar band', () => {
    document.documentElement.dataset.desktopRuntime = 'electron';
    render(<DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} />);

    expect(screen.getByTestId('electron-release-identity')).toBeInTheDocument();
    expect(
      screen.queryByTestId('electron-titlebar-row')
    ).not.toBeInTheDocument();
    delete document.documentElement.dataset.desktopRuntime;
  });

  it('renders header action content', () => {
    render(
      <DashboardHeader
        breadcrumbs={[{ label: 'New Chat' }]}
        action={<button type='button'>Help</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument();
  });

  it('places a route-owned primary action to the right of the right-rail toggle (header IA, 2026-09-25)', () => {
    render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Library' }]}
        railToggle={<button type='button'>Rail Toggle</button>}
        action={<button type='button'>Add Asset</button>}
      />
    );

    const railSlot = screen.getByTestId('dashboard-header-rail-slot');
    const action = screen.getByRole('button', { name: 'Add Asset' });

    expect(
      Boolean(
        railSlot.compareDocumentPosition(action) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });

  it('keeps the title/breadcrumb slot first, ahead of the rail toggle and action', () => {
    render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Library' }]}
        railToggle={<button type='button'>Rail Toggle</button>}
        action={<button type='button'>Add Asset</button>}
      />
    );

    const titleSlot = screen.getByTestId('dashboard-header-title-slot');
    const railSlot = screen.getByTestId('dashboard-header-rail-slot');
    const action = screen.getByRole('button', { name: 'Add Asset' });

    expect(
      Boolean(
        titleSlot.compareDocumentPosition(railSlot) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      Boolean(
        titleSlot.compareDocumentPosition(action) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
  });
});
