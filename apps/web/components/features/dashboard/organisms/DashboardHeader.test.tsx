import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHeader } from './DashboardHeader';

describe('DashboardHeader', () => {
  it('hides the web toggle and divider before Electron hydration without hiding route actions', () => {
    // Load the real prepaint rule: this behavior must work before any effect.
    const css = readFileSync(
      resolve(__dirname, '../../../../app/globals.css'),
      'utf8'
    );
    const rule = css.match(
      /html\[data-desktop-runtime="electron"\] \[data-web-sidebar-control="true"\]\s*\{[^}]+\}/
    )?.[0];
    expect(rule).toBeTruthy();
    const style = document.createElement('style');
    style.textContent = rule ?? '';
    document.head.append(style);
    const { container } = render(
      <DashboardHeader
        breadcrumbs={[{ label: 'Library' }]}
        sidebarTrigger={<button type='button'>Expand sidebar</button>}
        action={<button type='button'>Add Asset</button>}
        showDivider
      />
    );
    try {
      expect(
        screen.getByRole('button', { name: 'Expand sidebar' })
      ).toBeVisible();
      document.documentElement.dataset.desktopRuntime = 'electron';
      expect(
        screen.queryByRole('button', { name: 'Expand sidebar' })
      ).not.toBeInTheDocument();
      expect(
        container.querySelectorAll('[data-web-sidebar-control="true"]')
      ).toHaveLength(2);
      for (const slot of container.querySelectorAll(
        '[data-web-sidebar-control="true"]'
      )) {
        expect(slot).not.toBeVisible();
      }
      expect(screen.getByRole('button', { name: 'Add Asset' })).toBeVisible();
      delete document.documentElement.dataset.desktopRuntime;
      expect(
        screen.getByRole('button', { name: 'Expand sidebar' })
      ).toBeVisible();
    } finally {
      style.remove();
      delete document.documentElement.dataset.desktopRuntime;
    }
  });
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

  it('uses the single unified header-height token (founder lock 2026-09-25)', () => {
    const source = readFileSync(
      resolve(__dirname, './DashboardHeader.tsx'),
      'utf8'
    );
    expect(source).toContain('sm:h-(--app-shell-header-height)');
    expect(source).not.toContain('sm:h-(--app-shell-header-height-compact)');
  });

  it('exposes the header row as an Electron drag region', () => {
    render(<DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} />);

    expect(screen.getByTestId('dashboard-header')).toHaveAttribute(
      'data-electron-drag-region',
      'true'
    );
  });

  it('keeps build diagnostics out of the header', () => {
    document.documentElement.dataset.desktopRuntime = 'electron';
    render(<DashboardHeader breadcrumbs={[{ label: 'New Chat' }]} />);

    expect(
      screen.queryByTestId('electron-release-identity')
    ).not.toBeInTheDocument();
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
