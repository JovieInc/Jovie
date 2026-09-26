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
});
