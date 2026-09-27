import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
});
